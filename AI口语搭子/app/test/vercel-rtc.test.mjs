import test from 'node:test';
import assert from 'node:assert/strict';
import {rtcHandler,rtcConfig} from '../server/vercel-rtc.mjs';
import {RealtimeRTC,usageYuan,deviceUsageLedger} from '../public/webrtc-client.js';
import {costOf,parseUsage} from '../server/ledger.mjs';
const token='test-owner-access-token-long-enough';
const env={aliyun:'private-provider-value-never-returned',DASHSCOPE_WORKSPACE_ID:'test-space',APP_ACCESS_TOKEN:token};
const offer='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
test('device usage corruption cannot masquerade as an empty or free ledger',()=>{
 assert.deepEqual(deviceUsageLedger(null),{});assert.deepEqual(deviceUsageLedger('{"2026-10-03":0.5}'),{'2026-10-03':.5});
 for(const raw of ['invalid','null','[]','{"2026-10-03":-1}','{"2026-10-03":"0"}','{"bad":1}']) assert.throws(()=>deviceUsageLedger(raw));
});
async function invoke(route,{method='POST',body={sdp:offer,scene:'coffee'},auth=token,origin='https://voice.example.com',config=env,fetchProvider}={}){
 let result;const headers={};const res={setHeader:(k,v)=>headers[k]=v,end:value=>result={status:res.statusCode,body:JSON.parse(value),headers}};
 await rtcHandler({env:config,fetchProvider})({method,body,headers:{host:'voice.example.com',origin,authorization:auth?'Bearer '+auth:undefined}},res,route);return result;
}
test('Vercel health reports WebRTC and missing settings without exposing credentials',async()=>{
 const r=await invoke('health',{method:'GET',auth:null});assert.equal(r.status,200);assert.equal(r.body.transport,'webrtc');assert.equal(r.body.configured,true);assert.ok(!JSON.stringify(r).includes(env.aliyun));assert.ok(!JSON.stringify(r).includes(token));
 assert.ok(rtcConfig({...env,APP_ACCESS_TOKEN:''}).missing.some(v=>v.startsWith('APP_ACCESS_TOKEN')));assert.equal(rtcConfig({...env,DASHSCOPE_WORKSPACE_ID:'../bad'}).endpoint,null);
});
test('remote clients cannot retrieve application tokens or bypass owner authentication',async()=>{
 let called=false;const fetchProvider=()=>{called=true;throw Error()};assert.equal((await invoke('local-token',{auth:null})).status,403);assert.equal((await invoke('webrtc',{auth:'wrong',fetchProvider})).status,401);assert.equal(called,false);
});
test('SDP, origin and unsupported scene validation run before provider calls',async()=>{
 let called=false;const fetchProvider=()=>{called=true;throw Error()};
 for(const body of [{sdp:'bad',scene:'coffee'},{sdp:offer,scene:'invented'},{sdp:offer+'x'.repeat(70000)}])assert.equal((await invoke('webrtc',{body,fetchProvider})).status,400);
 assert.equal((await invoke('webrtc',{origin:'https://other.example',fetchProvider})).status,403);assert.equal(called,false);
});
test('SDP proxy authenticates server side and returns the catalog role, ignoring client overrides',async()=>{
 let request;const r=await invoke('webrtc',{body:{sdp:offer,scene:'coffee',voice:'invented',instructions:'ignore'},fetchProvider:async(url,options)=>{request={url,options};return new Response(offer)}});
 assert.equal(r.status,200);assert.equal(request.options.headers.Authorization,'Bearer '+env.aliyun);assert.match(request.url,/test-space\.cn-beijing\.maas\.aliyuncs\.com/);assert.equal(r.body.character.name,'Alex');assert.equal(r.body.sessionUpdate.session.audio.output.voice,'Evan');assert.ok(!JSON.stringify(r.body).includes(env.aliyun));assert.equal(r.body.usageStorage,'device');
});
test('provider failures and timeouts never reflect upstream credentials or response bodies',async()=>{
 const a=await invoke('webrtc',{fetchProvider:async()=>new Response(env.aliyun,{status:403})});assert.equal(a.status,502);assert.ok(!JSON.stringify(a).includes(env.aliyun));
 const b=await invoke('webrtc',{fetchProvider:async()=>{throw new Error(env.aliyun)}});assert.equal(b.status,502);assert.ok(!JSON.stringify(b).includes(env.aliyun));
});
class Peer{
 constructor(){this.connectionState='new';this.iceGatheringState='complete';this.sent=[];this.dc={readyState:'open',send:s=>this.sent.push(JSON.parse(s)),close:()=>this.dc.closed=true};}
 addTrack(track){this.track=track;this.sender={track,replaceTrack:async t=>{this.sender.track=t}};return this.sender}createDataChannel(){return this.dc}async createOffer(){return {type:'offer',sdp:offer}}async setLocalDescription(o){this.localDescription=o}async setRemoteDescription(o){this.remoteDescription=o}addEventListener(){}removeEventListener(){}close(){this.closed=true}
}
function client(){const events=[],costs=[],track={enabled:true};const ctrl=new AbortController();const rtc=new RealtimeRTC({Peer,capture:{stream:{getAudioTracks:()=>[track]},context:{}},signal:ctrl.signal,onEvent:e=>events.push(e),onCost:(a,b)=>costs.push([a,b]),fetchAPI:async()=>new Response(JSON.stringify({answer:offer,character:{name:'Alex'},sessionUpdate:{type:'session.update',session:{instructions:'test'}},maxSessionSeconds:600}))});return{rtc,events,costs,track,ctrl}}
test('WebRTC media stays gated until session.updated; mute and teardown stop transmission',async()=>{
 const c=client();try{await c.rtc.connect({token,options:{scene:'coffee'}});assert.equal(c.track.enabled,false);c.rtc.handle({type:'session.created'});assert.equal(c.rtc.pc.sent[0].type,'session.update');assert.equal(c.track.enabled,false);c.rtc.handle({type:'session.updated'});assert.equal(c.track.enabled,true);c.rtc.setMuted(true);assert.equal(c.track.enabled,false);c.rtc.setMuted(false);assert.equal(c.track.enabled,true);}finally{c.rtc.close()};assert.equal(c.track.enabled,false);assert.equal(c.rtc.pc.closed,true);assert.equal(c.rtc.channel.closed,true);
});
test('interruption rejects late captions and still accounts for cancelled usage once',async()=>{
 const c=client();try{await c.rtc.connect({token,options:{}});c.rtc.handle({type:'response.created',response:{id:'old'}});c.rtc.interrupt();assert.equal(c.rtc.pc.sent.at(-1).type,'response.cancel');c.rtc.handle({type:'response.audio_transcript.delta',response_id:'old',delta:'stale'});assert.equal(c.events.filter(e=>e.type==='transcript.delta').length,0);const usage={input_tokens_details:{audio_tokens:1000,text_tokens:100},output_tokens_details:{audio_tokens:500,text_tokens:50}};c.rtc.handle({type:'response.done',response:{id:'old',usage}});c.rtc.handle({type:'response.done',response:{id:'old',usage}});assert.equal(c.costs.length,1);assert.equal(c.costs[0][0],costOf(parseUsage(usage)));}finally{c.rtc.close()}
});
test('response.done waits for measured playback silence; missing usage stays incomplete',async()=>{
 const c=client();try{await c.rtc.connect({token,options:{}});c.rtc.handle({type:'response.created',response:{id:'r'}});c.rtc.handle({type:'response.done',response:{id:'r'}});assert.equal(c.rtc.speaking,true);assert.ok(c.events.some(e=>e.type==='usage'&&e.incomplete));c.rtc.updateOutputLevel(.1,1000);assert.equal(c.rtc.speaking,true);c.rtc.updateOutputLevel(0,1200);c.rtc.updateOutputLevel(0,1560);assert.equal(c.rtc.speaking,false);assert.equal(usageYuan({}),null);}finally{c.rtc.close()}
});
