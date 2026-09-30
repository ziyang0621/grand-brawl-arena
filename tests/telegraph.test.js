import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,CANNON_WARN,SNOWBALL_WARN,createWorld,step,bomb,predictBomb} from '../arena-core.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const quiet=stage=>{const w=createWorld({stage});w.crates=[];w.nextWaveTick=1e9;w.nextCannonTick=1e9;w.intro=0;return w;};

for(const [stage,kind,warn] of [['port','cannon',CANNON_WARN],['snow','snowball',SNOWBALL_WARN]]){
  test(`${kind}: the launcher announces the lane at least a second before firing`,()=>{
    const w=quiet(stage);w.training=false;w.nextCannonTick=w.tick+1;
    step(w,{});const warn1=w.events.find(e=>e.type==='hazardWarn');
    assert.ok(warn1,'warning event');assert.equal(warn1.kind,kind);assert.ok(Math.abs(warn1.z)<=7.6);assert.ok(warn1.delay>=1.4);assert.equal(warn1.delay,warn);
    assert.equal(w.events.some(e=>e.type==='cannon'),false);
    const ball=w.cannonballs[0];assert.ok(Math.abs(ball.x)>=15,'starts outside the arena');
    const x0=ball.x;advance(w,warn-.1);assert.equal(ball.x,x0,'holds still while winding up');
    assert.equal(w.events.some(e=>e.type==='cannon'),false);
    advance(w,.2);assert.ok(w.events.some(e=>e.type==='cannon'&&e.kind===kind),'fires after the warning');
  });
  test(`${kind}: standing in the lane hurts, stepping aside during the warning does not`,()=>{
    for(const dodge of [false,true]){
      const w=quiet(stage);w.training=true;w.nextCannonTick=1e9;
      const id=w.nextCannon++,side=1,z=2,fire={x:15,y:kind==='cannon'?1.2:.75,z,side,kind};
      w.cannonballs.push({id,owner:-1,kind,x:15,y:fire.y,z,vx:-(kind==='cannon'?11:9),vy:kind==='cannon'?1.8:0,vz:0,life:3.6,delay:warn,fire});
      const p=w.fighters[0];Object.assign(p,{x:kind==='cannon'?8:0,z});w.fighters[1].x=-12;w.fighters[1].z=-7;
      for(let t=0;t<warn+2.6;t+=STEP){step(w,dodge&&t<warn?{z:-1}:{});}
      if(dodge)assert.equal(p.hp,100,'sidestepped in time');else assert.ok(p.hp<100,'hit when standing still');
    }
  });
}
test('a CPU steps out of a wound-up lane before the shot leaves',()=>{
  const w=quiet('port');w.training=false;const [p,q]=w.fighters;Object.assign(p,{x:-12,z:-7});Object.assign(q,{x:8,z:3});
  w.cannonballs.push({id:99,owner:-1,kind:'cannon',x:15,y:1.2,z:3,vx:-11,vy:1.8,vz:0,life:3,delay:CANNON_WARN,fire:{x:14,y:1.2,z:3,side:1,kind:'cannon'}});
  let left=false;for(let t=0;t<CANNON_WARN;t+=STEP){step(w,{});if(Math.abs(q.z-3)>1.5)left=true;}
  assert.ok(left,'left the lane during the warning');
  advance(w,2.5);assert.ok(q.hp>=95,`only chip damage at most, hp ${q.hp}`);
});
test('the predicted landing spot of a thrown bomb matches where it lands',()=>{
  for(const [x,z,fx,fz,y] of [[0,3,1,0,0],[-6,2,.7,.7,0],[5,-1,-1,0,0],[0,-2.2,0,1,2.2]]){
    const w=createWorld({stage:'classic'});w.training=true;w.crates=[];const p=w.fighters[0];Object.assign(p,{x,z,fx,fz,y,item:'bomb',grounded:true,support:y?'deck-center':'ground'});
    bomb(w,p);const b=w.bombs[0],guess=predictBomb(w,b);
    let last=null;for(let i=0;i<400&&w.bombs.length;i++){last={x:w.bombs[0]?.x,z:w.bombs[0]?.z};step(w,{});}
    assert.ok(last&&Math.hypot(guess.x-last.x,guess.z-last.z)<.5,`guess ${guess.x.toFixed(2)},${guess.z.toFixed(2)} vs ${last?.x?.toFixed(2)},${last?.z?.toFixed(2)}`);
    assert.ok(guess.time>0.2&&guess.time<3);
  }
});
