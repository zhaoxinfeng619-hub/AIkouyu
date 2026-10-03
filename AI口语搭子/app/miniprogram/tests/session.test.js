const test = require('node:test');
const assert = require('node:assert/strict');
let definition;
global.Page = (value) => { definition = value; };
require('../pages/practice/practice');

function setup(options) {
  const opts = options || {};
  const calls = [];
  const application = { globalData: {} };
  global.getApp = () => application;
  global.wx = {
    getStorageSync: () => ({ baseUrl: 'http://127.0.0.1:8788', accessToken: 'application-only' }),
    request(args) {
      calls.push(args);
      if (opts.pending) opts.pending(args);
      else args.success({ statusCode: 200, data: { configured: opts.configured !== false } });
    },
    authorize: ({ fail }) => fail({}),
    onNeedPrivacyAuthorization() {}
  };
  const page = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(changes) { Object.assign(this.data, changes); }
  });
  page.onLoad();
  return { page, calls, application };
}

test('missing model configuration never asks for microphone permission or creates a session', async () => {
  const { page, calls } = setup({ configured: false });
  wx.authorize = () => assert.fail('No microphone request when backend is unconfigured');
  await page.startSession();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/api/health'));
  assert.match(page.data.error, /尚未配置/);
  assert.equal(page.data.starting, false);
});

test('microphone denial prevents session creation', async () => {
  const { page, calls } = setup();
  await page.startSession();
  assert.equal(calls.length, 1);
  assert.match(page.data.error, /麦克风权限/);
});

test('leaving while a health check is pending invalidates the start sequence', async () => {
  let pending;
  const { page, calls } = setup({ pending: (value) => { pending = value; } });
  const start = page.startSession();
  page.onHide();
  pending.success({ statusCode: 200, data: { configured: true } });
  await start;
  assert.equal(calls.length, 1);
  assert.equal(page.data.starting, false);
  assert.equal(page._socket, null);
});

test('outbound audio congestion ends the connection without recursive sends', () => {
  const { page } = setup();
  const sent = [];
  page._active = true;
  page._pendingBytes = 192000;
  page._socket = { send({ data }) { sent.push(JSON.parse(data)); }, close() {} };
  page.send({ type: 'audio.append', audio: 'AAAA' }, 4096);
  assert.deepEqual(sent, [{ type: 'session.stop' }]);
  assert.equal(page._active, false);
  assert.match(page.data.error, /网络发送较慢/);
});

test('final subtitle replaces deltas and late deltas do not duplicate the text', () => {
  const { page } = setup();
  page.updateTranscript({ type: 'transcript.delta', itemId: 'i1', role: 'assistant', delta: 'Hello' });
  page.updateTranscript({ type: 'transcript.done', itemId: 'i1', role: 'assistant', text: 'Hello there.' });
  page.updateTranscript({ type: 'transcript.delta', itemId: 'i1', role: 'assistant', delta: ' there.' });
  assert.equal(page.data.transcript.length, 1);
  assert.equal(page.data.transcript[0].text, 'Hello there.');
});

test('character identity stays on streamed and final subtitles, and a new character clears the old dialogue', () => {
  const { page } = setup();
  page.chooseScene({ currentTarget: { dataset: { id: 'hotel' } } });
  assert.equal(page.data.selectedScene.character.voice.id, 'Mione');
  page._active = true; page._recording = true;
  page.handleEvent({ type: 'session.ready', character: { id: 'olivia', name: 'Olivia', version: 1, voiceId: 'Mione' } });
  page.updateTranscript({ itemId: 'olivia-1', role: 'assistant', delta: 'Welcome!' });
  assert.equal(page.data.transcript[0].speakerName, 'Olivia');
  page.toggleVisualMode(); page.toggleVisualMode();
  assert.equal(page.data.transcript[0].speakerName, 'Olivia');
  page.handleEvent({ type: 'session.ended', transcript: [{ role: 'assistant', text: 'Welcome!' }] });
  assert.equal(page.data.transcript[0].speakerName, 'Olivia');
  page.chooseScene({ currentTarget: { dataset: { id: 'coffee' } } });
  assert.equal(page.data.selectedScene.partner, 'Alex');
  assert.equal(page.data.transcript.length, 0);
});

test('nonfatal subtitle failure keeps the current call alive', () => {
  const { page } = setup();
  page._active = true;
  page.handleEvent({ type: 'error', code: 'TRANSCRIPTION_FAILED', fatal: false, retryable: false, message: '字幕未识别' });
  assert.equal(page._active, true);
  assert.equal(page.data.notice, '字幕未识别');
});

test('fatal retryable error ends the current call and keeps the error visible', () => {
  const { page } = setup();
  page._active = true;
  page.setData({ active: true });
  page.handleEvent({ type: 'error', code: 'UPSTREAM_ERROR', fatal: true, retryable: true, message: '模型余额不足' });
  assert.equal(page._active, false);
  assert.equal(page.data.error, '模型余额不足');
});

