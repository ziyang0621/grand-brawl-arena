import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step} from '../arena-core.js';
import {CHARACTER_IDS,STAGE_IDS} from '../arena-roster.js';
// Crates and hazards use Math.random; a fixed seed keeps these simulations repeatable.
function seeded(fn,seed=12345){const real=Math.random;let s=seed;Math.random=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);try{return fn();}finally{Math.random=real;}}
const play=(chars,stage,limit=130)=>{const w=createWorld({chars,stage,roundTime:chars.length>2?120:99});w.autoplay=true;let t=0;while(!w.ended&&t<limit){step(w);t+=STEP;}return w;};

test('autoplay CPUs have no seat advantage in mirror matches',()=>seeded(()=>{
  let first=0,games=0;
  for(const id of CHARACTER_IDS)for(const stage of STAGE_IDS)for(let k=0;k<3;k++){const w=play([id,id],stage,110);games++;if(w.winner===0)first++;else if(w.winner===null)first+=.5;}
  assert.ok(first/games>.25&&first/games<.75,`seat 0 won ${first}/${games}`);
}));
test('two CPUs fight instead of hopping at each other forever',()=>seeded(()=>{
  const w=createWorld({chars:['swordsman','guardian'],stage:'port'});w.autoplay=true;w.crates=[];w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  let air=0,ticks=0;while(!w.ended&&ticks<120*40){step(w);ticks++;if(w.tick>240&&w.fighters.every(p=>!p.grounded&&p.knocked<=0&&p.stun<=0))air++;}
  assert.ok(air<ticks*.1,`both airborne for ${air}/${ticks} ticks`);
  assert.ok(w.fighters.some(p=>p.hp<100),'nobody landed a hit in 40 seconds');
}));
test('no character wins more than about half of the duels',()=>seeded(()=>{
  const wins=Object.fromEntries(CHARACTER_IDS.map(i=>[i,0])),games=Object.fromEntries(CHARACTER_IDS.map(i=>[i,0]));
  for(const a of CHARACTER_IDS)for(const b of CHARACTER_IDS){if(a>=b)continue;for(const stage of STAGE_IDS)for(let k=0;k<4;k++)for(const order of [[a,b],[b,a]]){
    const w=play(order,stage,110);games[a]++;games[b]++;if(w.winner!==null)wins[order[w.winner]]++;}}
  for(const id of CHARACTER_IDS){const rate=wins[id]/games[id];assert.ok(rate>.25&&rate<.7,`${id} wins ${(rate*100).toFixed(0)}%`);}
}));
test('no fighter dominates a four-way brawl',()=>seeded(()=>{
  const wins=Object.fromEntries(CHARACTER_IDS.map(i=>[i,0])),seen=Object.fromEntries(CHARACTER_IDS.map(i=>[i,0]));
  let games=0,s=1;const rand=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
  for(let n=0;n<108;n++){
    const pool=[...CHARACTER_IDS].sort(()=>rand()-.5).slice(0,4),w=play(pool,STAGE_IDS[n%3]);games++;
    pool.forEach(c=>seen[c]++);if(w.winner!==null)wins[pool[w.winner]]++;
  }
  for(const id of CHARACTER_IDS){const rate=wins[id]/seen[id];assert.ok(rate<.5&&rate>.05,`${id} wins ${wins[id]}/${seen[id]}`);}
}));
