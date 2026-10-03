import {bundle} from '@remotion/bundler';
import {selectComposition, renderStill, openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
const browserExecutable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const serveUrl=await bundle({entryPoint:process.cwd()+'/src/index.tsx',publicDir:process.cwd()+'/public'});
fs.writeFileSync('.local-bundle.json',JSON.stringify({serveUrl}));
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
const composition=await selectComposition({serveUrl,id:'ProductShowreel',puppeteerInstance:browser});
const keyframes=[24,64,220,353,445,843,899];
const handoffs=[88,200,316,412,512,640,760];
const frames=process.argv.length>2 ? process.argv.slice(2).map(Number) : [...new Set([...keyframes,580,700,...handoffs.flatMap(f=>[f-1,f,f+3,f+7,f+8])])].sort((a,b)=>a-b);
if(frames.some(f=>!Number.isInteger(f)||f<0||f>=900))throw Error('Frames must be integers from 0 to 899');
fs.mkdirSync('evidence',{recursive:true});
for(const frame of frames){await renderStill({composition,serveUrl,puppeteerInstance:browser,output:'evidence/F'+String(frame).padStart(3,'0')+'.png',frame,imageFormat:'png',logLevel:'error'});console.log('frame',frame)}
await browser.close({silent:true});