test('final cost marks incomplete usage instead of implying a complete bill', () => {
  const { page } = setup();
  page._active = true;
  page.handleEvent({ type: 'session.ended', reason: 'budget_limit', stats: { elapsedSeconds: 30, sessionYuan: 0.05, incomplete: true }, transcript: [] });
  assert.equal(page.data.usageIncomplete, true);
  assert.equal(page.data.sessionYuan, '0.050');
  assert.match(page.data.notice, /费用额度/);
});

test('preview is visual only and microphone mute preserves the partner speaking state', () => {
  const { page, calls } = setup();
  const states = [];
  page._orb = { setState: (state) => states.push(state), setInputLevel() {}, setOutputLevel() {}, pause() {} };
  page.previewOrb();
  assert.equal(page.data.previewing, true);
  assert.equal(page._active, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(page.data.transcript, []);
  page.stopPreview();
  page._active = true;
  page.setState('speaking');
  page.toggleMute();
  assert.equal(page.data.muted, true);
  assert.equal(states.at(-1), 'speaking');
  page.setState('listening');
  assert.equal(states.at(-1), 'muted');
});

test('scene browsing and visual preview never create a paid session or microphone request', () => {
  const { page, calls } = setup();
  wx.authorize = () => assert.fail('Browsing does not access the microphone');
  assert.equal(page.data.screen, 'home');
  assert.equal(page.data.scenes.length, 6);
  page.setData({ sessionComplete: true, transcript: [{ id: 'previous', role: 'assistant', text: 'Old scene.' }] });
  page.chooseScene({ currentTarget: { dataset: { id: 'restaurant' } } });
  assert.equal(page.data.screen, 'detail');
  assert.equal(page.data.selectedScene.id, 'restaurant');
  assert.equal(page.data.selectedScene.tasks.length, 3);
  assert.deepEqual(page.data.transcript, []);
  assert.equal(page.data.sessionComplete, false);
  page.previewOrb();
  assert.equal(page.data.screen, 'call');
  assert.equal(page.data.visualMode, 'scene');
  assert.equal(page.data.previewing, true);
  assert.deepEqual(page.data.transcript, []);
  assert.equal(page.data.sessionComplete, false);
  assert.equal(calls.length, 0);
  page.goBack();
  assert.equal(page.data.screen, 'detail');
  assert.equal(page.data.previewing, false);
  assert.equal(page._previewTimer, null);
});

test('changing call appearance preserves the current session, mute state and transcript', () => {
  const { page, calls } = setup();
  let pauses = 0;
  page._orb = { pause() { pauses += 1; } };
  page._socket = { identity: 'same-session' };
  page._active = true;
  page.setData({ screen: 'call', active: true, muted: true, transcript: [{ id: 'real', role: 'user', text: 'Hello.' }] });
  const epoch = page._epoch;
  page.toggleVisualMode();
  assert.equal(page.data.visualMode, 'orb');
  page.toggleSubtitles();
  page.toggleVisualMode();
  assert.equal(page.data.visualMode, 'scene');
  assert.ok(pauses > 0);
  assert.equal(page._epoch, epoch);
  assert.equal(page._socket.identity, 'same-session');
  assert.equal(page.data.muted, true);
  assert.equal(page.data.transcript[0].text, 'Hello.');
  assert.equal(page.data.showSubtitles, true);
  assert.equal(calls.length, 0);
});

test('back from a pending call cancels its start and returns to scene detail', async () => {
  let pending;
  const { page, calls } = setup({ pending: (args) => { pending = args; } });
  const start = page.startSession();
  assert.equal(page.data.screen, 'call');
  page.goBack();
  pending.success({ statusCode: 200, data: { configured: true } });
  await start;
  assert.equal(page.data.screen, 'detail');
  assert.equal(page.data.starting, false);
  assert.equal(calls.length, 1);
  assert.equal(page._socket, null);
});

test('backgrounding visual preview clears its timer and pauses rendering', () => {
  const { page } = setup();
  page.previewOrb();
  assert.ok(page._previewTimer);
  page.onHide();
  assert.equal(page.data.previewing, false);
  assert.equal(page._previewTimer, null);
  assert.equal(page.orbVisible(), false);
});

test('minimal voice entry retains the daily scenario and opens its detail in orb mode', () => {
  const { page, calls } = setup();
  page.openOrbChat();
  assert.equal(page.data.screen, 'detail');
  assert.equal(page.data.scene, 'daily');
  assert.equal(page.data.visualMode, 'orb');
  assert.equal(calls.length, 0);
  page.goBack();
  page.chooseScene({ currentTarget: { dataset: { id: 'hotel' } } });
  assert.equal(page.data.visualMode, 'scene');
});
