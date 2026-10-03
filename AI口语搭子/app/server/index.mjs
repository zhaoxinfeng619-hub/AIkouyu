import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';

try {
  const config = loadConfig();
  const app = createApp(config);
  const address = await app.listen();
  console.log(`AI口语搭子已启动：http://127.0.0.1:${address.port}`);
  console.log(config.missing.length ? `待配置：${config.missing.join('、')}（编辑本地 .env 后重启）` : '千问配置已加载；首次真实通话将产生云服务费用。');
  console.log('浏览器本机访问可自动取得应用口令；小程序设置中填写同一口令，不能填写百炼密钥。');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) {
  console.error('启动失败：' + error.message);
  process.exitCode = 1;
}
