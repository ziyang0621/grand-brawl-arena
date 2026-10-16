import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step,skill,STEP,CINEMA_TIME} from '../arena-core.js';

const duel=(char,stage='classic')=>{const w=createWorld({chars:[char,'brawler'],stage});w.training=true;w.online=true;w.remoteInput={x:0,z:0};w.crates=[];w.intro=0;const [p,q]=w.fighters;Object.assign(p,{x:0,z:2,fx:1,fz:0,energy:3,aimAssist:false});Object.assign(q,{x:1.6,z:2,fx:-1,fz:0});return {w,p,q};};
test('a special that connects freezes the fight for its cinematic, then the target takes a little more and is launched',()=>{
  for(const level of [1,3]){
    const {w,p,q}=duel('swordsman');skill(w,p,level);
    let started=null;for(let t=0;t<2&&!started;t+=STEP){step(w,{});started=w.events.find(e=>e.type==='cinemaStart');w.events.length=0;}
    assert.ok(started&&w.cinema,`level ${level}: the cinematic started`);assert.equal(started.kind,'whirlwind');
    const hp=q.hp,x=q.x,time=w.time;for(let t=0;t<CINEMA_TIME[level]-.1;t+=STEP)step(w,{});
    assert.ok(w.cinema,'still playing');assert.equal(q.hp,hp,'nothing happens meanwhile');assert.equal(q.x,x);assert.equal(w.time,time,'the round clock stops');
    let ended=null;for(let t=0;t<.3&&!ended;t+=STEP){step(w,{});ended=w.events.find(e=>e.type==='cinemaEnd');w.events.length=0;}
    assert.ok(ended&&!w.cinema,'it ended');assert.equal(q.hp,hp-level*3,'bonus damage');assert.ok(q.knocked>0&&!q.grounded,'launched');
  }
});
test('a special that misses (or is guarded) plays no cinematic; CPU-only simulations skip it',()=>{
  const {w,p,q}=duel('guardian');q.x=12;skill(w,p,1);for(let t=0;t<2;t+=STEP)step(w,{});assert.equal(w.cinema??null,null,'missed: no cinematic');
  const s=duel('brawler');s.w.autoplay=true;s.w.training=false;skill(s.w,s.p,2);let seen=false;for(let t=0;t<2;t+=STEP){step(s.w,{});if(s.w.cinema)seen=true;}assert.ok(!seen,'autoplay skips cinematics');
});
