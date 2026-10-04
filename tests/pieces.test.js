import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack,heavy,skill} from '../arena-core.js';
import {STAGES,STAGE_IDS} from '../arena-roster.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const quiet=(stage='port',chars)=>{const w=createWorld({stage,...(chars?{chars}:{})});w.training=true;w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;return w;};

test('every stage has set pieces clear of spawns, decks and terrain',()=>{
  for(const id of STAGE_IDS){
    const w=createWorld({stage:id});assert.ok(w.pieces.length>=2,id);
    for(const pc of w.pieces){
      for(const [x,z] of [[-3.4,2],[3.4,2],[-4.5,2.5],[4.5,2.5],[-4.5,-3],[4.5,-3]])assert.ok(Math.hypot(pc.x-x,pc.z-z)>pc.r+1,`${id} piece near spawn ${x},${z}`);
      for(const d of STAGES[id].platforms)assert.ok(Math.abs(pc.x-d.x)>d.w/2+pc.r||Math.abs(pc.z-d.z)>d.d/2+pc.r,`${id} piece inside ${d.id}`);
      assert.ok(Math.abs(pc.x)+pc.length*(pc.fall==='burst'?0:.2)<14.5);
    }
  }
});
test('a standing piece blocks walking',()=>{
  const w=quiet('port');const pc=w.pieces[0];Object.assign(w.fighters[0],{x:pc.x+3,z:pc.z});
  advance(w,1.5,{x:-1,z:0});
  assert.ok(Math.hypot(w.fighters[0].x-pc.x,w.fighters[0].z-pc.z)>=pc.r+.4);
});
test('melee hits wear a piece down and the last one topples it away from the attacker',()=>{
  const w=quiet('port');const pc=w.pieces[0],p=w.fighters[0];
  Object.assign(p,{x:pc.x+1.6,z:pc.z,fx:-1,fz:0});
  for(let i=0;i<12&&pc.state==='standing';i++){attack(w,p,{});advance(w,.6);p.fx=-1;p.fz=0;}
  assert.equal(pc.state==='standing',false);
  assert.ok(pc.dir.x<-.8,'falls away from the attacker');
  assert.ok(w.events.some(e=>e.type==='pieceHit'));assert.ok(w.events.some(e=>e.type==='pieceFall'));
});
test('a toppling mast crushes anyone in its path but not bystanders',()=>{
  const w=quiet('port');const pc=w.pieces[0],[a,b]=w.fighters;
  Object.assign(a,{x:pc.x+8,z:0});Object.assign(b,{x:pc.x+3,z:pc.z});
  Object.assign(pc,{state:'falling',fallT:0,dir:{x:1,z:0},owner:0});
  advance(w,1);
  assert.equal(pc.state,'down');assert.ok(w.events.some(e=>e.type==='hit'&&e.id===b.id),'in the path');assert.equal(w.events.some(e=>e.type==='hit'&&e.id===a.id),false);
  assert.ok(w.pickups.length>=1,'drops loot');assert.ok(w.events.some(e=>e.type==='pieceCrash'));
});
test('a broken piece stops blocking',()=>{
  const w=quiet('port');const pc=w.pieces[0];Object.assign(pc,{state:'down'});
  Object.assign(w.fighters[0],{x:pc.x+2,z:pc.z});advance(w,1,{x:-1,z:0});
  assert.ok(w.fighters[0].x<pc.x+.5);
});
test('ice columns burst in a ring and chill nearby fighters',()=>{
  const w=quiet('snow');const pc=w.pieces[0],q=w.fighters[1];
  Object.assign(q,{x:pc.x+1.5,z:pc.z});Object.assign(pc,{state:'falling',fallT:0,dir:{x:1,z:0},owner:0});advance(w,.6);
  assert.equal(pc.state,'down');assert.ok(w.events.some(e=>e.type==='hit'&&e.id===q.id),'burst damaged the fighter');assert.ok(q.slowTime>0);
});
test('shots, thrown containers, bombs and specials all damage pieces',()=>{
  let w=quiet('port',['gunner','guardian']);let pc=w.pieces[0];Object.assign(w.fighters[0],{x:pc.x+5,z:pc.z,fx:-1,fz:0});
  w.shots.push({id:w.nextShot++,owner:0,x:pc.x+3,y:1.2,z:pc.z,vx:-14,vz:0,fx:-1,fz:0,life:.6,boost:1,damage:6,style:'ball'});advance(w,.6);assert.ok(pc.hp<pc.maxHp,'shot');
  w=quiet('port');pc=w.pieces[0];w.bombs.push({id:0,owner:0,kind:'bomb',x:pc.x+1,y:.3,z:pc.z,vx:0,vy:-3,vz:0,life:.01});advance(w,.2);assert.ok(pc.hp<pc.maxHp,'bomb');
  w=quiet('port');pc=w.pieces[0];Object.assign(w.fighters[0],{x:pc.x+1.5,z:pc.z,energy:3});skill(w,w.fighters[0],1);advance(w,.8);assert.ok(pc.hp<pc.maxHp,'special');
});
test('a fighter smashed into a piece damages it and rebounds',()=>{
  const w=quiet('port');const pc=w.pieces[0],p=w.fighters[0];
  Object.assign(p,{x:pc.x+1.5,z:pc.z,knocked:1,vx:-12,vy:2,y:.2,grounded:false});advance(w,.3);
  assert.ok(pc.hp<pc.maxHp);assert.ok(p.x>pc.x);
});
test('pieces reset each round',()=>{
  const w=createWorld({stage:'port',bestOf:3,intro:0});w.crates=[];w.pieces[0].state='down';w.pieces[0].hp=0;
  w.fighters[1].hp=0;advance(w,.2);advance(w,3.2);
  assert.equal(w.roundNo,2);assert.equal(w.pieces[0].state,'standing');assert.equal(w.pieces[0].hp,w.pieces[0].maxHp);
});
test('CPUs keep away from a falling mast',()=>{
  const w=createWorld({stage:'port'});w.crates=[];w.nextCannonTick=w.nextWaveTick=1e9;const pc=w.pieces[0],p=w.fighters[1];
  Object.assign(w.fighters[0],{x:12,z:8});Object.assign(p,{x:pc.x+3,z:pc.z});Object.assign(pc,{state:'falling',fallT:0,dir:{x:1,z:0},owner:0});
  advance(w,.6);assert.ok(Math.abs(p.z-pc.z)>1||p.hp===100);
});
