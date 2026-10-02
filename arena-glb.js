// Skinned, animated characters authored in Blender (see tools/blender/). Loaded as glTF, re-skinned with the game's
// cel-shading and given a skinned ink outline, then driven by an AnimationMixer.
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/addons/GLTFLoader.js';
import * as SkeletonUtils from './vendor/addons/SkeletonUtils.js';
import {mat} from './arena-gfx.js';

const loader=new GLTFLoader(),cache=new Map();
export function loadGlbModel(url){
  if(!cache.has(url))cache.set(url,new Promise((resolve,reject)=>loader.load(url,gltf=>resolve({scene:gltf.scene,clips:gltf.animations}),undefined,reject)));
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
  for(const m of outlines){const o=new THREE.SkinnedMesh(m.geometry,outlineMaterial(ink,inkColor));o.bind(m.skeleton,m.bindMatrix);o.frustumCulled=false;o.userData.ink=true;m.parent.add(o);}
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
    update(dt){mixer.update(dt);}};
}
