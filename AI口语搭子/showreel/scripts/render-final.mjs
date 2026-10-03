import {spawnSync} from 'node:child_process';
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)};
run('node_modules/.bin/remotion',['render','src/index.tsx','ProductShowreel','silent-preview.mp4','--codec','h264','--crf','19','--scale','1.5','--concurrency','4','--muted','--overwrite']);
run(process.env.AICUT_PYTHON||'python3',['scripts/make-audio.py']);
run(process.execPath,['scripts/finalize-audio.mjs']);
