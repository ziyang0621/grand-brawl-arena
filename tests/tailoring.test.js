import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {profileGeometry,skinnedLimb,syncCostume,freezeSkinnedGeometry,clothPanel,costumeMaterial,palmGeometry,skirtGeometry,bladeGeometry,SKIN_RAMP} from '../arena-tailoring.js';
import {skinMat} from '../arena-face.js';

test('beveled blades have closed tips, finite mapped faces and real sloping cutting edges',()=>{
  for(const args of [[.14,1.5,.055],[.2,.93,.07]]){
    const g=bladeGeometry(...args),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,edges=new Map();
    for(const a of [p,n,uv])assert.ok([...a.array].every(Number.isFinite));
    const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
    for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++){
      const a=key(i+j),b=key(i+(j+1)%3);assert.notEqual(a,b);
      const edge=[a,b].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
    }
    assert.ok([...edges.values()].every(v=>v===2),'single watertight blade, not overlapping box and cone');
    assert.ok([...Array(n.count).keys()].some(i=>Math.abs(n.getX(i))>.2&&Math.abs(n.getZ(i))>.2),'bevels have oblique normals');
    assert.ok(g.boundingBox.max.y>args[1]-.001&&g.boundingBox.max.y<args[1]+.05);
    for(let i=0;i<uv.count;i++)assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
    g.dispose();
  }
});

test('pleated skirt has finite lining UVs, outward folds and inward-facing lining',()=>{
  const g=skirtGeometry(),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(const a of [p,n,uv])assert.ok([...a.array].every(Number.isFinite));
  for(let i=0;i<uv.count;i++){assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1);assert.ok(uv.getY(i)>=0&&uv.getY(i)<=1);}
  const outer=4*41,inner=7*41;
  assert.ok(p.getZ(outer)>p.getZ(inner)+.02,'hem retains cloth thickness');
  assert.ok(n.getZ(outer)>0&&n.getZ(inner)<0,'lining has its own inward face');
  const peak=Math.hypot(p.getX(outer),p.getZ(outer)/.95),valley=Math.hypot(p.getX(outer+2),p.getZ(outer+2)/.95);
  assert.ok(peak-valley>.03,'folds change the silhouette, not only its texture');
  g.dispose();
});

test('painted cloth edge shading follows pattern boundaries without triangle seams',()=>{
  const panel=clothPanel(new THREE.Group(),'#c04a32',[[-.3,2,0],[.3,2,0],[.3,1,0],[-.3,1,0]]);
  const p=panel.geometry.attributes.position,c=panel.geometry.attributes.color,seen=new Map();
  assert.equal(c.count,p.count);assert.equal(panel.material.vertexColors,true);
  let edge=false,interior=false;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),shade=c.getX(i),key=[x,y].join(',');
    assert.ok(shade>=.819&&shade<=1);
    if(seen.has(key))assert.equal(shade,seen.get(key));seen.set(key,shade);
    if(Math.abs(x)>.299||Math.abs(y-1)<1e-5||Math.abs(y-2)<1e-5){assert.ok(shade<.83);edge=true;}
    if(Math.abs(x)<.2&&y>1.1&&y<1.9){assert.ok(shade>.99);interior=true;}
  }
  assert.ok(edge&&interior);panel.geometry.dispose();
  assert.notEqual(costumeMaterial('#c04a32','jacket').map,costumeMaterial('#c04a32','sleeve').map);
});

