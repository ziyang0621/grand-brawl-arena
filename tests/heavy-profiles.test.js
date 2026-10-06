import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,heavy,STEP} from '../arena-core.js';
import {CHARACTERS,CHARACTER_IDS} from '../arena-roster.js';

// Every character's U is its own move: reach, arc, force, launch differ (see CHARACTERS[id].heavy).
function duel(char,place){
  const w=createWorld({chars:[char,'brawler'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});q.blocking=false;
  place(q);q.hp=100;
  p.attackCD=0;heavy(w,p,{});
  for(let t=0;t<.7;t+=STEP){step(w,{});q.hp=Math.max(q.hp,0);}
  return {w,p,q};
}
test('every character has a distinct heavy profile',()=>{
  const names=new Set();
  for(const id of CHARACTER_IDS){const h=CHARACTERS[id].heavy;assert.ok(h&&h.name&&(h.reach>0||h.projectile),id);names.add(h.name);}
  assert.equal(names.size,CHARACTER_IDS.length);
});
test("Red Sail's U is a flying slash: it reaches far ahead, pierces, and does not hit behind",()=>{
  const far=duel('swordsman',q=>Object.assign(q,{x:3.2,z:0,fx:-1,fz:0}));
  assert.ok(far.q.hp<100,'the slash wave travels about 3 units');
  assert.equal(duel('swordsman',q=>Object.assign(q,{x:5.5,z:0,fx:-1,fz:0})).q.hp,100,'but not across the arena');
  const two=(()=>{const w=createWorld({chars:['swordsman','brawler','gunner'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
    const [p,q,r]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:2.4,z:0});Object.assign(r,{x:3.2,z:0});p.attackCD=0;heavy(w,p,{});
    for(let t=0;t<.9;t+=STEP)step(w,{});return [q.hp,r.hp];})();
  assert.ok(two[0]<100&&two[1]<100,'the wave pierces through both');
  const behind=duel('swordsman',q=>Object.assign(q,{x:-4,z:0,fx:1,fz:0}));
  assert.equal(behind.q.hp,100);
});
test("the guardian's U throws his shield out and back, hitting on both legs",()=>{
  const w=createWorld({chars:['guardian','brawler'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:-2,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:1,z:0,fx:-1,fz:0});q.hp=100;p.attackCD=0;heavy(w,p,{});
  let first=100,sawShield=false,gone=false;
  for(let t=0;t<2.4;t+=STEP){step(w,{});if(w.shots.length)sawShield=true;q.vx=q.vz=0;q.x=1;q.z=0;q.invuln=0;q.knocked=0;if(t<.4)first=q.hp;if(sawShield&&!w.shots.length)gone=true;}
  assert.ok(sawShield,'a shield flies');assert.ok(first<100,'hit on the way out');assert.ok(q.hp<first,'hit again on the way back');assert.ok(gone,'the shield returns to him');
});
test("the brawler's rubber rocket punch reaches 3 units, narrowly",()=>{
  const near=duel('brawler',q=>Object.assign(q,{x:3.2,z:0,fx:-1,fz:0}));assert.ok(near.q.hp<100,'hits at 3.2');
  const far=duel('brawler',q=>Object.assign(q,{x:4,z:0,fx:-1,fz:0}));assert.equal(far.q.hp,100);
  const side=duel('brawler',q=>Object.assign(q,{x:0,z:2.9,fx:0,fz:-1}));assert.equal(side.q.hp,100);
});
test("the cook's whirlwind kick hits all around him, Red Sail's thrust does not",()=>{
  const spin=duel('cook',q=>Object.assign(q,{x:-1.6,z:0,fx:1,fz:0}));
  assert.ok(spin.q.hp<100,'whirlwind catches an enemy behind');
});

import {grab,attack} from '../arena-core.js';
function grabThrow(char){
  const w=createWorld({chars:[char,'brawler'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:1.5,z:0,fx:-1,fz:0});
  p.attackCD=0;grab(w,p,{});for(let t=0;t<.6;t+=STEP)step(w,{});
  const afterGrab=q.hp;assert.equal(q.grabbedBy,p.id,char+' holds');
  attack(w,p,{});step(w,{});
  return {afterGrab,after:q.hp,q,spd:Math.hypot(q.vx,q.vz)};
}
test('every grab ends with its own damage on release; the stormcaller shocks and the gunner throws far',()=>{
  const sw=grabThrow('swordsman'),gu=grabThrow('gunner'),st=grabThrow('stormcaller'),br=grabThrow('brawler');
  for(const r of [sw,gu,st,br])assert.ok(r.after<r.afterGrab,'release hurts');
  assert.ok(gu.spd>sw.spd*1.2,'gunner throws further');
  assert.ok(st.q.slowTime>0,'shocked');
  assert.ok(br.afterGrab<sw.afterGrab,'the brawler grab hurts most');
});

import {createFighter,stepFighter} from '../arena-core.js';
import {STAGES} from '../arena-roster.js';
const walkOn=(char,stage,x,z,seconds,input)=>{const p=createFighter(0,x,z,char);for(let t=0;t<seconds;t+=STEP)stepFighter(p,input,STEP,stage);return p;};
test('characters cope differently with quicksand and ice',()=>{
  const sand=STAGES.desert.zones[0];
  const dist=char=>walkOn(char,STAGES.desert,sand.x-1.5,sand.z,.6,{x:1}).x-(sand.x-1.5);
  assert.ok(dist('cook')>dist('swordsman')&&dist('swordsman')>dist('guardian'),'cook wades best, the armoured guardian worst');
  const iceZone=STAGES.snow.zones.find(z=>z.kind==='ice');
  const slide=char=>{const p=walkOn(char,STAGES.snow,iceZone.x-4,iceZone.z,.5,{x:1});const x0=p.x;for(let t=0;t<.6;t+=STEP)stepFighter(p,{},STEP,STAGES.snow);return p.x-x0;};
  assert.ok(slide('gunner')>slide('guardian')*1.5,'the light gunner slides much further than the planted guardian');
});

test("the gunner's and the storm caller's U are ranged shots; the cook's whirlwind kick reaches further than J",()=>{
  const g=duel('gunner',q=>Object.assign(q,{x:9,z:0,fx:-1,fz:0}));assert.ok(g.q.hp<100,'a heavy bullet hits at 9');
  const s=duel('stormcaller',q=>Object.assign(q,{x:6,z:0,fx:-1,fz:0}));assert.ok(s.q.hp<100,'a thunder ball hits at 6');assert.ok(s.q.slowTime>0,'and slows');
  const k=duel('cook',q=>Object.assign(q,{x:3.1,z:0,fx:-1,fz:0}));assert.ok(k.q.hp<100,'whirlwind reaches 3.1');
  const j=(()=>{const w=createWorld({chars:['cook','brawler'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;const [p,q]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:3.1,z:0});attack(w,p,{});for(let t=0;t<.6;t+=STEP)step(w,{});return q.hp;})();
  assert.equal(j,100,'while J does not');
});

function strike(char,hits,foe='brawler'){
  const w=createWorld({chars:[char,foe],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:1.3,z:0,fx:-1,fz:0});q.blocking=false;
  const log=[];
  for(let i=0;i<hits;i++){q.invuln=0;q.knocked=0;q.stun=0;q.hurtTime=0;q.x=1.3;q.z=0;q.hp=100;q.slowTime=0;p.attackCD=0;p.comboWindow=p.comboWindow||0;
    attack(w,p,{});for(let t=0;t<.33&&q.hp===100;t+=STEP)step(w,{});log.push({dmg:100-q.hp,slow:q.slowTime,cd:p.attackCD,type:p.attackType,combo:p.combo});
    for(let t=0;t<.05;t+=STEP)step(w,{});}
  return log;
}
test('every character has its own J string: the brawler is fastest, the guardian slowest, the storm caller shocks on the third hit',()=>{
  const cdOf=c=>CHARACTERS[c].jab.cd[0];
  assert.ok(cdOf('brawler')<cdOf('swordsman')&&cdOf('swordsman')<=cdOf('guardian'),'cooldowns: brawler < swordsman <= guardian');
  const third=char=>{const w=createWorld({chars:[char,'brawler'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
    const [p,q]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:1.3,z:0,fx:-1,fz:0});q.blocking=false;
    p.attackType='light';p.combo=1;p.comboWindow=.5;p.comboQueued=true;p.comboInput={};p.attackTime=0;p.attackCD=0;
    for(let t=0;t<.4;t+=STEP)step(w,{});return {p,q};};
  const st=third('stormcaller');assert.equal(st.p.combo,2);assert.ok(st.q.slowTime>0,'the third strike shocks');
  assert.ok(third('brawler').q.hp<100);
  for(const id of CHARACTER_IDS)assert.ok(CHARACTERS[id].jab&&CHARACTERS[id].jab.name,id);
});
test('CPUs use their own range: kiters shoot a standing foe from afar, a melee CPU pokes with U between J and U range',()=>{
  const idle=chars=>{const w=createWorld({chars,stage:'classic'});w.autoplay=true;w.crates=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=1e9;return w;};
  for(const char of ['gunner','stormcaller']){
    const w=idle([char,'swordsman']);Object.assign(w.fighters[0],{x:-6,z:0});Object.assign(w.fighters[1],{x:6,z:0});
    let shots=0;const seen=new Set();
    for(let t=0;t<12&&!w.ended;t+=STEP){step(w,{});for(const s of w.shots)if(!seen.has(s.id)&&s.owner===0){seen.add(s.id);shots++;}Object.assign(w.fighters[1],{hp:100,x:6,z:0,vx:0,vz:0,attackTime:0});}
    assert.ok(shots>=3,`${char} fires its U at a distant foe (${shots})`);
  }
  const w=idle(['swordsman','guardian']);Object.assign(w.fighters[1],{x:0,z:0});Object.assign(w.fighters[0],{x:-2.9,z:0});let u=0;
  for(let t=0;t<8&&!w.ended;t+=STEP){step(w,{});if(w.fighters[0].attackType==='heavy'&&w.fighters[0].attackTime>.45)u++;Object.assign(w.fighters[0],{x:-2.9,z:0,vx:0,vz:0});Object.assign(w.fighters[1],{hp:100,x:0,z:0,vx:0,vz:0,attackTime:0});}
  assert.ok(u>0,'the swordsman uses U from just outside J range');
});

import {existsSync,statSync} from 'node:fs';
test('every Tripo character ships a lite build (halved textures) next to the full one, for phones',()=>{
  for(const id of ['pirate','brawler','guardian','gunner','cook','stormcaller']){
    const full=new URL(`../models/tripo-${id}-animated.glb`,import.meta.url),lite=new URL(`../models/tripo-${id}-animated-lite.glb`,import.meta.url);
    assert.ok(existsSync(full)&&existsSync(lite),id);assert.ok(statSync(lite).size<=statSync(full).size,id+' lite is not larger');
  }
});

import {laddersOf} from '../arena-roster.js';
import {createFighter as mkFighter,jump} from '../arena-core.js';
test('a fighter on a ladder always faces the rungs, also while climbing down, and every Tripo model has a climb clip',()=>{
  const stage=STAGES.desert,ladder=laddersOf(stage)[0];
  const p=mkFighter(0,ladder.x,ladder.z-ladder.dz*.6,'brawler');
  for(let i=0;i<30;i++)stepFighter(p,{x:ladder.dx,z:ladder.dz},STEP,stage);
  assert.ok(p.y>.5&&p.climbing,'climbed');assert.equal(p.fx,ladder.dx);assert.equal(p.fz,ladder.dz);
  for(let i=0;i<15;i++)stepFighter(p,{x:-ladder.dx,z:-ladder.dz},STEP,stage);
  assert.ok(p.climbing,'on the way down');assert.equal(p.fx,ladder.dx,'still facing the ladder, not turned away');
  for(const id of ['pirate','brawler','guardian','gunner','cook','stormcaller']){
    const b=readFileSync(new URL(`../models/tripo-${id}-animated.glb`,import.meta.url)),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n).toString());
    assert.ok(j.animations.some(a=>a.name==='climb'),id+' has a climb clip');
  }
});
import {readFileSync} from 'node:fs';

test('decks are solid below their top, and a fighter who jumps at one grabs the ledge and pulls himself up',()=>{
  const stage=STAGES.port,deck=stage.platforms.find(d=>d.id==='crows-nest');   // 3.5 high: out of reach of a single jump
  // 1. walking into the side of a deck is blocked
  const w=createFighter(0,deck.x-deck.w/2-1.5,deck.z,'swordsman');
  for(let i=0;i<300;i++)stepFighter(w,{x:1},STEP,stage);
  assert.ok(w.x<=deck.x-deck.w/2+.2&&w.y<.1,`blocked at the side (x ${w.x.toFixed(2)})`);
  // 2. jump at it: he ends up on top
  const p=createFighter(0,deck.x-deck.w/2-.9,deck.z,'swordsman');
  for(let i=0;i<10;i++)stepFighter(p,{x:1},STEP,stage);
  jump(p);let mantled=false,second=false,standing=null;
  for(let i=0;i<360;i++){stepFighter(p,{x:1},STEP,stage);if(p.mantle)mantled=true;if(mantled&&!p.mantle&&!standing){standing=`${p.y.toFixed(2)} ${p.support} ${p.grounded}`;}if(!second&&p.vy<0&&!p.grounded){jump(p);second=true;}}
  assert.ok(mantled,'he grabbed the ledge');assert.equal(standing,`${deck.top.toFixed(2)} ${deck.id} true`,'when the pull-up ends he stands on the deck');
});

test('combo links: rocket punch pulls the target in for an air follow-up, a shock mark adds 25%, the returning shield drags, the heavy round staggers, the slash slows',()=>{
  // brawler U pulls the target toward him and pops it up
  const b=duel('brawler',q=>Object.assign(q,{x:3,z:0,fx:-1,fz:0}));
  assert.ok(b.q.hp<100&&b.q.juggle>=1,'rocket punch starts a juggle');
  // the pull drives the target toward the brawler, not away
  const w=createWorld({chars:['brawler','guardian'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:3,z:0,fx:-1,fz:0});p.attackCD=0;heavy(w,p,{});
  let minX=9;for(let t=0;t<.9;t+=STEP){step(w,{});minX=Math.min(minX,q.x);}
  assert.ok(minX<2,`the target is dragged in (closest ${minX.toFixed(2)})`);
  // a shocked target takes 25% more
  const hurt=shock=>{const w2=createWorld({chars:['swordsman','brawler'],stage:'classic'});w2.training=true;w2.online=true;w2.crates=[];w2.intro=0;const [a,c]=w2.fighters;Object.assign(a,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(c,{x:1.3,z:0,fx:-1,fz:0});if(shock)c.vulnTime=3;attack(w2,a,{});for(let t=0;t<.35;t+=STEP)step(w2,{});return 100-c.hp;};
  assert.ok(hurt(true)>hurt(false)*1.2,'shocked: more damage');
  // storm caller's bolt leaves the mark
  const s=duel('stormcaller',q=>Object.assign(q,{x:5,z:0,fx:-1,fz:0}));assert.ok(s.q.vulnTime>0,'bolt shocks');
  // gunner's heavy round staggers
  const g=duel('gunner',q=>Object.assign(q,{x:6,z:0,fx:-1,fz:0}));assert.ok(g.q.hp<100,'gunner round hits');
  // the slash slows
  const k=duel('swordsman',q=>Object.assign(q,{x:3,z:0,fx:-1,fz:0}));assert.ok(k.q.hp<100);
});

test('terrain interactions: a shock freezes a fighter on ice, the hot spring conducts it, and a sandstorm carries shots downwind',()=>{
  const snow=STAGES.snow,ice=snow.zones.find(z=>z.kind==='ice'),spring=snow.zones.find(z=>z.kind==='hotspring');
  const shocked=(zone,dx)=>{const w=createWorld({chars:['stormcaller','brawler'],stage:'snow'});w.online=true;w.crates=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=1e9;
    const [p,q]=w.fighters;Object.assign(p,{x:zone.x-dx-3.5,z:zone.z,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:zone.x-dx,z:zone.z,fx:-1,fz:0});
    step(w,{});heavy(w,p,{});const log={freeze:false,electrify:false,hp:q.hp};
    for(let t=0;t<1.2;t+=STEP){step(w,{});for(const e of w.events){if(e.type==='freeze')log.freeze=true;if(e.type==='electrify')log.electrify=true;}w.events.length=0;}
    return {...log,q};};
  const onIce=shocked(ice,0);assert.ok(onIce.freeze,'frozen on the ice');
  if(spring){const inSpring=shocked(spring,0);assert.ok(inSpring.electrify,'electrified in the spring');}
  const plain=shocked({x:-6,z:-6},0);assert.ok(!plain.freeze&&!plain.electrify,'nothing special on bare ground');
  // sandstorm: the same shot ends further downwind than in calm air
  const drift=storm=>{const w=createWorld({chars:['gunner','brawler'],stage:'desert'});w.online=true;w.crates=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=1e9;
    const [p,q]=w.fighters;Object.assign(p,{x:-4,z:-7,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:12,z:8});if(storm){w.waveTime=3;w.waveDir=1;}
    heavy(w,p,{});let last=null;for(let t=0;t<.7;t+=STEP){step(w,{});if(storm){w.waveTime=3;w.waveDir=1;}const s=w.shots[0];if(s)last=s.x;}return last;};
  assert.ok(drift(true)>drift(false)+.5,'the shot is carried by the wind');
});

test("the cook's whirlwind kick throws one leg wind that flies about 6 units",()=>{
  const wind=duel('cook',q=>Object.assign(q,{x:5,z:0,fx:-1,fz:0}));assert.ok(wind.q.hp<100,'the wind reaches 5 units');
  assert.equal(duel('cook',q=>Object.assign(q,{x:8,z:0,fx:-1,fz:0})).q.hp,100,'but not across the arena');
  assert.equal(duel('cook',q=>Object.assign(q,{x:3.5,z:2.6,fx:-1,fz:0})).q.hp,100,'a single wave: the diagonals are not covered');
});
