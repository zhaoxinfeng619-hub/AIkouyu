import {chromium} from '/Users/gaowenjie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const items=JSON.parse(await readFile(new URL('./captures.json',import.meta.url),'utf8'));
const b=await chromium.launch({headless:true,channel:'chrome'});
for(const d of items){const p=await b.newPage({viewport:{width:d.size.w+30,height:d.size.h+30}});await p.setContent(`<style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:${d.size.w}px;height:${d.size.h}px}</style><img src="${d.url.replaceAll('&','&amp;')}">`);await p.locator('img').evaluate(i=>i.decode());await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.screenshot({path:fileURLToPath(new URL('../截图/'+d.id+'.png',import.meta.url)),clip:d.clip,omitBackground:true});await p.close()}
await b.close();console.log('7 source captures refreshed');
