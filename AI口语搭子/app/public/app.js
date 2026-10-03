const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start-button'), mute: $('mute-button'), interrupt: $('interrupt-button'),
  state: $('state-label'), pill: $('state-pill'), avatar: $('companion'),
  title: $('call-title'), hint: $('call-hint'), error: $('call-error'),
  transcript: $('transcript'), empty: $('transcript-empty'), copy: $('copy-button'),
  test: $('mic-test-button'), dialog: $('settings-dialog'),
  canvas: $('voice-orb'), preview: $('orb-preview-button'), previewStatus: $('orb-preview-status'),
};

const state = {
  health: null, token: '', scene: 'daily', view: 'home', mode: 'scene', category: 'all', favoritesOnly: false, active: false, ready: false,
  testing: false, muted: false, epoch: 0, socket: null, audio: null,
  request: null, timer: null, startedAt: 0, rows: new Map(),
  sources: new Set(), responses: new Map(), cancelled: new Set(),
  nextPlaybackAt: 0, sessionYuan: 0, currentResponse: null, costIncomplete: false,
  receivedFinal: false, status: 'idle', testingStage: null, sessionCharacterName: null,
  inputLevel: 0, lastInputAt: 0, meterFrame: null, previewAt: null, previewPhase: null,
};

const statusCopy = {
  idle: ['等待开始', '今天，想聊点什么？', '选个话题，开启你的英语聊天。\n卡住时可以说中文，我们慢慢来。'],
  connecting: ['正在连接', '正在和搭子连线', '请允许麦克风权限。\n戴上耳机，听得更清楚。'],
  listening: ['正在聆听', '我在听，你慢慢说', '说完稍等一下，我会接着聊。\n不用着急，也不用每句话都完美。'],
  thinking: ['想一想', '收到，让我想一想', '可以停顿，可以重来。\n你的每一句话，都是一次进步。'],
  speaking: ['搭子在说', '听听搭子怎么说', '想接话时可以直接开口。\n也可以点“打断”，停止这段回答。'],
  ended: ['本次已结束', '今天又多说了一点', '对话记录已经留下。\n准备好了，随时再聊一会儿。'],
};

const scenes = window.SpeakingScenes;
function readSet(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter(id => scenes.some(scene => scene.id === id)) : []); }
  catch { return new Set(); }
}
const favorites = readSet('speaking-favorites-v1');
const practiced = readSet('speaking-practiced-v1');
function saveSet(key, value) { try { localStorage.setItem(key, JSON.stringify([...value])); } catch { /* Browsing still works without storage. */ } }
function currentScene() { return scenes.find(scene => scene.id === state.scene) || scenes[0]; }
function characterName(scene = currentScene()) { return scene.character?.name || scene.partner; }
function conversationName() { return state.sessionCharacterName || characterName(); }
function populateCharacter(scene) {
  const character = scene.character;
  $('character-profile').hidden = !character;
  if (!character) return;
  $('character-profile-title').textContent = `认识 ${character.name}`;
  $('character-meta').textContent = [character.genderLabel, `${character.age} 岁`, character.occupation].filter(Boolean).join(' · ');
  $('character-tags').replaceChildren(...character.personality.tags.map(tag => { const span = document.createElement('span'); span.textContent = tag; return span; }));
  $('character-bio').textContent = character.bio;
  $('character-interests').textContent = character.interests.join('、');
  $('character-voice').textContent = character.speakingStyle.label;
}

