import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack} from '../arena-core.js';
import {STAGE_IDS,CHARACTER_IDS} from '../arena-roster.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const four=(extra={})=>createWorld({chars:CHARACTER_IDS.slice(0,4),roundTime:120,...extra});

test('four chars create a free-for-all with separate corners facing the middle',()=>{
  const w=four();
  assert.equal(w.brawl,true);assert.equal(w.fighters.length,4);
  assert.equal(new Set(w.fighters.map(p=>`${p.x},${p.z}`)).size,4);
  for(const p of w.fighters)assert.ok(p.x<0?p.fx>0:p.fx<0);
  assert.equal(createWorld().brawl,false);
});
test('spawn points stay off quicksand on every stage',()=>{
  for(const stage of STAGE_IDS){const w=four({stage});w.training=true;advance(w,.2);
    if(stage==='desert')for(const p of w.fighters)assert.notEqual(p.terrain,'quicksand',`${p.id} on ${stage}`);}
});
test('a knocked-out fighter stays down while the others keep fighting',()=>{
  const w=four();w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  w.fighters[3].hp=0;advance(w,.3);
  assert.equal(w.ended,false);
  assert.equal(w.fighters[3].eliminated,true);
  assert.equal(w.events.filter(e=>e.type==='eliminated').length,1);
  const {x,z}=w.fighters[3];advance(w,2);
  assert.ok(Math.hypot(w.fighters[3].x-x,w.fighters[3].z-z)<1.5);
  assert.equal(w.fighters[3].hp,0);
});
test('eliminated fighters cannot be hit and do not block targets',()=>{
  const w=four();w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  const [a,b,c,d]=w.fighters;Object.assign(c,{hp:0});Object.assign(a,{x:0,z:3,fx:1,fz:0});Object.assign(b,{x:9,z:-5});Object.assign(c,{x:1.2,z:3});Object.assign(d,{x:-9,z:-5});
  advance(w,.1);attack(w,a,{});advance(w,.4);
  assert.equal(c.hp,0);
});
test('last fighter standing ends the match with their id',()=>{
  const w=four();w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  for(const i of [0,1,3])w.fighters[i].hp=0;
  advance(w,.5);
  assert.equal(w.ended,true);assert.equal(w.winner,2);
});
test('time up crowns the healthiest survivor and a tie is a draw',()=>{
  let w=four();w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  w.fighters.forEach((p,i)=>{p.hp=[40,90,70,0][i];});w.time=.05;advance(w,.5);
  assert.equal(w.ended,true);assert.equal(w.winner,1);
  w=four();w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  w.fighters.forEach((p,i)=>{p.hp=[80,80,30,0][i];});w.time=.05;advance(w,.5);
  assert.equal(w.ended,true);assert.equal(w.winner,null);
});
test('overlapping fighters are pushed apart pairwise',()=>{
  const w=four();w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  Object.assign(w.fighters[0],{x:0,z:3});Object.assign(w.fighters[1],{x:.2,z:3});Object.assign(w.fighters[2],{x:-.2,z:3.1});Object.assign(w.fighters[3],{x:12,z:-6});
  w.training=true;advance(w,.5);
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(Math.hypot(w.fighters[i].x-w.fighters[j].x,w.fighters[i].z-w.fighters[j].z)>.6);
});
test('three CPUs and an idle player finish a brawl on every stage without NaN or escapes',()=>{
  for(const stage of STAGE_IDS){
    const w=four({stage,roundTime:60});
    // Keep the human slot busy: it wanders so the CPUs have something to chase.
    let t=0;while(!w.ended&&t<80){step(w,{x:Math.sin(t),z:Math.cos(t*.7)});t+=STEP;}
    assert.ok(w.ended,`${stage} did not end`);
    for(const p of w.fighters){assert.ok(Number.isFinite(p.x+p.y+p.z+p.hp),`${stage} NaN`);assert.ok(Math.abs(p.x)<=27&&p.z<=19&&p.z>=-8.6&&p.y>-8,`${stage} fighter far outside the arena`);}
    assert.ok(w.winner===null||w.fighters[w.winner].hp>0);
  }
});

test('a brawl records the final standing: winner first, later eliminations ahead of earlier ones',()=>{
  const w=four();w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;
  w.fighters[3].hp=0;advance(w,.3);w.fighters[0].hp=0;advance(w,.3);w.fighters[1].hp=0;advance(w,.5);
  assert.equal(w.ended,true);assert.equal(w.winner,2);
  assert.deepEqual(w.ranking,[2,1,0,3]);
  assert.deepEqual(w.events.find(e=>e.type==='end').ranking,[2,1,0,3]);
});
test('team standings list the winning team first',()=>{
  const w=createWorld({chars:CHARACTER_IDS.slice(0,4),teams:[0,1,0,1],roundTime:120});w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;
  w.fighters[1].hp=0;advance(w,.3);w.fighters[3].hp=0;advance(w,.5);w.fighters[2].hp=50;
  assert.equal(w.ended,true);assert.equal(w.winnerTeam,0);
  assert.ok(new Set(w.ranking.slice(0,2)).has(0)&&new Set(w.ranking.slice(0,2)).has(2));
  assert.deepEqual(w.ranking.slice(2),[3,1]);
});
