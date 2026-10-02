import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {poseCombat,poseStance,attackPhase,attackDuration} from '../arena-posing.js';
import {articulateWaist} from '../arena-models.js';
import {skinnedLimb} from '../arena-tailoring.js';
import {CHARACTER_IDS} from '../arena-roster.js';
function rig(){
  const arms=[-1,1].map(side=>{const a=new THREE.Group();a.position.set(side*.5,2.2,0);a.userData.elbow=new THREE.Group();a.userData.elbow.position.y=-.5;a.add(a.userData.elbow);return a;});
  const legs=[-1,1].map(side=>{const a=new THREE.Group();a.position.set(side*.185,1.28,0);a.userData.knee=new THREE.Group();a.userData.knee.position.y=-.57;a.add(a.userData.knee);return a;});
  return {arms,legs};
}
const state=(char,extra={})=>({char,combo:1,attackType:'light',attackTime:0,skillTime:0,blocking:false,grabbedTarget:null,carrying:null,...extra});
test('waist articulation preserves the skinned bind pose and keeps feet outside the shoulder pivot',()=>{
  const m=rig(),body=new THREE.Group();body.position.set(3,1,-2);body.rotation.y=.4;
  body.add(...m.arms,...m.legs);
  const arm=m.arms[0],joint=arm.userData.elbow;
  const skin=skinnedLimb(arm,joint,[[.1,.1,.1],[-.5,.1,.1],[-1,.08,.08]],'#ab5636','sleeve');
  const sample=()=>{body.updateMatrixWorld(true);skin.skeleton.update();return skin.getVertexPosition(25,new THREE.Vector3()).applyMatrix4(skin.matrixWorld);};
  const before=sample(),foot=m.legs[0].getWorldPosition(new THREE.Vector3());
  const upper=articulateWaist(body,m);assert.ok(sample().distanceTo(before)<1e-6);
  assert.equal(arm.parent,upper);assert.equal(m.legs[0].parent,body);
  upper.rotation.y=.3;
  assert.ok(sample().distanceTo(before)>.1,'arm follows waist');
  assert.ok(m.legs[0].getWorldPosition(new THREE.Vector3()).distanceTo(foot)<1e-6,'pelvis does not twist');
});
test('shoulders wind up and unwind through contact while head counter-turns and pose resets',()=>{
  for(const char of ['swordsman','brawler','cook']){
    const m=rig();m.upper=new THREE.Group();m.head=new THREE.Group();
    const p=state(char,{attackTime:.34}),contact=attackPhase(p).contact;
    p.attackTime=.34*(1-contact*.55);poseCombat(m,p);const wind=m.upper.rotation.y;
    p.attackTime=.34*(1-contact);poseCombat(m,p);const hit=m.upper.rotation.y;
    assert.ok(wind*hit<0,'shoulders reverse from preparation to contact');
    assert.ok(m.head.rotation.y*hit<0,'look remains towards opponent');
    poseCombat(m,state(char));assert.equal(m.upper.rotation.y,0);assert.equal(m.head.rotation.y,0);
  }
});
test('ready stances have distinct silhouettes and do not translate hip or shoulder attachments',()=>{
  const poses=new Set();
  for(const char of CHARACTER_IDS){
    const m=rig(),before=[...m.arms,...m.legs].map(p=>p.position.toArray());poseStance(m,char);
    assert.deepEqual([...m.arms,...m.legs].map(p=>p.position.toArray()),before);
    poses.add(m.arms.map(p=>p.rotation.toArray().slice(0,3).join(',')).join('|'));
    assert.ok(m.legs[0].rotation.z<-.07&&m.legs[1].rotation.z>.07);
    assert.ok(m.arms.every(p=>p.userData.elbow.rotation.x<0));
  }
  assert.equal(poses.size,6);
});
test('guardian shield remains forward-facing as the elbow bends',()=>{
  for(const extra of [{},{blocking:true},{attackType:'shieldBash',attackTime:.29}]){
    const m=rig();m.buckler=new THREE.Group();m.arms[0].userData.elbow.add(m.buckler);
    poseStance(m,'guardian');poseCombat(m,state('guardian',extra));m.arms[0].updateMatrixWorld(true);
    const normal=new THREE.Vector3(0,0,1).transformDirection(m.buckler.matrixWorld);
    assert.ok(normal.z>.95,'shield faces the opponent, not the sky');
  }
});
test('combat poses leave fighter state and shoulder attachments unchanged for the six characters',()=>{
  for(const char of CHARACTER_IDS)for(const type of ['light','heavy','upper','air','dash','rush','slam','grab','shot','shieldBash'])for(let n=0;n<21;n++){
    const m=rig(),p=state(char,{attackType:type,attackTime:attackDuration(type)*(1-n/21)}),before=structuredClone(p);
    poseCombat(m,p,n);assert.deepEqual(p,before);
    for(const [j,a] of m.arms.entries()){
      assert.deepEqual(a.position.toArray(),[j?.5:-.5,2.2,0],'shoulder cannot slide out of the shirt');
      assert.ok(a.userData.elbow.rotation.x<=0,'elbows must not bend backwards');
    }
    for(const part of [...m.arms,...m.legs])assert.ok(part.rotation.toArray().slice(0,3).every(Number.isFinite));
  }
});
test('punch unfolds its elbow at contact instead of translating the whole arm',()=>{
  const m=rig(),p=state('brawler',{attackTime:.34}),contact=attackPhase(p).contact;
  p.attackTime=.34*(1-contact*.55);poseCombat(m,p);const chamber=m.arms[0].userData.elbow.rotation.x;
  p.attackTime=.34*(1-contact);poseCombat(m,p);const strike=m.arms[0].userData.elbow.rotation.x;
  assert.ok(chamber<-1.3);assert.ok(strike>-.15);assert.equal(m.arms[0].position.z,0);
  p.attackTime=.34*.1;poseCombat(m,p);assert.ok(m.arms[0].userData.elbow.rotation.x<strike-.8);
});
test('kick chambers the knee then extends it while the other leg supports the pose',()=>{
  const m=rig(),p=state('cook',{attackTime:.34}),contact=attackPhase(p).contact;
  p.attackTime=.34*(1-contact*.55);poseCombat(m,p);assert.ok(m.legs[0].userData.knee.rotation.x>1.2);
  p.attackTime=.34*(1-contact);poseCombat(m,p);assert.ok(m.legs[0].userData.knee.rotation.x<.1);
  assert.ok(m.legs[0].rotation.x<-1.5);assert.ok(m.legs[1].userData.knee.rotation.x>0);
});
test('blocking and carrying retain articulated elbows instead of rigid sticks',()=>{
  for(const char of CHARACTER_IDS){
    const m=rig();poseCombat(m,state(char,{blocking:true}));
    assert.ok(m.arms.every(a=>a.userData.elbow.rotation.x<-.2));
    poseCombat(m,state(char,{carrying:{kind:'crate'}}));
    assert.ok(m.arms.every(a=>a.rotation.x<-2.5&&a.userData.elbow.rotation.x<-.2));
  }
});

test('gun barrel points forward during firing, not back into the face',()=>{
  for(let n=0;n<20;n++){
    const m=rig();m.weapon=new THREE.Group();m.arms[1].userData.elbow.add(m.weapon);
    poseCombat(m,state('gunner',{attackType:'shot',attackTime:.32*(1-n/20)}));
    m.arms[1].updateMatrixWorld(true);
    const direction=new THREE.Vector3(0,1,0).transformDirection(m.weapon.matrixWorld);
    assert.ok(direction.z>.9999);assert.ok(Math.abs(direction.y)<1e-5);
  }
});