// Each atlas cell keeps its original 2:3 aspect ratio; extra edges crop like object-fit: cover.
function fitSprite(el) {
  const width = el.clientWidth, height = el.clientHeight;
  if (!width || !height) return;
  const cellWidth = Math.max(width, height * 2 / 3), cellHeight = cellWidth * 1.5;
  const img = el.querySelector('img');
  Object.assign(img.style, {
    width: `${cellWidth * 3}px`, height: `${cellHeight * 2}px`,
    left: `${(width - cellWidth) / 2 - Number(el.dataset.column || 0) * cellWidth}px`,
    top: `${-Number(el.dataset.row || 0) * cellHeight}px`,
  });
}
const spriteObserver = new ResizeObserver(entries => entries.forEach(({ target }) => fitSprite(target)));
function setSprite(el, scene) {
  const appearance = scene.character?.appearance || scene;
  el.dataset.column = appearance.spriteX / 50;
  el.dataset.row = appearance.spriteY / 100;
  el.querySelector('img').src = appearance.image;
  fitSprite(el);
  spriteObserver.observe(el);
}
function sceneIcon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function renderScenes() {
  for (const visual of $('scene-grid').querySelectorAll('.scene-visual')) spriteObserver.unobserve(visual);
  $('scene-grid').replaceChildren();
  const filtered = scenes.slice().sort((a, b) => a.displayOrder - b.displayOrder).filter(scene =>
    (state.category === 'all' || scene.category === state.category) && (!state.favoritesOnly || favorites.has(scene.id)));
  for (const scene of filtered) {
    const card = document.createElement('article'); card.className = 'scene-card';
    const open = document.createElement('button'); open.className = 'scene-card-button'; open.dataset.scene = scene.id;
    open.setAttribute('aria-label', `${scene.title}，${scene.english}`);
    open.innerHTML = `<div class="scene-visual"><img alt=""></div><span class="scene-tag"></span><div class="scene-label"><small></small><strong></strong><em><span></span>${sceneIcon('arrow')}</em></div>`;
    open.querySelector('.scene-tag').textContent = practiced.has(scene.id) ? '✓ 练习过' : scene.tag;
    open.querySelector('.scene-label small').textContent = scene.title;
    open.querySelector('.scene-label strong').textContent = scene.english;
    open.querySelector('.scene-label em span').textContent = `${characterName(scene)} · ${scene.duration}`;
    open.addEventListener('click', () => openDetail(scene.id));
    const favorite = document.createElement('button'); favorite.className = 'scene-favorite';
    favorite.setAttribute('aria-pressed', String(favorites.has(scene.id)));
    favorite.setAttribute('aria-label', `${favorites.has(scene.id) ? '取消收藏' : '收藏'}${scene.title}`);
    favorite.innerHTML = sceneIcon('heart');
    favorite.addEventListener('click', () => {
      if (favorites.has(scene.id)) favorites.delete(scene.id); else favorites.add(scene.id);
      saveSet('speaking-favorites-v1', favorites); renderScenes();
    });
    card.append(open, favorite); $('scene-grid').append(card); setSprite(open.querySelector('.scene-visual'), scene);
  }
  $('scene-count').textContent = `${filtered.length} 个场景`;
  $('empty-favorites').hidden = filtered.length > 0;
  $('favorites-filter').setAttribute('aria-pressed', String(state.favoritesOnly));
  for (const button of document.querySelectorAll('[data-category]')) button.classList.toggle('selected', button.dataset.category === state.category);
}
function showView(view) {
  state.view = view;
  document.body.dataset.view = view;
  for (const name of ['home', 'detail', 'call']) $(`${name}-view`).hidden = name !== view;
  if (view !== 'call') { stopPreview(); pauseOrb(); }
  else { resizeOrb(); resumeOrb(); }
  document.querySelectorAll('.scene-visual').forEach(fitSprite);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function setMode(mode) {
  state.mode = mode === 'orb' ? 'orb' : 'scene';
  document.body.dataset.mode = state.mode;
  for (const button of document.querySelectorAll('button[data-mode]')) {
    const selected = button.dataset.mode === state.mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  if (state.view === 'call') { resizeOrb(); resumeOrb(); }
}
function populateScene() {
  const scene = currentScene();
  setSprite($('detail-art'), scene); setSprite($('call-art'), scene);
  $('detail-partner').textContent = characterName(scene); $('detail-role').textContent = scene.character?.occupation || scene.role;
  populateCharacter(scene);
  $('detail-tag').textContent = `${scene.category === 'travel' ? '旅行出行' : '日常生活'} · ${scene.duration}`;
  $('detail-title').textContent = scene.title; $('detail-english').textContent = scene.english;
  $('detail-description').textContent = scene.description;
  $('detail-tasks').replaceChildren(...scene.tasks.map(task => { const li = document.createElement('li'); li.textContent = task; return li; }));
  $('call-partner').textContent = characterName(scene); $('call-scene-label').textContent = scene.title;
  $('transcript-title').textContent = `与 ${characterName(scene)} 的对话`;
  setStatus(state.status);
}
function openDetail(id) {
  if (state.active || state.testing) return;
  const changed = state.scene !== id;
  if (changed && state.socket) { state.socket.close(); state.socket = null; }
  state.scene = id;
  if (changed) { state.sessionCharacterName = null; resetTranscript(); updateDuration(0); showCost(0, 'session-cost'); showError(); setStatus('idle'); }
  populateScene(); showView('detail');
}
function enterCall(mode = state.mode) {
  setMode(mode); populateScene(); showView('call');
}
function chooseHomeTab(free) {
  $('topics-tab').setAttribute('aria-selected', String(!free)); $('free-tab').setAttribute('aria-selected', String(free));
  $('topics-panel').hidden = free; $('free-panel').hidden = !free;
  $('favorites-filter').hidden = free;
  $('nav-home').classList.toggle('selected', !free); $('nav-free').classList.toggle('selected', free);
}
function initializeViews() {
  renderScenes(); populateScene();
  for (const button of document.querySelectorAll('button[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
  for (const button of document.querySelectorAll('[data-category]')) button.addEventListener('click', () => { state.category = button.dataset.category; renderScenes(); });
  $('favorites-filter').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; renderScenes(); });
  $('show-all-scenes').addEventListener('click', () => { state.favoritesOnly = false; state.category = 'all'; renderScenes(); });
  $('topics-tab').addEventListener('click', () => chooseHomeTab(false));
  $('free-tab').addEventListener('click', () => chooseHomeTab(true));
  $('nav-home').addEventListener('click', () => { chooseHomeTab(false); showView('home'); });
  $('nav-free').addEventListener('click', () => { chooseHomeTab(true); showView('home'); });
  $('detail-back').addEventListener('click', () => showView('home'));
  $('call-back').addEventListener('click', () => { if (state.testing) return; if (state.active) stopSession(); showView('detail'); });
  $('detail-enter').addEventListener('click', () => enterCall());
  $('free-enter').addEventListener('click', () => { openDetail('daily'); enterCall('orb'); });
  const params = new URLSearchParams(location.search);
  if (['voice-orb', 'rareui-fluid-orb', 'call', 'scene'].includes(params.get('view'))) {
    const scene = params.get('scene'); if (scenes.some(item => item.id === scene)) state.scene = scene;
    enterCall(['voice-orb', 'rareui-fluid-orb'].includes(params.get('view')) || params.get('mode') === 'orb' ? 'orb' : 'scene');
  } else showView('home');
}

let orb;
try {
  orb = new window.VoiceOrb(ui.canvas, { pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
} catch {
  // Keep all conversation controls usable if the browser cannot create a GPU canvas.
  ui.avatar.classList.add('orb-fallback');
  ui.preview.hidden = true;
  ui.previewStatus.textContent = '当前浏览器使用静态语音图形';
  orb = { resize() {}, setReducedMotion() {}, setState() {}, setInputLevel() {}, setOutputLevel() {}, start() {}, pause() {} };
}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
orb.setReducedMotion(reducedMotion.matches);
reducedMotion.addEventListener('change', (event) => orb.setReducedMotion(event.matches));

function resizeOrb() {
  const { width, height } = ui.avatar.getBoundingClientRect();
  if (width > 0 && height > 0) orb.resize(width, height);
}
const orbObserver = new ResizeObserver(resizeOrb);
orbObserver.observe(ui.avatar);
resizeOrb();

function applyOrbState() {
  if (state.previewAt !== null) return;
  let name = state.testingStage || state.status;
  // Muting only affects the microphone: the partner's actual playback still animates.
  if (state.muted && state.active && name !== 'speaking') name = 'muted';
  ui.avatar.dataset.state = name;
  $('call-card').dataset.state = name;
  orb.setState(name);
}

function rms(samples, divisor = 1) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const value of samples) sum += (value / divisor) ** 2;
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

function measureMicrophone(buffer) {
  state.inputLevel = rms(new Int16Array(buffer), 32768);
  state.lastInputAt = performance.now();
}

function stopPreview() {
  if (state.previewAt === null) return;
  state.previewAt = null;
  state.previewPhase = null;
  ui.preview.setAttribute('aria-pressed', 'false');
  ui.preview.querySelector('span').textContent = '预览通话动效';
  ui.previewStatus.textContent = '仅画面预览，不开启麦克风';
  orb.setInputLevel(0);
  orb.setOutputLevel(0);
  applyOrbState();
}

function animatePreview(now) {
  const t = ((now - state.previewAt) / 1000) % 11;
  const name = t < 3.6 ? 'listening' : t < 5.2 ? 'thinking' : t < 9.3 ? 'speaking' : 'muted';
  if (name !== state.previewPhase) {
    state.previewPhase = name;
    orb.setState(name);
    ui.avatar.dataset.state = name;
    $('call-card').dataset.state = name;
    const label = { listening: '聆听', thinking: '思考', speaking: '说话', muted: '静音' }[name];
    ui.previewStatus.textContent = `动效预览 · ${label} · 不调用 AI`;
  }
  // Explicit visual demo only. It never opens the microphone, a session, or subtitles.
  const level = Math.max(0, Math.sin(t * 7.1) * .28 + Math.sin(t * 2.6) * .18 + .28);
  orb.setInputLevel(name === 'listening' ? level : 0);
  orb.setOutputLevel(name === 'speaking' ? level : 0);
  $('scene-presence').style.setProperty('--voice-level', ['speaking', 'listening'].includes(name) ? level : 0);
}

function meterTick(now) {
  state.meterFrame = null;
  if (document.hidden || state.view !== 'call') return;
  if (state.previewAt !== null) animatePreview(now);
  else {
    const inputEnabled = !state.muted && ((state.active && state.ready) || state.testingStage === 'listening');
    orb.setInputLevel(inputEnabled && now - state.lastInputAt < 180 ? state.inputLevel : 0);
    const audio = state.audio;
    if (audio?.analyser && audio.context.state === 'running' && state.sources.size) {
      audio.analyser.getFloatTimeDomainData(audio.meterSamples);
      orb.setOutputLevel(rms(audio.meterSamples));
    } else orb.setOutputLevel(0);
    const level = state.sources.size ? rms(audio?.meterSamples || []) : inputEnabled && now - state.lastInputAt < 180 ? state.inputLevel : 0;
    $('scene-presence').style.setProperty('--voice-level', level);
  }
  state.meterFrame = requestAnimationFrame(meterTick);
}

function resumeOrb() {
  if (document.hidden || state.view !== 'call') return;
  if (state.mode === 'orb') orb.start();
  else orb.pause();
  if (state.meterFrame === null) state.meterFrame = requestAnimationFrame(meterTick);
}

function pauseOrb() {
  orb.pause();
  if (state.meterFrame !== null) cancelAnimationFrame(state.meterFrame);
  state.meterFrame = null;
}

function setStatus(name) {
  state.status = statusCopy[name] ? name : 'idle';
  const [baseLabel, baseTitle, hint] = statusCopy[state.status];
  const nameCopy = conversationName();
  const label = state.status === 'speaking' ? `${nameCopy} 在说` : baseLabel;
  const title = state.status === 'connecting' ? `正在和 ${nameCopy} 连线`
    : state.status === 'speaking' ? `听听 ${nameCopy} 怎么说` : baseTitle;
  ui.state.textContent = state.muted && state.active ? '麦克风已静音' : label;
  ui.title.textContent = title;
  ui.hint.textContent = hint;
  ui.hint.style.whiteSpace = 'pre-line';
  applyOrbState();
  ui.pill.classList.toggle('active', state.active && state.ready);
  $('live-label').classList.toggle('active', state.active && state.ready);
}

function updateControls() {
  ui.start.disabled = state.testing || (!state.active && !state.health?.configured);
  ui.start.classList.toggle('ending', state.active);
  ui.start.querySelector('span').textContent = state.active ? '结束聊天' : '开始聊天';
  ui.mute.disabled = !state.ready || !state.active;
  ui.interrupt.disabled = !state.ready || !state.active;
  ui.mute.setAttribute('aria-pressed', String(state.muted));
  ui.mute.querySelector('span').textContent = state.muted ? '取消静音' : '静音';
  $('preferences').disabled = state.active || state.testing;
  ui.test.disabled = state.active || state.testing;
  ui.preview.disabled = state.active || state.testing;
  $('call-back').disabled = state.testing;
  $('call-back').querySelector('span').textContent = state.active ? '结束并返回' : '返回场景';
}

function showError(message = '') {
  ui.error.textContent = message;
  ui.error.hidden = !message;
}

function readableError(error) {
  if (error.name === 'NotAllowedError') return '麦克风权限未开启。请在浏览器地址栏的权限设置中允许麦克风，然后重试。';
  if (error.name === 'NotFoundError') return '没有找到麦克风。请连接麦克风或耳机后重试。';
  if (error.name === 'NotReadableError') return '暂时无法使用麦克风。请检查设备是否被其他应用占用。';
  if (error.name === 'SecurityError') return '浏览器阻止了录音。请通过 localhost 或 HTTPS 打开页面。';
  if (error.name === 'AbortError') return '';
  return error.message || '连接遇到问题，请稍后重试。';
}

async function readJSON(response) {
  let data;
  try { data = await response.json(); } catch { throw new Error(`服务器未返回有效数据（${response.status}）。`); }
  if (!response.ok) throw new Error(data.error?.message || `请求失败（${response.status}）。`);
  return data;
}

async function checkHealth() {
  $('refresh-button').disabled = true;
  try {
    state.health = await readJSON(await fetch('/api/health', { cache: 'no-store' }));
    const configured = Boolean(state.health.configured);
    $('service-state').textContent = configured ? '千问连接已配置' : '千问待配置';
    $('service-state').classList.toggle('ready', configured);
    $('setup-banner').hidden = configured;
    $('health-details').textContent = configured
      ? `模型：${state.health.model || '由后端配置'}。配置已检测到，实际可用性将在开始通话时验证。`
      : `尚未配置：${(state.health.missing || ['百炼 API Key']).join('、')}。保存 .env 后请重启服务。`;
    await refreshUsage();
  } catch (error) {
    state.health = null;
    $('service-state').textContent = '后端服务未连接';
    $('service-state').classList.remove('ready');
    $('setup-banner').hidden = false;
    $('health-details').textContent = readableError(error);
    showError('暂时无法连接后端。请确认服务已启动，再到连接设置中重新检查。');
  } finally {
    $('refresh-button').disabled = false;
    updateControls();
  }
}

async function refreshUsage() {
  // The monthly total must come from the ledger; a missing total is not zero.
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!isLocal && !$('access-token').value.trim()) return;
  try {
    const token = await getAccessToken();
    const usage = await readJSON(await fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }));
    showCost(usage.monthlyYuan, 'monthly-cost');
  } catch { $('monthly-cost').textContent = '—'; }
}

