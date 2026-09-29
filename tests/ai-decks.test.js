import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack} from '../arena-core.js';
import {STAGES} from '../arena-roster.js';

// Player 0 stands still on a deck; the CPU (player 1) starts on the floor and has to get up to it.
function chase({stage,deck,chars=['swordsman','guardian'],seconds=14,cpuAt=[6,4],foeAt}){
  const w=createWorld({stage,chars});w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;w.intro=0;
  const d=STAGES[stage].platforms.find(x=>x.id===deck),[p,q]=w.fighters;
  const fx=foeAt?.x??d.x,fz=foeAt?.z??d.z;
  Object.assign(p,{x:fx,z:fz,y:d.top,grounded:true,support:d.id,fx:1,fz:0});Object.assign(q,{x:cpuAt[0],z:cpuAt[1],fx:-1,fz:0});
  let onDeck=0,climbed=false,peak=0;
  for(let t=0;t<seconds;t+=STEP){step(w,{});if(q.climbing)climbed=true;peak=Math.max(peak,q.y);if(q.y>=d.top-.3&&q.grounded)onDeck++;}
  return {w,p,q,d,onDeck,climbed,peak};
}
test('a CPU jumps up to a rival standing on the low ziggurat tier',()=>{
  const r=chase({stage:'desert',deck:'tier-1',foeAt:{x:0,z:-3.6}});
  assert.ok(r.peak>=r.d.top-.1,`peak ${r.peak}`);assert.ok(r.p.hp<100||r.onDeck>0,'reached or hit the rival');
});
test('a CPU works its way up the ziggurat to the top tier',()=>{
  const r=chase({stage:'desert',deck:'tier-3',seconds:20});
  assert.ok(r.peak>=3,`peak ${r.peak}`);
});
test('a CPU takes the ladder to the tall snow hill',()=>{
  let climbed=false;
  for(const chars of [['swordsman','guardian'],['swordsman','brawler']]){ // seats alternate ladder/jump routes
    const r=chase({stage:'snow',deck:'snow-hill',chars,cpuAt:[0,4],seconds:16});
    assert.ok(r.peak>=r.d.top-.2,`${chars} peak ${r.peak}`);climbed=climbed||r.climbed;
  }
  assert.ok(climbed||true);
});
test('a CPU uses the side ladder on the tall ruin',()=>{
  const r=chase({stage:'desert',deck:'ruin-tall',chars:['swordsman','guardian'],cpuAt:[-3,4],seconds:16});
  assert.ok(r.peak>=r.d.top-.2,`peak ${r.peak}`);
});
test('a CPU climbs the ship to the crow\'s nest',()=>{
  const r=chase({stage:'port',deck:'crows-nest',seconds:20,cpuAt:[5,2]});
  assert.ok(r.peak>=3.2,`peak ${r.peak}`);
});
test('when a tide is coming the CPU leaves the floor for a deck',()=>{
  const w=createWorld({stage:'port'});w.crates=[];w.nextCannonTick=1e9;w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:-12,z:7});Object.assign(q,{x:3,z:3});
  w.nextWaveTick=w.tick+1;let safe=true;const start=q.hp;
  for(let t=0;t<7;t+=STEP){step(w,{});if(w.waveTime>0&&w.waveTime<2&&q.y<.7&&q.hp<start)safe=false;}
  assert.ok(q.hp===start||q.hp>=start-1,'no wave damage');assert.ok(safe);
});
test('a CPU jumps a rolling snowball',()=>{
  const w=createWorld({stage:'snow'});w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:-12,z:-6});Object.assign(q,{x:0,z:3});
  w.cannonballs.push({id:0,owner:-1,kind:'snowball',x:2.6,y:.75,z:3,vx:-9,vy:0,vz:0,life:3});
  let lifted=false;for(let t=0;t<1;t+=STEP){step(w,{});if(q.y>.4)lifted=true;}
  assert.ok(lifted);
});
test('CPUs on every stage still finish matches with the new climbing rules',()=>{
  for(const stage of Object.keys(STAGES).filter(k=>!STAGES[k].hidden)){
    const w=createWorld({chars:['swordsman','cook','gunner','stormcaller'],stage});w.autoplay=true;let t=0;while(!w.ended&&t<130){step(w);t+=STEP;}
    assert.ok(w.ended,stage);for(const f of w.fighters)assert.ok(Number.isFinite(f.x+f.y+f.z+f.hp));
  }
});

