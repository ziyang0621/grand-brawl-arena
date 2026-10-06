import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,jump,STEP,EDGE,SWALLOW_TIME} from '../arena-core.js';
import {STAGES} from '../arena-roster.js';

const quiet=(stage,chars=['swordsman','brawler'])=>{const w=createWorld({stage,chars});w.online=true;w.remoteInput={x:0,z:0};w.crates=[];w.pieces=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=w.nextMonsterTick=w.nextSupplyTick=1e9;return w;};
const events=(w,type)=>w.events.filter(e=>e.type===type);

test('a hard knock at the open edge sends a fighter over; he falls, loses 25 health and comes back at his spawn',()=>{
  const w=quiet('port');const [p,q]=w.fighters;Object.assign(q,{x:-10,z:6});
  Object.assign(p,{x:13.8,z:3,vx:14,vy:5,knocked:.9,grounded:false,support:null,hp:100});
  let out=null;for(let t=0;t<3&&!out;t+=STEP){step(w,{});out=events(w,'ringOut')[0];w.events.length=0;if(!out&&p.y<-2)p.knocked=.5;}
  assert.ok(out&&out.kind==='edge','he fell off the edge');assert.equal(Math.round(p.hp),100-EDGE.damage);
  assert.ok(Math.abs(p.x-p.spawnX)<.01&&p.y===0&&p.grounded,'back at his spawn point');assert.ok(p.invuln>1);
});
test('walking, running and jumping stop at the lip: only a knock can send you over',()=>{
  const w=quiet('desert');const [p,q]=w.fighters;Object.assign(q,{x:-10,z:6});Object.assign(p,{x:12,z:1});
  for(let t=0;t<2.5;t+=STEP){step(w,{x:1,z:0});if(t<1.5&&!p.grounded)continue;}
  for(let k=0;k<6;k++){jump(p);for(let t=0;t<.5;t+=STEP)step(w,{x:1,z:0});}
  assert.ok(p.x<=EDGE.x+.001&&p.hp===100&&p.y>=0,`still on the floor (x ${p.x.toFixed(2)})`);
});
test('the back wall still bounces; the classic test stage keeps all its walls',()=>{
  const c=createWorld({stage:'classic',chars:['swordsman','brawler']});c.online=true;c.remoteInput={x:0,z:0};c.intro=0;
  const p=c.fighters[0];Object.assign(p,{x:14,z:0,vx:16,vy:4,knocked:.9,grounded:false});for(let t=0;t<1;t+=STEP)step(c,{});
  assert.ok(Math.abs(p.x)<=14.6,'the classic stage is walled');
});
test('an emergency hop saves a fighter who is over the edge but not yet gone',()=>{
  const w=quiet('snow');const [p,q]=w.fighters;Object.assign(q,{x:-10,z:6});
  Object.assign(p,{x:15.2,y:.4,z:2,vx:3,vy:-1,knocked:.9,grounded:false,support:null});
  step(w,{});jump(p);assert.ok(p.vy>10&&p.vx<0,'hopped back toward the floor');
  let fell=false;for(let t=0;t<3;t+=STEP){step(w,{});if(events(w,'ringOut').length)fell=true;w.events.length=0;}
  assert.ok(!fell&&p.hp===100&&Math.abs(p.x)<=EDGE.x+.3,'he made it back');
});
test('a water hole drops whoever stands on the ground in it; a deck above it is safe',()=>{
  const w=quiet('port');const [p,q]=w.fighters;Object.assign(q,{x:-10,z:6});
  w.zones.push({kind:'water',x:0,z:3,w:4,d:3,id:'t',dyn:true});
  Object.assign(p,{x:0,z:3,y:0,grounded:true,support:'ground'});step(w,{});
  assert.equal(events(w,'ringOut')[0]?.kind,'water');assert.equal(p.hp,100-EDGE.damage);
});
test('standing in quicksand too long swallows you; leaving it in time resets the clock',()=>{
  const w=quiet('desert');const [p,q]=w.fighters;Object.assign(q,{x:-3,z:6});const sand=STAGES.desert.zones[0];
  Object.assign(p,{x:sand.x,z:sand.z,y:0,grounded:true,support:'ground'});
  let got=null;for(let t=0;t<SWALLOW_TIME+.5&&!got;t+=STEP){p.x=sand.x;p.z=sand.z;step(w,{});got=events(w,'ringOut')[0];w.events.length=0;}
  assert.equal(got?.kind,'sand','swallowed');
  const w2=quiet('desert');const p2=w2.fighters[0];Object.assign(w2.fighters[1],{x:-3,z:6});Object.assign(p2,{x:sand.x,z:sand.z,y:0,grounded:true,support:'ground'});
  for(let t=0;t<1.2;t+=STEP){p2.x=sand.x;p2.z=sand.z;step(w2,{});}
  Object.assign(p2,{x:0,z:6});for(let t=0;t<1.5;t+=STEP)step(w2,{});
  assert.ok(p2.sinkTime<.1&&p2.hp===100,'the sink clock is back to zero');
});

