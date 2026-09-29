import step from './assets/audio/step.ogg?inline';
import metal from './assets/audio/metal.ogg?inline';
import cup from './assets/audio/cup.ogg?inline';
import machine from './assets/audio/machine.ogg?inline';
import shot from './assets/audio/shot.ogg?inline';
import door from './assets/audio/door.ogg?inline';
import thruster from './assets/audio/thruster.ogg?inline';
import computer from './assets/audio/computer.ogg?inline';
import thump from './assets/audio/thump.ogg?inline';
export const soundCues=[];
function s(id,sound,start,end,gain=.4,sustain=false,group='sfx'){soundCues.push({id,kind:'sound',sound,group,start,end,gain,sustain})}
s('room','room',0,69,.19,true,'ambience');s('room-return','room',287,295,.12,true,'ambience');
for(let i=0;i<9;i++)s('step-'+i,'step',14+i*.62,14+i*.62+.5,.28);
s('tea','cup',28,28.8,.3);s('tea-return','cup',290,290.8,.16);
s('stone-case','metal',57.8,58.7,.25);
s('machine-room','hum',69,103,.15,true,'ambience');s('cnc','machine',76,92,.32,true);
for(let i=0;i<12;i++)s('cut-'+i,'metal',80+i*.91,80+i*.91+.5,.13);
s('tray','metal',94,94.9,.25);s('gun-click','metal',102,102.7,.22);
for(let [i,t] of [106,108,110,111.5].entries()){s('gun-'+i,'shot',t,t+.7,.7);for(let [j,d] of [.08,.17,.31,.47].entries())s('echo-'+i+'-'+j,'shot',t+d,t+d+.7,.27/(j+1));s('gun-low-'+i,'pulse',t,t+.55,.5)}
s('fabric','thump',117,117.8,.16);s('orbit-music','drone',125,211,.15,true,'music');s('room-electronics','computer',140,169,.15,true,'ambience');s('locator','computer',170,172,.2);s('latch','metal',177,178,.28);
s('suit','breath',180,264,.32,true,'ambience');s('radio-1','radio',225.8,226.15,.1);s('radio-2','radio',233.8,234.15,.1);
s('cabin-door','door',178,179.8,.24); // Airlock exterior remains silent in vacuum.

// Only suit conduction at firing. No external gun report in vacuum.
for(let i=0;i<30;i++){let t=246.25+i*.24;s('conducted-'+i,'thump',t,t+.22,.095);s('recoil-'+i,'pulse',t,t+.18,.09)}
s('radio-distress','radio',266.8,267.1,.2);s('pressure-alarm','alarm',265,276,.18,true);s('leaking-suit','air',265,270,.3,true);s('internal-thruster','thruster',278,285,.14,true);
s('closing-music','drone',276,295,.13,true,'music');
export function defineAudio(bus){bus.defineSample('step',step).defineSample('metal',metal).defineSample('cup',cup).defineSample('machine',machine,{loop:true,playbackRate:.7}).defineSample('shot',shot,{playbackRate:1.5}).defineSample('door',door).defineSample('thruster',thruster,{loop:true,playbackRate:.65}).defineSample('computer',computer,{loop:true,playbackRate:.75}).defineSample('thump',thump,{playbackRate:.5});
function noise({audioContext:ac,output},type){let buffer=ac.createBuffer(1,ac.sampleRate*4,ac.sampleRate),d=buffer.getChannelData(0);let v=1;for(let i=0;i<d.length;i++){v=(v*16807)%2147483647;d[i]=(v/2147483647-.5)*2}let src=ac.createBufferSource();src.buffer=buffer;src.loop=true;let filter=ac.createBiquadFilter();filter.type='lowpass';filter.frequency.value=type==='room'?280:type==='breath'?950:1600;let gain=ac.createGain();gain.gain.value=type==='room'?.06:type==='breath'?.08:.16;src.connect(filter).connect(gain).connect(output);let lfo=ac.createOscillator(),lfg=ac.createGain();lfo.frequency.value=type==='breath'?.24:.1;lfg.gain.value=type==='breath'?.075:.015;lfo.connect(lfg).connect(gain.gain);lfo.start();src.start();return {stop:()=>{src.stop();lfo.stop()}}}
for(let n of ['room','air','breath'])bus.define(n,o=>noise(o,n));
bus.define('pulse',({audioContext:ac,output})=>{let o=ac.createOscillator(),g=ac.createGain();o.frequency.setValueAtTime(82,ac.currentTime);o.frequency.exponentialRampToValueAtTime(30,ac.currentTime+.18);g.gain.setValueAtTime(.4,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.24);o.connect(g).connect(output);o.start();o.stop(ac.currentTime+.26);return {stop:()=>{try{o.stop()}catch{}}}});
for(let n of ['hum','drone','alarm','radio'])bus.define(n,({audioContext:ac,output,elapsed=0})=>{let nodes=[];for(let i=0;i<(n==='drone'?4:1);i++){let o=ac.createOscillator(),g=ac.createGain();o.type=n==='radio'?'sawtooth':n==='alarm'?'sine':'triangle';o.frequency.value=n==='hum'?72:n==='radio'?1800:n==='alarm'?660:[55,82.41,110,164.81][i];g.gain.value=n==='radio'?.045:n==='hum'?.1:.065;o.connect(g).connect(output);if(n==='alarm'){for(let j=0;j<60;j++){g.gain.setValueAtTime(.1,ac.currentTime+j*.6);g.gain.setValueAtTime(0,ac.currentTime+j*.6+.17)}}o.start();nodes.push(o)}return {stop:()=>nodes.forEach(o=>o.stop())}});
bus.setMasterGain(.8);}
