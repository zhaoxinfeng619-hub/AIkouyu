const test = require('node:test');
const assert = require('node:assert/strict');
const { Pcm16Decoder, clockLabel } = require('../utils/pcm');
const { websocketUrl, normalizeBaseUrl } = require('../utils/config');

test('PCM decoder preserves an odd byte across chunks and respects view bounds', () => {
  const decoder = new Pcm16Decoder();
  const backing = new Uint8Array([99, 0, 128, 255, 88]);
  assert.deepEqual(Array.from(decoder.decode(backing.subarray(1, 4))), [-1]);
  assert.deepEqual(Array.from(decoder.decode(new Uint8Array([127, 0, 0]))), [32767 / 32768, 0]);
  assert.equal(decoder.carry, null);
});

test('PCM reset discards a stale half sample after an interruption', () => {
  const decoder = new Pcm16Decoder();
  decoder.decode(new Uint8Array([255]));
  decoder.reset();
  assert.deepEqual(Array.from(decoder.decode(new Uint8Array([0, 0]))), [0]);
  assert.equal(clockLabel(600), '10:00');
});

test('connection URL uses only the configured origin and a local ticket path', () => {
  assert.equal(websocketUrl('https://buddy.example/', '/ws?ticket=abc'), 'wss://buddy.example/ws?ticket=abc');
  assert.throws(() => websocketUrl('https://buddy.example', 'wss://other.example/ws?ticket=abc'));
  assert.throws(() => normalizeBaseUrl('https://user:secret@buddy.example'));
  assert.throws(() => normalizeBaseUrl('https://buddy.example?secret=value'));
});

function mockAudio() {
  const sources = [];
  const context = {
    currentTime: 1,
    destination: {},
    close() {}, resume() {},
    createBuffer(channels, size, sampleRate) {
      assert.equal(channels, 1);
      assert.equal(sampleRate, 24000);
      return { copyToChannel(values, channel) { assert.equal(values.length, size); assert.equal(channel, 0); } };
    },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(time) { this.time = time; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    }
  };
  global.wx = {
    createWebAudioContext: () => context,
    base64ToArrayBuffer: (base64) => {
      const bytes = Buffer.from(base64, 'base64');
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
  return { sources, context };
}

test('playback waits for the final audio node before reporting response completion', () => {
  const { sources } = mockAudio();
  const { PcmPlayer } = require('../utils/player');
  const drained = [];
  const player = new PcmPlayer((id) => drained.push(id));
  const chunk = Buffer.alloc(4800).toString('base64');
  player.append(chunk, 'r1');
  player.append(chunk, 'r1');
  assert.ok(Math.abs(sources[1].time - sources[0].time - 0.1) < 0.000001);
  player.done('r1');
  assert.deepEqual(drained, []);
  sources[0].onended();
  assert.deepEqual(drained, []);
  sources[1].onended();
  assert.deepEqual(drained, ['r1']);
  player.close();
});

test('interruption stops queued sources and drops delayed audio from the old response', () => {
  const { sources } = mockAudio();
  const { PcmPlayer } = require('../utils/player');
  const player = new PcmPlayer(() => assert.fail('Cancelled audio cannot report playback completion'));
  const chunk = Buffer.alloc(4800).toString('base64');
  player.append(chunk, 'old');
  player.append(chunk, 'old');
  player.clear('old');
  assert.ok(sources.every((source) => source.stopped));
  player.append(chunk, 'old');
  player.done('old');
  assert.equal(sources.length, 2);
  player.append(chunk, 'new');
  assert.equal(sources.length, 3);
  assert.equal(sources[2].time, sources[0].time);
  player.close();
});

test('voice visual follows playback clock, including silent windows and queued audio', () => {
  const { sources, context } = mockAudio();
  const { PcmPlayer } = require('../utils/player');
  const player = new PcmPlayer();
  const chunk = Buffer.alloc(480 * 4);
  for (let i = 0; i < 480; i += 1) chunk.writeInt16LE(3277, i * 2);
  player.append(chunk.toString('base64'), 'r1');
  player.append(chunk.toString('base64'), 'r1');
  assert.equal(player.getLevel(), 0, 'audio arrived but playback has not started');
  context.currentTime = sources[0].time + 0.005;
  assert.ok(player.getLevel() > 0.49 && player.getLevel() < 0.51);
  context.currentTime = sources[0].time + 0.025;
  assert.equal(player.getLevel(), 0, 'silence in first chunk stays quiet despite queued speech');
  context.currentTime = sources[1].time + 0.005;
  assert.ok(player.getLevel() > 0.49);
  context.state = 'suspended';
  assert.equal(player.getLevel(), 0);
  context.state = 'running';
  player.clear('r1');
  assert.equal(player.getLevel(), 0, 'interruption discards the complete visual envelope');
  player.close();
});
