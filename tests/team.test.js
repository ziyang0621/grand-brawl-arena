import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack,skill} from '../arena-core.js';
import {CHARACTER_IDS,STAGE_IDS} from '../arena-roster.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const duo=(extra={})=>{const w=createWorld({chars:CHARACTER_IDS,teams:[0,1,0,1],...extra});w.training=true;w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;return w;};

test('teams option builds a 2v2 with partners on the same side',()=>{
  const w=duo();assert.equal(w.teamMode,true);assert.deepEqual(w.fighters.map(p=>p.team),[0,1,0,1]);
  assert.ok(w.fighters[0].x<0&&w.fighters[2].x<0&&w.fighters[1].x>0&&w.fighters[3].x>0);
  assert.equal(createWorld({chars:CHARACTER_IDS}).teamMode,false);
});
test('teammates cannot hurt each other with melee, specials or bombs',()=>{
  const w=duo();const [a,,c]=w.fighters;
  Object.assign(a,{x:0,z:3,fx:1,fz:0,energy:3});Object.assign(c,{x:1.2,z:3});
  attack(w,a,{});advance(w,.5);assert.equal(c.hp,100);
  skill(w,a,1);advance(w,1);assert.equal(c.hp,100);
  w.bombs.push({id:0,owner:0,kind:'bomb',x:1.2,y:.3,z:3,vx:0,vy:-3,vz:0,life:.01});advance(w,.2);assert.equal(c.hp,100);
});
test('opponents still take damage from the same attacks',()=>{
  const w=duo();const [a,b]=w.fighters;
  Object.assign(a,{x:0,z:3,fx:1,fz:0});Object.assign(b,{x:1.2,z:3});attack(w,a,{});advance(w,.5);assert.ok(b.hp<100);
});
test('a shot passes through a teammate',()=>{
  const w=duo(['x'].length?{chars:['gunner','guardian','brawler','swordsman']}:{});const [a,,c]=w.fighters;
  Object.assign(a,{x:-6,z:3,fx:1,fz:0});Object.assign(c,{x:-3,z:3});attack(w,a,{x:1});advance(w,.7);assert.equal(c.hp,100);
});
test('the match ends when one whole team is down and names the winning team',()=>{
  const w=duo();w.fighters[1].hp=0;advance(w,.3);assert.equal(w.ended,false,'one opponent left');
  w.fighters[3].hp=0;advance(w,.5);
  assert.equal(w.ended,true);assert.equal(w.winnerTeam,0);assert.ok([0,2].includes(w.winner));
  assert.equal(w.events.find(e=>e.type==='end').team,0);
});
test('on time-up the team with more total health wins',()=>{
  const w=duo();w.training=false;w.fighters.forEach((p,i)=>{p.hp=[40,90,50,10][i];});w.time=.05;advance(w,.5);
  // team 0 = 40+50 = 90, team 1 = 90+10 = 100
  assert.equal(w.ended,true);assert.equal(w.winnerTeam,1);assert.equal(w.winner,1);
});
test('CPU partners never damage each other over a full match on every stage',()=>{
  for(const stage of STAGE_IDS){
    const w=duo({stage});w.training=false;w.autoplay=true;let t=0;
    while(!w.ended&&t<130){step(w);t+=STEP;w.events.length=0;
      // aggro records who last landed a hit on each fighter; it must never be a teammate.
      for(const p of w.fighters)if(p.aggro!==undefined)assert.notEqual(w.fighters[p.aggro].team,p.team,`${stage}: friendly hit`);}
    assert.ok(w.ended,stage);
  }
});
test('CPUs only pick opponents from the other team',()=>{
  const w=duo();w.training=false;w.autoplay=true;
  for(let i=0;i<120*20;i++){step(w);for(const p of w.fighters)if(p.aiFoe!==undefined)assert.notEqual(w.fighters[p.aiFoe].team,p.team);}
});
test('teams are fair: neither side wins much more often',()=>{
  const real=Math.random;let seed=99;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  try{
    let left=0,games=0;
    const rots=[0,1,2,3].map(r=>CHARACTER_IDS.map((_,i)=>CHARACTER_IDS[(i+r)%4]));
    for(const stage of STAGE_IDS)for(const order of rots)for(let k=0;k<3;k++){const w=createWorld({chars:order,teams:[0,1,0,1],stage,roundTime:120});w.autoplay=true;let t=0;while(!w.ended&&t<130){step(w);t+=STEP;}games++;if(w.winnerTeam===0)left++;else if(w.winnerTeam===undefined)left+=.5;}
    assert.ok(left/games>.3&&left/games<.7,`left team won ${left}/${games}`);
  }finally{Math.random=real;}
});