async function getAccessToken(signal) {
  const manualToken = $('access-token').value.trim();
  if (manualToken) return manualToken;
  if (state.token) return state.token;
  const response = await fetch('/api/local-token', { cache: 'no-store', signal });
  if (!response.ok) {
    ui.dialog.showModal();
    throw new Error('当前访问方式需要应用访问口令，请在连接设置中填写。不要填写百炼 API Key。');
  }
  const data = await readJSON(response);
  if (!data.token) throw new Error('没有获取到本机访问口令。请重新启动后端后重试。');
  state.token = data.token;
  return data.token;
}

function base64FromPCM(buffer) {
  const bytes = new Uint8Array(buffer);
  let value = '';
  for (let i = 0; i < bytes.length; i++) value += String.fromCharCode(bytes[i]);
  return btoa(value);
}

function floatFromPCM(encoded) {
  const bytes = atob(encoded);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < samples.length; i++) {
    let sample = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
    if (sample >= 0x8000) sample -= 0x10000;
    samples[i] = sample / 32768;
  }
  return samples;
}

async function createCapture(onPacket, epoch) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('浏览器录音需要安全环境，请用 localhost、127.0.0.1 或 HTTPS 打开页面。');
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.AudioWorkletNode) throw new Error('当前浏览器不支持实时音频处理，请使用新版 Chrome、Edge 或 Safari。');
  const bundle = { context: new AudioContextClass({ latencyHint: 'interactive' }), stream: null, input: null, node: null, silent: null, analyser: null, meterSamples: null };
  try {
    await bundle.context.resume();
    bundle.analyser = bundle.context.createAnalyser();
    bundle.analyser.fftSize = 1024;
    bundle.meterSamples = new Float32Array(bundle.analyser.fftSize);
    bundle.analyser.connect(bundle.context.destination);
    bundle.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (state.epoch !== epoch) throw new DOMException('操作已取消', 'AbortError');
    await bundle.context.audioWorklet.addModule('/pcm-capture-worklet.js');
    if (state.epoch !== epoch) throw new DOMException('操作已取消', 'AbortError');
    bundle.input = bundle.context.createMediaStreamSource(bundle.stream);
    bundle.node = new AudioWorkletNode(bundle.context, 'pcm-capture');
    bundle.silent = bundle.context.createGain();
    bundle.silent.gain.value = 0;
    bundle.node.port.onmessage = ({ data }) => {
      if (state.epoch === epoch) {
        measureMicrophone(data);
        onPacket(data);
      }
    };
    bundle.input.connect(bundle.node);
    bundle.node.connect(bundle.silent);
    bundle.silent.connect(bundle.context.destination);
    bundle.stream.getAudioTracks()[0].onended = () => {
      if (state.active && state.epoch === epoch) {
        showError('麦克风连接已中断，本次聊天已结束。');
        stopSession();
      }
    };
    return bundle;
  } catch (error) {
    disposeCapture(bundle);
    throw error;
  }
}

