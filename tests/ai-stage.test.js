import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step} from '../arena-core.js';
import {STAGES,VENT_PERIOD,VENT_WARN} from '../arena-roster.js';
const advance=(w,s)=>{for(let t=0;t<s;t+=STEP)step(w,{});};
const world=(stage,chars)=>{const w=createWorld({stage,...(chars?{chars}:{})});w.nextCannonTick=w.nextWaveTick=1e9;w.intro=0;w.crates=w.crates.filter(c=>c.kind==='keg');return w;};

test('a hurt CPU walks to the hot spring and stays there to heal while the rival is away',()=>{
  const w=world('snow'),p=w.fighters[1],q=w.fighters[0],z=STAGES.snow.zones.find(z=>z.kind==='hotspring');
  Object.assign(p,{x:6,z:2,hp:30});Object.assign(q,{x:-12,z:6});q.hp=100;
  advance(w,4.5);
  assert.ok(Math.hypot(p.x-z.x,p.z-z.z)<z.r,`reached the spring: ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  assert.ok(p.hp>35,'healing');
});
test('a healthy CPU does not detour to the hot spring',()=>{
  const w=world('snow'),p=w.fighters[1],q=w.fighters[0],z=STAGES.snow.zones.find(z=>z.kind==='hotspring');
  Object.assign(p,{x:8,z:5,hp:100});Object.assign(q,{x:-6,z:5});advance(w,.5);
  assert.ok(Math.hypot(p.x-z.x,p.z-z.z)>4);
});
test('a CPU standing on a glowing vent steps off before it erupts',()=>{
  const w=world('desert'),v=STAGES.desert.vents[0],p=w.fighters[1];
  w.tick=Math.round((VENT_PERIOD-VENT_WARN+.1-v.offset)/STEP);
  Object.assign(p,{x:v.x,z:v.z});Object.assign(w.fighters[0],{x:-12,z:6});
  advance(w,VENT_WARN-.2);
  assert.ok(Math.hypot(p.x-v.x,p.z-v.z)>v.r+.3,'left the grate');
  advance(w,1.5);assert.equal(p.hp,100,'not burned');
});
test('a ranged CPU shoots a powder keg when the rival stands beside it, from outside the blast',()=>{
  const w=world('port',['swordsman','gunner']),keg=w.crates.find(c=>c.kind==='keg'),p=w.fighters[1],q=w.fighters[0];
  Object.assign(q,{x:keg.x-1.2,z:keg.z});Object.assign(p,{x:keg.x+6,z:keg.z});
  let ownDist=null;
  for(let t=0;t<3&&keg.hp>0;t+=STEP){step(w,{});q.x=keg.x-1.2;q.z=keg.z;if(keg.hp<=0)ownDist=Math.hypot(p.x-keg.x,p.z-keg.z);}
  assert.equal(keg.hp,0,'keg went off');assert.ok(w.events.some(e=>e.type==='explosion'&&e.kind==='keg'));
  assert.ok(ownDist>3.2,`shooter was clear of the blast: ${ownDist}`);
  advance(w,.2);assert.ok(q.hp<100,'the rival took the blast');
});
test('a melee CPU backs away from a keg rather than fighting beside it',()=>{
  const w=world('port'),keg=w.crates.find(c=>c.kind==='keg'),p=w.fighters[1];
  Object.assign(p,{x:keg.x+1,z:keg.z});Object.assign(w.fighters[0],{x:-12,z:-6});
  advance(w,1);assert.ok(Math.hypot(p.x-keg.x,p.z-keg.z)>2.2);assert.equal(keg.hp,1);
});
