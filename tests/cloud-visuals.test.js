import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudVisual,updateCloudVisual} from '../arena-clouds.js';
import {Box3} from '../vendor/three.module.js';

test('all bottle cloud boundaries match their damage radius at spawn and expiry',()=>{
  for(const [kind,radius] of [['poison',2.2],['virus',2.8],['slow',2.4]]){
    const root=createCloudVisual(kind);
    for(const life of [5,2,.1]){
      updateCloudVisual(root,{x:3,y:.2,z:4,kind,radius,life});root.updateMatrixWorld(true);
      const bounds=new Box3().setFromObject(root.userData.edge);
      assert.ok(Math.abs(bounds.max.x-(3+radius))<1e-6);
      assert.ok(Math.abs(bounds.min.z-(4-radius))<1e-6);
      assert.equal(root.scale.y,1);
    }
  }
});
test('expiry fades fog without hiding a still active boundary',()=>{
  const root=createCloudVisual('poison');updateCloudVisual(root,{x:0,y:0,z:0,radius:2.2,life:.01});
  assert.ok(root.userData.fog.material.opacity<.01);assert.ok(root.userData.edge.material.opacity>=.5);
  updateCloudVisual(root,{x:0,y:0,z:0,radius:2.2,life:0});assert.equal(root.userData.edge.material.opacity,0);
});
test('hazard colors remain distinct and translucent effects do not write depth',()=>{
  const roots=['poison','virus','slow'].map(createCloudVisual);
  assert.equal(new Set(roots.map(r=>r.userData.edge.material.color.getHex())).size,3);
  for(const root of roots){assert.equal(root.userData.fog.material.depthWrite,false);assert.equal(root.userData.edge.material.depthWrite,false);}
});