function disposeCapture(bundle) {
  if (!bundle) return;
  if (bundle.node) bundle.node.port.onmessage = null;
  bundle.input?.disconnect();
  bundle.node?.disconnect();
  bundle.silent?.disconnect();
  bundle.analyser?.disconnect();
  bundle.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
  if (bundle.context.state !== 'closed') bundle.context.close().catch(() => {});
}

function send(message) {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message));
}

function clearPlayback(responseId) {
  if (responseId) state.cancelled.add(responseId);
  for (const response of state.responses.keys()) state.cancelled.add(response);
  for (const source of state.sources) {
    source.onended = null;
    try { source.stop(); } catch { /* The buffer may already have ended. */ }
    source.disconnect();
  }
  state.sources.clear();
  state.responses.clear();
  state.nextPlaybackAt = 0;
  state.currentResponse = null;
  orb.setOutputLevel(0);
}

function playbackComplete(responseId) {
  const response = state.responses.get(responseId);
  if (response?.done && response.pending === 0 && !response.notified) {
    response.notified = true;
    send({ type: 'playback.done', responseId });
    if (state.sources.size === 0 && state.active && state.ready) setStatus('listening');
  }
}

function playDelta(message) {
  const context = state.audio?.context;
  if (!state.active || !context || context.state === 'closed' || state.cancelled.has(message.responseId)) return;
  const samples = floatFromPCM(message.audio);
  if (!samples.length) return;
  const buffer = context.createBuffer(1, samples.length, 24000);
  buffer.copyToChannel(samples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audio.analyser);
  const responseId = message.responseId || 'current';
  let response = state.responses.get(responseId);
  if (!response) {
    response = { pending: 0, done: false, notified: false };
    state.responses.set(responseId, response);
  }
  response.pending++;
  state.currentResponse = responseId;
  state.sources.add(source);
  source.onended = () => {
    source.disconnect();
    state.sources.delete(source);
    response.pending--;
    playbackComplete(responseId);
  };
  const at = Math.max(context.currentTime + 0.035, state.nextPlaybackAt);
  source.start(at);
  state.nextPlaybackAt = at + buffer.duration;
  setStatus('speaking');
}

