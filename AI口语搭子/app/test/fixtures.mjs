import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { loadConfig, APP_ROOT } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

export const TEST_TOKEN = 'local-test-owner-token-not-a-real-secret';
export const USAGE = { input_tokens_details: { audio_tokens: 1000, text_tokens: 100 }, output_tokens_details: { audio_tokens: 500, text_tokens: 50 } };
export const PCM = Buffer.alloc(1280).toString('base64');

export function inbox(socket) {
  const messages = [], waiters = [];
  socket.on('error', () => {});
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer); waiter.resolve(message);
    } else messages.push(message);
  });
  return {
    messages,
    wait(typeOrPredicate, timeout = 3000) {
      const predicate = typeof typeOrPredicate === 'function' ? typeOrPredicate : message => message.type === typeOrPredicate;
      const index = messages.findIndex(predicate);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error(`Timed out waiting for ${typeOrPredicate}`)); }, timeout) };
        waiters.push(waiter);
      });
    },
  };
}

export async function fixture(t, overrides = {}, providerOptions = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-speaking-test-'));
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(provider, 'listening');
  const upstreams = [], connections = [];
  provider.on('connection', (socket, request) => {
    const entry = { socket, headers: request.headers, inbox: inbox(socket), send: event => socket.send(JSON.stringify(event)) };
    upstreams.push(entry); connections.push(entry);
    socket.on('message', raw => {
      const event = JSON.parse(raw.toString());
      if (event.type === 'session.update' && providerOptions.autoReady !== false) entry.send({ type: 'session.updated', session: event.session });
    });
  });
  const config = {
    ...loadConfig({ DASHSCOPE_API_KEY: 'test-provider-key-never-printed', DASHSCOPE_WORKSPACE_ID: 'test-workspace', APP_ACCESS_TOKEN: TEST_TOKEN, PORT: '0' }, temp),
    root: APP_ROOT,
    upstreamUrl: `ws://127.0.0.1:${provider.address().port}`,
    stopGraceMs: 30,
    ...overrides,
  };
  const app = createApp(config);
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const request = (route, options = {}) => fetch(base + route, { ...options, headers: { Authorization: `Bearer ${TEST_TOKEN}`, ...options.headers } });
  const connect = async (options = {}) => {
    const reservation = await request('/api/sessions', { method: 'POST', body: JSON.stringify(options) });
    if (reservation.status !== 201) throw new Error(`Reservation failed: ${reservation.status}`);
    const session = await reservation.json();
    const socket = new WebSocket(base.replace('http:', 'ws:') + session.websocketPath);
    const received = inbox(socket);
    await once(socket, 'open');
    const ready = providerOptions.autoReady === false ? null : await received.wait('session.ready');
    return { socket, inbox: received, session, ready, send: event => socket.send(JSON.stringify(event)), provider: connections.at(-1) };
  };
  const close = async () => {
    await app.close();
    for (const client of provider.clients) client.terminate();
    await new Promise(resolve => provider.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  };
  t?.after(close);
  return { app, config, base, request, connect, upstreams, connections, temp, close };
}
