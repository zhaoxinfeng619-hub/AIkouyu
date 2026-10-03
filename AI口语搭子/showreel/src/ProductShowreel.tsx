import React,{useEffect,useRef} from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame} from 'remotion';
import {at,C,coffeeGeometry,dialogueGeometry,easeFast,easeSlow,enter,linear,panel,sceneIds,sceneNames,sceneTitles,track,unit} from './motion';
import './voice-orb.js';

const FONT='-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const SHADOW='0 24px 80px rgba(32,49,81,.10)';
const Mic=({size=26}:{size?:number})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>;
const Arrow=()=> <span style={{fontSize:30,lineHeight:1}}>↗</span>;
const Pill=({children,blue=false}:{children:React.ReactNode,blue?:boolean})=><span style={{padding:'10px 18px',borderRadius:30,background:blue?'#edf3fd':'#fff',color:blue?'#6380ad':'#686f7d',fontSize:20,display:'inline-block'}}>{children}</span>;
const Stage=({f,a,b,id,children,dir=1}:{f:number,a:number,b:number,id:string,children:React.ReactNode,dir?:number})=>f<a||f>b?null:<AbsoluteFill data-motion-object={id} style={panel(f,a,b,dir)}>{children}</AbsoluteFill>;
const TextReveal=({text,f,start,step=5,size=46,color=C.ink}:{text:string,f:number,start:number,step?:number,size?:number,color?:string})=> <div style={{fontSize:size,fontWeight:550,lineHeight:1.25,letterSpacing:-.8,color,display:'flex',flexWrap:'wrap',gap:'0 .22em'}}>{text.split(' ').map((s,i)=><span key={i} style={{opacity:unit(f,start+i*step,start+i*step+5),transform:`translateY(${track(f,[[start+i*step,22],[start+i*step+13,0]],easeFast)}px)`,display:'inline-block'}}>{s}</span>)}</div>;
const Wave=({f,active=true,white=false}:{f:number,active?:boolean,white?:boolean})=><div style={{height:58,display:'flex',gap:7,alignItems:'center',justifyContent:'center'}}>{Array.from({length:13},(_,i)=><i key={i} style={{width:7,borderRadius:6,background:white?'#fff':C.blue,height:active?12+Math.abs(Math.sin(f*.18+i*.83)*Math.sin(f*.06+i*.29))*42:6}}/>)}</div>;

function FluidOrb({f,energy}:{f:number,energy:number}){
 const canvas=useRef<HTMLCanvasElement>(null),orb=useRef<any>(null);
 useEffect(()=>{const VoiceOrb=(globalThis as any).VoiceOrb;orb.current=new VoiceOrb(canvas.current,{pixelRatio:1});orb.current.resize(540,540);return()=>orb.current?.destroy()},[]);
 useEffect(()=>{if(!orb.current)return;orb.current.time=(f-540)/30*.4;orb.current.energy=energy;orb.current._draw()},[f,energy]);
 return <canvas ref={canvas} width={540} height={540} style={{width:'100%',height:'100%'}}/>;
}