function addTranscript(message, done = false) {
  if (!message.text && !message.delta) return;
  const role = message.role === 'user' ? 'user' : 'assistant';
  const key = `${role}:${message.itemId || message.responseId || `entry-${state.rows.size}`}`;
  const nearBottom = ui.transcript.scrollHeight - ui.transcript.scrollTop - ui.transcript.clientHeight < 80;
  let row = state.rows.get(key);
  if (!row) {
    ui.empty.hidden = true;
    const element = document.createElement('div');
    element.className = `utterance ${role}`;
    const speaker = document.createElement('div');
    speaker.className = 'speaker';
    const speakerName = role === 'user' ? '你' : conversationName();
    speaker.textContent = speakerName;
    const content = document.createElement('p');
    element.append(speaker, content);
    ui.transcript.append(element);
    row = { element, content, role, speakerName, text: '' };
    state.rows.set(key, row);
  }
  row.text = done ? message.text : row.text + message.delta;
  row.content.textContent = row.text;
  $('current-caption').hidden = false;
  $('caption-speaker').textContent = role === 'user' ? '你说' : row.speakerName;
  $('caption-text').textContent = row.text;
  row.element.classList.toggle('streaming', !done);
  ui.copy.disabled = state.rows.size === 0;
  if (nearBottom) ui.transcript.scrollTop = ui.transcript.scrollHeight;
}