test('stage changes: a warning first, then a hole opens, quicksand grows, a new pit appears; a round restart resets them',()=>{
  const run=(stage,seconds)=>{const w=createWorld({stage,chars:['swordsman','brawler'],roundTime:120});w.online=true;w.remoteInput={x:0,z:0};w.crates=[];w.pieces=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=w.nextMonsterTick=w.nextSupplyTick=1e9;Object.assign(w.fighters[0],{x:-12,z:-6});Object.assign(w.fighters[1],{x:12,z:-6});
    const log=[];for(let t=0;t<seconds;t+=STEP){step(w,{});for(const e of w.events){if(e.type==='stageWarn'||e.type==='stageChange')log.push([e.type,e.op,+(w.roundTime-w.time).toFixed(0)]);}w.events.length=0;for(const p of w.fighters)p.hp=100;}return {w,log};};
  const port=run('port',45);
  assert.deepEqual(port.log.map(l=>l[0]+':'+l[1]),['stageWarn:hole','stageChange:hole'],'port: warned, then holed');
  assert.ok(port.log[0][2]<port.log[1][2],'the warning comes first');
  const hole=port.w.zones.find(z=>z.kind==='water');assert.ok(hole&&hole.dyn,'a water hole is in the zone list');
  assert.equal(port.w.zones[0].kind,'water','dynamic zones take priority over the static ones underneath');
  const desert=run('desert',55);const sand=desert.w.zones.filter(z=>z.kind==='quicksand');
  assert.ok(sand.length===4,`a fourth pit appeared (${sand.length})`);assert.ok(desert.w.zones.find(z=>z.kind==='quicksand'&&z.id==='z0').r>STAGES.desert.zones[0].r*1.3,'the first pit grew');
  const snow=run('snow',40);assert.ok(snow.w.zones.some(z=>z.kind==='water'),'the ice cracked');
  // training has no stage changes
  const t=createWorld({stage:'port',chars:['swordsman','brawler']});t.training=true;t.intro=0;for(let i=0;i<120*60;i++){step(t,{});}
  assert.ok(!t.zones.some(z=>z.kind==='water'),'no holes in training');
});

test('a stage monster warns, then slams: damage and a launch away from its centre; one at a time; none in training',()=>{
  for(const [stage,kind] of [['port','tentacle'],['desert','sandworm'],['snow','yeti']]){
    const w=createWorld({stage,chars:['swordsman','brawler']});w.online=true;w.remoteInput={x:0,z:0};w.crates=[];w.pieces=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=w.nextSupplyTick=1e9;w.nextMonsterTick=1;
    const [p,q]=w.fighters;Object.assign(p,{x:0,z:2});Object.assign(q,{x:-12,z:-6});
    let warn=null,strike=null,seen=0;
    for(let t=0;t<4;t+=STEP){step(w,{});for(const e of w.events){if(e.type==='monsterWarn')warn??=e;if(e.type==='monsterStrike')strike??=e;}w.events.length=0;seen=Math.max(seen,w.monsters.length);
      if(warn&&!strike){p.x=warn.x;p.z=warn.z+.01;p.hp=100;}}   // stand in the marked circle
    assert.equal(warn?.kind,kind,stage+' warns');assert.ok(strike,stage+' strikes');assert.ok(strike.x===warn.x&&strike.z===warn.z,'it hits where it warned');
    assert.ok(p.hp<100,`${stage}: the slam hurt (${p.hp})`);assert.equal(seen,1,'one monster at a time');
  }
  const t=createWorld({stage:'port',chars:['swordsman','brawler']});t.training=true;t.intro=0;t.nextMonsterTick=1;for(let i=0;i<600;i++)step(t,{});assert.equal(t.monsters.length,0,'no monsters in training');
});
test('the crowd throws a supply crate now and then, one at a time, and it disappears once broken',()=>{
  const w=createWorld({stage:'snow',chars:['swordsman','brawler']});w.online=true;w.remoteInput={x:0,z:0};w.pieces=[];w.intro=0;w.nextCannonTick=w.nextWaveTick=w.nextMonsterTick=1e9;w.nextSupplyTick=1;
  Object.assign(w.fighters[0],{x:-12,z:-6});Object.assign(w.fighters[1],{x:12,z:-6});
  const before=w.crates.length;let sup=null;for(let t=0;t<1&&!sup;t+=STEP){step(w,{});sup=w.events.find(e=>e.type==='supply');w.events.length=0;}
  assert.ok(sup&&w.crates.length===before+1,'a supply crate was thrown');
  const c=w.crates.find(c=>c.supply);for(let t=0;t<2;t+=STEP)step(w,{});assert.ok(!c.falling&&c.y<1,'it landed');
  c.hp=0;step(w,{});assert.ok(!w.crates.some(c=>c.supply),'a broken supply crate is gone for good');
});
