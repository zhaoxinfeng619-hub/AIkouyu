import {chromium} from '/Users/gaowenjie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {fileURLToPath} from 'node:url';
const images=[
['Praktika Scenes','https://praktika.ai/assets/step-5--dq0P3QK.webp'],
['Praktika correction','https://praktika.ai/assets/step-4-CFiY2bfP.webp'],
['ELSA Scene','https://i0.wp.com/blog.elsaspeak.com/wp-content/uploads/2026/01/Untitled-design-3.png?resize=261%2C536&ssl=1'],
['Loora feedback','https://www.loora.com/legacy/exp_02_device.webp']];
const b=await chromium.launch({headless:true,channel:'chrome'});const p=await b.newPage({viewport:{width:1450,height:1000},deviceScaleFactor:1});
await p.setContent(`<style>body{background:#eee;display:flex;gap:20px;font:18px sans-serif;margin:20px}figure{margin:0;width:332px}img{width:332px;height:920px;object-fit:contain}</style>${images.map(([name,url])=>`<figure><figcaption>${name}</figcaption><img src="${url}"></figure>`).join('')}`);
await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>null))));
await p.screenshot({path:fileURLToPath(new URL('./extra-previews.png',import.meta.url))});console.log(await p.locator('img').evaluateAll(imgs=>imgs.map(i=>({src:i.src,w:i.naturalWidth,h:i.naturalHeight}))));await b.close();
