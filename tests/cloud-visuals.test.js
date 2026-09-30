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

test('each bottle hazard has its own animated ground effect, not just a ring',()=>{
  const kinds=['poison','virus','slow'],sigs=new Set();
  for(const kind of kinds){
    const root=createCloudVisual(kind),{parts,puddle}=root.userData;
    assert.ok(puddle,`${kind} puddle`);assert.ok(parts.length>=15,`${kind} particles`);
    sigs.add(parts.map(m=>m.userData.fx.t).sort().join());
    const before=parts.map(m=>m.position.toArray().join());
    updateCloudVisual(root,{x:0,y:0,z:0,radius:2.4,life:5},1);updateCloudVisual(root,{x:0,y:0,z:0,radius:2.4,life:5},1.6);
    const after=parts.map(m=>m.position.toArray().join());
    assert.ok(after.some((p,i)=>p!==before[i]),`${kind} particles move`);
  }
  assert.equal(sigs.size,3,'three different compositions');
});
test('cloud particles stay inside the damage radius and never write depth',()=>{
  for(const kind of ['poison','virus','slow']){
    const root=createCloudVisual(kind);
    for(const time of [.2,1,3.7]){updateCloudVisual(root,{x:0,y:0,z:0,radius:2.8,life:4},time);
      for(const m of root.userData.parts){if(m.userData.fx.t==='wisp')continue;assert.ok(Math.hypot(m.position.x,m.position.z)<=2.8+.01,`${kind}/${m.userData.fx.t}`);}}
    root.traverse(o=>{if(o.material)assert.equal(o.material.depthWrite,false);});
  }
});
