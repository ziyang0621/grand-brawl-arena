import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {headGeometry,facePlateGeometry,hairShellGeometry,lockGeometry,lock,eyeUpperContour,makeHead} from '../arena-face.js';

test('sculpted nose base leaves the expanded mouth clear',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({})})};
  try{
    for(const style of ['dot','line','broad','hook','button']){
      const group=new THREE.Group(),face=makeHead(group,{skin:'#e8bd8e',hair:'#282321'},{noseStyle:style});
      const nose=group.children.find(p=>p.userData.facialNose),positions=nose.geometry.attributes.position;
      assert.ok(nose);for(let i=0;i<positions.count;i++)assert.ok(positions.getY(i)>2.28-.151,'nose must not cross shout teeth');
      face.dispose();group.traverse(o=>o.geometry?.dispose());
    }
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('fighting eye tension changes the shared upper lid rather than leaving round surprised eyes',()=>{
  const calm=eyeUpperContour(100,70,-45,0,0),tense=eyeUpperContour(100,70,-45,0,1);
  assert.ok(tense[0][1]>calm[0][1],'inner corner lowers towards the nose');
  assert.ok(tense[1][1]>calm[1][1],'inner lid tightens');
  assert.ok(tense[3][1]<calm[3][1],'outer corner rises');
  assert.deepEqual(eyeUpperContour(100,70,-45,0,5),tense,'tension is bounded');
  assert.deepEqual(eyeUpperContour(100,70,-45,0,-1),calm,'sad brows do not invert the eye');
  for(const lid of [0,.25,.5,.75,1])for(const p of eyeUpperContour(100,70,-45,lid,1))assert.ok(p.every(Number.isFinite));
});

test('expression surface stays outside the head across cheek, eye and jaw transitions',()=>{
  for(const [jaw,shape] of [[.8,{square:.12}],[1,{square:.7,chin:1.08}],[.6,{square:1,chin:1.12,cheek:1.08}],[.7,{chin:.92,cheek:1.06}],[1.2,{chin:1.1}],[.95,{chin:1.02}]]){
    const head=new THREE.Mesh(headGeometry(.45,jaw,shape),new THREE.MeshBasicMaterial()),plate=facePlateGeometry(.45,jaw,shape),p=plate.attributes.position,index=plate.index;
    head.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(),point=new THREE.Vector3(),direction=new THREE.Vector3(),v=new THREE.Vector3();
    // Triangle interiors matter: different tessellation can intersect even when all vertices clear.
    for(let i=0;i<index.count;i+=9){
      point.set(0,0,0);for(let j=0;j<3;j++)point.add(v.fromBufferAttribute(p,index.getX(i+j)));point.multiplyScalar(1/3);
      direction.copy(point).normalize();ray.set(direction.clone().multiplyScalar(2),direction.clone().negate());
      const hit=ray.intersectObject(head,false)[0];assert.ok(hit,'ray reaches underlying head');
      assert.ok(point.length()-hit.point.length()>.001,`expression penetrates skull at ${point.toArray()} jaw=${jaw}`);
    }
    head.geometry.dispose();head.material.dispose();plate.dispose();
  }
});

test('hair cap leaves an open forehead instead of folding through the face',()=>{
  const radius=.48,g=hairShellGeometry(radius),p=g.attributes.position;
  let front=Infinity,back=Infinity;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    assert.ok(Math.abs(Math.hypot(x,y,z)-radius)<1e-6,'scalp stays on its surface');
    if(z>radius*.75&&Math.abs(x)<.01)front=Math.min(front,y);
    if(z<-radius*.75&&Math.abs(x)<.01)back=Math.min(back,y);
  }
  assert.ok(front>radius*.35,'front hem clears the forehead');
  assert.ok(back<-radius*.5,'back reaches the nape');g.dispose();
});

test('hair UV seam shares normals and locks use a single tapered outline',()=>{
  const points=[[0,.4,0],[.12,.35,.2],[.16,.1,.4]],g=lockGeometry(points,.12,0),n=g.attributes.normal;
  for(let row=0;row<=18;row++){
    const a=new THREE.Vector3().fromBufferAttribute(n,row*9),b=new THREE.Vector3().fromBufferAttribute(n,row*9+8);
    assert.ok(a.distanceTo(b)<1e-6,'no lighting seam along a strand');
  }
  const group=lock(new THREE.Group(),'#a7762e',points,.12),surface=group.children[0];
  assert.equal(surface.userData.noInk,true,'generic scaled outline must skip locks');
  assert.equal(surface.children.filter(c=>c.userData.ink).length,1);
  const shader={vertexShader:'#include <begin_vertex>'};surface.children[0].material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/smoothstep\(0\.0, 0\.22, strandT\)/,'outline fades at root');
  g.dispose();surface.geometry.dispose();
});

test('shaped scalp caps stay outside their character skulls at the temples and nape',()=>{
  const cases=[
    [.8,{square:.12},1.07,.08,1.15],
    [1,{square:.7,chin:1.08},1.07,.1,1.15],
    [.6,{square:1,chin:1.12,cheek:1.08},1.04,.08,1.15],
    [.7,{chin:.92,cheek:1.06},1.1,.08,1.15],
    [1.2,{chin:1.1},1.07,.09,.88],
    [.95,{chin:1.02},1.08,.08,.88],
  ];
  for(const [jaw,shape,scale,back,frontHem] of cases){
    const head=new THREE.Mesh(headGeometry(.45,jaw,shape),new THREE.MeshBasicMaterial());head.updateMatrixWorld(true);
    const cap=hairShellGeometry(.45*scale,{headShape:{jaw,shape},back,frontHem});cap.scale(1.02,1,1.04);cap.translate(0,.05,0);
    const positions=cap.attributes.position,indices=cap.index,point=new THREE.Vector3(),v=new THREE.Vector3(),ray=new THREE.Raycaster();
    for(let i=0;i<indices.count;i+=18){
      point.set(0,0,0);for(let j=0;j<3;j++)point.add(v.fromBufferAttribute(positions,indices.getX(i+j)));point.divideScalar(3);
      const direction=point.clone().normalize();ray.set(direction.clone().multiplyScalar(2),direction.clone().negate());
      const hit=ray.intersectObject(head,false)[0];assert.ok(hit);
      assert.ok(point.length()-hit.point.length()>.002,`scalp cuts through skull: jaw=${jaw}, point=${point.toArray()}`);
    }
    cap.dispose();head.geometry.dispose();head.material.dispose();
  }
});
