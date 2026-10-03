import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Ledger } from './ledger.mjs';
import { VoiceSession } from './session.mjs';
import { validateOptions } from './prompt.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const loopbackAddress = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
const loopbackName = value => ['localhost', '127.0.0.1', '[::1]'].includes(value);

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function error(res, status, code, message) { json(res, status, { error: { code, message } }); }
function authorized(req, token) {
  const actual = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function readJson(req) {
  let body = '', length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) throw new Error('请求内容过长');
    body += chunk;
  }
  const parsed = JSON.parse(body || '{}');
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('请求必须为JSON对象');
  return parsed;
}

export function createApp(config) {
  const ledger = new Ledger(config.dataDir);
  const tickets = new Map();
  let active = null;
  let closing = false;
  const staticRoot = path.join(config.root, 'public');
  function validRequest(req) {
    let host;
    try { host = new URL(`http://${req.headers.host}`).host; } catch { return false; }
    const localPort = req.socket.localPort;
    const localOrigins = [`http://127.0.0.1:${localPort}`, `http://localhost:${localPort}`, `http://[::1]:${localPort}`];
    const allowed = [...localOrigins, ...(config.publicOrigin ? [config.publicOrigin] : [])];
    const allowedHosts = allowed.map(origin => new URL(origin).host);
    if (!allowedHosts.includes(host)) return false;
    return !req.headers.origin || allowed.includes(req.headers.origin);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-ancestors 'none'");
    if (!validRequest(req)) return error(res, 403, 'ORIGIN_DENIED', '请从配置的应用地址访问。');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return error(res, 400, 'BAD_URL', '地址无效'); }
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return json(res, 200, { version: '0.1.0', configured: config.missing.length === 0, missing: config.missing, model: config.model, inputTranscription: config.inputTranscription, maxSessionSeconds: config.maxSessionSeconds, costIsEstimate: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/local-token') {
        const hostname = new URL(`http://${req.headers.host}`).hostname;
        if (!loopbackAddress(req.socket.remoteAddress) || !loopbackName(hostname) || req.headers['x-forwarded-for'] || ![undefined, 'same-origin', 'none'].includes(req.headers['sec-fetch-site'])) {
          return error(res, 403, 'LOCAL_ONLY', '远程访问请手动输入应用访问口令。');
        }
        return json(res, 200, { token: config.accessToken });
      }
      if (req.method === 'GET' && url.pathname === '/api/usage') {
        if (!authorized(req, config.accessToken)) return error(res, 401, 'UNAUTHORIZED', '应用访问口令不正确。');
        return json(res, 200, { ...ledger.totals(), dailyBudget: config.dailyBudget, monthlyBudget: config.monthlyBudget, estimated: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        if (!authorized(req, config.accessToken)) return error(res, 401, 'UNAUTHORIZED', '应用访问口令不正确。');
        if (closing) return error(res, 503, 'SHUTTING_DOWN', '服务正在关闭。');
        if (config.missing.length) return error(res, 503, 'NOT_CONFIGURED', '请先在后端 .env 填入百炼北京地域密钥和业务空间 ID，然后重启服务。');
        if (active || tickets.size) return error(res, 409, 'SESSION_BUSY', '已有一通对话，请先挂断再开始。');
        const totals = ledger.totals();
        if (totals.dailyYuan >= config.dailyBudget || totals.monthlyYuan >= config.monthlyBudget) return error(res, 429, 'BUDGET_LIMIT', '已达到设置的模型费用阈值，请检查用量。');
        let options;
        try { options = validateOptions(await readJson(req)); } catch (e) { return error(res, 400, 'INVALID_OPTIONS', e.message); }
        // Check again after asynchronous body parsing to prevent concurrent reservations.
        if (active || tickets.size) return error(res, 409, 'SESSION_BUSY', '已有一通对话，请先挂断再开始。');
        const ticket = randomBytes(32).toString('base64url');
        const id = randomUUID();
        const timer = setTimeout(() => tickets.delete(ticket), 30000);
        timer.unref();
        tickets.set(ticket, { id, options, timer, expiresAt: Date.now() + 30000 });
        return json(res, 201, { sessionId: id, websocketPath: `/ws?ticket=${ticket}`, audio: { inputSampleRate: 16000, outputSampleRate: 24000 } });
      }
      if (url.pathname.startsWith('/api/')) return error(res, 404, 'NOT_FOUND', '接口不存在。');
      if (!['GET', 'HEAD'].includes(req.method)) return error(res, 405, 'METHOD_NOT_ALLOWED', '不支持此请求。');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0')) return error(res, 400, 'BAD_URL', '地址无效');
      const file = path.resolve(staticRoot, '.' + (decoded === '/' ? '/index.html' : decoded));
      if (!file.startsWith(staticRoot + path.sep)) return error(res, 404, 'NOT_FOUND', '文件不存在。');
      const mime = MIME[path.extname(file)];
      if (!mime || !fs.existsSync(file) || !fs.statSync(file).isFile()) return error(res, 404, 'NOT_FOUND', '文件不存在。');
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch {
      if (!res.headersSent) error(res, 500, 'SERVER_ERROR', '服务暂时无法处理请求。');
      else res.end();
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const reject = () => { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); };
    if (closing || !validRequest(req) || active) return reject();
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return reject(); }
    const ticket = url.searchParams.get('ticket');
    const reservation = tickets.get(ticket);
    if (url.pathname !== '/ws' || !reservation || reservation.expiresAt < Date.now()) return reject();
    clearTimeout(reservation.timer); tickets.delete(ticket);
    wss.handleUpgrade(req, socket, head, client => {
      active = new VoiceSession({ id: reservation.id, config, ledger, options: reservation.options, onEnded: session => { if (active === session) active = null; } });
      active.attach(client);
    });
  });
  return {
    server, ledger,
    async listen() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
      return server.address();
    },
    async close() {
      closing = true;
      for (const value of tickets.values()) clearTimeout(value.timer);
      tickets.clear();
      if (active) active.stop('server_shutdown');
      await new Promise(resolve => setTimeout(resolve, config.stopGraceMs + 25));
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}
