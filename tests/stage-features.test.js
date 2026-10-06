import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack} from '../arena-core.js';
import {STAGES,STAGE_IDS,ventState,VENT_PERIOD,VENT_WARN,VENT_BURST,zoneAt} from '../arena-roster.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const live=(stage,chars)=>{const w=createWorld({stage,...(chars?{chars}:{})});w.nextCannonTick=w.nextWaveTick=1e9;w.intro=0;return w;};

test('vent clock: idle, then a warning window, then a burst, repeating every period',()=>{
  const v={offset:0};
  assert.equal(ventState(v,0).phase,'erupt');
  assert.equal(ventState(v,Math.round((VENT_BURST+.5)/STEP)).phase,'idle');
  assert.equal(ventState(v,Math.round((VENT_PERIOD-VENT_WARN/2)/STEP)).phase,'warn');
  assert.equal(ventState(v,Math.round(VENT_PERIOD/STEP)+1).phase,'erupt');
  assert.notEqual(ventState(v,0).cycle,ventState(v,Math.round(VENT_PERIOD/STEP)+5).cycle);
});
test('a vent burns whoever stands on it once per eruption, and warns first',()=>{
  const w=live('desert');const v=STAGES.desert.vents[0],p=w.fighters[0];
  w.tick=Math.round((VENT_PERIOD-VENT_WARN+.2-v.offset)/STEP);
  Object.assign(p,{x:v.x,z:v.z});w.fighters[1].x=-12;
  advance(w,1.0);
  assert.ok(w.events.some(e=>e.type==='ventWarn'),'telegraph event');assert.equal(p.hp,100,'no damage during the warning');
  advance(w,.5);p.x=v.x;p.z=v.z;
  advance(w,1.2);
  assert.equal(w.events.filter(e=>e.type==='ventBurst').length>=1,true);
  assert.ok(p.hp<100,'burned');
});
test('vents stay off in practice mode and standing clear is safe',()=>{
  const w=live('desert');w.training=true;const v=STAGES.desert.vents[0];Object.assign(w.fighters[0],{x:v.x,z:v.z});
  w.tick=Math.round((VENT_PERIOD-.1-v.offset)/STEP);advance(w,1.5);assert.equal(w.fighters[0].hp,100);
  const w2=live('desert');w2.online=true;Object.assign(w2.fighters[0],{x:0,z:6});Object.assign(w2.fighters[1],{x:-12,z:6});advance(w2,VENT_PERIOD*1.2);assert.equal(w2.fighters[0].hp,100);
});
test('every vent and the hot spring sit on open floor away from spawns and decks',()=>{
  for(const id of STAGE_IDS)for(const o of [...(STAGES[id].vents||[]),...STAGES[id].zones.filter(z=>z.kind==='hotspring')]){
    for(const [x,z] of [[-3.4,2],[3.4,2],[-4.5,2.5],[4.5,2.5]])assert.ok(Math.hypot(o.x-x,o.z-z)>(o.r||1)+.4,`${id} too close to spawn`);
    for(const d of STAGES[id].platforms)assert.ok(Math.abs(o.x-d.x)>d.w/2+(o.r||1)||Math.abs(o.z-d.z)>d.d/2+(o.r||1),`${id} overlaps ${d.id}`);
  }
});
test('the snow hot spring heals fighters and thaws the chill',()=>{
  const w=live('snow');const z=STAGES.snow.zones.find(z=>z.kind==='hotspring'),p=w.fighters[0];
  Object.assign(p,{x:z.x,z:z.z,hp:40,slowTime:3});w.fighters[1].x=-12;
  advance(w,2);assert.ok(p.hp>45&&p.hp<60,`healed gently: ${p.hp}`);assert.ok(p.slowTime<1.5);
  assert.equal(zoneAt(STAGES.snow,z.x,z.z).kind,'hotspring');
});
test('powder kegs explode when broken, hurt people nearby and set off their neighbours',()=>{
  const w=live('port');let kegs=w.crates.filter(c=>c.kind==='keg');assert.equal(kegs.length,1,'one keg on the floor (the stage is deliberately uncluttered)');
  w.crates.push({...kegs[0],id:99,home:{x:kegs[0].x+2,z:kegs[0].z},x:kegs[0].x+2});kegs=w.crates.filter(c=>c.kind==='keg');   // a second one, for the chain
  const [a,b]=kegs;b.x=a.x+2;b.z=a.z;
  w.crates.forEach(c=>{if(c.kind!=='keg')c.hp=0;});
  const p=w.fighters[0];Object.assign(p,{x:a.x-1,z:a.z,y:0,fx:1,fz:0});Object.assign(w.fighters[1],{x:-13,z:-6});
  attack(w,p,{});advance(w,.6);
  assert.equal(a.hp,0);assert.equal(b.hp,0,'chain reaction');
  assert.equal(w.events.filter(e=>e.type==='explosion'&&e.kind==='keg').length,2);
  assert.ok(p.hp<100,'the one who lit it is caught too');
  assert.equal(w.pickups.length,0,'kegs drop no loot');
});
test('kegs come back after a while and are not picked as loot by the CPU',()=>{
  const w=live('port');const keg=w.crates.find(c=>c.kind==='keg');keg.hp=0;keg.respawnTick=w.tick+10;
  advance(w,.5);assert.equal(keg.hp,1);assert.equal(keg.kind,'keg');assert.deepEqual({x:keg.x,z:keg.z},keg.home);
});
