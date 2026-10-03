// Browser integration only: local fixture, fake PeerConnection, no cloud calls.
import assert from 'node:assert/strict';
import {fixture,USAGE} from './fixtures.mjs';
import {providerSession} from '../server/prompt.mjs';
import {characterSnapshot} from '../server/catalog.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const f=await fixture(null);let diagnosticPage;
try{
 const page=await browser.newPage();diagnosticPage=page;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.rtcTest={sent:[],count:0};
  window.RTCPeerConnection=class extends EventTarget{
   constructor(){super();window.rtcTest.peer=this;window.rtcTest.count++;this.iceGatheringState='complete';this.connectionState='new'}
   addTrack(track){this.track=track;this.sender={track,replaceTrack:async value=>{this.sender.track=value}};return this.sender}
   createDataChannel(){this.dc={readyState:'open',close:()=>{this.dc.readyState='closed'},send:raw=>{const event=JSON.parse(raw);window.rtcTest.sent.push(event);if(event.type==='session.update')setTimeout(()=>this.emit({type:'session.updated'}),200)}};return this.dc}
   async createOffer(){return{type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'}}
   async setLocalDescription(value){this.localDescription=value}
   async setRemoteDescription(){setTimeout(()=>this.emit({type:'session.created'}),100)}
   emit(event){this.dc.onmessage?.({data:JSON.stringify(event)})}
   close(){this.closed=true}
  };
 });
 await page.route('**/api/health',r=>r.fulfill({json:{configured:true,model:'test',transport:'webrtc',missing:[]}}));
 let handshakes=0;
 await page.route('**/api/webrtc',r=>{handshakes++;const body=r.request().postDataJSON();assert.equal(body.scene,'coffee');assert.ok(body.sdp.startsWith('v=0'));return r.fulfill({json:{answer:'v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 111',character:characterSnapshot('coffee'),sessionUpdate:providerSession({inputTranscription:true,vadSilenceMs:1400},{scene:'coffee',level:'starter',correction:'gentle'}),maxSessionSeconds:600}})});
 await page.goto(f.base+'/?view=call&scene=coffee');await page.waitForFunction(()=>!document.querySelector('#start-button').disabled);
 await page.locator('#settings-open').click();assert.equal(await page.locator('.token-copy-row').isVisible(),false);await page.locator('#access-token').fill('local-test-rtc-owner-token');await page.locator('.close-button').click();
 await page.locator('#start-button').click();await page.waitForFunction(()=>window.rtcTest.sent.some(e=>e.type==='session.update'));
 assert.equal(await page.evaluate(()=>window.rtcTest.peer.sender.track),null);
 await page.waitForFunction(()=>document.querySelector('#state-label').textContent==='正在聆听');assert.equal(await page.evaluate(()=>window.rtcTest.peer.track.enabled),true);
 await page.evaluate(usage=>{const pc=window.rtcTest.peer;pc.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'rtc-user',transcript:'Hello RTC.'});pc.emit({type:'response.created',response:{id:'r-rtc'}});pc.emit({type:'response.audio_transcript.done',response_id:'r-rtc',item_id:'rtc-a',transcript:'Hi from Alex.'});pc.emit({type:'response.done',response:{id:'r-rtc',usage}})},USAGE);
 await page.waitForFunction(()=>document.querySelector('#session-cost').textContent==='¥0.0124');assert.ok(await page.locator('#transcript').textContent().then(t=>t.includes('Hi from Alex.')));
 await page.locator('.call-mode-picker [data-mode="orb"]').click();assert.equal(handshakes,1);assert.equal(await page.evaluate(()=>window.rtcTest.count),1);
 await page.locator('#mute-button').click();assert.equal(await page.evaluate(()=>window.rtcTest.peer.track.enabled),false);
 await page.evaluate(()=>window.rtcTest.peer.emit({type:'response.created',response:{id:'pending'}}));await page.locator('#start-button').click();await page.waitForFunction(()=>document.querySelector('#state-label').textContent==='本次已结束');assert.equal(await page.locator('#session-cost').textContent(),'待核对');assert.equal(await page.evaluate(()=>window.rtcTest.peer.closed),true);
 assert.equal(f.connections.length,0);assert.deepEqual(errors,[]);console.log('RTC browser check passed: authenticated handshake, media gate, role/subtitles, device ledger, visual switch without reconnect, mute, teardown and missing usage. No cloud calls.');
}catch(error){console.error(await diagnosticPage?.evaluate(()=>({health:document.querySelector('#health-details')?.textContent,error:document.querySelector('#call-error')?.textContent,state:document.querySelector('#state-label')?.textContent,button:document.querySelector('#start-button')?.disabled})));throw error}finally{await browser.close();await f.close()}
