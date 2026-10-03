// Personal Vercel mode: HTTP authentication, direct WebRTC media, device usage guard.
export function usageYuan(usage) {
  const input = usage?.input_tokens_details, output = usage?.output_tokens_details;
  const values = [input?.audio_tokens, input?.text_tokens, output?.audio_tokens, output?.text_tokens];
  return values.every(v => Number.isSafeInteger(v) && v >= 0) ? (values[0] * 6 + values[1] * 1.5 + values[2] * 12 + values[3] * 4.5) / 1e6 : null;
}
export function deviceUsageLedger(raw) {
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([day, amount]) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(amount) || amount < 0)) throw new Error('本设备费用记录无法读取，请先核对百炼账单。');
  return value;
}
export class RealtimeRTC {
  constructor({ capture, signal, onEvent, onCost, onLevels, fetchAPI = (input, init) => fetch(input, init), Peer = RTCPeerConnection }) {
    Object.assign(this, { capture, signal, onEvent, onCost, onLevels, fetchAPI, Peer });
    this.closed = false; this.ready = false; this.speaking = false; this.muted = false;
    this.cancelled = new Set(); this.seenUsage = new Set(); this.sessionYuan = 0;
  }
  async connect({ token, options }) {
    this.pc = new this.Peer();
    this.track = this.capture.stream.getAudioTracks()[0];
    this.track.enabled = false;
    this.sender = this.pc.addTrack(this.track, this.capture.stream);
    await this.sender.replaceTrack(null);
    this.channel = this.pc.createDataChannel('oai-events');
    this.channel.onmessage = e => { if (!this.closed) { try { this.handle(JSON.parse(e.data)); } catch { this.fail('语音数据无法处理，请重试。'); } } };
    this.pc.ontrack = e => {
      if (this.closed) return;
      this.remote = this.capture.context.createMediaStreamSource(e.streams[0]);
      this.gain = this.capture.context.createGain();
      this.remote.connect(this.gain); this.gain.connect(this.capture.analyser);
    };
    this.pc.onconnectionstatechange = () => { if (!this.closed && ['failed', 'closed'].includes(this.pc.connectionState)) this.fail('语音连接已断开，请检查网络后重试。'); };
    this.channel.onclose = () => { if (!this.closed) this.fail('语音数据连接已断开。'); };
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await new Promise((resolve, reject) => {
      if (this.signal.aborted) return reject(new DOMException('操作已取消', 'AbortError'));
      const done = error => { clearTimeout(timer); this.pc.removeEventListener('icegatheringstatechange', changed); this.signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
      const changed = () => { if (this.pc.iceGatheringState === 'complete') done(); };
      const abort = () => done(new DOMException('操作已取消', 'AbortError'));
      const timer = setTimeout(() => done(new Error('网络协商超时，请重试。')), 12000);
      this.pc.addEventListener('icegatheringstatechange', changed); this.signal.addEventListener('abort', abort, { once: true }); changed();
    });
    if (this.closed || this.signal.aborted) throw new DOMException('操作已取消', 'AbortError');
    const response = await this.fetchAPI('/api/webrtc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...options, sdp: this.pc.localDescription.sdp }), signal: this.signal });
    const session = await response.json();
    if (!response.ok) throw new Error(session.error || '语音服务连接失败。');
    if (this.closed || this.signal.aborted) throw new DOMException('操作已取消', 'AbortError');
    this.session = session;
    const answer = session.answer.trim().replace(/\r?\n/g, '\r\n') + '\r\n';
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answer });
    if (this.closed || this.signal.aborted) throw new DOMException('操作已取消', 'AbortError');
    this.connectTimer = setTimeout(() => { if (!this.ready) this.fail('模型会话未就绪，请核对模型权限后重试。'); }, 20000);
    this.abort = () => this.close(); this.signal.addEventListener('abort', this.abort, { once: true });
  }
  send(event) { if (!this.closed && this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event)); }
  handle(event) {
    if (['input_audio_buffer.speech_started','input_audio_buffer.speech_stopped','response.created','response.done'].includes(event.type)) this.lastActivity = performance.now();
    if (event.type === 'session.created') { this.send(this.session.sessionUpdate); return; }
    if (event.type === 'session.updated' && !this.ready) {
      this.ready = true; this.lastActivity = performance.now(); clearTimeout(this.connectTimer);
      this.sender.replaceTrack(this.track).catch(() => this.fail('麦克风传输无法恢复，请重试。'));
      this.idleTimer = setInterval(() => { if (!this.closed && performance.now() - this.lastActivity > 60000) this.end('idle_timeout'); }, 5000); this.track.enabled = !this.muted;
      this.onEvent({ type: 'session.ready', character: this.session.character });
      this.limitTimer = setTimeout(() => this.end('time_limit'), Math.min(600, this.session.maxSessionSeconds) * 1000);
      return;
    }
    if (event.type === 'error') { this.fail('模型会话出错，请检查模型权限或重新开始。'); return; }
    if (event.type === 'input_audio_buffer.speech_started') { this.interrupt(); this.onEvent({ type: 'playback.clear' }); this.onEvent({ type: 'session.state', state: 'listening' }); }
    if (event.type === 'input_audio_buffer.speech_stopped') this.onEvent({ type: 'session.state', state: 'thinking' });
    if (event.type === 'response.created') { this.currentResponse = event.response?.id; this.awaitingDrain = false; this.silenceSince = null; this.speaking = true; if (this.gain) this.gain.gain.value = 1; this.onEvent({ type: 'session.state', state: 'speaking' }); }
    if (event.type === 'conversation.item.input_audio_transcription.completed') this.onEvent({ type: 'transcript.done', role: 'user', itemId: event.item_id, text: event.transcript });
    const cancelledCaption = this.cancelled.has(event.response_id);
    if (!cancelledCaption && ['response.audio_transcript.delta', 'response.output_audio_transcript.delta', 'response.text.delta'].includes(event.type)) this.onEvent({ type: 'transcript.delta', role: 'assistant', itemId: event.item_id, responseId: event.response_id, delta: event.delta });
    if (!cancelledCaption && ['response.audio_transcript.done', 'response.output_audio_transcript.done', 'response.text.done'].includes(event.type)) this.onEvent({ type: 'transcript.done', role: 'assistant', itemId: event.item_id, responseId: event.response_id, text: event.transcript || event.text });
    if (event.type === 'output_audio_buffer.stopped') { this.speaking = false; this.onEvent({ type: 'session.state', state: 'listening' }); }
    if (event.type === 'response.done') {
      const response = event.response;
      if (!response?.id || this.seenUsage.has(response.id)) return;
      this.seenUsage.add(response.id);
      const amount = usageYuan(response.usage);
      if (amount === null) this.onEvent({ type: 'usage', incomplete: true });
      else { this.sessionYuan += amount; this.onCost(amount, this.sessionYuan); }
      if (!this.cancelled.has(response.id)) { this.awaitingDrain = true; this.silenceSince = null; }

    }
  }
  updateOutputLevel(level, now = performance.now()) {
    if (!this.awaitingDrain || !this.speaking) return;
    if (level >= .003) { this.silenceSince = null; return; }
    if (this.silenceSince === null) this.silenceSince = now;
    if (now - this.silenceSince >= 350) { this.awaitingDrain = false; this.speaking = false; this.onEvent({ type: 'session.state', state: 'listening' }); }
  }
  get hasPendingUsage() { return Boolean(this.currentResponse && !this.seenUsage.has(this.currentResponse)); }
  end(reason) { if (this.hasPendingUsage) this.onEvent({type:'usage',incomplete:true}); this.onEvent({type:'session.ended',reason}); }
  setMuted(value) { this.muted = Boolean(value); if (this.track) this.track.enabled = this.ready && !this.muted && !this.closed; }
  interrupt() { if (this.currentResponse) this.cancelled.add(this.currentResponse); this.awaitingDrain = false; this.send({ type: 'response.cancel' }); this.speaking = false; if (this.gain) this.gain.gain.value = 0; }
  fail(message) { if (!this.closed) this.onEvent({ type: 'error', message, fatal: true }); }
  close() {
    if (this.closed) return;
    this.closed = true; this.ready = false; this.speaking = false;
    if (this.track) this.track.enabled = false;
    [this.connectTimer, this.limitTimer, this.playbackTimer].forEach(clearTimeout); clearInterval(this.idleTimer);
    this.signal.removeEventListener('abort', this.abort);
    if (this.channel) { this.channel.onmessage = this.channel.onclose = null; this.channel.close(); }
    if (this.pc) { this.pc.ontrack = this.pc.onconnectionstatechange = null; this.pc.close(); }
    this.remote?.disconnect(); this.gain?.disconnect();
  }
}