function resetTranscript() {
  for (const row of state.rows.values()) row.element.remove();
  state.rows.clear();
  $('current-caption').hidden = true;
  ui.empty.hidden = false;
  ui.copy.disabled = true;
}

function updateDuration(seconds) {
  const duration = Math.max(0, Math.floor(seconds));
  $('duration').textContent = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
}

function showCost(value, id) {
  if (Number.isFinite(value) && value >= 0) $(id).textContent = `¥${value.toFixed(4)}`;
}

function cleanupAudio() {
  clearInterval(state.timer);
  state.timer = null;
  clearPlayback();
  disposeCapture(state.audio);
  state.audio = null;
  state.ready = false;
  state.inputLevel = 0;
  orb.setInputLevel(0);
  orb.setOutputLevel(0);
}

function finishSession(message) {
  state.active = false;
  state.muted = false;
  state.request?.abort();
  cleanupAudio();
  if (Number.isFinite(message?.stats?.elapsedSeconds)) updateDuration(message.stats.elapsedSeconds);
  if (Number.isFinite(message?.stats?.sessionYuan)) showCost(message.stats.sessionYuan, 'session-cost');
  if (message?.stats?.incomplete || state.costIncomplete) markIncompleteUsage();
  if (message?.transcript?.length) {
    resetTranscript();
    message.transcript.forEach((item, index) => addTranscript({ ...item, itemId: `final-${index}` }, true));
  }
  for (const row of state.rows.values()) row.element.classList.remove('streaming');
  if ([...state.rows.values()].some(row => row.role === 'user' && row.text.trim())) {
    practiced.add(state.scene);
    saveSet('speaking-practiced-v1', practiced);
    renderScenes();
  }
  setStatus('ended');
  updateControls();
}