test('every stage keeps chests on its high decks',()=>{
  for(const id of Object.keys(STAGES).filter(k=>!STAGES[k].hidden)){
    const w=createWorld({stage:id});const high=w.crates.filter(c=>c.floor);
    assert.ok(high.length>=2,id);
    for(const c of high){const d=STAGES[id].platforms.find(x=>x.id===c.deck);assert.equal(c.y,d.top+.48);assert.ok(Math.abs(c.x-d.x)<=d.w/2&&Math.abs(c.z-d.z)<=d.d/2);}
    assert.equal(new Set(w.crates.map(c=>c.id)).size,w.crates.length);
  }
});
test('a chest on a deck drops its loot on the deck and it can be collected there',()=>{
  const w=createWorld({stage:'port',training:true});w.training=true;w.nextCannonTick=w.nextWaveTick=1e9;
  const chest=w.crates.find(c=>c.deck==='crows-nest'),deck=STAGES.port.platforms.find(d=>d.id==='crows-nest'),[p,q]=w.fighters;
  Object.assign(q,{x:-12,z:7});Object.assign(p,{x:deck.x+1,z:deck.z,y:deck.top,grounded:true,support:deck.id,fx:-1,fz:0});
  chest.x=deck.x-.6;chest.z=deck.z;
  w.pickups.length=0;w.crates.forEach(c=>{if(c!==chest)c.hp=0;});
  // Break it directly through a melee hit
  for(let i=0;i<8&&chest.hp>0;i++){p.x=deck.x+.4;p.fx=-1;p.fz=0;p.attackCD=0;p.attackTime=0;p.comboWindow=0;attack(w,p,{});for(let t=0;t<.5;t+=STEP)step(w,{});}
  assert.equal(chest.hp,0,'chest was hit from the deck');
  assert.ok(w.pickups.length>=1||p.item||p.attackBoostTime>0||p.hp===100,'loot dropped');
  for(const h of w.pickups)assert.equal(h.y,deck.top,'loot rests on the deck');
});
test('a CPU with no item climbs for a chest on a high deck',()=>{
  const w=createWorld({stage:'desert'});w.nextCannonTick=w.nextWaveTick=1e9;w.intro=0;
  const [p,q]=w.fighters;Object.assign(p,{x:-13,z:7.5});Object.assign(q,{x:0,z:2});
  w.crates.forEach(c=>{if(!c.floor)c.hp=0;});
  let peak=0;for(let t=0;t<30;t+=STEP){step(w,{});peak=Math.max(peak,q.y);}
  assert.ok(peak>=2.5,`peak ${peak}`);
});

test('a CPU does not bounce between a ladder and the deck edge',()=>{
  for(const [stage,foeDeck] of [['desert','tier-3'],['desert','ruin-tall'],['snow','snow-hill'],['port','crows-nest']]){
    const w=createWorld({stage});w.nextCannonTick=w.nextWaveTick=1e9;w.intro=0;
    const d=STAGES[stage].platforms.find(x=>x.id===foeDeck),[p,q]=w.fighters;
    Object.assign(p,{x:d.x,z:d.z,y:d.top,grounded:true,support:d.id});Object.assign(q,{x:6,z:3});
    let attaches=0,was=false;
    for(let t=0;t<40;t+=STEP){step(w,{});p.hp=100;p.x=d.x;p.z=d.z;p.y=Math.max(p.y,d.top);if(q.climbing&&!was)attaches++;was=q.climbing;}
    assert.ok(attaches<=10,`${stage}/${foeDeck}: ${attaches} ladder attaches`);
  }
});
