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
  for(const id of CHARACTER_IDS){const h=CHARACTERS[id].heavy;assert.ok(h&&h.name&&h.reach>0&&h.damage>0,id);names.add(h.name);}
  assert.equal(names.size,CHARACTER_IDS.length);
});
test('Red Sail thrusts further than a normal swing but only in front of him',()=>{
  const far=duel('swordsman',q=>Object.assign(q,{x:3.3,z:0,fx:-1,fz:0}));
  assert.ok(far.q.hp<100,'thrust reaches 3.3 ahead');
  const behind=duel('swordsman',q=>Object.assign(q,{x:-1.2,z:0,fx:1,fz:0}));
  assert.equal(behind.q.hp,100,'thrust does not hit behind');
  const side=duel('swordsman',q=>Object.assign(q,{x:0,z:2.4,fx:0,fz:-1}));
  assert.equal(side.q.hp,100,'thrust is a narrow cone');
});
test("the cook's whirlwind kick hits all around him, Red Sail's thrust does not",()=>{
  const spin=duel('cook',q=>Object.assign(q,{x:-1.6,z:0,fx:1,fz:0}));
  assert.ok(spin.q.hp<100,'whirlwind catches an enemy behind');
});
test("the brawler's uppercut launches the target for a juggle",()=>{
  const r=duel('brawler',q=>Object.assign(q,{x:2,z:0,fx:-1,fz:0}));
  assert.ok(r.q.hp<100);assert.equal(r.q.juggle,1,'target is in the juggle state');
});
