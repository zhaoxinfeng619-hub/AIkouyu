const { Pcm16Decoder } = require('./pcm');

class PcmPlayer {
  constructor(onDrained) {
    if (typeof wx.createWebAudioContext !== 'function') {
      throw new Error('当前微信版本不支持连续语音播放，请更新微信后用手机体验。');
    }
    this.context = wx.createWebAudioContext();
    this.onDrained = onDrained;
    this.nodes = new Map();
    this.blocked = new Set();
    this.finished = new Set();
    this.decoders = new Map();
    this.envelopes = new Map();
    this.nextTime = 0;
    this.closed = false;
    if (!this.context || typeof this.context.createBufferSource !== 'function') {
      throw new Error('当前设备暂不支持连续语音播放，请更新微信后重试。');
    }
  }

  async resume() {
    if (this.context.resume) await this.context.resume();
  }

  append(base64, responseId) {
    const id = responseId || 'unidentified';
    if (this.closed || this.blocked.has(id)) return;
    if (!this.decoders.has(id)) this.decoders.set(id, new Pcm16Decoder());
    const samples = this.decoders.get(id).decode(wx.base64ToArrayBuffer(base64));
    if (!samples.length) return;
    const context = this.context;
    if (this.nextTime - context.currentTime > 45) throw new Error('语音播放积压，请重新开始练习。');
    const buffer = context.createBuffer(1, samples.length, 24000);
    if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(samples, 0, 0);
    else buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.nodes.set(source, id);
    source.onended = () => {
      this.nodes.delete(source);
      this.envelopes.delete(source);
      try { source.disconnect(); } catch (_) { /* Already disconnected. */ }
      this.checkDrained(id);
    };
    const start = Math.max(this.nextTime, context.currentTime + 0.035);
    this.nextTime = start + samples.length / 24000;
    // Keep the visual envelope on the same clock as the scheduled audio. Network
    // arrival time can be seconds ahead of what the listener actually hears.
    const windowSize = 480;
    const levels = new Float32Array(Math.ceil(samples.length / windowSize));
    for (let offset = 0; offset < samples.length; offset += windowSize) {
      const end = Math.min(samples.length, offset + windowSize);
      let energy = 0;
      for (let i = offset; i < end; i += 1) energy += samples[i] * samples[i];
      levels[offset / windowSize] = Math.min(1, Math.sqrt(energy / (end - offset)) * 5);
    }
    this.envelopes.set(source, { start, end: this.nextTime, levels });
    source.start(start);
  }

  getLevel() {
    if (this.closed || (this.context.state && this.context.state !== 'running')) return 0;
    const now = this.context.currentTime;
    for (const envelope of this.envelopes.values()) {
      if (now >= envelope.start && now < envelope.end) {
        return envelope.levels[Math.min(envelope.levels.length - 1, Math.floor((now - envelope.start) / 0.02))] || 0;
      }
    }
    return 0;
  }

  done(responseId) {
    const id = responseId || 'unidentified';
    if (this.blocked.has(id)) return;
    this.finished.add(id);
    this.checkDrained(id);
  }

  checkDrained(id) {
    if (this.closed || !this.finished.has(id) || this.blocked.has(id)) return;
    for (const value of this.nodes.values()) if (value === id) return;
    this.finished.delete(id);
    this.decoders.delete(id);
    if (this.onDrained) this.onDrained(id);
  }

  clear(responseId) {
    if (responseId) this.blocked.add(responseId);
    this.nodes.forEach((id, source) => {
      this.blocked.add(id);
      source.onended = null;
      try { source.stop(); } catch (_) { /* It may already have ended. */ }
      try { source.disconnect(); } catch (_) { /* Platform cleanup. */ }
    });
    this.nodes.clear();
    this.finished.clear();
    this.decoders.clear();
    this.envelopes.clear();
    this.nextTime = 0;
  }

  close() {
    if (this.closed) return;
    this.clear();
    this.closed = true;
    try {
      const closing = this.context.close();
      if (closing && closing.catch) closing.catch(() => {});
    } catch (_) { /* Context may already be closed by the platform. */ }
  }
}

module.exports = { PcmPlayer };
