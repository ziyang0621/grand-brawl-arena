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
test('a melee CPU backs away from a keg rather than fighting beside it',()=>{
  const w=world('port'),keg=w.crates.find(c=>c.kind==='keg'),p=w.fighters[1];
  Object.assign(p,{x:keg.x+1,z:keg.z});Object.assign(w.fighters[0],{x:-12,z:-6});
  advance(w,1);assert.ok(Math.hypot(p.x-keg.x,p.z-keg.z)>2.2);assert.equal(keg.hp,1);
});
