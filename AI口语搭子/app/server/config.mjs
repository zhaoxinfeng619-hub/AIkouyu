import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODEL = 'qwen3.8-omni-flash-realtime';

function numberEnv(env, key, fallback, min, max) {
  const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} 必须在 ${min}—${max} 之间`);
  return value;
}

export function loadConfig(env = process.env, root = APP_ROOT) {
  const dataDir = path.join(root, '.local');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const tokenPath = path.join(dataDir, 'access-token');
  let accessToken = env.APP_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    accessToken = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : randomBytes(32).toString('base64url');
    if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, accessToken, { mode: 0o600 });
  }
  if (accessToken.length < 24) throw new Error('APP_ACCESS_TOKEN 至少需要24个字符');
  const workspaceId = env.DASHSCOPE_WORKSPACE_ID?.trim() || '';
  if (workspaceId && !/^[a-zA-Z0-9_-]{1,128}$/.test(workspaceId)) throw new Error('业务空间 ID 格式不正确');
  const model = env.QWEN_MODEL?.trim() || MODEL;
  if (model !== MODEL) throw new Error('当前费用计算仅支持 qwen3.8-omni-flash-realtime；更换模型前需同步计价');
  const publicOrigin = env.PUBLIC_ORIGIN?.trim().replace(/\/$/, '') || '';
  if (publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN 应为完整域名，例如 https://voice.example.com');
  const apiKey = env.DASHSCOPE_API_KEY?.trim() || '';
  return {
    root, dataDir, accessToken, apiKey, workspaceId, model,
    host: env.HOST || '127.0.0.1',
    port: numberEnv(env, 'PORT', 8788, 0, 65535),
    publicOrigin,
    maxSessionSeconds: numberEnv(env, 'MAX_SESSION_SECONDS', 600, 10, 600),
    maxIdleSeconds: numberEnv(env, 'MAX_IDLE_SECONDS', 60, 10, 600),
    dailyBudget: numberEnv(env, 'DAILY_BUDGET_YUAN', 3, 0.01, 1000),
    monthlyBudget: numberEnv(env, 'MONTHLY_BUDGET_YUAN', 50, 0.01, 10000),
    vadSilenceMs: numberEnv(env, 'VAD_SILENCE_MS', 1400, 200, 6000),
    inputTranscription: env.ENABLE_INPUT_TRANSCRIPTION !== 'false',
    stopGraceMs: 700,
    upstreamUrl: workspaceId ? `wss://${workspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(model)}` : '',
    missing: [!apiKey && 'DASHSCOPE_API_KEY', !workspaceId && 'DASHSCOPE_WORKSPACE_ID'].filter(Boolean),
  };
}
