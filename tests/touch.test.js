import test from 'node:test';
import assert from 'node:assert/strict';
import {stickToKeys,TOUCH_BUTTONS,isTouchDevice} from '../arena-touch.js';

test('stick inside dead zone gives no movement',()=>{
  assert.deepEqual(stickToKeys(3,-2,50),[]);
  assert.deepEqual(stickToKeys(10,0,0),[]);
});
test('stick maps to four cardinal directions',()=>{
  assert.deepEqual(stickToKeys(40,0,50),['KeyD']);
  assert.deepEqual(stickToKeys(-40,0,50),['KeyA']);
  assert.deepEqual(stickToKeys(0,40,50),['KeyS']);
  assert.deepEqual(stickToKeys(0,-40,50),['KeyW']);
});
test('stick maps to diagonals near 45 degrees',()=>{
  assert.deepEqual(stickToKeys(30,-30,50).sort(),['KeyD','KeyW']);
  assert.deepEqual(stickToKeys(-30,30,50).sort(),['KeyA','KeyS']);
});
test('touch buttons cover every keyboard action once',()=>{
  const codes=TOUCH_BUTTONS.map(b=>b.code);
  for(const c of ['Space','KeyJ','KeyU','KeyI','KeyK','KeyL','KeyR','ShiftLeft','KeyQ'])assert.ok(codes.includes(c),c);
  assert.equal(new Set(codes).size,codes.length);
  assert.deepEqual(TOUCH_BUTTONS.filter(b=>b.hold).map(b=>b.code).sort(),['KeyR','ShiftLeft']);
});
test('isTouchDevice honours ?touch and coarse pointers',()=>{
  assert.equal(isTouchDevice({location:{search:'?touch=1'}}),true);
  assert.equal(isTouchDevice({location:{search:''},matchMedia:()=>({matches:true})}),true);
  assert.equal(isTouchDevice({location:{search:''},matchMedia:()=>({matches:false})}),false);
});

import {createSprintDetector} from '../arena-touch.js';
test('tap then hold-and-push fires sprint once',()=>{
  const d=createSprintDetector();
  d.down(0);assert.equal(d.direction(false),false);d.up(100);
  d.down(250);assert.equal(d.direction(true),true);assert.equal(d.direction(true),false);d.up(900);
});
test('slow second press or a long first press does not sprint',()=>{
  let d=createSprintDetector();d.down(0);d.up(100);d.down(500);assert.equal(d.direction(true),false);
  d=createSprintDetector();d.down(0);d.up(400);d.down(450);assert.equal(d.direction(true),false);
});
test('a first press that already pushed a direction is not a tap',()=>{
  const d=createSprintDetector();d.down(0);d.direction(true);d.up(100);d.down(150);assert.equal(d.direction(true),false);
});

test('every touch button carries a plain-language caption and the item/aim captions update',()=>{
  for(const b of TOUCH_BUTTONS){assert.ok(b.hint&&b.hint.length>=2,b.code);assert.ok(b.label);}
  assert.equal(TOUCH_BUTTONS.some(b=>b.label==='弹'||b.label==='瞄'),false,'no cryptic single glyphs for item and aim');
  const aim=TOUCH_BUTTONS.find(b=>b.name==='aim');assert.equal(aim.label,'朝向');assert.ok(/辅助/.test(aim.hint));
});
