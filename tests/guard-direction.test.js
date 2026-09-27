import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,attack,heavy} from '../arena-core.js';
function strike({rear=false,side=false,parry=false,strong=false,id=0}={}){
  const w=createWorld();w.training=true;w.online=true;w.crates=[];
  const p=w.fighters[id],q=w.fighters[1-id];
  Object.assign(p,{x:0,z:5});Object.assign(q,{x:1.7,z:5,fx:side?0:rear?1:-1,fz:side?1:0,guardPrev:!parry});
  if(parry)q.parryWindow=.5;
  w.remoteInput={guard:id===0};(strong?heavy:attack)(w,p);
  for(let i=0;i<38;i++)step(w,{guard:id===1});return {w,p,q};
}
test('both players take chip damage when facing a normal attack',()=>{
  for(const id of [0,1]){const {q,w}=strike({id});assert.equal(q.hp,98);assert.ok(w.events.some(e=>e.type==='guard'));}
});
test('side and rear melee bypass guard without extra damage',()=>{
  for(const options of [{rear:true},{side:true}]){const {q,w}=strike(options);assert.equal(q.hp,91);assert.ok(w.events.some(e=>e.type==='flank'));assert.ok(!w.events.some(e=>e.type==='guard'||e.type==='parry'));}
});
test('perfect guard cannot counter a rear attack',()=>{
  const front=strike({parry:true}),rear=strike({parry:true,rear:true});
  assert.equal(front.q.hp,100);assert.ok(front.w.events.some(e=>e.type==='parry'));
  assert.equal(rear.q.hp,91);assert.ok(!rear.w.events.some(e=>e.type==='parry'));
});
test('heavy rear hits are flank hits rather than a frontal guard break',()=>{
  const {w,q}=strike({rear:true,strong:true});assert.ok(q.hp<100);
  assert.ok(w.events.some(e=>e.type==='flank'));assert.ok(!w.events.some(e=>e.type==='guardBreak'));
});
