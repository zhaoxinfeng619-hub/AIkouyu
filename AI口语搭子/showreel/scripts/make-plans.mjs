import fs from 'node:fs';
import {build} from 'esbuild';
await build({entryPoints:['src/motion.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.local-motion.mjs'});
const {coffeeGeometry,dialogueGeometry}=await import('../.local-motion.mjs');
const primary=[
 ['M01','camera','coffee-card',0,95,'咖啡场景卡从六人列表中移入中心，保留Alex图像，其他场景沿两个深度层退出','选择咖啡店点单','coffeeMotion',coffeeGeometry],
 ['M02','product_carrier','coffee-card',88,207,'同一角色卡改成详情肖像；头像裁切、姓名、职业与耐心标签错峰建立','认识Alex，选择初学者和温和提醒','coffeeMotion',coffeeGeometry],
 ['M03','interface_response','dialogue-focus',200,323,'开始按钮边界扩成语音输入字幕；点单句逐词建立，输入波形随语音能量更新','用户说出想点一杯拿铁','dialogueMotion',dialogueGeometry],
 ['M04','interface_response','dialogue-focus',316,419,'同一字幕载体换为Alex输出，热饮或冰饮问题逐词出现','Alex理解点单并追问冷热','dialogueMotion',dialogueGeometry],
 ['M05','interface_response','dialogue-focus',412,519,'旧输出停止，同一中央字幕切成蓝色输入，Actually iced please逐词出现','用户自然插话改成冰饮，角色停止旧回复并倾听','dialogueMotion',dialogueGeometry],
 ['M06','product_carrier','dialogue-focus',512,647,'新回答建立，模式选中底板移到语音球；Alex场景图移开，球体与同一字幕保留','切换视觉不重连，Alex继续问杯型','dialogueMotion',dialogueGeometry],
 ['M07','product_carrier','dialogue-focus',640,767,'同一Alex字幕收进记录末行，其余三句按说话顺序建立；复制记录变为已复制','复制当前对话便于回看','dialogueMotion',dialogueGeometry],
 ['M08','camera','coffee-card',760,899,'Alex由边缘场景图回到六人集合，首卡身份连续；品牌与下一段对话入口随角色阵列建立','把英语聊进生活，继续练习其他生活场景','coffeeMotion',coffeeGeometry],
];
const actions=primary.map(([id,layer,object,start,end,change,info,expr,g])=>({id,layer,object_id:object,start_frame:start,end_frame:end,visible_change:change,product_information_change:info,events:[...new Set([...Array.from({length:Math.floor((end-start)/8)+1},(_,i)=>start+i*8),end])].map(frame=>({frame,visible_change:`中心${Math.round(g(frame).x??(g(frame).left+g(frame).width/2))},${Math.round(g(frame).y??(g(frame).top+g(frame).height/2))}；宽${Math.round(g(frame).w??g(frame).width)}，高${Math.round(g(frame).h??g(frame).height)}；${change}`})),source_binding:{source_file:'src/ProductShowreel.tsx',object_marker:object,animated_properties:['left','top','width','height'],expression_markers:[expr]}}));
const extra=[
 ['I01','intro',0,88,'品牌、核心任务与分类一起建立并移出，让选中的角色接管焦点','可识别产品是口语陪练','introMotion'],
 ['I02','selection',46,94,'蓝色选择边界包裹咖啡卡，并沿同一中心收进详情','咖啡场景被选中','ringMotion'],
 ['I03','profile',100,207,'职业、性格、简介、初学者和温和提醒按4–9帧错峰建立','角色身份、练习偏好可读','profileMotion'],
 ['I04','orb',543,647,'语音球从原场景旁进入，尺寸与语音能量响应同一对话','语音球仅改变视觉表现','orbitMotion'],
 ['I05','copy',706,736,'复制记录按钮压下，文字在F722改为已复制，底色变蓝灰','当前字幕已复制','recordCopyMotion'],
 ['I07','dialogue-focus',577,629,'读完冷热问题后，字幕与语音球错峰进入记录方向','将当前回答保留到记录','dialogueMotion'],
 ['I08','coffee-card',843,899,'读完品牌结果后，同一Alex场景卡与其余角色继续归入可选集合','下一段生活对话仍可开始','coffeeMotion'],
 ['I09','final-cta',891,899,'开始聊天控件恢复产品蓝色，结尾仍保持下一次操作入口','准备继续开口','finalCtaMotion'],
 ['I06','final-title',790,899,'品牌随角色集合建立，价值与下一段对话入口依次揭开','从一句Hi开始练习','finalTitleMotion'],
];
for(const [id,object,start,end,change,info,expr] of extra)actions.push({id,layer:'interface_response',object_id:object,start_frame:start,end_frame:end,visible_change:change,product_information_change:info,events:[...new Set([...Array.from({length:Math.floor((end-start)/8)+1},(_,i)=>start+i*8),end])].map(frame=>({frame,visible_change:change+'；对象在该帧由'+expr+'驱动'})),source_binding:{source_file:'src/ProductShowreel.tsx',object_marker:object,animated_properties:['transform','opacity','content'],expression_markers:[expr]}});
fs.writeFileSync('product-motion-map.json',JSON.stringify({fps:30,duration_in_frames:900,actions,result_holds:[{id:'R01',start_frame:570,end_frame:587,product_result:'Alex回应冰饮并追问杯型，语音球模式保留同一角色与字幕',next_action_id:'I07'},{id:'R02',start_frame:699,end_frame:712,product_result:'当前对话记录可读，复制操作在读数结束前启动',next_action_id:'I05'},{id:'R03',start_frame:841,end_frame:849,product_result:'把英语聊进生活，六种场景保持可选',next_action_id:'I08'},{id:'R04',start_frame:891,end_frame:899,product_result:'品牌与开始聊天入口完整保留',next_action_id:'I09'}],continuity_chain:primary.map(p=>p[0]),note:'不把背景移动算作产品动画；逐词字幕、角色标签、记录行与波形是对应真实状态的演示。工程覆盖通过不等于正常速度质量通过。'},null,2));
const names=['before_overlap','overlap_start','main_motion_midpoint','property_transfer','after_overlap'];
const handoffs=primary.slice(0,-1).map((p,i)=>{const next=primary[i+1];const start=next[3],end=p[4],g=i===0||i===6?coffeeGeometry:dialogueGeometry;const object=i===0||i===6?'coffee-card':'dialogue-focus';return {id:'H0'+(i+1),from_action:p[0],to_action:next[0],bridge_object_id:object,overlap:{start_frame:start,end_frame:end},shared_attributes:['object_identity','position','size','direction'],simultaneous_complete_copies:false,added_product_information:next[6],states:[start-1,start,start+3,end,end+1].map((frame,j)=>{const v=g(frame),n=g(frame+1);const x=v.x??v.left+v.width/2,y=v.y??v.top+v.height/2;return{name:names[j],frame,center_x:+x.toFixed(2),center_y:+y.toFixed(2),width:+(v.w??v.width).toFixed(2),height:+(v.h??v.height).toFixed(2),color:v.background??'Alex场景图',content:i===0||i===6?'Alex / 咖啡店点单':frame<210?'开始聊天':frame<316?'Hi! I’d like a latte, please.':frame<412?'Sure. Would you like it hot or iced?':frame<512?'Actually, iced, please.':'An iced latte. What size would you like?',clip:'同一对象的overflow:hidden圆角容器',container:object,velocity_x:+((n.x??n.left+n.width/2)-x).toFixed(2),velocity_y:+((n.y??n.top+n.height/2)-y).toFixed(2),image:'evidence/F'+String(frame).padStart(3,'0')+'.png'}})}});
fs.writeFileSync('handoff-map.json',JSON.stringify({fps:30,handoffs},null,2));
let md='# 帧级导演方案\n\n1280×720 / 30fps / F000–F899。人物图片来自真实项目；对白为示范脚本。\n\n';
for(const p of primary){md+=`## F${String(p[3]).padStart(3,'0')}–F${p[4]}｜${p[6]}\n\n${p[5]}。\n\n主动作${p[0]}；焦点对象${p[2]}。前一动作尾部与此动作头部保持8帧重叠。摄影机、字幕与控件使用不同开始帧和缓动。\n\n`;
for(let f=p[3];f<=p[4];f+=8){const end=Math.min(f+7,p[4]),a=p[8](f),b=p[8](end);md+=`- F${f}–F${end}：${p[2]}中心 (${Math.round(a.x??a.left+a.width/2)}, ${Math.round(a.y??a.top+a.height/2)}) → (${Math.round(b.x??b.left+b.width/2)}, ${Math.round(b.y??b.top+b.height/2)})；尺寸 ${Math.round(a.w??a.width)}×${Math.round(a.h??a.height)} → ${Math.round(b.w??b.width)}×${Math.round(b.h??b.height)}。同时按源码在该段推进选中、标签、字幕、模式或记录内容；正常速度可见量以审片为准。\n`;}md+='\n'}
md+='## 转场对象表\n\n| From | Handoff Object | To | 保持属性 | Overlap |\n|---|---|---|---|---|\n'+handoffs.map(h=>`| ${h.from_action} | ${h.bridge_object_id} | ${h.to_action} | 身份、位置、尺寸、运动方向 | F${h.overlap.start_frame}–F${h.overlap.end_frame} |`).join('\n')+'\n\n## 运动审计\n\n关闭两个背景色场后输出MotionAudit；freeze脚本只证明未出现工程层面的长静止段。当前连续对白含阅读窗口，完整质量以六帧、五帧交接条及正常速度观看判断。\n';
fs.writeFileSync('frame-motion-description.md',md);