test('costume joints deform the continuous surface and follow translated parent poses',()=>{
  const root=new THREE.Group(),arm=new THREE.Group(),joint=new THREE.Group();
  root.position.set(4,2,-3);arm.position.set(.5,2.2,0);joint.position.y=-.5;root.add(arm);arm.add(joint);
  const rings=[[.1,.12,.12],[-.35,.1,.1],[-.5,.1,.1],[-.65,.1,.1],[-1,.08,.08]];
  const surface=skinnedLimb(arm,joint,rings,'#ac4b34','sleeve'),rig={arms:[arm],legs:[]};
  root.updateMatrixWorld(true);surface.skeleton.update();
  const end=68,rest=surface.getVertexPosition(end,new THREE.Vector3()).clone();
  assert.ok(Math.abs(rest.y+1)<1e-5,'bind pose must retain original local position');
  joint.rotation.x=-Math.PI/2;syncCostume(rig);root.updateMatrixWorld(true);surface.skeleton.update();
  const bent=surface.getVertexPosition(end,new THREE.Vector3());
  assert.ok(bent.z>.45,'forearm follows bent elbow');assert.ok(Math.abs(bent.y+.42)<1e-5);
  const top=surface.getVertexPosition(0,new THREE.Vector3());assert.ok(Math.abs(top.y-.1)<1e-5,'shoulder stays attached');
  const weights=surface.geometry.attributes.skinWeight;
  assert.ok(weights.getX(34)>0&&weights.getY(34)>0,'joint ring blends both bones');
  root.position.set(-5,7,3);root.rotation.y=1.2;root.updateMatrixWorld(true);surface.skeleton.update();
  assert.ok(surface.getVertexPosition(end,new THREE.Vector3()).distanceTo(bent)<1e-5,'world motion must not double-transform skin');
  const frozen=freezeSkinnedGeometry(surface),snapshot=new THREE.Vector3().fromBufferAttribute(frozen.attributes.position,end);
  assert.ok(snapshot.distanceTo(bent)<1e-5,'afterimage captures the deformed limb');
  joint.rotation.x=0;syncCostume(rig);root.updateMatrixWorld(true);surface.skeleton.update();
  assert.ok(new THREE.Vector3().fromBufferAttribute(frozen.attributes.position,end).distanceTo(snapshot)<1e-8,'afterimage stays frozen after the fighter moves');
  assert.equal(frozen.attributes.skinWeight,undefined);
});

test('shirt panels conform to a curved torso instead of cutting through its centre',()=>{
  const body=new THREE.Group();body.costumeProfile=[[2.3,.4,.3],[1.3,.3,.22]];
  const panel=clothPanel(body,'#ffffff',[[-.2,2.2,.12],[.2,2.2,.12],[.2,1.4,.12],[-.2,1.4,.12]]),p=panel.geometry.attributes.position;
  let centre=false;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=2.3-y,rx=.4-.1*k,rz=.3-.08*k;
    const surface=rz*Math.sqrt(1-(x/rx)**2);
    assert.ok(z>=surface+.0179,'fabric must sit outside the body');
    if(Math.abs(x)<.01&&y>1.6&&y<2)centre=true;
  }
  assert.ok(centre,'the panel has interior vertices, not only projected corners');
});

test('profile seam has matching positions and normals and normalized joint weights',()=>{
  const g=profileGeometry([[.1,.15,.12],[-.3,.12,.1],[-.5,.1,.1],[-.8,.08,.08]],{joint:-.5,fold:.03});
  for(const name of ['position','normal']){const a=g.attributes[name];for(let i=0;i<4;i++){const x=new THREE.Vector3().fromBufferAttribute(a,i*17),y=new THREE.Vector3().fromBufferAttribute(a,i*17+16);assert.ok(x.distanceTo(y)<1e-5,name+' seam');}}
  const w=g.attributes.skinWeight;for(let i=0;i<w.count;i++)assert.ok(Math.abs(w.getX(i)+w.getY(i)-1)<1e-6);
});

