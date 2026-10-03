import { timingSafeEqual } from 'node:crypto';
import { MODEL } from './config.mjs';
import { validateOptions, providerSession } from './prompt.mjs';
import { characterSnapshot } from './catalog.mjs';

export function rtcConfig(env = process.env) {
  const key = env.aliyun?.trim() || env.DASHSCOPE_API_KEY?.trim() || '';
  const workspace = env.DASHSCOPE_WORKSPACE_ID?.trim() || '';
  const token = env.APP_ACCESS_TOKEN?.trim() || '';
  const validWorkspace = /^[a-zA-Z0-9_-]{1,128}$/.test(workspace);
  return { key, token, workspace, model: MODEL,
    missing: [!key && 'aliyun / DASHSCOPE_API_KEY', !validWorkspace && 'DASHSCOPE_WORKSPACE_ID', token.length < 24 && 'APP_ACCESS_TOKEN（至少24字符）'].filter(Boolean),
    endpoint: validWorkspace ? `https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=${MODEL}` : null,
  };
}

function authorized(req, token) {
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
  const a = Buffer.from(supplied), b = Buffer.from(token);
  return b.length >= 24 && a.length === b.length && timingSafeEqual(a, b);
}

// Vercel handles only the short SDP exchange; no permanent key reaches the browser.
export function rtcHandler({ env = process.env, fetchProvider = fetch } = {}) {
  return async function handle(req, res, route) {
    const config = rtcConfig(env);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
    if (route === 'health') {
      if (req.method !== 'GET') return reply(405, { error: 'method_not_allowed' });
      return reply(200, { configured: !config.missing.length, missing: config.missing, model: MODEL, transport: 'webrtc', usageStorage: 'device', maxSessionSeconds: 600 });
    }
    if (route === 'local-token') return reply(403, { error: 'remote_access_token_required' });
    if (!authorized(req, config.token)) return reply(401, { error: '应用访问口令不正确，请在连接设置中填写。' });
    if (route === 'usage') return reply(200, { monthlyYuan: null, dailyYuan: null, storage: 'device' });
    if (route !== 'webrtc') return reply(404, { error: '此部署通过浏览器 WebRTC 提供语音。小程序仍需支持 WebSocket 的后端。' });
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (config.missing.length) return reply(503, { error: '语音服务配置不完整', missing: config.missing });
    const origin = req.headers.origin;
    const expectedOrigin = env.PUBLIC_ORIGIN?.replace(/\/$/, '') || `https://${req.headers.host}`;
    if (origin && origin !== expectedOrigin) return reply(403, { error: '请求来源与当前应用不一致。' });
    let body, options;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body.sdp !== 'string' || body.sdp.length > 65536 || !body.sdp.startsWith('v=0\r\n') || !/^m=audio /m.test(body.sdp)) throw new Error();
      options = validateOptions(body);
    } catch { return reply(400, { error: '请提交有效的音频连接与练习设置。' }); }
    try {
      const upstream = await fetchProvider(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${config.key}` }, body: body.sdp, signal: AbortSignal.timeout(20000) });
      if (!upstream.ok) return reply(502, { error: '百炼未接受语音连接，请核对北京地域的 Key、业务空间和模型权限。', providerStatus: upstream.status });
      const answer = await upstream.text();
      if (!answer.startsWith('v=0') || answer.length > 262144) return reply(502, { error: '语音服务返回的连接信息无效。' });
      return reply(200, { answer, character: characterSnapshot(options.scene), sessionUpdate: providerSession({ inputTranscription: env.ENABLE_INPUT_TRANSCRIPTION !== 'false', vadSilenceMs: 1400 }, options), maxSessionSeconds: 600, usageStorage: 'device' });
    } catch { return reply(502, { error: '语音连接未完成，请稍后重试。' }); }
  };
}
