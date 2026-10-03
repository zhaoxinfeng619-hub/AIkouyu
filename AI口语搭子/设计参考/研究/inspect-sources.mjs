import {chromium} from '/Users/gaowenjie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const urls=['https://elsaspeak.com/en','https://www.loora.com/'];
const out=await Promise.all(urls.map(async url=>{const page=await browser.newPage({viewport:{width:1400,height:1000}});try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});const data=await page.locator('img').evaluateAll(els=>els.map(e=>({alt:e.alt,src:e.currentSrc||e.src,w:e.naturalWidth,h:e.naturalHeight})));return {url,images:data};}catch(e){return{url,error:e.message};}finally{await page.close();}}));
await writeFile(new URL('./source-images.json',import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));await browser.close();
