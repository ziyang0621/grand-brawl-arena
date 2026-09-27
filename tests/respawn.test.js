import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,STEP} from '../arena-core.js';
function respawning(){const w=createWorld();w.training=true;w.online=true;w.stock=true;w.crates=[];const p=w.fighters[0];p.hp=0;p.lives=2;p.respawnTimer=STEP/2;return {w,p};}
test('respawn clears power from the previous life',()=>{
  const {w,p}=respawning();p.attackBoost=1.55;p.attackBoostTime=7;p.weapon='sword';step(w,{});
  assert.equal(p.hp,100);assert.equal(p.attackBoost,1);assert.equal(p.attackBoostTime,0);assert.equal(p.weapon,null);
});
test('fresh respawn is protected from every cloud type including its own',()=>{
  for(const kind of ['poison','virus','slow']){const {w,p}=respawning();w.clouds=[{id:0,owner:p.id,kind,x:p.spawnX,z:p.spawnZ,y:0,life:5,tick:0,radius:3}];
    step(w,{});assert.equal(p.hp,100);assert.equal(p.poisonTime,0);assert.equal(p.virusTime,0);assert.equal(p.slowTime,0);
    for(let i=0;i<100;i++)step(w,{});assert.equal(p.hp,100);assert.equal(p.slowTime,0);
    for(let i=0;i<180;i++)step(w,{});assert.ok(kind==='slow'?p.slowTime>0:p.hp<100,'danger returns after protection');
  }
});
test('expired cloud does not deal a last tick of damage',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];w.clouds=[{id:0,kind:'poison',x:p.x,z:p.z,y:0,radius:3,life:STEP/2,tick:0}];step(w,{});
  assert.equal(p.hp,100);assert.equal(w.clouds.length,0);
});
