// Skinned, animated characters authored in Blender (see tools/blender/). Loaded as glTF, re-skinned with the game's
// cel-shading and given a skinned ink outline, then driven by an AnimationMixer.
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/addons/GLTFLoader.js';
import * as SkeletonUtils from './vendor/addons/SkeletonUtils.js';
import {mat} from './arena-gfx.js';

const loader=new GLTFLoader(),cache=new Map();
// Some hosts only serve web file types, so a base64 module (`<file>.js`, default export = base64 text) is the fallback for a .glb.
async function fetchBuffer(url){
  try{const r=await fetch(url);if(r.ok)return await r.arrayBuffer();}catch{}
  const mod=await import(new URL(url+'.js',import.meta.url).href),bin=atob(mod.default),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}
export function loadGlbModel(url){
  if(!cache.has(url))cache.set(url,fetchBuffer(url).then(buf=>new Promise((resolve,reject)=>loader.parse(buf,new URL('.',import.meta.url).href,gltf=>resolve({scene:gltf.scene,clips:gltf.animations}),reject))));
  return cache.get(url);
}
// Outline: the skinned mesh drawn again, back faces only, pushed out along its (skinned) normals.
const outlineMaterials=new Map();
function outlineMaterial(thickness,color){
  const key=thickness+color;
  if(!outlineMaterials.has(key)){
    const m=new THREE.MeshBasicMaterial({color,side:THREE.BackSide});
    m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>\n transformed += normalize(objectNormal) * ${thickness.toFixed(4)};`);};
    m.customProgramCacheKey=()=>'skin-ink'+thickness;
    outlineMaterials.set(key,m);
  }
  return outlineMaterials.get(key);
}
export function instantiate(model,{ink=.022,inkColor='#101216',hide=[]}={}){
  const root=SkeletonUtils.clone(model.scene),outlines=[];
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(hide.includes(o.name)){o.visible=false;return;}
    const c='#'+o.material.color.getHexString();
    o.material=mat(c);o.castShadow=o.receiveShadow=true;o.frustumCulled=false;
    if(o.isSkinnedMesh&&ink>0)outlines.push(o);
  });
  for(const m of outlines){
    const o=new THREE.SkinnedMesh(m.geometry,outlineMaterial(ink,inkColor));o.bind(m.skeleton,m.bindMatrix);o.frustumCulled=false;o.userData.ink=true;
    if(m.morphTargetInfluences){o.morphTargetInfluences=m.morphTargetInfluences;o.morphTargetDictionary=m.morphTargetDictionary;}   // the outline blinks and talks with the face
    m.parent.add(o);
  }
  const morphMeshes=[];root.traverse(o=>{if(o.isMesh&&!o.userData.ink&&o.morphTargetDictionary)morphMeshes.push(o);});
  const face={};   // smoothed expression state: key -> value

  const mixer=new THREE.AnimationMixer(root),actions={};
  for(const clip of model.clips)actions[clip.name]=mixer.clipAction(clip);
  let current=null;
  const bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  return {root,mixer,actions,bones,get current(){return current;},
    play(name,{fade=.15,loop=true,speed=1,restart=false}={}){
      const next=actions[name];if(!next||(next===current&&!restart))return next;
      next.reset();next.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,Infinity);next.clampWhenFinished=!loop;next.timeScale=speed;
      if(current&&current!==next){next.crossFadeFrom(current,fade,false);}
      next.play();current=next;return next;
    },
    // Pose-driven playback: the game decides which clip and what time (from its own state), the mixer only blends between them.
    set(name,time,{fade=.12}={}){
      const next=actions[name];if(!next)return;
      if(next!==current){next.reset();next.play();next.paused=true;if(current)next.crossFadeFrom(current,fade,false);current=next;}
      next.paused=true;next.time=Math.max(0,Math.min(time,next.getClip().duration));
    },
    // Expression keys: blink squint open shut wide angry sad up (0..1). Values ease towards their targets.
    setFace(target,dt){
      for(const key of ['blink','squint','open','shut','wide','angry','sad','up']){
        const goal=target[key]||0,cur=face[key]??0,k=1-Math.exp(-dt*(key==='blink'?40:16));face[key]=cur+(goal-cur)*k;
        for(const m of morphMeshes){const i=m.morphTargetDictionary[key];if(i!==undefined)m.morphTargetInfluences[i]=face[key];}
      }
    },
    update(dt){mixer.update(dt);}};
}

// Long axis of a mesh's rest-pose vertices (power iteration on the covariance), used to line weapon effects up with the blade / barrel / staff.
export function principalAxis(mesh){
  const pos=mesh.geometry.attributes.position,n=pos.count,c=new THREE.Vector3(),v=new THREE.Vector3();
  for(let i=0;i<n;i++)c.add(v.fromBufferAttribute(pos,i));c.multiplyScalar(1/n);
  let axis=new THREE.Vector3(.3,.5,.8).normalize();
  for(let it=0;it<8;it++){const next=new THREE.Vector3();for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i).sub(c);next.addScaledVector(v,v.dot(axis));}axis=next.normalize();}
  let min=Infinity,max=-Infinity;for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i).sub(c);const t=v.dot(axis);min=Math.min(min,t);max=Math.max(max,t);}
  return {center:c,axis,min,max,length:max-min};
}
