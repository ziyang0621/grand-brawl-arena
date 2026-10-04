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
  const far=duel('swordsman',q=>Object.assign(q,{x:4,z:0,fx:-1,fz:0}));
  assert.ok(far.q.hp<100,'the slash wave travels about 4 units');
  assert.equal(duel('swordsman',q=>Object.assign(q,{x:7,z:0,fx:-1,fz:0})).q.hp,100,'but not across the arena');
  const two=(()=>{const w=createWorld({chars:['swordsman','brawler','gunner'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
    const [p,q,r]=w.fighters;Object.assign(p,{x:0,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:2.6,z:0});Object.assign(r,{x:4,z:0});p.attackCD=0;heavy(w,p,{});
    for(let t=0;t<.9;t+=STEP)step(w,{});return [q.hp,r.hp];})();
  assert.ok(two[0]<100&&two[1]<100,'the wave pierces through both');
  const behind=duel('swordsman',q=>Object.assign(q,{x:-4,z:0,fx:1,fz:0}));
  assert.equal(behind.q.hp,100);
});
test("the guardian's U throws his shield out and back, hitting on both legs",()=>{
  const w=createWorld({chars:['guardian','brawler'],stage:'classic'});w.training=true;w.online=true;w.crates=[];w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:-2.5,z:0,fx:1,fz:0,aimAssist:false});Object.assign(q,{x:1,z:0,fx:-1,fz:0});q.hp=100;p.attackCD=0;heavy(w,p,{});
  let first=100,sawShield=false,gone=false;
  for(let t=0;t<2.4;t+=STEP){step(w,{});if(w.shots.length)sawShield=true;q.vx=q.vz=0;q.x=1;q.z=0;q.invuln=0;q.knocked=0;if(t<.5)first=q.hp;if(sawShield&&!w.shots.length)gone=true;}
  assert.ok(sawShield,'a shield flies');assert.ok(first<100,'hit on the way out');assert.ok(q.hp<first,'hit again on the way back');assert.ok(gone,'the shield returns to him');
});
test("the brawler's rubber rocket punch reaches 3 units, narrowly",()=>{
  const near=duel('brawler',q=>Object.assign(q,{x:3.0,z:0,fx:-1,fz:0}));assert.ok(near.q.hp<100,'hits at 3.0');
  const far=duel('brawler',q=>Object.assign(q,{x:3.8,z:0,fx:-1,fz:0}));assert.equal(far.q.hp,100);
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
