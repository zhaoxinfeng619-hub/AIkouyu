import {chromium} from '/Users/gaowenjie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const images=[
['ELSA Home','https://cms-asset.elsanow.io/uploads/1_Personalized_Learning_Experience_1f28d2cfd4.png'],
['ELSA feedback','https://cms-asset.elsanow.io/uploads/2_Instant_Feedback_14a6a4e6ee.png'],
['ELSA Progress','https://cms-asset.elsanow.io/uploads/3_Progress_Tracking_f7022f734a.png'],
['Loora Conversation','https://www.loora.com/_next/image?q=75&url=%2Flegacy%2Fexp_img_01.webp&w=640'],
['Loora Feedback','https://www.loora.com/_next/image?q=75&url=%2Flegacy%2Fexp_img_02a.webp&w=640']];
const b=await chromium.launch({headless:true,channel:'chrome'});const p=await b.newPage({viewport:{width:1500,height:920},deviceScaleFactor:1});
await p.setContent(`<style>body{background:#eee;display:flex;gap:20px;font:18px sans-serif;margin:20px}figure{margin:0;width:272px}img{width:272px;height:780px;object-fit:contain}</style>${images.map(([name,url])=>`<figure><figcaption>${name}</figcaption><img src="${url}"></figure>`).join('')}`);
await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>null))));
await p.screenshot({path:fileURLToPath(new URL('./previews.png',import.meta.url))});console.log(await p.locator('img').evaluateAll(imgs=>imgs.map(i=>({src:i.src,w:i.naturalWidth,h:i.naturalHeight}))));await b.close();