export const ProductShowreel:React.FC<{audit:boolean}>=({audit})=>{
 const f=useCurrentFrame();
 const coffeeMotion=coffeeGeometry(f);
 const introMotion={x:track(f,[[0,60],[22,90],[56,90],[88,-570]]),y:track(f,[[0,180],[22,166],[56,160],[88,104]])};
 const galleryMotion=1-unit(f,52,94);
 const profileMotion=panel(f,88,207);
 const firstSpeechMotion=panel(f,200,323);
 const answerMotion=panel(f,316,419);
 const interruptionMotion=panel(f,412,519,-1);
 const modeMotion=panel(f,512,647);
 const recordMotion=panel(f,640,767,-1);
 const endingMotion=panel(f,760,899);
 const bridgeMotion=track(f,[[0,0],[174,0],[190,1],[214,0]]);
 const callShadeMotion=unit(f,198,224)*(1-unit(f,510,560));
 const captionFillMotion=unit(f,222,254);
 const orbitMotion=unit(f,543,565)*(1-unit(f,630,654));
 const recordCopyMotion=unit(f,713,727);
 const finalTitleMotion=enter(f,790,810);
 const finalCtaMotion=unit(f,891,899);
 const ringMotion=unit(f,46,59)*(1-unit(f,84,94));
 const showCardLabel=f<102||f>760;
 const friendsMotion=unit(f,765,794);
 const endingCardsMotion=unit(f,776,810);
 const dialogueStart=f<316?210:f<412?316:f<512?412:512;
 const dialogueText=f<316?'Hi! I’d like a latte, please.':f<412?'Sure. Would you like it hot or iced?':f<512?'Actually, iced, please.':'An iced latte. What size would you like?';
 const isUser=f<316||(f>=412&&f<512);
 const dialogueMotion=dialogueGeometry(f);
 const speech1='Hi! I’d like a latte, please.';
 const answer1='Sure. Would you like it hot or iced?';
 const speech2='Actually, iced, please.';
 const answer2='An iced latte. What size would you like?';

 return <AbsoluteFill style={{background:C.gray,color:C.ink,fontFamily:FONT,overflow:'hidden'}}>
  {!audit&&<>
   <div style={{position:'absolute',width:1000,height:950,left:-580+f/900*65,top:-440,background:'radial-gradient(ellipse, #dfeafe55, transparent 65%)'}}/>
   <div style={{position:'absolute',width:1000,height:1000,right:-580+f/900*32,top:110,background:'radial-gradient(ellipse,#e6dfd522,transparent 66%)'}}/>
  </>}

  <div data-motion-object="intro" style={{position:'absolute',left:introMotion.x,top:introMotion.y,width:500}}>
   <div style={{display:'flex',alignItems:'center',gap:12,color:C.blue,fontSize:25,fontWeight:650,marginBottom:26}}><Mic size={32}/>AI口语搭子</div>
   <div style={{fontSize:60,letterSpacing:-3,lineHeight:1.2,fontWeight:650}}>今天，<br/>想和谁聊聊？</div>
   <div style={{fontSize:24,color:'#93979f',marginTop:28}}>在生活里，练习开口。</div>
   <div style={{display:'flex',gap:12,marginTop:34}}><Pill blue>全部场景</Pill><Pill>日常</Pill><Pill>旅行</Pill></div>
  </div>

  {sceneIds.map((id,i)=>i===1?null:<div key={id} data-motion-object={`scene-${id}`} style={{...at({x:track(f,[[0,848+(i===0?-250:i===2?250:((i-3)*250-250))],[34,848+(i===0?-250:i===2?250:((i-3)*250-250))],[90,i<3?(-320+i*130):(1180+i*120)]],easeSlow),y:track(f,[[0,i<3?312:698],[34,i<3?302:681],[90,i<3?100:880]]),w:228,h:342,r:28,opacity:galleryMotion*unit(f,i*3,i*3+7)}),overflow:'hidden',boxShadow:SHADOW}}>
   <Img src={staticFile(id+'.jpg')} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
   <div style={{position:'absolute',inset:0,background:'linear-gradient(transparent 50%,#0b101dbd)'}}/>
   <div style={{position:'absolute',bottom:24,left:22,color:'white'}}><div style={{fontSize:17,marginBottom:6}}>{sceneNames[i]}</div><div style={{fontSize:25,fontWeight:550}}>{sceneTitles[i]}</div></div>
  </div>)}

  <div data-motion-object="coffee-card" style={{...at(coffeeMotion),overflow:'hidden',boxShadow:f<210||f>754?SHADOW:'none',zIndex:2}}>
   <Img src={staticFile('alex.jpg')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:f>210&&f<530?'center 12%':'center'}}/>
   <div style={{position:'absolute',inset:0,background:`linear-gradient(180deg,rgba(12,21,39,${callShadeMotion*.30}) 0%,transparent 30%,rgba(12,21,39,${showCardLabel?.7:callShadeMotion*.28}) 100%)`}}/>
   {showCardLabel&&<div style={{position:'absolute',bottom:32,left:30,right:22,color:'white'}}><div style={{fontSize:f>760?22:18,marginBottom:8}}>Alex · 咖啡师</div><div style={{fontSize:f>760?30:32,fontWeight:550,letterSpacing:-.8}}>咖啡店点单</div><div style={{fontSize:17,marginTop:12,color:'#ffffffb5'}}>3–5 分钟 <span style={{float:'right'}}>↗</span></div></div>}
   {f>=90&&f<203&&<div style={{position:'absolute',left:26,bottom:28,color:'white',opacity:unit(f,98,112)}}><div style={{fontSize:21}}>你的口语搭子</div><div style={{fontSize:58,fontWeight:550,marginTop:8}}>Alex</div></div>}
  </div>
  {f>=46&&f<=94&&<div data-motion-object="selection" style={{...at({...coffeeMotion,r:coffeeMotion.r+3}),border:`${track(f,[[46,0],[54,6],[80,6],[94,0]])}px solid ${C.blue}`,boxShadow:'0 0 0 10px #1765ee13',zIndex:3,opacity:ringMotion}}/>}

  {f>=88&&f<=207&&<AbsoluteFill data-motion-object="profile" style={{...profileMotion,zIndex:4}}>
   <div style={{position:'absolute',left:570,top:95,width:592}}>
    <div style={{...enter(f,100,115),fontSize:20,color:C.muted}}>日常必备 · 3–5 分钟</div>
    <h1 style={{...enter(f,105,124),fontSize:52,fontWeight:620,letterSpacing:-2,margin:'16px 0 8px'}}>咖啡店点单</h1>
    <div style={{...enter(f,114,133),fontSize:25,color:'#8f969f'}}>At a coffee shop</div>
    <div style={{...enter(f,127,145),marginTop:24,padding:'24px 28px',background:'#ffffffbd',borderRadius:26,border:'1px solid #e5e9f0'}}>
     <div style={{fontSize:29,fontWeight:620}}>认识 Alex</div><div style={{fontSize:20,color:'#8a94a3',marginTop:8}}>男 · 25 岁 · 咖啡师</div>
     <div style={{display:'flex',gap:10,marginTop:18}}>{['温柔','耐心','细心'].map((s,i)=><div key={s} style={enter(f,135+i*4,150+i*4)}><Pill blue>{s}</Pill></div>)}</div>
     <div style={{...enter(f,149,169),fontSize:22,color:'#748194',lineHeight:1.5,marginTop:20}}>你犹豫时，他会耐心介绍两种选择。</div>
    </div>
    <div style={{...enter(f,160,177),display:'flex',gap:10,marginTop:22,fontSize:20,color:'#8c94a1'}}><Pill>初学者</Pill><Pill>温和提醒</Pill></div>

   </div>
  </AbsoluteFill>}

  {f>=174&&f<=767&&<div data-motion-object="dialogue-focus" style={{...dialogueMotion,zIndex:15,boxShadow:SHADOW,overflow:'hidden'}}>
   {f<210?<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:16,color:'white',fontSize:26,opacity:1-unit(f,198,210)}}><Mic size={28}/>开始聊天 <span style={{marginLeft:20}}>→</span></div>:<div style={{padding:f>=640?'17px 23px':'30px 42px'}}>
    <div style={{display:'flex',alignItems:'center',gap:12,fontSize:f>=640?19:23,color:isUser?'#dbe7ff':'#697589',marginBottom:f>=640?8:22}}>{isUser&&f<640?<Mic/>:null}{isUser?'我在说':'Alex'}{f<640&&<span style={{marginLeft:'auto',fontSize:21,color:isUser?'#fff':C.blue}}>{isUser?'Alex 在听':'正在说话'}</span>}</div>
    <TextReveal text={dialogueText} f={f} start={dialogueStart} step={f>=640?0:5} size={f>=640?28:(f>=412&&f<512?64:f>=512?40:49)} color={isUser?'white':C.ink}/>
    {f<630&&<div style={{marginTop:20}}><Wave f={f} white={isUser}/></div>}
   </div>}
  </div>}


  {f>=200&&f<=323&&<AbsoluteFill data-motion-object="first-speech" style={{...firstSpeechMotion,zIndex:7}}>
   <div style={{position:'absolute',left:72,top:52,color:'white',fontSize:24,...enter(f,213,228)}}>Alex <span style={{fontSize:19,opacity:.65,marginLeft:12}}>咖啡店点单</span></div>
   <div style={{position:'absolute',bottom:42,left:track(f,[[218,490],[282,512],[322,550]]),color:'#fff',fontSize:22,display:'flex',alignItems:'center',gap:13}}><span style={{width:10,height:10,borderRadius:50,background:'#61e9cb'}}/>正在听你说</div>
  </AbsoluteFill>}

  {f>=316&&f<=419&&<AbsoluteFill data-motion-object="answer" style={{...answerMotion,zIndex:8}}>
   <div style={{position:'absolute',left:160,bottom:60,padding:'15px 24px',borderRadius:24,background:'#25334c99',color:'white',fontSize:23,transform:`translateY(${track(f,[[326,45],[351,0],[393,-24]])}px)`}}>我：Hi! I’d like a latte, please.</div>
  </AbsoluteFill>}

  {f>=412&&f<=519&&<AbsoluteFill data-motion-object="interruption" style={{...interruptionMotion,zIndex:9}}>
   <div style={{position:'absolute',left:track(f,[[412,148],[455,196],[519,236]]),top:track(f,[[412,93],[455,73],[519,40]]),width:920,color:'white',fontSize:25,padding:'16px 22px',borderRadius:22,background:'#25334c99',opacity:1-unit(f,466,489)}}>Alex：Would you like it hot or iced? <span style={{marginLeft:18,padding:'8px 14px',fontSize:20,borderRadius:20,background:'#ffffff21'}}>已停止播放</span></div>
  </AbsoluteFill>}

  {f>=512&&f<=647&&<AbsoluteFill data-motion-object="mode" style={{...modeMotion,zIndex:10}}>
   <div style={{position:'absolute',left:66,top:60,width:track(f,[[512,420],[550,480],[602,480],[647,520]]),fontSize:24,color:'#728096'}}><span style={{fontWeight:600,color:C.ink}}>Alex</span><span style={{marginLeft:16}}>咖啡店点单</span></div>
   <div style={{position:'absolute',left:track(f,[[529,400],[557,438],[606,420],[647,395]]),top:track(f,[[529,118],[557,116],[606,85],[647,60]]),width:440,height:66,borderRadius:35,background:'#e7e9ed',padding:6,display:'flex',fontSize:24,zIndex:4}}>
    <div style={{position:'absolute',top:6,left:track(f,[[529,6],[548,6],[560,219]]),width:215,height:54,borderRadius:29,background:'white',boxShadow:'0 2px 6px #00000007'}}/>
    <div style={{position:'relative',flex:1,textAlign:'center',paddingTop:11,color:f<554?C.ink:'#9096a2'}}>场景模式</div><div style={{position:'relative',flex:1,textAlign:'center',paddingTop:11,color:f<554?'#9096a2':C.blue}}>语音球</div>
   </div>
   <div data-motion-object="orb" style={{position:'absolute',left:track(f,[[540,-360],[560,-160],[603,-100],[647,-200]]),top:track(f,[[540,74],[560,50],[603,18],[647,-64]]),width:620,height:620,opacity:orbitMotion,zIndex:2}}><FluidOrb f={f} energy={.18+Math.abs(Math.sin(f*.13))*.65}/></div>
   <div style={{position:'absolute',bottom:42,left:510,color:'#728096',fontSize:22,display:'flex',gap:20,...enter(f,573,591)}}><Mic/>正在说话 <span style={{color:'#a1adbe'}}>00:12</span></div>
  </AbsoluteFill>}

  {f>=640&&f<=767&&<AbsoluteFill data-motion-object="record" style={{...recordMotion,zIndex:11}}>
   <div style={{position:'absolute',left:track(f,[[640,182],[673,136],[710,158],[767,188]]),top:track(f,[[640,62],[673,44],[714,42],[767,24]]),width:960,height:604,borderRadius:34,background:'#fff',padding:'32px 40px',boxShadow:SHADOW}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:29,fontWeight:620,marginBottom:26}}>和 Alex 的对话<div data-motion-object="copy" style={{fontSize:24,color:C.blue,padding:'12px 22px',borderRadius:20,background:recordCopyMotion>.1?'#edf3fd':'#f5f7fa',transform:`scale(${track(f,[[706,1],[715,.92],[723,1]])})`}}>{f<722?'复制记录':'已复制'}</div></div>
    {[['我',speech1],['Alex',answer1],['我',speech2]].map(([name,text],i)=><div key={i} style={{...enter(f,648+i*9,672+i*9),marginTop:14,padding:'17px 23px',borderRadius:22,background:name==='我'?'#edf3fd':'#f5f6f8',transform:`translateX(${track(f,[[648+i*9,name==='我'?130:-130],[670+i*9,0],[741+i*2,0],[766,24-i*18]])}px)`}}><div style={{fontSize:19,color:'#8190a6',marginBottom:8}}>{name}</div><div style={{fontSize:28,fontWeight:500,letterSpacing:-.3}}>{text}</div></div>)}
   </div>
  </AbsoluteFill>}

  {f>=760&&<AbsoluteFill data-motion-object="ending" style={{...endingMotion,transform:'none',opacity:unit(f,760,766),zIndex:12}}>
   <div data-motion-object="final-title" style={{position:'absolute',left:track(f,[[780,85],[817,98],[860,106],[899,85]]),top:track(f,[[780,169],[817,157],[860,141],[899,139]]),width:652,...finalTitleMotion}}>
    <div style={{display:'flex',alignItems:'center',gap:13,color:C.blue,fontSize:29,fontWeight:650,marginBottom:30}}><Mic size={36}/>AI口语搭子</div>
    <div style={{fontSize:65,fontWeight:630,letterSpacing:-3,lineHeight:1.21}}>把英语，<br/>聊进你的生活。</div>
    <div style={{marginTop:28,color:'#93979f',fontSize:25}}>从一句 Hi，开始下一段对话。</div>
    <div data-motion-object="final-cta" style={{marginTop:36,width:360,height:72,borderRadius:22,display:'flex',alignItems:'center',justifyContent:'center',gap:16,color:finalCtaMotion>.1?'white':C.blue,background:`rgba(23,101,238,${finalCtaMotion})`,fontSize:24}}><Mic/>开始聊天 <span style={{marginLeft:12}}>→</span></div>
   </div>
   {sceneIds.map((id,i)=>i===1?null:<div key={id} data-motion-object={`final-${id}`} style={{position:'absolute',left:track(f,[[767,1290+i*60],[792+i*4,i<3?710+i*226:710+(i-3)*226],[843, i<3?694+i*226:694+(i-3)*226],[899,i<3?662+i*226:662+(i-3)*226]],easeSlow),top:track(f,[[767,i<3?-220:770],[792+i*4,i<3?-74:542],[843,i<3?-91:518],[899,i<3?-113:493]],easeSlow),width:196,height:294,borderRadius:24,overflow:'hidden',opacity:endingCardsMotion*friendsMotion,boxShadow:SHADOW,zIndex:1}}><Img src={staticFile(id+'.jpg')} style={{width:'100%',height:'100%',objectFit:'cover'}}/><div style={{position:'absolute',inset:0,background:'linear-gradient(transparent 50%,#0b101dbd)'}}/><div style={{position:'absolute',bottom:20,left:20,color:'white',fontSize:20}}>{sceneTitles[i]}</div></div>)}
  </AbsoluteFill>}
 </AbsoluteFill>;
};
