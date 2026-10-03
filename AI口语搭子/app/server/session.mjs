import { WebSocket } from 'ws';
import { emptyTokens } from './ledger.mjs';
import { providerSession } from './prompt.mjs';
import { characterSnapshot } from './catalog.mjs';

const OPEN = WebSocket.OPEN;
export class VoiceSession {
  constructor({ id, config, ledger, options, onEnded }) {
    Object.assign(this, { id, config, ledger, options, onEnded });
    this.character = characterSnapshot(options.scene);
    this.tokens = emptyTokens();
    this.sessionYuan = 0;
    this.transcripts = new Map();
    this.blockedResponses = new Set();
    this.pendingUsage = new Set();
    this.startedAt = Date.now();
    this.lastActivity = Date.now();
    this.state = 'pending';
    this.ending = false;
    this.ended = false;
    this.ready = false;
    this.userSpeaking = false;
    this.activeResponse = null;
    this.lastResponse = null;
    this.unknownUsage = false;
    this.audioWindow = { at: Date.now(), bytes: 0 };
  }
  send(value) {
    if (this.client?.readyState === OPEN) this.client.send(JSON.stringify(value));
  }
  upstreamSend(value) {
    if (this.upstream?.readyState === OPEN) this.upstream.send(JSON.stringify(value));
  }
  setState(state) {
    this.state = state;
    this.send({ type: 'session.state', state });
  }
  usage() {
    return { type: 'usage', sessionYuan: this.sessionYuan, ...this.ledger.totals(), tokens: { ...this.tokens }, estimated: true, incomplete: this.unknownUsage };
  }
  attach(client) {
    this.client = client;
    this.startedAt = Date.now();
    this.lastActivity = Date.now();
    this.setState('connecting');
    client.on('message', (raw, isBinary) => this.onClient(raw, isBinary));
    client.on('close', () => this.stop('client_disconnected'));
    client.on('error', () => this.stop('client_disconnected'));
    this.upstream = new WebSocket(this.config.upstreamUrl, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      handshakeTimeout: 10000, maxPayload: 2 * 1024 * 1024, perMessageDeflate: false,
    });
    this.upstream.on('open', () => {
      if (this.ending) return this.upstream.close();
      this.upstreamSend(providerSession(this.config, this.options));
    });
    this.upstream.on('message', raw => {
      try { this.onProvider(JSON.parse(raw.toString())); }
      catch { this.unknownUsage = true; this.fail('UPSTREAM_PROTOCOL', '语音服务返回了无法处理的数据，请重新开始。'); }
    });
    this.upstream.on('unexpected-response', (_request, response) => {
      response.resume();
      this.fail('UPSTREAM_AUTH', response.statusCode === 401 || response.statusCode === 403 ? '百炼鉴权失败，请检查北京地域密钥、业务空间和模型权限。' : '语音服务暂时无法连接，请稍后重试。');
    });
    this.upstream.on('error', () => this.fail('UPSTREAM_CONNECT', '连接语音服务失败，请检查后端配置或网络。'));
    this.upstream.on('close', () => this.ending ? this.finish() : this.fail('UPSTREAM_CLOSED', '语音连接已断开，请重新开始。'));
    this.connectTimer = setTimeout(() => this.fail('CONNECT_TIMEOUT', '语音服务准备超时，请重新开始。'), 12000);
    this.tick = setInterval(() => {
      if (Date.now() - this.startedAt >= this.config.maxSessionSeconds * 1000) this.stop('time_limit');
      else if (this.ready && !this.userSpeaking && !this.activeResponse && Date.now() - this.lastActivity >= this.config.maxIdleSeconds * 1000) this.stop('idle_timeout');
    }, 1000);
  }
  fail(code, message) {
    if (this.ending || this.ended) return;
    this.send({ type: 'error', code, message, fatal: true, retryable: true });
    this.stop(code.toLowerCase());
  }
  onClient(raw, isBinary) {
    if (this.ending || this.ended) return;
    if (isBinary) return this.fail('INVALID_MESSAGE', '音频消息格式不正确。');
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return this.fail('INVALID_MESSAGE', '消息格式不正确。'); }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return this.fail('INVALID_MESSAGE', '消息格式不正确。');
    switch (message.type) {
      case 'ping': this.send({ type: 'pong' }); break;
      case 'session.stop': this.stop('user_ended'); break;
      case 'interrupt':
        if (this.ready) { this.lastActivity = Date.now(); this.interrupt('manual'); }
        break;
      case 'playback.done':
        if (this.ready && !this.activeResponse && message.responseId === this.lastResponse) {
          this.lastActivity = Date.now(); this.setState('listening');
        }
        break;
      case 'audio.append': {
        if (!this.ready) return;
        const audio = message.audio;
        if (typeof audio !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio)) return this.fail('INVALID_AUDIO', '录音数据格式不正确。');
        const bytes = Buffer.byteLength(audio, 'base64');
        if (!bytes || bytes % 2 || bytes > 32768) return this.fail('INVALID_AUDIO', '录音分帧大小不正确。');
        if (Date.now() - this.audioWindow.at > 1000) this.audioWindow = { at: Date.now(), bytes: 0 };
        this.audioWindow.bytes += bytes;
        if (this.audioWindow.bytes > 128000) return this.fail('AUDIO_RATE_LIMIT', '录音上传过快，请重新开始。');
        if (this.upstream.bufferedAmount > 256 * 1024) return this.fail('NETWORK_SLOW', '网络跟不上录音，请换个网络重新开始。');
        this.upstreamSend({ type: 'input_audio_buffer.append', audio });
        break;
      }
      default: this.fail('INVALID_MESSAGE', '客户端发送了不支持的操作。');
    }
  }
  interrupt(reason) {
    const responseId = this.activeResponse || this.lastResponse;
    if (responseId) {
      this.blockedResponses.add(responseId);
      for (const record of this.transcripts.values()) if (record.responseId === responseId) record.interrupted = true;
    }
    this.send({ type: 'playback.clear', responseId, reason });
    if (this.activeResponse) this.upstreamSend({ type: 'response.cancel' });
    this.activeResponse = null;
    this.setState('listening');
  }
  transcript(event, role, done = false) {
    const responseId = event.response_id || (role === 'assistant' ? this.activeResponse : undefined);
    if (role === 'assistant' && responseId && this.blockedResponses.has(responseId)) return;
    const itemId = event.item_id || responseId;
    if (!itemId) return;
    const existing = this.transcripts.get(itemId) || { role, text: '', itemId, responseId };
    if (done) existing.text = String(event.transcript ?? event.text ?? existing.text).slice(0, 16000);
    else existing.text = (existing.text + String(event.delta ?? '')).slice(0, 16000);
    this.transcripts.set(itemId, existing);
    if (this.transcripts.size > 200) this.transcripts.delete(this.transcripts.keys().next().value);
    this.send(done ? { type: 'transcript.done', ...existing } : { type: 'transcript.delta', role, itemId, responseId, delta: String(event.delta ?? '') });
  }
  onProvider(event) {
    if (this.ended) return;
    // Even a cancelled response can carry billable usage. Account before filtering stale output.
    if (event.type === 'response.done') {
      const response = event.response || {};
      if (response.id) {
        const result = this.ledger.add(this.id, response.id, response.usage);
        if (!result) this.unknownUsage = true;
        else if (!result.duplicate) {
          this.sessionYuan += result.yuan;
          for (const key of Object.keys(this.tokens)) this.tokens[key] += result.tokens[key];
        }
        if (result) this.pendingUsage.delete(response.id);
      } else this.unknownUsage = true;
      this.send(this.usage());
      if (this.activeResponse === response.id) this.activeResponse = null;
      if (response.status === 'failed') {
        this.fail('RESPONSE_FAILED', '本轮语音生成失败，请稍后重新开始；请检查百炼模型权限与余额。');
        return;
      }
      if (response.status === 'incomplete' && !this.ending && !this.blockedResponses.has(response.id)) {
        this.send({ type: 'error', code: 'RESPONSE_INCOMPLETE', message: '这一轮回答没有完整生成，可以请搭子再说一次。', fatal: false, retryable: false });
      }
      if (!this.blockedResponses.has(response.id) && !this.ending) this.send({ type: 'audio.done', responseId: response.id });
      const totals = this.ledger.totals();
      if (totals.dailyYuan >= this.config.dailyBudget || totals.monthlyYuan >= this.config.monthlyBudget) this.stop('budget_limit');
      return;
    }
    if (this.ending) return;
    switch (event.type) {
      case 'session.updated':
        if (!this.ready) {
          clearTimeout(this.connectTimer); this.ready = true;
          this.send({ type: 'session.ready', sessionId: this.id, character: this.character, audio: { inputSampleRate: 16000, outputSampleRate: 24000 } });
          this.send(this.usage()); this.setState('listening');
        }
        break;
      case 'input_audio_buffer.speech_started': this.userSpeaking = true; this.lastActivity = Date.now(); this.interrupt('speech_started'); break;
      case 'input_audio_buffer.speech_stopped': this.userSpeaking = false; this.lastActivity = Date.now(); this.setState('thinking'); break;
      case 'response.created':
        this.activeResponse = event.response?.id;
        if (this.activeResponse) this.pendingUsage.add(this.activeResponse);
        this.lastResponse = this.activeResponse;
        this.lastActivity = Date.now(); this.setState('thinking');
        break;
      case 'response.audio.delta': {
        const responseId = event.response_id || this.activeResponse;
        if (!responseId || this.blockedResponses.has(responseId)) return;
        if (this.client?.bufferedAmount > 512 * 1024) return this.fail('CLIENT_SLOW', '播放网络不稳定，请重新开始。');
        this.lastActivity = Date.now();
        if (this.state !== 'speaking') this.setState('speaking');
        this.send({ type: 'audio.delta', responseId, audio: event.delta });
        break;
      }
      case 'response.audio_transcript.delta': this.transcript(event, 'assistant'); break;
      case 'response.audio_transcript.done': this.transcript(event, 'assistant', true); break;
      case 'conversation.item.input_audio_transcription.completed': this.transcript(event, 'user', true); break;
      case 'conversation.item.input_audio_transcription.failed': this.send({ type: 'error', code: 'TRANSCRIPTION_FAILED', message: '本句字幕未能识别，语音对话可以继续。', fatal: false, retryable: false }); break;
      case 'error': {
        const code = String(event.error?.code || '');
        // A response may complete between speech-start and cancel reaching the service.
        if (/cancel|no_active_response|response_not_found/.test(code)) return;
        this.fail('UPSTREAM_ERROR', '千问未能完成本次请求，请检查模型权限、余额与配置。');
        break;
      }
    }
  }
  stop(reason) {
    if (this.ending || this.ended) return;
    this.ending = true; this.reason = reason; this.ready = false;
    clearTimeout(this.connectTimer); clearInterval(this.tick);
    this.send({ type: 'playback.clear', responseId: this.activeResponse || this.lastResponse, reason });
    if (this.activeResponse) this.upstreamSend({ type: 'response.cancel' });
    this.stopTimer = setTimeout(() => this.finish(), this.config.stopGraceMs);
    if (!this.upstream || this.upstream.readyState === WebSocket.CLOSED) this.finish();
  }
  finish() {
    if (this.ended) return;
    this.ended = true; this.ending = true;
    if (this.pendingUsage.size) this.unknownUsage = true;
    clearTimeout(this.stopTimer); clearTimeout(this.connectTimer); clearInterval(this.tick);
    if (this.upstream && this.upstream.readyState !== WebSocket.CLOSED) this.upstream.terminate();
    this.setState('ended');
    this.send({ type: 'session.ended', character: this.character, reason: this.reason || 'ended', stats: { elapsedSeconds: Math.round((Date.now() - this.startedAt) / 1000), sessionYuan: this.sessionYuan, estimated: true, incomplete: this.unknownUsage }, transcript: [...this.transcripts.values()] });
    if (this.client?.readyState === OPEN) this.client.close(1000, 'Session ended');
    this.onEnded(this);
  }
}