function onServerMessage(message) {
  switch (message.type) {
    case 'session.ready':
      if (!state.active) return;
      state.sessionCharacterName = message.character?.name || state.sessionCharacterName;
      $('transcript-title').textContent = `与 ${conversationName()} 的对话`;
      state.ready = true;
      state.startedAt = Date.now();
      state.timer = setInterval(() => updateDuration((Date.now() - state.startedAt) / 1000), 1000);
      setStatus('listening');
      updateControls();
      break;
    case 'session.state':
      if (!state.active) return;
      // A model response can finish generating before the scheduled audio ends.
      if (state.sources.size && ['listening', 'thinking'].includes(message.state)) return;
      setStatus(message.state);
      break;
    case 'audio.delta': playDelta(message); break;
    case 'audio.done': {
      const id = message.responseId || 'current';
      if (state.cancelled.has(id)) break;
      const response = state.responses.get(id) || { pending: 0, done: false, notified: false };
      response.done = true;
      state.responses.set(id, response);
      playbackComplete(id);
      break;
    }
    case 'playback.clear':
      clearPlayback(message.responseId);
      if (state.active && state.ready) setStatus('listening');
      break;
    case 'transcript.delta': addTranscript(message); break;
    case 'transcript.done': addTranscript(message, true); break;
    case 'usage':
      showCost(message.sessionYuan, 'session-cost');
      showCost(message.monthlyYuan, 'monthly-cost');
      state.sessionYuan = message.sessionYuan || 0;
      if (message.incomplete) markIncompleteUsage();
      break;
    case 'error':
      showError(message.message || '实时服务暂时不可用，请结束后重试。');
      if (message.fatal !== false) {
        stopSession();
      }
      break;
    case 'session.ended':
      state.receivedFinal = true;
      finishSession(message);
      if (message.reason && !['user_stop', 'client_stop', 'normal'].includes(message.reason)) {
        const reasons = {
          time_limit: '本次聊天达到时长上限，已自动结束。',
          budget_limit: '已达到当天或本月模型费用阈值，聊天已结束。',
          idle_timeout: '一段时间没有对话，已自动结束本次聊天。',
          upstream_closed: '语音服务连接已结束。你可以手动开始新的聊天。',
        };
        if (reasons[message.reason]) $('device-note').textContent = reasons[message.reason];
      }
      state.socket?.close();
      break;
  }
}

function markIncompleteUsage() {
  state.costIncomplete = true;
  $('session-cost').textContent = '待核对';
  $('device-note').textContent = '本次用量未完整返回，页面金额可能低估，请以百炼账单为准';
}

async function startSession() {
  if (state.active) { stopSession(); return; }
  if (state.testing || !state.health?.configured) return;
  stopPreview();
  const epoch = ++state.epoch;
  state.socket?.close();
  state.socket = null;
  state.active = true;
  state.sessionCharacterName = characterName();
  state.muted = false;
  state.ready = false;
  state.cancelled.clear();
  state.costIncomplete = false;
  state.receivedFinal = false;
  state.request = new AbortController();
  showError();
  setStatus('connecting');
  updateControls();
  try {
    const capture = await createCapture((buffer) => {
      if (!state.active || !state.ready || state.muted) return;
      if (state.socket?.bufferedAmount > 256000) {
        showError('网络发送缓慢，本次聊天已结束。请检查网络后重试。');
        stopSession();
        return;
      }
      send({ type: 'audio.append', audio: base64FromPCM(buffer) });
    }, epoch);
    if (state.epoch !== epoch || !state.active) { disposeCapture(capture); return; }
    state.audio = capture;
    const token = await getAccessToken(state.request.signal);
    const session = await readJSON(await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scene: state.scene, level: $('level').value, correction: $('correction').value }),
      signal: state.request.signal,
    }));
    if (state.epoch !== epoch || !state.active) return;
    if (!session.websocketPath) throw new Error('服务器没有返回通话连接地址。');
    const socketURL = new URL(session.websocketPath, window.location.href);
    if (socketURL.origin !== window.location.origin) throw new Error('通话连接地址与当前后端不一致。');
    socketURL.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(socketURL);
    state.socket = socket;
    resetTranscript();
    updateDuration(0);
    showCost(0, 'session-cost');
    $('device-note').textContent = '声音由千问 AI 生成 · 建议戴耳机练习';
    const connectTimeout = setTimeout(() => {
      if (state.socket === socket && state.active && !state.ready) {
        showError('连接超时，尚未开始通话。请检查模型权限和网络后重试。');
        finishSession();
        socket.close();
      }
    }, 20000);
    socket.onmessage = (event) => {
      if (state.socket !== socket || state.epoch !== epoch) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'session.ready') clearTimeout(connectTimeout);
        onServerMessage(message);
      } catch {
        showError('收到的语音数据无法处理，本次聊天已结束。');
        stopSession();
      }
    };
    socket.onerror = () => {
      if (state.socket === socket && state.active) showError('实时连接失败。请检查后端日志、模型权限和网络。');
    };
    socket.onclose = () => {
      clearTimeout(connectTimeout);
      if (state.socket !== socket || state.epoch !== epoch) return;
      if (!state.receivedFinal) markIncompleteUsage();
      if (state.active) {
        showError('连接已断开，本次聊天已结束。不会自动重新创建付费会话。');
        finishSession();
      }
      state.socket = null;
    };
  } catch (error) {
    if (state.epoch !== epoch) return;
    showError(readableError(error));
    finishSession();
  }
}

