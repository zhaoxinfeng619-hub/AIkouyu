// WeChat must package local modules; the browser serves the same renderer as a UMD script.
import fs from 'node:fs';
const source = new URL('../miniprogram/utils/voice-orb.js', import.meta.url);
const target = new URL('../public/voice-orb.js', import.meta.url);
const code = fs.readFileSync(source, 'utf8');
if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== code) fs.writeFileSync(target, code);
