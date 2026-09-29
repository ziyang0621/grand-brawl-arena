import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack,heavy,jump,sprint} from '../arena-core.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const duel=()=>{const w=createWorld();w.training=true;w.crates=[];return w;};

test('double-tap sprint is faster than walking and ends when input stops',()=>{
  const walk=duel(),run=duel();
  advance(walk,.5,{x:1});sprint(run.fighters[0]);advance(run,.5,{x:1});
  assert.ok(run.fighters[0].x-walk.fighters[0].x>1.2);assert.equal(run.fighters[0].running,true);
  advance(run,.1,{});assert.equal(run.fighters[0].running,false);
});
test('sprint cannot start in the air or while knocked down',()=>{
  const w=duel(),p=w.fighters[0];p.grounded=false;sprint(p);assert.ok(!p.running);
  p.grounded=true;p.knocked=.5;sprint(p);assert.ok(!p.running);
});
test('an upper launches the target high enough to chase in the air',()=>{
  const w=duel();const [p,q]=w.fighters;Object.assign(p,{x:0,z:3,fx:1,fz:0});Object.assign(q,{x:1.6,z:3});
  heavy(w,p,{z:-1});assert.equal(p.attackType,'upper');advance(w,.3);
  assert.ok(q.vy>6);assert.equal(q.juggle,1);assert.ok(w.events.some(e=>e.type==='launch'));
  let apex=0;for(let t=0;t<.6;t+=STEP){step(w,{});apex=Math.max(apex,q.y);}assert.ok(apex>2.4);
});
test('air hits keep a launched target floating and the third air hit spikes into a bounce',()=>{
  const w=duel();const [p,q]=w.fighters;
  Object.assign(q,{x:1.4,z:3,y:3,grounded:false,vy:0,knocked:.8,juggle:1});Object.assign(p,{x:0,z:3,y:3,grounded:false,vy:0,fx:1,fz:0});
  attack(w,p);advance(w,.14);assert.ok(q.vy>3,'first air hit pops target up');assert.equal(q.juggle,2);assert.ok(p.vy>0,'attacker hangs in the air');
  attack(w,p);advance(w,.42);attack(w,p);advance(w,.45);
  assert.ok(w.events.some(e=>e.type==='spike'));
  advance(w,1);assert.ok(w.events.some(e=>e.type==='groundBounce'));assert.equal(q.juggle,0);
});
test('juggles are capped so a target always falls out',()=>{
  const w=duel();const [p,q]=w.fighters;Object.assign(q,{x:1.4,z:3,y:3,grounded:false,vy:0,knocked:.8,juggle:5});Object.assign(p,{x:0,z:3,y:3,grounded:false,vy:0,fx:1,fz:0});
  attack(w,p);advance(w,.14);assert.ok(q.vy<5.2);assert.equal(q.juggle,5);
});
