import {chromium} from '/Users/gaowenjie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const items=[
{id:'praktika-scene',url:'https://praktika.ai/assets/step-5--dq0P3QK.webp'},
{id:'praktika-feedback',url:'https://praktika.ai/assets/step-4-CFiY2bfP.webp'},
{id:'elsa-scenes',url:'https://i0.wp.com/blog.elsaspeak.com/wp-content/uploads/2026/01/Untitled-design-3.png?resize=261%2C536&ssl=1'},
{id:'elsa-feedback',url:'https://cms-asset.elsanow.io/uploads/2_Instant_Feedback_14a6a4e6ee.png'},
{id:'elsa-progress',url:'https://cms-asset.elsanow.io/uploads/3_Progress_Tracking_f7022f734a.png'},
{id:'duolingo-flow',url:'https://lh7-rt.googleusercontent.com/docsz/AD_4nXdPEYlrYdw9VGoQwtAYd4OEAwXR_E0GMYHSudBOCd1yGeiWn5WLCLJkLG690f8UyW7dJ61e_57PsnsaTxkp5FW8tXUTiaPCWL_mOdC5648uUERVptV6TTmkrDkDKNTUHu-D0GVLeq5_mUZKQ1MEEEasnEE?key=Z_VR1JadUlFxk0wY-HuZ8Q'},
{id:'gemini-live',url:'https://storage.googleapis.com/gweb-uniblog-publish-prod/images/Blogpost_Header_Option_2_v02.width-1300.png'}
];
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=await Promise.all(items.map(async item=>{const page=await browser.newPage({viewport:{width:1600,height:1400},deviceScaleFactor:1});try{
await page.goto(item.url,{waitUntil:'load',timeout:45000});const img=page.locator('img').first();await img.evaluate(i=>i.decode());
const size=await img.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight}));
await page.addStyleTag({content:'html,body{margin:0!important;padding:0!important;background:transparent!important}img{display:block!important;max-width:none!important;max-height:none!important;margin:0!important;position:static!important}'});
await img.evaluate(i=>{i.style.width=i.naturalWidth+'px';i.style.height=i.naturalHeight+'px'});
let rect={x:0,y:0,width:size.w,height:size.h};
// Trim transparent artwork margins only. All visible app content stays intact.
try{rect=await img.evaluate(i=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(d[(y*c.width+x)*4+3]>24){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}}return{x:Math.max(0,x0-5),y:Math.max(0,y0-5),width:Math.min(c.width,x1+6)-Math.max(0,x0-5),height:Math.min(c.height,y1+6)-Math.max(0,y0-5)}})}catch{}
await page.setViewportSize({width:Math.max(size.w,800),height:Math.max(size.h,900)});
await page.screenshot({path:fileURLToPath(new URL('../截图/'+item.id+'.png',import.meta.url)),clip:rect,omitBackground:true});return{...item,size,clip:rect,status:'ok'};
}catch(e){return{...item,status:'failed',error:e.message}}finally{await page.close()}}));
await writeFile(new URL('./captures.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