test('concave lapels preserve their notch and smooth coincident cloth vertices',()=>{
  const body=new THREE.Group();body.costumeProfile=[[3,.6,.4],[1,.45,.3]];
  const pattern=[[-.3,2.8,0],[.3,2.8,0],[.1,2.3,0],[.3,2.2,0],[-.3,1.5,0]];
  const panel=clothPanel(body,'#fff',pattern),p=panel.geometry.attributes.position,n=panel.geometry.attributes.normal;
  const seen=new Map();let area=0;
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');
    const normal=new THREE.Vector3().fromBufferAttribute(n,i);
    if(seen.has(key))assert.ok(normal.distanceTo(seen.get(key))<1e-5,'no triangle lighting seams');
    else seen.set(key,normal);
    if(i%3===0){const a=new THREE.Vector2(p.getX(i),p.getY(i)),b=new THREE.Vector2(p.getX(i+1),p.getY(i+1)),c=new THREE.Vector2(p.getX(i+2),p.getY(i+2));area+=Math.abs(b.sub(a).cross(c.sub(a)))/2;}
  }
  const expected=Math.abs(THREE.ShapeUtils.area(pattern.map(p=>new THREE.Vector2(p[0],p[1]))));
  assert.ok(Math.abs(area-expected)<1e-6,'triangles must cover the cut pattern without overlap');
});

test('cloth triangles respect chest and waist ridges before projection',()=>{
  const body=new THREE.Group();body.costumeProfile=[[2.42,.12,.09],[2.24,.44,.31],[2.14,.4,.28],[1.92,.376,.263],[1.7,.28,.196],[1.3,.3,.21]];
  const panel=clothPanel(body,'#fff',[[-.125,2.39,0],[.125,2.39,0],[.16,2.16,0],[0,1.87,0],[-.16,2.16,0]]),p=panel.geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){
    const ys=[p.getY(i),p.getY(i+1),p.getY(i+2)],lo=Math.min(...ys),hi=Math.max(...ys);
    for(const [y] of body.costumeProfile)assert.ok(!(lo<y-1e-6&&hi>y+1e-6),'a cloth triangle must not bridge across a torso ridge');
  }
  assert.equal(panel.material,costumeMaterial('#fff','panel'),'flat patterns must not reuse cylindrical sleeve creases');
});

test('capped profiles and shaped palms have no open geometric edges',()=>{
  const geometries=[profileGeometry([[-.676,.141,.237,.09],[-.715,.14,.235,.09]],{caps:true}),palmGeometry(1.14),skirtGeometry()];
  for(const g of geometries){
    const p=g.attributes.position,ids=g.index,edges=new Map();
    const vertex=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
    for(let i=0;i<ids.count;i+=3)for(let j=0;j<3;j++){
      const a=vertex(ids.getX(i+j)),b=vertex(ids.getX(i+(j+1)%3)),key=[a,b].sort().join('|');
      assert.notEqual(a,b,'no degenerate edges');edges.set(key,(edges.get(key)||0)+1);
    }
    for(const [edge,count] of edges)assert.equal(count,2,`closed surface edge ${edge}`);
    g.dispose();
  }
});

test('sole has a downward-facing closed base and capped weights remain normalized',()=>{
  const g=profileGeometry([[-.676,.141,.237,.09],[-.715,.14,.235,.09]],{caps:true,joint:-.7});
  const shoe=new THREE.Mesh(g,new THREE.MeshBasicMaterial());shoe.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,-2,.09),new THREE.Vector3(0,1,0)),hit=ray.intersectObject(shoe)[0];
  assert.ok(hit,'a lifted shoe must not be hollow');assert.ok(Math.abs(hit.point.y+.715)<1e-6);assert.ok(hit.face.normal.y<-.99);
  const w=g.attributes.skinWeight;assert.equal(w.count,g.attributes.position.count);
  for(let i=0;i<w.count;i++)assert.ok(Math.abs(w.getX(i)+w.getY(i)-1)<1e-6);
  g.dispose();shoe.material.dispose();
});

test('skin on head, hands and body shares the same shading ramp',()=>{
  for(const kind of ['skin','hand','anatomy'])assert.equal(costumeMaterial('#e7ba8e',kind).gradientMap,skinMat('#e7ba8e').gradientMap);
  assert.equal(skinMat('#e7ba8e').gradientMap,SKIN_RAMP);
  const g=palmGeometry();g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x>size.z*1.5,'palm must have a flatter front/back than a sphere');g.dispose();
});
