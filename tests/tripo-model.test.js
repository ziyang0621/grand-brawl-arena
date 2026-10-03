// Exercise the actual exported skin/animation data, without a browser or GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/addons/GLTFLoader.js';
import {instantiate} from '../arena-glb.js';
import {configureTripo} from '../arena-tripo.js';

const file=new URL('../models/tripo-pirate-animated.glb',import.meta.url);
async function model(){
  const input=fs.readFileSync(file),size=input.readUInt32LE(12);
  const json=JSON.parse(input.subarray(20,20+size));
  // Textures are irrelevant to skeleton tests; keep geometry and animation
  // bytes unchanged and remove only image loading from the in-memory copy.
  json.materials=json.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
  const tail=input.subarray(20+size),buffer=Buffer.alloc(20+padded.length+tail.length);
  input.copy(buffer,0,0,20);buffer.writeUInt32LE(buffer.length,8);buffer.writeUInt32LE(padded.length,12);padded.copy(buffer,20);tail.copy(buffer,20+padded.length);
  const parsed=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'',resolve,reject));
  const g=instantiate({scene:parsed.scene,clips:parsed.animations},{ink:0,preserveMaterials:true});configureTripo(g);
  const parent=new THREE.Group();parent.add(g.root);
  const bone=suffix=>Object.values(g.bones).find(b=>b.name.endsWith(suffix));
  const pose=(name,time)=>{g.mixer.stopAllAction();const a=g.actions[name];a.reset().play();a.paused=true;a.time=time;g.mixer.update(0);parent.updateMatrixWorld(true);g.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});};
  return {g,parent,bone,pose};
}

test('Tripo exported character faces the movement direction, including left/right',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,pose}=await model();pose('idle',0);
  for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
    parent.rotation.y=Math.atan2(x,z);parent.updateMatrixWorld(true);
    const forward=new THREE.Vector3(1,0,0).transformDirection(g.root.matrixWorld);
    assert.ok(forward.distanceTo(new THREE.Vector3(x,0,z))<1e-6);
  }
});

test('cutlass grip stays at the wrist and the blade swings with the attack',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,bone,pose}=await model(),wrist=bone('0_Right_Limb_2');
  const parts=[];g.root.getObjectByName('TripoCutlass').traverse(o=>{if(o.isSkinnedMesh)parts.push(o);});
  assert.ok(parts.length>=3,'blade, guard and grip must be exported');
  const grip=parts.find(o=>o.material.name==='TripoLeather'),blade=parts.find(o=>o.material.name==='TripoSteel');
  function vertex(mesh,i){return mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);}
  let reference,initialTip,maxMovement=0;
  for(const [clip,time] of [['idle',0],['attack_a',5/24],['attack_a',9/24],['attack_b',9/24],['heavy',9/24],['walk',.5]]){
    pose(clip,time);
    parent.rotation.y=.7;parent.updateMatrixWorld(true);parts.forEach(o=>o.skeleton.update());
    const local=wrist.worldToLocal(vertex(grip,0));
    if(reference)assert.ok(local.distanceTo(reference)<1e-5,'grip must never drift off the hand');else reference=local.clone();
    const center=new THREE.Vector3();for(let i=0;i<grip.geometry.attributes.position.count;i++)center.add(vertex(grip,i));center.divideScalar(grip.geometry.attributes.position.count);
    assert.ok(center.distanceTo(wrist.getWorldPosition(new THREE.Vector3()))<.3,'hilt must be inside the palm area');
    const tip=vertex(blade,0);if(!initialTip)initialTip=tip.clone();else maxMovement=Math.max(maxMovement,tip.distanceTo(initialTip));
  }
  assert.ok(maxMovement>.6,'sword must visibly move with attack poses');
});

test('walk has forward-bending knees, alternating foot lift and a seamless cycle',{skip:!fs.existsSync(file)},async()=>{
  const {g,bone,pose}=await model();
  const pos=s=>bone(s).getWorldPosition(new THREE.Vector3());
  const feet=[];
  for(const t of [0,.25,.5,.75,1]){
    pose('walk',t);
    const r=pos('1_Right_Limb_2'),l=pos('1_Left_Limb_2');feet.push([r,l]);
    for(const side of ['Right','Left']){
      const hip=pos('1_'+side+'_Limb_0'),knee=pos('1_'+side+'_Limb_1'),ankle=pos('1_'+side+'_Limb_2');
      const segment=ankle.clone().sub(hip),k=knee.clone().sub(hip),onLine=hip.clone().addScaledVector(segment,k.dot(segment)/segment.lengthSq());
      assert.ok(knee.z>=onLine.z-.015,'both knees bend toward game +Z');
    }
  }
  assert.ok(feet[0][0].distanceTo(feet[4][0])<1e-4,'loop boundary must not snap');
  assert.ok(feet[1][0].y<feet[1][1].y-.1,'left foot lifts during its swing');
  assert.ok(feet[3][0].y>feet[3][1].y+.1,'right foot lifts during its swing');
});
