import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,jump,attack,STEP} from '../arena-core.js';
function setup(id=0){const w=createWorld();w.training=true;w.online=true;w.remoteInput={};w.crates=[];const p=w.fighters[id];Object.assign(p,{x:10,z:5,y:.02,vy:-2,grounded:false,knocked:.7,stun:.2});return {w,p};}
test('both players can roll in the requested direction on landing',()=>{
  for(const id of [0,1]){const {w,p}=setup(id);jump(p,{z:-1});for(let i=0;i<4;i++)step(w,{});
    assert.equal(p.knocked,0);assert.ok(p.recoveryTime>0);assert.ok(p.vz<0);assert.equal(p.vx,0);
    assert.ok(w.events.some(e=>e.type==='recovery'&&e.id===id));assert.ok(p.invuln>0);
    attack(w,p);assert.equal(p.attackTime,0);assert.equal(p.jumpBuffer,0);
  }
});
test('early recovery input expires before a distant landing',()=>{
  const {w,p}=setup();p.y=5;jump(p,{x:1});for(let i=0;i<120;i++)step(w,{});
  assert.ok(!w.events.some(e=>e.type==='recovery'));
});
test('poison infection ice and being held prevent recovery',()=>{
  for(const status of ['poisonTime','virusTime','slowTime','grabbedBy']){const {w,p}=setup();p[status]=status==='grabbedBy'?1:2;jump(p,{x:1});step(w,{});assert.ok(!p.recoveryBuffer);assert.ok(!p.recoveryTime);}
});
test('standing or rising cannot buffer a landing recovery',()=>{
  for(const change of [{grounded:true},{vy:3}]){const {p}=setup();Object.assign(p,change);jump(p);assert.ok(!p.recoveryBuffer);}
});
test('snapshot preserves pending recovery and produces the same landing',()=>{
  const {w,p}=setup();jump(p,{x:1,z:1});const copy=JSON.parse(JSON.stringify(w));
  for(let i=0;i<5;i++){step(w,{},STEP);step(copy,{},STEP);}assert.deepEqual(copy,w);
});
test('a new explosion cancels recovery buffered for the previous fall',()=>{
  const {w,p}=setup();p.y=.7;jump(p,{x:1});
  w.bombs.push({id:99,owner:1,kind:'bomb',x:p.x,y:p.y+1,z:p.z,vx:0,vy:0,vz:0,life:0});
  step(w,{});assert.ok(p.hp<100);assert.equal(p.recoveryBuffer,0);assert.equal(p.recoveryDirection,null);
});
test('losing a life clears roll animation and dodge state immediately',()=>{
  const {w,p}=setup();w.stock=true;p.lives=3;p.hp=0;
  Object.assign(p,{recoveryTime:.2,recoveryBuffer:.1,recoveryDirection:{x:1,z:0},dodgeTime:.2});
  step(w,{});assert.equal(p.recoveryTime,0);assert.equal(p.recoveryBuffer,0);assert.equal(p.recoveryDirection,null);assert.equal(p.dodgeTime,0);
});
test('recovery ends without permanent invulnerability or input lock',()=>{
  const {w,p}=setup();jump(p,{x:-1});for(let i=0;i<60;i++)step(w,{});
  assert.equal(p.recoveryTime,0);assert.equal(p.dodgeTime,0);assert.equal(p.invuln,0);assert.equal(p.stun,0);
  const x=p.x;step(w,{x:1});assert.ok(p.x>x);attack(w,p);assert.ok(p.attackTime>0);
});
test('status applied after buffering invalidates the landing escape',()=>{
  for(const status of ['poisonTime','virusTime','slowTime']){const {w,p}=setup();jump(p,{x:1});p[status]=1;
    for(let i=0;i<4;i++)step(w,{});assert.ok(p.knocked>0);assert.ok(!w.events.some(e=>e.type==='recovery'));
  }
});
