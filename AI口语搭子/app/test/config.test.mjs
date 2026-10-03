import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.mjs';

test('Vercel aliyun credential configures the workspace endpoint and stays out of health responses', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speaking-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { aliyun: '  test-aliyun-credential  ', DASHSCOPE_API_KEY: 'legacy-credential', DASHSCOPE_WORKSPACE_ID: 'test-space', APP_ACCESS_TOKEN: 'test-owner-token-long-enough' };
  const config = loadConfig(env, root);
  assert.equal(config.apiKey, 'test-aliyun-credential');
  assert.deepEqual(config.missing, []);
  assert.equal(config.upstreamUrl, 'wss://test-space.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3.8-omni-flash-realtime');
  assert.equal(loadConfig({ ...env, aliyun: ' ' }, root).apiKey, 'legacy-credential');
  assert.ok(loadConfig({ ...env, DASHSCOPE_WORKSPACE_ID: '' }, root).missing.includes('DASHSCOPE_WORKSPACE_ID'));
  // Exercise the real HTTP endpoint without an upstream AI call.
  const { createApp } = await import('../server/app.mjs');
  const app = createApp({ ...config, port: 0, stopGraceMs: 0 });
  t.after(() => app.close());
  const address = await app.listen();
  const health = await (await fetch(`http://127.0.0.1:${address.port}/api/health`)).text();
  assert.equal(JSON.parse(health).configured, true);
  assert.ok(!health.includes(config.apiKey));
  assert.ok(!health.includes(config.accessToken));
});
