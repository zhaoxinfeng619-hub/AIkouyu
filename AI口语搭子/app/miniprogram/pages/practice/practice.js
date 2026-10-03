const { getConfig, request, websocketUrl } = require('../../utils/config');
const { PcmPlayer } = require('../../utils/player');
const { startRecorder, stopRecorder } = require('../../utils/recorder');
const { clockLabel } = require('../../utils/pcm');
const { VoiceOrb } = require('../../utils/voice-orb');
const SCENES = require('../../utils/scenes').map((scene) => {
  const character = scene.character;
  const name = character ? character.name : scene.partner;
  return Object.assign({}, scene, {
    partner: name, initial: name.charAt(0),
    characterMeta: character ? [character.genderLabel, character.age + ' 岁', character.occupation].join(' · ') : scene.role,
    characterInterests: character ? character.interests.join('、') : ''
  });
});
const DISPLAY_SCENES = SCENES.slice().sort((a, b) => a.displayOrder - b.displayOrder);

const STATES = {
  idle: ['准备好，就聊两句', '不用想好整句话，也可以慢慢说。'],
  connecting: ['正在连接搭子', '戴上耳机，准备开始今天的练习。'],
  listening: ['搭子在听', '说完稍微停一下，搭子就会回应。'],
  thinking: ['搭子想一想', '你的话已经收到，很快就有回应。'],
  speaking: ['搭子正在说', '想接话，可以直接说，也可以点击打断。'],
  ended: ['本次练习已结束', '不用完美，愿意开口就是进步。']
};

function authorizeMicrophone() {
  return new Promise((resolve, reject) => {
    const authorize = () => wx.authorize({
      scope: 'scope.record', success: resolve,
      fail: () => reject(new Error('需要麦克风权限才能练习，请在右上角设置中允许录音。'))
    });
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({ success: authorize, fail: () => reject(new Error('同意小程序隐私授权后才能使用录音。')) });
    } else authorize();
  });
}

