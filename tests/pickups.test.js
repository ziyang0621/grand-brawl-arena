import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,STEP} from '../arena-core.js';
function setup(type='meat'){
  const w=createWorld();w.training=true;w.online=true;w.crates=[];
  Object.assign(w.fighters[0],{x:10,z:5});Object.assign(w.fighters[1],{x:-10,z:5});
  w.pickups=[{type,x:10,z:5,y:0,life:10}];return w;
}
test('lethal damage cannot be undone by automatic meat pickup in the same tick',()=>{
  const w=setup();w.fighters[0].hp=2;
  w.clouds=[{id:0,kind:'poison',x:10,z:5,y:0,radius:2,life:2,tick:0}];
  step(w,{});assert.equal(w.fighters[0].hp,0);assert.equal(w.ended,true);assert.equal(w.pickups.length,1);
});
test('dead fighters cannot take a pickup during stock respawn',()=>{
  for(const type of ['meat','beer','bomb','sword']){const w=setup(type),p=w.fighters[0];w.stock=true;p.lives=3;p.hp=0;
    step(w,{});assert.equal(p.lives,2);assert.equal(w.pickups.length,1);
    for(let i=0;i<20;i++)step(w,{});assert.equal(w.pickups.length,1);assert.equal(p.item,null);assert.equal(p.hp,0);
  }
});
test('full health does not waste meat but still allows beer or inventory items',()=>{
  const w=setup();step(w,{});assert.equal(w.pickups.length,1);
  w.pickups.push({type:'beer',x:10,z:5,y:0,life:10});step(w,{});assert.ok(w.fighters[0].attackBoostTime>0);assert.equal(w.pickups.length,1);
  w.pickups.push({type:'bomb',x:10,z:5,y:0,life:10});step(w,{});assert.equal(w.fighters[0].item,'bomb');assert.equal(w.pickups.length,1);
});
test('the nearer eligible fighter wins contested loot, not always player zero',()=>{
  for(const nearId of [0,1]){const w=setup('bomb');Object.assign(w.fighters[nearId],{x:10.2,z:5});Object.assign(w.fighters[1-nearId],{x:8.8,z:5});step(w,{});
    assert.equal(w.fighters[nearId].item,'bomb');assert.equal(w.fighters[1-nearId].item,null);
  }
});
test('expired pickups cannot be collected on their expiry frame',()=>{
  const w=setup('bomb');w.pickups[0].life=STEP/2;step(w,{});assert.equal(w.fighters[0].item,null);assert.equal(w.pickups.length,0);
});

test('the power-up sword works like beer: instant effect, never occupies the item slot',()=>{
  const w=createWorld();w.crates=[];w.training=true;const p=w.fighters[0];Object.assign(p,{x:0,z:5});
  w.pickups=[{type:'sword',x:0.3,y:0,z:5,life:10}];step(w,{});
  assert.equal(p.weapon,'sword');assert.equal(p.attackBoost,1.35);assert.ok(p.attackBoostTime>9);assert.equal(p.item,null,'no item slot is used');
  assert.equal(w.pickups.length,0);assert.ok(w.events.some(e=>e.type==='ready'&&e.id===0));
  // ...so a bomb can be picked up straight afterwards, while the blade stays active.
  w.pickups=[{type:'bomb',x:0.3,y:0,z:5,life:10}];step(w,{});assert.equal(p.item,'bomb');assert.equal(p.weapon,'sword');
});
test('a fighter holding a bomb can still pick up the power-up sword',()=>{
  const w=createWorld();w.crates=[];w.training=true;const p=w.fighters[0];Object.assign(p,{x:0,z:5,item:'bomb'});
  w.pickups=[{type:'sword',x:0.3,y:0,z:5,life:10}];step(w,{});
  assert.equal(p.weapon,'sword');assert.equal(p.item,'bomb','the held bomb is untouched');
});
