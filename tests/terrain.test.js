import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,createFighter,stepFighter,step,jump,dodge} from '../arena-core.js';
import {STAGES,STAGE_IDS,zoneAt,laddersOf} from '../arena-roster.js';
const walk=(stage,x,z,seconds,input)=>{const p=createFighter(0,x,z);for(let t=0;t<seconds;t+=STEP)stepFighter(p,input,STEP,stage);return p;};
const quiet=stage=>{const w=createWorld({stage});w.training=true;w.crates=[];return w;};
// Hazards are off in training, so hazard tests use an idle remote opponent instead of the CPU.
const hazards=stage=>{const w=createWorld({stage});w.online=true;w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;return w;};

test('every stage has its own decks, terrain and hazard pair',()=>{
  const sig=id=>JSON.stringify([STAGES[id].platforms.map(p=>[p.x,p.z,p.top]),STAGES[id].zones.map(z=>z.kind),STAGES[id].waveKind,STAGES[id].cannonKind]);
  assert.equal(new Set(STAGE_IDS.map(sig)).size,3);
  for(const id of STAGE_IDS)for(const [x,z] of [[-3.4,2],[3.4,2]])assert.equal(zoneAt(STAGES[id],x,z),null,`${id} spawn is on normal ground`);
});
test('quicksand slows walking, pulls toward the middle and weakens jumps',()=>{
  const sand=STAGES.desert.zones[0],normal=walk(STAGES.port,sand.x-1.5,sand.z,.6,{x:1}),slow=walk(STAGES.desert,sand.x-1.5,sand.z,.6,{x:1});
  assert.ok(slow.x-(sand.x-1.5)<(normal.x-(sand.x-1.5))*.6);assert.equal(slow.terrain,'quicksand');
  const idle=walk(STAGES.desert,sand.x+1.5,sand.z,1,{});assert.ok(idle.x<sand.x+1.1,'dragged inward');assert.ok(idle.sink>0);
  const p=createFighter(0,sand.x,sand.z);stepFighter(p,{},STEP,STAGES.desert);jump(p);let apex=0;for(let i=0;i<120;i++){stepFighter(p,{},STEP,STAGES.desert);apex=Math.max(apex,p.y);}
  const q=createFighter(0,-3.4,2);stepFighter(q,{},STEP,STAGES.desert);jump(q);let normalApex=0;for(let i=0;i<120;i++){stepFighter(q,{},STEP,STAGES.desert);normalApex=Math.max(normalApex,q.y);}
  assert.ok(apex<normalApex*.5);
});
test('dodging out of quicksand covers less ground',()=>{
  const sand=STAGES.desert.zones[0],p=createFighter(0,sand.x,sand.z);stepFighter(p,{},STEP,STAGES.desert);dodge(p);assert.ok(Math.abs(p.vx)<8);
});
test('ice is faster and keeps sliding after the stick is released',()=>{
  const ice=STAGES.snow.zones[0],start=ice.x-2.9,run=[{x:1},{x:-1}];
  // Run back and forth across the patch long enough for the low ice grip to reach top speed.
  const shuttle=stage=>{const p=createFighter(0,start,ice.z);let top=0;for(let t=0;t<1.6;t+=STEP){stepFighter(p,p.x>ice.x+2.4?run[1]:p.x<ice.x-2.4?run[0]:{x:Math.sign(p.vx)||1},STEP,stage);top=Math.max(top,Math.abs(p.vx));}return top;};
  assert.ok(shuttle(STAGES.snow)>shuttle(STAGES.port)*1.15);
  const p=walk(STAGES.snow,start,ice.z,.4,{x:1}),stopAt=p.x;for(let t=0;t<.5;t+=STEP)stepFighter(p,{},STEP,STAGES.snow);
  const q=walk(STAGES.port,start,ice.z,.4,{x:1}),qStop=q.x;for(let t=0;t<.5;t+=STEP)stepFighter(q,{},STEP,STAGES.port);
  assert.ok(p.x-stopAt>1,'slides on ice');assert.ok(p.x-stopAt>(q.x-qStop)*2,'wood stops much sooner');
});
test('port springboard launches a fighter who walks onto it',()=>{
  const w=quiet('port'),p=w.fighters[0],net=STAGES.port.zones[0];Object.assign(p,{x:net.x+1.3,z:net.z});
  let apex=0;for(let t=0;t<1;t+=STEP){step(w,{x:-1});apex=Math.max(apex,p.y);}
  assert.ok(apex>4);assert.ok(w.events.some(e=>e.type==='spring'));
});
test('stage decks are solid: a fighter lands on the desert altar',()=>{
  const altar=STAGES.desert.platforms.find(p=>p.id==='altar'),ladder=laddersOf(STAGES.desert)[1];
  assert.equal(ladder.top,altar.top);
  const p=createFighter(0,altar.x,altar.z);p.y=altar.top+1;p.grounded=false;for(let i=0;i<120;i++)stepFighter(p,{},STEP,STAGES.desert);
  assert.equal(p.y,altar.top);assert.equal(p.support,'altar');
});
test('desert rockfall is marked first, then hits whoever stays under it',()=>{
  const w=hazards('desert');w.nextCannonTick=1;const q=w.fighters[0];Object.assign(w.fighters[1],{x:12,z:-7});
  step(w,{});const warn=w.events.find(e=>e.type==='rockWarn');assert.ok(warn);assert.equal(w.cannonballs[0].kind,'rock');
  const before=q.hp;for(let t=0;t<.9;t+=STEP)step(w,{});assert.equal(q.hp,before,'no damage during the warning');
  Object.assign(q,{x:w.cannonballs[0].x,z:w.cannonballs[0].z});for(let t=0;t<1.2;t+=STEP)step(w,{});
  assert.ok(q.hp<before);assert.ok(w.events.some(e=>e.type==='rockImpact'));
});
test('snowball rolls along the ground and chills on hit',()=>{
  const w=hazards('snow');w.nextCannonTick=1;w.fighters[1].x=12;w.fighters[1].z=-7;
  step(w,{});const ball=w.cannonballs[0];assert.equal(ball.kind,'snowball');Object.assign(w.fighters[0],{z:ball.z,x:0});Object.assign(w.fighters[1],{x:0,z:ball.z>0?-8:8});
  for(let t=0;t<2.5;t+=STEP)step(w,{});assert.ok(w.fighters[0].hp<100);assert.ok(w.fighters[0].slowTime>0||w.events.some(e=>e.type==='slow'));
});
test('sandstorm pushes even airborne fighters and deals no damage; avalanche hurts',()=>{
  const w=hazards('desert');w.nextWaveTick=1;const p=w.fighters[0];
  step(w,{});assert.equal(w.events.find(e=>e.type==='waveWarning').kind,'sandstorm');for(let t=0;t<2.05;t+=STEP)step(w,{});
  Object.assign(p,{y:2,grounded:false,vy:0});const x0=p.x;for(let t=0;t<.3;t+=STEP)step(w,{});
  assert.ok(Math.abs(p.x-x0)>.3);assert.equal(p.hp,100);
  const s=hazards('snow');s.nextWaveTick=1;for(let t=0;t<2.1;t+=STEP)step(s,{});
  assert.equal(s.fighters[0].hp,90);
});
test('CPU wades out of quicksand when the player is far away',()=>{
  const w=createWorld({stage:'desert'});w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;const sand=STAGES.desert.zones[1];
  Object.assign(w.fighters[0],{x:-12,z:-7});Object.assign(w.fighters[1],{x:sand.x+.4,z:sand.z});
  for(let t=0;t<3;t+=STEP)step(w,{});assert.equal(zoneAt(STAGES.desert,w.fighters[1].x,w.fighters[1].z)?.kind??null,null);
});