function stopSession() {
  state.request?.abort();
  send({ type: 'session.stop' });
  const socket = state.socket;
  finishSession();
  // Keep receiving the final usage/transcript briefly, but release the microphone now.
  setTimeout(() => { if (socket && socket.readyState < WebSocket.CLOSING) socket.close(); }, 2000);
}

async function testMicrophone() {
  if (state.active || state.testing) return;
  stopPreview();
  const epoch = ++state.epoch;
  state.testing = true;
  state.testingStage = 'connecting';
  applyOrbState();
  showError();
  updateControls();
  const packets = [];
  try {
    ui.test.textContent = '请允许麦克风权限…';
    state.audio = await createCapture((buffer) => packets.push(new Int16Array(buffer)), epoch);
    state.testingStage = 'listening';
    applyOrbState();
    ui.test.textContent = '正在本地录音，请说一句话（3 秒）…';
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (state.epoch !== epoch) return;
    state.audio.node.port.onmessage = null;
    state.audio.stream.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    state.audio.input.disconnect();
    if (!packets.length) throw new Error('没有收到麦克风音频。请检查浏览器权限和输入设备。');
    state.testingStage = 'speaking';
    applyOrbState();
    ui.test.textContent = '正在回放刚才的录音，不调用 AI…';
    const context = state.audio.context;
    const count = packets.reduce((sum, packet) => sum + packet.length, 0);
    const buffer = context.createBuffer(1, count, 16000);
    const channel = buffer.getChannelData(0);
    let offset = 0;
    for (const packet of packets) for (const value of packet) channel[offset++] = value / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audio.analyser);
    state.sources.add(source);
    await new Promise((resolve) => { source.onended = resolve; source.start(); });
    source.disconnect();
    state.sources.delete(source);
    $('device-note').textContent = '麦克风检查已完成 · 录音仅在本地回放，未保存或上传';
  } catch (error) {
    showError(readableError(error));
  } finally {
    if (state.epoch === epoch) {
      cleanupAudio();
      state.testing = false;
      state.testingStage = null;
      applyOrbState();
      ui.test.replaceChildren(document.createTextNode('检查麦克风 '));
      const label = document.createElement('span');
      label.textContent = '· 录制 3 秒后本地回放，不调用 AI';
      ui.test.append(label);
      updateControls();
    }
  }
}

ui.preview.addEventListener('click', () => {
  if (state.active || state.testing) return;
  if (state.previewAt !== null) { stopPreview(); return; }
  state.previewAt = performance.now();
  ui.preview.setAttribute('aria-pressed', 'true');
  ui.preview.querySelector('span').textContent = '退出预览';
  resumeOrb();
});
ui.start.addEventListener('click', startSession);
ui.test.addEventListener('click', testMicrophone);
ui.mute.addEventListener('click', () => {
  state.muted = !state.muted;
  updateControls();
  if (state.muted) orb.setInputLevel(0);
  setStatus(state.sources.size ? 'speaking' : state.status);
});
ui.interrupt.addEventListener('click', () => {
  clearPlayback(state.currentResponse);
  send({ type: 'interrupt' });
  setStatus('listening');
});
for (const id of ['settings-open', 'setup-open', 'nav-settings']) $(id).addEventListener('click', () => ui.dialog.showModal());
$('refresh-button').addEventListener('click', async () => {
  state.token = '';
  showError();
  await checkHealth();
  if (state.health?.configured) ui.dialog.close();
});
$('copy-access-token').addEventListener('click', async () => {
  const button = $('copy-access-token');
  button.disabled = true;
  try {
    const token = await getAccessToken();
    await navigator.clipboard.writeText(token);
    $('token-copy-status').textContent = '已复制，请仅粘贴到自己的小程序设置';
  } catch (error) {
    $('token-copy-status').textContent = error.name === 'NotAllowedError'
      ? '浏览器未允许复制，请在本机 Chrome 中重试'
      : readableError(error);
  } finally { button.disabled = false; }
});
ui.copy.addEventListener('click', async () => {
  const text = [...state.rows.values()].map((row) => `${row.role === 'user' ? '我' : row.speakerName}：${row.text}`).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    ui.copy.textContent = '已复制';
    setTimeout(() => { ui.copy.textContent = '复制记录'; }, 1800);
  } catch { showError('浏览器不允许自动复制。可以直接选中字幕进行复制。'); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseOrb();
  else resumeOrb();
});
window.addEventListener('pageshow', resumeOrb);
window.addEventListener('pagehide', () => {
  stopPreview();
  pauseOrb();
  state.epoch++;
  send({ type: 'session.stop' });
  state.socket?.close();
  state.request?.abort();
  cleanupAudio();
  state.active = false;
  state.testing = false;
  state.testingStage = null;
  setStatus('idle');
  updateControls();
});

initializeViews();
checkHealth();
