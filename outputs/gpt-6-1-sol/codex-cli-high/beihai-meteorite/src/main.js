import * as T from 'three';
import {CinematicPlayer,ThreeStage,WebAudioCueBus,mountCinematicControls,validateVoiceCues} from '@agentbench/cinematic-player';
import {aim,float as floatPose,walk,lerpPose} from '@agentbench/voxel-kit';
import {makeCollector,makeWorkshop,makeBasement,makeSpace,makeMeeting,makeCabin,applyPose,idle} from './worlds.js';
import {voiceCues} from './voice-cues.js';
import {soundCues,defineAudio} from './audio.js';
import './style.css';
import {mergeArchitecture} from './optimize.js';
const duration=300;validateVoiceCues(voiceCues,duration);
const scene=new T.Scene();scene.background=new T.Color(0x05080b);
const camera=new T.PerspectiveCamera(40,1,.025,500);const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const worlds={home:makeCollector(),shop:makeWorkshop(),cell:makeBasement(),space:makeSpace(),meeting:makeMeeting(),cabin:makeCabin()};for(let w of Object.values(worlds)){mergeArchitecture(w);scene.add(w.g);w.g.visible=false}
const title=document.querySelector('#title'),veil=document.querySelector('#veil'),chapter=document.querySelector('#chapter'),credits=document.querySelector('#credits');
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>x*x*(3-2*x),mix=(a,b,p)=>a+(b-a)*p;
const vec=a=>new T.Vector3(...a);let active='';
function cam(a,b,lookA,lookB,p,fov=40){camera.position.copy(vec(a).lerp(vec(b),ease(p)));camera.lookAt(vec(lookA).lerp(vec(lookB||lookA),ease(p)));camera.fov=fov;camera.updateProjectionMatrix()}
function performHome(t){let w=worlds.home;w.zhang.root.position.set(-1.4,0,t<20?mix(3,1.25,clamp((t-13)/7)):1.25);w.zhang.root.rotation.set(0,.55,0);w.held.visible=t>=27&&t<57;w.cup.visible=!w.held.visible;let p=t<20?walk(t,1):idle(t);p.neck=[t>57?.08:.01,.12+Math.sin(t*.25)*.025,0];if(t>=27&&t<57){p.armR=[-.85,0,-.1];p.armL=[-.2,0,.05]}if(t>=58){p.armR=[-1.1,.1,-.08];p.neck=[.12,.1,0]}applyPose(w.zhang,p);let c=idle(t);c.neck=[.09,-.08+Math.sin(t*.3)*.06,0];c.armL=[t>40&&t<50?-.9:-.3,0,-.15];c.armR=[-.45,0,.12];applyPose(w.collector,c);for(let [i,r] of w.rocks.entries()){r.rotation.set(.2,i+.1*Math.sin(t*.2),.1)} }
function performShop(t){let w=worlds.shop;applyPose(w.zhang,{...idle(t),neck:[.22,-.2,0],armR:[-1.22,-.1,.1],armL:[-.85,0,-.1]});w.cutter.position.x=-1+Math.sin(t*2.8)*.19;w.cutter.position.y=1.83+Math.sin(t*5)*.05;w.rock.rotation.y=t*3;w.rock.visible=t<93;w.sparks.visible=t>=80&&t<92;for(let [i,s] of w.sparks.children.entries()){let phase=((t*2+i*.17)%1);s.position.set(Math.sin(i*2.3)*phase*.45,phase*.3-phase*phase*.3,Math.cos(i*2.3)*phase*.5);s.visible=((Math.floor(t*14)+i)%3!==0)}for(let [i,m]of w.fragments.entries())m.visible=t>87+i*.14}
function performCell(t){let w=worlds.cell;let recoil=Math.max(...[106,108,110,111.5].map(x=>Math.max(0,1-(t-x)/.18)*(t>=x?1:0)));w.zhang.root.position.set(-1.25,0,.15);w.zhang.root.rotation.set(0,Math.PI/2,0);let p=t<113?aim(-.02):{...idle(t),neck:[.28,0,0],armR:[-.65,0,.05],armL:[-.95,0,-.1]};if(t<103)p={...idle(t),armR:[-1.0,0,0],armL:[-.6,0,-.2],neck:[.3,0,0]};p.armR[0]-=recoil*.2;applyPose(w.zhang,p);w.gun.visible=t>=103&&t<113;w.flash.visible=recoil>.5;w.flashLight.intensity=recoil*8;for(let [i,h]of w.holes.entries())h.visible=t>[106,108,110,111.5][i];w.broken.visible=t>=113;for(let [i,r]of w.rounds.entries())r.visible=i>=4||t<113;w.bag.rotation.z=t>114?-.06:0}
function performSpace(t){let w=worlds.space;
let shot=t>=246&&t<254,burst=shot&&((t-246.25)% .24)<.045&&t>=246.25&&t<253.25;
let yaw=2.48;let p=floatPose(t);p.neck=[.08,-.04,0];p.hips=[-.08,.06,.02];if(t>=235&&t<264){p={...p,...aim(-.03),legR:[-.5,0,.13],legL:[-.23,0,-.12]};p.armR[0]-=burst?.13:0;p.armL[0]-=burst?.06:0}else if(t>=264){p.armR=[-.65,0,.18];p.armL=[-.45,0,-.24]}
applyPose(w.hero,p);w.hero.root.position.set(-4+(t>276?(t-276)*-.7:0),Math.sin(t*.22)*.08+(t>276?(t-276)*.15:0),5+(t>276?(t-276)*.4:0));w.hero.root.rotation.set(0,t>=235?yaw:.1,.06);w.gun.visible=t>=235&&t<276;
w.hero.clothing.head.material.map=t<211?w.hero.clear:w.hero.dark;w.hero.clothing.head.material.needsUpdate=true;
w.g.updateMatrixWorld(true);let muzzle=w.hero.anchors.handR.localToWorld(new T.Vector3(0,1,4.8));w.flash.position.copy(muzzle);w.flash.visible=burst;
let sunset=clamp((t-180)/90);w.sun.position.y=8-sunset*28;w.halo.position.copy(w.sun.position);w.halo.position.z-=1;w.sun.scale.setScalar(1);w.sunLight.intensity=3.2-sunset*1.8;w.st.door.position.x=-5.4+(t>=214?1.4:0);w.st.signal.material.color.setHex(t>=213?0x93c39f:0xaf604d);
for(let [i,f]of w.people.entries()){f.root.visible=t>=211;let arrive=ease(clamp((t-214-i*.14)/10));let row=Math.floor(i/5);let x=9+((i<5?[1,2,3,0,4][i]:i%5)-2)*1.05,y=1+row*1.8,z=-14-row*.65;f.root.position.set(mix(7.6,x,arrive),mix(.9,y,arrive)+Math.sin(t*.5+i)*.03,mix(-26.5,z,arrive));f.root.rotation.set(0,0,Math.sin(t*.3+i)*.03);let po=floatPose(t+i);po.hips=[-.02,0,0];po.neck=[0,Math.sin(t*.3+i)*.04,0];po.armR=[-.35,0,.15];po.armL=[-.3,0,-.13];po.legR=[-.25,0,.07];po.legL=[-.12,0,-.1];if(t>=264&&i<3){po.hips=[-.4,0,(i-1)*.18];po.armR=[-.6,0,.4];po.armL=[-.85,0,-.3];f.root.position.y+=clamp((t-264)/8)*.23;f.root.rotation.z=(i-1)*clamp((t-264)/8)*.3}if(t>=268&&i>=3){po.armR=[-1.4,0,-.1];po.armL=[-1.2,0,.1]}applyPose(f,po);let broken=t>=265&&i<3;f.clothing.head.material.map=broken?f.broken:t>=230?f.clear:f.dark;if(t>=276){let k=ease(clamp((t-276)/9));f.root.position.lerp(new T.Vector3(7.6,.9,-27),k);f.root.visible=k<.98;f.root.rotation.x=-k*.8}}
w.photographer.root.visible=t>=220&&t<281;applyPose(w.photographer,{...floatPose(t),armR:[-1.4,0,0],armL:[-1.2,0,-.18],hips:[-.04,0,0]});if(t>=276){let k=clamp((t-276)/7);w.photographer.root.position.set(13-k*5.4,2-k,-8-k*19)}else w.photographer.root.position.set(13,2,-8);
for(let [i,m]of w.plumes.entries()){m.visible=(t>=214&&t<226)||(t>=264&&t<284);let phase=(t*.8+i*.173)%1;let j=i%3;if(t<230){m.position.set(7.6+Math.sin(i*2.4)*phase*1.4,1+Math.cos(i)*phase,-25+phase*3);m.material.opacity=.14*(1-phase)}else{let f=w.people[j],base=f.root.position;m.position.set(base.x+phase*(i%2?1:-1)*1.2,base.y+1+phase*.85,base.z+phase*3);m.material.opacity=.65*(1-phase);m.scale.setScalar(.055+phase*.24)}}
}
function performMeeting(t){let w=worlds.meeting;for(let [i,f]of w.people.entries())applyPose(f,{...idle(t+i),neck:[.04,.06,0],armR:[t>=150&&i===1?-.85:-.15,0,.08],armL:[-.4,0,-.1]});applyPose(w.zhang,{...idle(t),neck:[.02,.15,0],armR:[-.12,0,.01],armL:[-.1,0,-.01]})}
function performCabin(t){let w=worlds.cabin;applyPose(w.zhang,{...idle(t),neck:[.14,-.2,0],armL:[-.2,0,0],armR:[mix(-1.2,-.2,clamp((t-172)/5)),0,0]});w.zhang.root.position.x=mix(.2,1.5,clamp((t-175)/5));w.zhang.root.rotation.y=mix(-.6,2.4,clamp((t-176)/4))}
const performers={home:performHome,shop:performShop,cell:performCell,space:performSpace,meeting:performMeeting,cabin:performCabin};
export const edit=[
['01-stone',0,13,'home',[1.0,1.24,2.05],[.7,1.18,1.8],[0,.98,.6],[0,.98,.6],34],
['02-arrival',13,27,'home',[-3.3,2.3,5.5],[-2.8,2,4.6],[.3,1.1,.2],[.25,1.1,.2],42],
['03-tea',27,42,'home',[-2.7,1.7,3.25],[-2.3,1.62,3],[-.6,1.25,.7],[-.5,1.25,.7],39],
['04-world',42,50,'home',[.05,1.75,2.65],[.25,1.69,2.45],[1.35,1.35,.16],[1.35,1.39,.16],34],
['04b-cup',50,57,'home',[-.05,1.8,3.4],[-.2,1.75,3.15],[-1.4,1.4,1.2],[-1.4,1.4,1.2],34],
['05-respect',57,69,'home',[-.1,1.7,3.2],[-.4,1.7,2.8],[-1.4,1.35,1.2],[-1.4,1.4,1.2],34],
['06-after-hours',69,80,'shop',[4.3,2.7,5.6],[3.5,2.35,4.8],[-.7,1,-.3],[-.7,1.2,-.3],44],
['07-lathe',80,93,'shop',[-.2,1.85,1.7],[-.5,1.67,1.3],[-1,1.48,-.1],[-1,1.48,-.1],32],
['08-thirty-six',93,103,'cell',[-1.6,2.9,2.8],[-1.6,2.4,2.5],[-1.5,.94,1.6],[-1.5,.94,1.6],36],
['09-report',103,113,'cell',[-2.5,1.9,3.3],[-2.3,1.8,3.1],[.2,1.2,.2],[.2,1.2,.2],45],
['10-no-trace',113,125,'cell',[-1.5,1.35,2.7],[-1.5,1.2,2.35],[-1.6,.96,1.72],[-1.6,.95,1.72],32],
['11-umbilical',125,140,'space',[29,15,24],[24,10,15],[10,2,-30],[10,2,-30],52],
['12-future',140,154,'meeting',[3.8,2.4,4.8],[3,2.1,4],[0,1.35,-.65],[0,1.35,-.65],42],
['13-certain',154,169,'meeting',[-.4,1.75,2.4],[-.7,1.7,2.2],[-2.7,1.4,1.3],[-2.7,1.4,1.3],33],
['14-signal',169,180,'cabin',[-2.5,1.7,2.3],[-1.9,1.4,1.7],[-1.2,1.05,-.2],[-1.2,1.05,-.2],36],
['15-alone',180,196,'space',[0,9,28],[1,7,23],[-1,2,-14],[-1,2,-14],57],
['16-father',196,211,'space',[-6.8,2.6,9],[-5.8,2.2,8.3],[-4,1.45,5],[-4,1.5,5],35],
['17-airlock',211,223,'space',[7.3,3,-19],[6.7,2.6,-18],[7.6,1.2,-26],[7.6,1.2,-25],40],
['18-photograph',223,235,'space',[7.2,4.8,-5.8],[7.7,4.3,-6.6],[9,3.6,-14],[9,3.5,-14],45],
['19-face',235,241,'space',[9.1,2.1,-11],[9.1,2,-11.8],[9,2.3,-14],[9,2.3,-14],34],
['20-aim',241,246,'space',[-7,2.9,8],[-6.4,2.5,7.6],[-4,1.35,5],[-4,1.35,5],34],
['21-firefly',246,254,'space',[-7.4,3.2,9.5],[-7.6,3.3,9.7],[-4,1.25,5],[-4,1.25,5],39],
['22-ten-seconds',254,264,'space',[4,7,14],[4,7,14],[7,2,-15],[7,2,-15],49],
['23-meteor-rain',264,276,'space',[7.9,4.7,-5.5],[8.2,4.2,-6.2],[9,3.4,-14],[9,3.3,-14],45],
['24-return',276,287,'space',[-2,6,20],[0,8,26],[2,1,-12],[3,1,-16],55],
['25-tea-remains',287,295,'home',[-.82,1.23,1.8],[-.82,1.18,1.65],[-.8,.99,.94],[-.8,1,.94],32],
['26-end',295,300,'home',[1,2,4],[1,2,4],[0,1,0],[0,1,0],40]
];
let shots=edit.map(([id,start,end,world,a,b,la,lb,fov])=>({id,start,end,enter:()=>{active=world;for(let [key,w]of Object.entries(worlds))w.g.visible=key===world;scene.background.setHex(world==='space'?0x010307:0x080e12);},update:({time,progress})=>{performers[world](time);cam(a,b,la,lb,progress,fov)}}));
shots.unshift({id:'editorial-overlays',start:0,end:300,update:({time})=>{title.style.opacity=1-clamp((time-8)/4);title.style.display=time<13?'block':'none';credits.style.opacity=clamp((time-295)/1);let transition=0;for(let c of [69,125,140,169,180,287])transition=Math.max(transition,1-Math.abs(time-c)/.5);veil.style.opacity=Math.max(transition,time>=294?clamp((time-294)/1):0);let chapters=[[13,19,'I  /  尘世'],[69,75,'II  /  铁与镍'],[125,133,'III  /  三个月后 · 同步轨道'],[211,217,'IV  /  日落时分']];chapter.textContent=chapters.find(([a,b])=>time>=a&&time<b)?.[2]||''}});
const player=new CinematicPlayer({duration,context:{scene,camera},shots,cues:[...voiceCues,...soundCues]});
const stage=new ThreeStage({player,renderer,scene,camera,container:document.querySelector('#stage'),maxPixelRatio:1.5});
const audio=new WebAudioCueBus(player);defineAudio(audio);const controls=mountCinematicControls({player,audio,container:document.querySelector('#cinema')});
const start=document.querySelector('#start');start.addEventListener('click',async()=>{await audio.unlock();player.play()});player.addTypedEventListener('statechange',({detail})=>{start.style.display=detail.state==='playing'||player.currentTime>0?'none':'block'});player.addTypedEventListener('frame',()=>{if(player.currentTime>0)start.style.display='none'});
window.addEventListener('keydown',async e=>{if(e.target.tagName==='INPUT')return;if(e.code==='Space'){e.preventDefault();await audio.unlock();player.isPlaying?player.pause():player.play()}if(e.code==='ArrowRight')player.seek(Math.min(duration,player.currentTime+5));if(e.code==='ArrowLeft')player.seek(Math.max(0,player.currentTime-5))});
// Exposed transport is useful for production review and deterministic seek inspection.
window.film={player,voiceCues,edit,audio,worlds,renderer,camera,stage};
