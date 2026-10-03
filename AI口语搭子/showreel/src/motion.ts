import {Easing, interpolate} from 'remotion';
export const C={blue:'#1765ee',ink:'#242529',gray:'#f3f4f5',muted:'#93969b'};
export type Key = [number,number];
export const track=(f:number,keys:Key[],ease=Easing.bezier(.24,.03,.2,1))=>interpolate(f,keys.map(k=>k[0]),keys.map(k=>k[1]),{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
export const easeSlow=Easing.bezier(.42,.08,.28,.96);
export const easeFast=Easing.bezier(.12,.72,.18,1);
export const unit=(f:number,a:number,b:number)=>track(f,[[a,0],[b,1]]);
export const linear=(f:number,a:number,b:number)=>track(f,[[a,0],[b,1]],Easing.linear);
export const enter=(f:number,a:number,b:number)=>({opacity:unit(f,a,a+7),transform:`translateY(${track(f,[[a,52],[b,0]],easeFast)}px)`});
export const panel=(f:number,a:number,b:number,dir=1)=>({opacity:unit(f,a,a+5)*(1-unit(f,b-7,b)),transform:`translateX(${track(f,[[a,140*dir],[a+22,0],[b-20,0],[b,-180*dir]])}px)`});
export const coffeeGeometry=(f:number)=>({
 x:track(f,[[0,848],[26,840],[64,720],[88,640],[116,318],[155,296],[196,322],[222,640],[268,696],[310,764],[350,885],[412,940],[470,992],[520,820],[552,1040],[574,1350],[744,1350],[770,1045],[798,1000],[843,992],[899,940]],easeSlow),
 y:track(f,[[0,324],[64,348],[88,360],[116,352],[196,365],[222,360],[268,385],[310,360],[350,332],[412,356],[470,386],[520,360],[574,344],[744,344],[770,310],[843,342],[899,360]],easeSlow),
 w:track(f,[[0,228],[26,252],[64,332],[88,416],[116,358],[155,395],[196,368],[222,1280],[268,1430],[310,1500],[350,1060],[412,1180],[470,1260],[520,820],[574,560],[744,560],[770,274],[798,274],[843,300],[899,270]],easeSlow),
 h:track(f,[[0,342],[26,378],[64,498],[88,624],[116,538],[155,580],[196,544],[222,720],[268,870],[310,920],[350,796],[412,880],[470,932],[520,720],[574,560],[744,560],[770,406],[798,406],[843,445],[899,400]],easeSlow),
 r:track(f,[[0,28],[196,32],[222,0],[510,0],[558,48],[744,48],[770,28]]),
 opacity:1,
});
export const at=(g:{x:number,y:number,w:number,h:number,r?:number,opacity?:number})=>({position:'absolute' as const,left:g.x-g.w/2,top:g.y-g.h/2,width:g.w,height:g.h,borderRadius:g.r??28,opacity:g.opacity??1});
export const sceneNames=['Mia','Alex','Leo','Emma','Noah','Olivia'];
export const sceneTitles=['认识新朋友','咖啡店点单','街头餐车','商店购物','旅行问路','酒店入住'];
export const sceneIds=['mia','alex','leo','emma','noah','olivia'];

export const dialogueGeometry=(f:number)=>({position:'absolute' as const,
 left:track(f,[[174,570],[190,570],[211,110],[250,96],[308,80],[327,108],[376,90],[404,114],[429,90],[482,112],[504,120],[537,368],[577,356],[629,384],[664,176],[710,198],[767,228]],easeSlow),
 top:track(f,[[174,597],[190,597],[211,308],[250,300],[308,254],[327,218],[376,244],[404,282],[429,264],[482,240],[504,270],[537,350],[577,374],[629,402],[664,491],[710,489],[767,471]],easeSlow),
 width:track(f,[[174,592],[190,592],[211,1060],[250,1060],[308,1000],[327,1050],[404,1030],[429,1090],[504,1040],[537,824],[577,852],[629,880],[664,880]]),
 height:track(f,[[174,72],[190,72],[211,294],[250,294],[308,274],[327,320],[404,304],[429,320],[504,294],[537,275],[577,275],[629,260],[664,103]]),
 borderRadius:track(f,[[174,22],[211,34],[629,30],[664,22]]),
 background:f<316||f>=412&&f<512?C.blue:f<640?'#fffffff2':'#f5f6f8',
 transform:`scale(${track(f,[[174,1],[189,.955],[196,1]])})`,
 });