Page({
  data: {
    scene: 'daily', level: 'basic', correction: 'gentle',
    scenes: DISPLAY_SCENES, selectedScene: SCENES[0],
    screen: 'home', homeTab: 'scenes', visualMode: 'scene', showSubtitles: false,
    state: 'idle', stateTitle: STATES.idle[0], stateHint: STATES.idle[1],
    active: false, starting: false, ending: false, muted: false,
    elapsed: '00:00', sessionYuan: '0.000', dailyYuan: '0.00', monthlyYuan: '0.00',
    transcript: [], scrollTarget: '', error: '', notice: '',
    healthLabel: '检查连接中', healthOk: false, showSetup: false, sessionComplete: false,
    showPrivacy: false, usageIncomplete: false,
    orbReady: false, orbFailed: false, previewing: false, previewLabel: '', previewPhase: '', reducedMotion: false
  },

  onLoad() {
    this._epoch = 0; this._active = false; this._unloaded = false; this._visible = true;
    this._inputLevel = 0; this._inputAt = 0;
    if (typeof wx.onNeedPrivacyAuthorization === 'function') {
      wx.onNeedPrivacyAuthorization((resolve) => {
        if (this._unloaded) return resolve({ event: 'disagree' });
        this._privacyResolve = resolve;
        this.setData({ showPrivacy: true });
      });
    }
  },
  onReady() { this.updateOrbVisibility(); },
  onShow() {
    this._visible = true;
    this.updateOrbVisibility();
    if (!this._active && !this.data.starting) this.checkHealth();
  },
  onHide() {
    this._visible = false;
    this.stopPreview(); this.pauseOrb();
    this.stopSession('background'); this.rejectPrivacy();
  },
  onUnload() {
    this._unloaded = true; this._visible = false;
    this.stopPreview(); this.pauseOrb();
    if (this._orb) this._orb.destroy();
    this._orb = null; this._orbCanvas = null;
    this.stopSession('leave'); this.release();
  },
  onResize() {
    if (!this._orb || !this.orbVisible()) return;
    this.createSelectorQuery().select('#voice-orb').fields({ size: true }).exec((result) => {
      if (this._orb && result[0]) this._orb.resize(result[0].width, result[0].height);
    });
  },

  orbVisible() { return this._visible && this.data.screen === 'call' && this.data.visualMode === 'orb'; },
  updateOrbVisibility() {
    if (!this.orbVisible()) return this.pauseOrb();
    const update = () => {
      if (!this.orbVisible() || this._unloaded) return;
      if (!this._orb && !this.data.orbFailed) this.initOrb();
      else { this.onResize(); this.startOrb(); }
    };
    if (typeof wx.nextTick === 'function') wx.nextTick(update);
    else if (typeof this.createSelectorQuery === 'function') update();
  },

  initOrb() {
    if (this._orbInitializing || this._orb || !this.orbVisible()) return;
    this._orbInitializing = true;
    this.createSelectorQuery().select('#voice-orb').fields({ node: true, size: true }).exec((result) => {
      this._orbInitializing = false;
      if (this._unloaded) return;
      try {
        const surface = result && result[0];
        if (!surface || !surface.node) throw new Error('Canvas is unavailable');
        const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this._orbCanvas = surface.node;
        this._orb = new VoiceOrb(surface.node, { pixelRatio: Math.min(info.pixelRatio || 1, 2) });
        this._orb.resize(surface.width || 320, surface.height || 320);
        this._orb.setReducedMotion(this.data.reducedMotion);
        this.setData({ orbReady: true });
        this.syncOrbState();
        this.startOrb();
      } catch (_) { this.orbFallback(); }
    });
  },
  orbFallback() {
    this.pauseOrb();
    if (this._orb) this._orb.destroy();
    this._orb = null;
    if (!this._unloaded) this.setData({ orbFailed: true, orbReady: false });
  },
  startOrb() {
    if (!this._orb || !this.orbVisible() || this._unloaded) return;
    this.pauseOrb();
    this._orb.start();
    const tick = () => {
      if (!this._orb || !this.orbVisible() || this._unloaded) return;
      const now = Date.now();
      if (this.data.previewing) {
        const elapsed = (now - this._previewStarted) / 1000;
        if (elapsed < 8) {
          const phase = this.data.previewPhase;
          this._orb.setState(phase);
          const level = Math.max(0, Math.sin(elapsed * 8) * 0.3 + Math.sin(elapsed * 3) * 0.22 + 0.3);
          this._orb.setInputLevel(phase === 'listening' ? level : 0);
          this._orb.setOutputLevel(phase === 'speaking' ? level : 0);
        }
      } else {
        const decay = Math.max(0, 1 - (now - this._inputAt) / 200);
        this._orb.setInputLevel(this._active && !this.data.muted ? this._inputLevel * decay : 0);
        this._orb.setOutputLevel(this._player ? this._player.getLevel() : 0);
      }
      this._levelFrame = this._orbCanvas.requestAnimationFrame(tick);
    };
    this._levelFrame = this._orbCanvas.requestAnimationFrame(tick);
  },
  pauseOrb() {
    if (this._orbCanvas && this._levelFrame !== undefined) this._orbCanvas.cancelAnimationFrame(this._levelFrame);
    this._levelFrame = undefined;
    if (this._orb) this._orb.pause();
  },
  syncOrbState() {
    if (this._orb && !this.data.previewing) {
      // Muting the microphone must never hide the partner's audible reply.
      this._orb.setState(this.data.muted && this.data.state !== 'speaking' ? 'muted' : this.data.state);
    }
  },
  previewOrb() {
    if (this.data.active || this.data.starting || this.data.ending) return;
    if (this.data.previewing) return this.stopPreview();
    this._previewStarted = Date.now(); this._previewPhase = '';
    this.setData({ screen: 'call', previewing: true, previewLabel: '连接', previewPhase: 'connecting', error: '', notice: '' });
    this.updateOrbVisibility();
    this._previewTimer = setInterval(() => {
      const elapsed = (Date.now() - this._previewStarted) / 1000;
      if (elapsed >= 8) return this.stopPreview();
      const phase = elapsed < 1 ? 'connecting' : elapsed < 3.5 ? 'listening' : elapsed < 4.5 ? 'thinking' : 'speaking';
      if (phase !== this.data.previewPhase) this.setData({ previewPhase: phase, previewLabel: { connecting: '连接', listening: '倾听', thinking: '思考', speaking: '回应' }[phase] });
    }, 120);
  },
  stopPreview() {
    clearInterval(this._previewTimer); this._previewTimer = null;
    if (!this.data.previewing) return;
    if (!this._unloaded) this.setData({ previewing: false, previewLabel: '', previewPhase: '' });
    if (this._orb) {
      this._orb.setInputLevel(0); this._orb.setOutputLevel(0);
      this._orb.setState(this.data.muted ? 'muted' : this.data.state);
    }
  },
  toggleMotion() {
    const reducedMotion = !this.data.reducedMotion;
    this.setData({ reducedMotion });
    if (this._orb) this._orb.setReducedMotion(reducedMotion);
  },

  async checkHealth() {
    try {
      const health = await request(getConfig(), '/api/health');
      if (this._unloaded) return;
      this.setData({
        healthOk: Boolean(health.configured),
        healthLabel: health.configured ? '搭子已就绪' : '服务待配置',
        showSetup: !health.configured
      });
    } catch (_) {
      if (!this._unloaded) this.setData({ healthOk: false, healthLabel: '尚未连接', showSetup: true });
    }
  },

  setState(state) {
    const copy = STATES[state];
    if (copy && !this._unloaded) {
      const name = this._sessionCharacterName || this.data.selectedScene.partner;
      this.setData({ state, stateTitle: copy[0].replace(/搭子/g, name), stateHint: copy[1].replace(/搭子/g, name) });
      this.syncOrbState();
    }
  },
  chooseScene(event) {
    if (this.data.active || this.data.starting || this.data.ending) return;
    const selectedScene = SCENES.find((item) => item.id === event.currentTarget.dataset.id);
    if (!selectedScene) return;
    this.stopPreview();
    this._sessionCharacterName = null;
    this.setData({ scene: selectedScene.id, selectedScene, screen: 'detail', visualMode: 'scene', error: '', notice: '', transcript: [], scrollTarget: '', sessionComplete: false, elapsed: '00:00', sessionYuan: '0.000', usageIncomplete: false });
    this.setState('idle');
    this.updateOrbVisibility();
    if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  chooseHomeTab(event) { this.setData({ homeTab: event.currentTarget.dataset.id }); },
  openOrbChat() {
    this.chooseScene({ currentTarget: { dataset: { id: 'daily' } } });
    this.setData({ visualMode: 'orb' });
  },
  goBack() {
    this.stopPreview();
    if (this.data.screen === 'call') { this.stopSession('user'); this.rejectPrivacy(); }
    this.setData({ screen: this.data.screen === 'call' ? 'detail' : 'home' });
    this.updateOrbVisibility();
    if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  goHome() {
    if (this.data.active || this.data.starting || this.data.ending) return;
    this.stopPreview(); this.setData({ screen: 'home' }); this.updateOrbVisibility();
  },
  toggleVisualMode() {
    this.setData({ visualMode: this.data.visualMode === 'scene' ? 'orb' : 'scene' });
    this.updateOrbVisibility();
  },
  toggleSubtitles() { this.setData({ showSubtitles: !this.data.showSubtitles }); },
  chooseLevel(event) { if (!this.data.active && !this.data.starting) this.setData({ level: event.currentTarget.dataset.id }); },
  chooseCorrection(event) { if (!this.data.active && !this.data.starting) this.setData({ correction: event.currentTarget.dataset.id }); },
  openSettings() { if (!this.data.active && !this.data.starting) wx.navigateTo({ url: '/pages/settings/settings' }); },
  openPermissions() { wx.openSetting({}); },
  openPrivacy() { wx.openPrivacyContract({ fail: () => this.setData({ error: '暂时无法打开隐私指引，请检查小程序后台配置。' }) }); },
  agreePrivacy() {
    const resolve = this._privacyResolve;
    this._privacyResolve = null;
    this.setData({ showPrivacy: false });
    if (resolve) resolve({ buttonId: 'agree-privacy', event: 'agree' });
  },
  rejectPrivacy() {
    const resolve = this._privacyResolve;
    this._privacyResolve = null;
    this.setData({ showPrivacy: false });
    if (resolve) resolve({ event: 'disagree' });
  },
  preventTouchMove() {},

  async startSession() {
    if (this.data.active || this.data.starting || this.data.ending) return;
    this.stopPreview();
    const epoch = ++this._epoch;
    const config = getConfig();
    this._sessionCharacterName = this.data.selectedScene.partner;
    this.setData({ screen: 'call', starting: true, error: '', notice: '', sessionComplete: false });
    this.updateOrbVisibility();
    this.setState('connecting');
    try {
      const health = await request(config, '/api/health');
      if (!health.configured) throw new Error('陪练服务尚未配置，请先完成服务配置，再开始练习。');
      if (epoch !== this._epoch) return;
      await authorizeMicrophone();
      if (epoch !== this._epoch) return;
      const player = new PcmPlayer((responseId) => {
        if (epoch !== this._epoch || !this._active) return;
        this.send({ type: 'playback.done', responseId });
        if (this.data.state === 'speaking') this.setState('listening');
      });
      this._player = player;
      await player.resume();
      if (epoch !== this._epoch) { player.close(); return; }
      // Microphone consent and audio capability checks precede session creation.
      const session = await request(config, '/api/sessions', {
        method: 'POST', data: { scene: this.data.scene, level: this.data.level, correction: this.data.correction }
      });
      if (epoch !== this._epoch) { player.close(); return; }
      if (session.audio && (session.audio.inputSampleRate !== 16000 || session.audio.outputSampleRate !== 24000)) {
        throw new Error('当前语音格式不匹配，请更新小程序与服务。');
      }
      this._active = true;
      this._receivedFinal = false;
      this._pendingBytes = 0;
      this._startedAt = Date.now();
      this._lastResponseId = '';
      this.setData({ active: true, starting: false, muted: false, transcript: [], elapsed: '00:00', sessionYuan: '0.000', usageIncomplete: false });
      getApp().globalData.activeSession = (reason) => this.stopSession(reason);
      const socket = wx.connectSocket({ url: websocketUrl(config.baseUrl, session.websocketPath), timeout: 12000 });
      this._socket = socket;
      this._connectTimer = setTimeout(() => this.fail('连接等待太久，请检查网络后再试。'), 18000);
      socket.onMessage((event) => {
        if (epoch !== this._epoch) return;
        try { this.handleEvent(JSON.parse(event.data)); }
        catch (error) { this.fail(error.message || '语音数据处理失败，请挂断后重试。'); }
      });
      socket.onError(() => { if (epoch === this._epoch) this.fail('通话连接失败，请检查网络或连接设置。'); });
      socket.onClose(() => {
        if (epoch !== this._epoch) return;
        if (this._active) this.fail('连接已断开，本次练习已结束。');
        else this.finish();
      });
      this._timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - this._startedAt) / 1000);
        this.setData({ elapsed: clockLabel(seconds) });
        if (seconds >= 600) this.stopSession('time_limit');
      }, 1000);
      this._ping = setInterval(() => this.send({ type: 'ping' }), 20000);
    } catch (error) {
      if (epoch === this._epoch) this.fail(error.message || '暂时无法开始练习，请稍后再试。');
    }
  },

  send(message, bytes) {
    if (!this._socket) return;
    const epoch = this._epoch;
    const size = bytes || 0;
    this._pendingBytes = (this._pendingBytes || 0) + size;
    if (size > 0 && this._pendingBytes > 192000) return this.fail('网络发送较慢，本次练习已结束，请换一个稳定的网络。');
    this._socket.send({
      data: JSON.stringify(message),
      fail: () => { if (epoch === this._epoch && this._active) this.fail('声音没有发送成功，请检查网络后再试。'); },
      complete: () => { if (epoch === this._epoch) this._pendingBytes = Math.max(0, this._pendingBytes - size); }
    });
  },

  handleEvent(event) {
    if (event.type === 'session.ended') {
      if (Array.isArray(event.transcript)) {
        this.setData({ transcript: event.transcript.slice(-100).map((item, index) => ({
          id: 'final-' + index, role: item.role, text: item.text, final: true,
          speakerName: item.role === 'user' ? '你' : this._sessionCharacterName || this.data.selectedScene.partner
        })) });
      }
      if (event.stats) this.setData({
        elapsed: clockLabel(event.stats.elapsedSeconds), sessionYuan: Number(event.stats.sessionYuan || 0).toFixed(3),
        usageIncomplete: Boolean(event.stats.incomplete)
      });
      const endMessages = {
        time_limit: '本次练习已到时间，休息一下再聊吧。',
        budget_limit: '已达到设置的费用额度，本次练习已结束。',
        idle_timeout: '一段时间没有对话，已自动结束本次练习。'
      };
      if (endMessages[event.reason]) this.setData({ notice: endMessages[event.reason] });
      this._receivedFinal = true;
      this.setData({ sessionComplete: this.data.transcript.length > 0, showSubtitles: this.data.transcript.length > 0 || this.data.showSubtitles });
      this.finish();
      return;
    }
    if (!this._active) return;
    if (event.type === 'session.ready') {
      this._sessionCharacterName = event.character && event.character.name || this._sessionCharacterName;
      clearTimeout(this._connectTimer);
      if (this._recording) return;
      this._recording = true;
      this._lastFrameAt = Date.now();
      startRecorder({
        onStart: () => this.setState('listening'),
        onFrame: (frameBuffer) => {
          this._lastFrameAt = Date.now();
          if (!this._active || this.data.muted) return;
          const pcm = new DataView(frameBuffer);
          const count = Math.floor(frameBuffer.byteLength / 2);
          let energy = 0;
          for (let i = 0; i < count; i += 1) {
            const sample = pcm.getInt16(i * 2, true) / 32768;
            energy += sample * sample;
          }
          this._inputLevel = count ? Math.min(1, Math.sqrt(energy / count) * 5) : 0;
          this._inputAt = this._lastFrameAt;
          this.send({ type: 'audio.append', audio: wx.arrayBufferToBase64(frameBuffer) }, frameBuffer.byteLength);
        },
        onError: (message) => this.fail(message)
      });
      this._recorderWatch = setInterval(() => {
        if (this._active && Date.now() - this._lastFrameAt > 10000) {
          this.fail('未收到麦克风声音，请使用手机真机并检查录音权限。');
        }
      }, 2500);
    } else if (event.type === 'session.state') {
      if (event.state !== 'ended') this.setState(event.state);
    } else if (event.type === 'audio.delta') {
      this._lastResponseId = event.responseId || this._lastResponseId;
      this._player.append(event.audio, event.responseId);
    } else if (event.type === 'audio.done') {
      this._player.done(event.responseId);
    } else if (event.type === 'playback.clear') {
      this._player.clear(event.responseId || this._lastResponseId);
      this.setState('listening');
    } else if (event.type === 'transcript.delta' || event.type === 'transcript.done') {
      this.updateTranscript(event);
    } else if (event.type === 'usage') {
      this.setData({
        sessionYuan: Number(event.sessionYuan || 0).toFixed(3),
        dailyYuan: Number(event.dailyYuan || 0).toFixed(2),
        monthlyYuan: Number(event.monthlyYuan || 0).toFixed(2),
        usageIncomplete: Boolean(event.incomplete)
      });
    } else if (event.type === 'error') {
      // retryable means a fresh session can be retried, not that this one survives.
      if (event.fatal === false) this.setData({ notice: event.message || '本句字幕没有识别成功，语音对话可以继续。' });
      else {
        this.setData({ error: event.message || '陪练服务暂时不可用，请稍后再试。' });
        this.stopSession('server_error');
      }
    }
  },

  updateTranscript(event) {
    const id = event.itemId || event.responseId || event.role;
    const transcript = this.data.transcript.slice();
    let item = transcript.find((entry) => entry.id === id);
    if (!item) {
      item = { id, role: event.role, text: '', final: false, speakerName: event.role === 'user' ? '你' : this._sessionCharacterName || this.data.selectedScene.partner };
      transcript.push(item);
    }
    if (event.type === 'transcript.done') { item.text = event.text || item.text; item.final = true; }
    else if (!item.final) item.text += event.delta || '';
    const clipped = transcript.slice(-100);
    this.setData({ transcript: clipped, scrollTarget: 'subtitle-' + (clipped.length - 1) });
  },

  toggleMute() {
    if (!this._active) return;
    this.setData({ muted: !this.data.muted });
    this._inputLevel = 0;
    this.syncOrbState();
  },
  interrupt() {
    if (!this._active || !this._player) return;
    this._player.clear(this._lastResponseId);
    this.send({ type: 'interrupt' });
    this.setState('listening');
  },
  hangup() { this.stopSession('user'); },

  stopSession(reason) {
    if (!this._active && !this.data.starting) return;
    this._active = false;
    getApp().globalData.activeSession = null;
    this.setData({ active: false, starting: false, ending: Boolean(this._socket), muted: false });
    this.stopMedia();
    if (reason === 'background') this.setData({ notice: '离开练习页面后，通话会自动结束。' });
    if (reason === 'time_limit') this.setData({ notice: '已完成 10 分钟练习，休息一下吧。' });
    this.setState('ended');
    if (this._socket) {
      this.send({ type: 'session.stop' });
      if (reason === 'background' || reason === 'leave') this.finish();
      else this._endTimer = setTimeout(() => this.finish(), 2000);
    } else {
      ++this._epoch; // Invalidates permission / HTTP work that is still pending.
      this.finish();
    }
  },

  fail(message) {
    if (!this._unloaded) this.setData({ error: message, active: false, starting: false });
    this._active = false;
    if (this._socket) this.send({ type: 'session.stop' });
    this.finish();
  },
  stopMedia() {
    stopRecorder();
    this._recording = false;
    this._inputLevel = 0;
    if (this._orb) { this._orb.setInputLevel(0); this._orb.setOutputLevel(0); }
    if (this._player) { this._player.close(); this._player = null; }
    clearInterval(this._timer);
    clearInterval(this._ping);
    clearInterval(this._recorderWatch);
    clearTimeout(this._connectTimer);
  },
  finish() {
    this._active = false;
    if (this._socket && !this._receivedFinal && !this._unloaded) this.setData({ usageIncomplete: true });
    this.release();
    if (!this._unloaded) {
      this.setData({ active: false, starting: false, ending: false, muted: false });
      this.setState(this.data.elapsed === '00:00' && !this.data.transcript.length ? 'idle' : 'ended');
    }
  },
  release() {
    ++this._epoch;
    getApp().globalData.activeSession = null;
    this.stopMedia();
    clearTimeout(this._endTimer);
    const socket = this._socket;
    this._socket = null;
    if (socket) { try { socket.close({ code: 1000, reason: 'session ended' }); } catch (_) {} }
  }
});
