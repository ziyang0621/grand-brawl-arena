import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step} from '../arena-core.js';
function setup(){const w=createWorld();w.crates=[];w.nextCannonTick=1e8;w.nextWaveTick=1e8;Object.assign(w.fighters[0],{x:-10,z:5});Object.assign(w.fighters[1],{x:4,z:5});return w;}
test('AI pursues nearby useful loot instead of only chasing the player',()=>{
  const w=setup(),p=w.fighters[1];w.pickups=[{type:'bomb',x:7,z:5,life:10}];step(w,{});assert.ok(p.vx>0);
  for(let i=0;i<90;i++)step(w,{});assert.equal(p.item,'bomb');
});
test('AI does not chase meat at full health, but seeks it when hurt',()=>{
  for(const hp of [100,30]){const w=setup(),p=w.fighters[1];p.hp=hp;w.pickups=[{type:'meat',x:7,z:5,life:10}];step(w,{});assert.equal(p.vx>0,hp===30);}
});
test('AI opens a nearby crate while the opponent is distant',()=>{
  const w=setup(),p=w.fighters[1];w.crates=[{id:4,kind:'barrel',x:6,z:5,y:0,hp:1,heldBy:null,falling:false}];
  for(let i=0;i<150;i++)step(w,{});assert.equal(w.crates[0].hp,0);assert.ok(p.item||w.events.some(e=>e.type==='throw'));
});
test('AI equips a collected sword and uses heavy attacks against guard',()=>{
  const w=setup(),p=w.fighters[1],q=w.fighters[0];p.item='sword';step(w,{});assert.equal(p.weapon,'sword');assert.equal(p.item,null);
  Object.assign(q,{x:2,z:5});w.tick=219;step(w,{guard:true});assert.equal(p.attackType,'heavy');
});
test('training and remote players do not make autonomous loot decisions',()=>{
  for(const mode of ['training','online']){const w=setup(),p=w.fighters[1];w[mode]=true;p.item='sword';w.pickups=[{type:'beer',x:7,z:5,life:10}];step(w,{});assert.equal(p.vx,0);assert.equal(p.item,'sword');assert.equal(p.weapon,null);}
});
test('AI reacts after a delay and leaves poison, infection and ice rather than chasing loot inside',()=>{
  for(const kind of ['poison','virus','slow']){
    const w=setup(),p=w.fighters[1];w.pickups=[{type:'bomb',x:2,z:5,life:10}];
    w.clouds=[{id:0,kind,x:3,z:5,y:0,radius:2.2,life:5,tick:.7}];
    step(w,{});assert.ok(p.vx<0,'initial reaction is not instantaneous');
    for(let i=0;i<100;i++)step(w,{});
    assert.ok(Math.hypot(p.x-3,p.z-5)>2.2,'leaves the hazard');
  }
});
test('AI escapes an imminent bomb without gaining free invulnerability',()=>{
  const w=setup(),p=w.fighters[1];
  w.bombs=[{id:0,kind:'bomb',owner:1,x:2,y:2,z:5,vx:0,vy:2,vz:0,life:.64}];
  for(let i=0;i<30;i++)step(w,{});
  assert.ok(p.vx>0);assert.equal(p.hp,100);assert.equal(p.invuln,0);assert.equal(p.dodgeTime,0);
});
test('AI chooses a useful escape along a boundary rather than running into the rail',()=>{
  const w=setup(),p=w.fighters[1];p.x=14.4;
  w.clouds=[{id:0,kind:'poison',x:13.7,z:5,y:0,radius:2.2,life:5,tick:.7}];
  for(let i=0;i<120;i++)step(w,{});
  assert.ok(Math.hypot(p.x-13.7,p.z-5)>2.2);assert.ok(Math.abs(p.x)<=14.5);
});
test('danger avoidance remains disabled for practice and network players',()=>{
  for(const mode of ['training','online']){const w=setup(),p=w.fighters[1];w[mode]=true;
    w.clouds=[{id:0,kind:'slow',x:4,z:5,y:0,radius:2,life:5,tick:5}];
    for(let i=0;i<40;i++)step(w,{});assert.equal(p.x,4);assert.equal(p.z,5);
  }
});
