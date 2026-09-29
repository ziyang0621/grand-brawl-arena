// Cel-shaded building blocks: hard-stepped toon ramp plus inverted-hull ink lines,
// the look PS2-era anime brawlers used for characters and stage props.
import * as THREE from './vendor/three.module.js';

const ramp=new THREE.DataTexture(new Uint8Array([70,150,255]),3,1,THREE.RedFormat);
ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.generateMipmaps=false;ramp.needsUpdate=true;
export const TOON_RAMP=ramp;
const materials=new Map();
export function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshToonMaterial({color,gradientMap:ramp}));return materials.get(color);}
export function isSharedMaterial(m){for(const v of materials.values())if(v===m)return true;return false;}
export function mesh(geometry,color,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export const box=(w,h,d,color,parent,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),color,parent,x,y,z);
export const sphere=(r,color,parent,x,y,z,seg=16)=>mesh(new THREE.SphereGeometry(r,seg,Math.max(8,seg*.75|0)),color,parent,x,y,z);
export const cylinder=(rt,rb,h,color,parent,x,y,z,seg=12)=>mesh(new THREE.CylinderGeometry(rt,rb,h,seg),color,parent,x,y,z);
export const cone=(r,h,color,parent,x,y,z,seg=12)=>mesh(new THREE.ConeGeometry(r,h,seg),color,parent,x,y,z);
export function fxMesh(geometry,color,parent,x,y,z,opacity=.75,additive=true){const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;}
export function label(text,color='#fff4cf',size=64){const c=document.createElement('canvas');c.width=512;c.height=128;const cx=c.getContext('2d');cx.font=`900 ${size}px system-ui,sans-serif`;cx.textAlign='center';cx.textBaseline='middle';cx.lineJoin='round';cx.lineWidth=12;cx.strokeStyle='#111318';cx.strokeText(text,256,64);cx.fillStyle=color;cx.fillText(text,256,64);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));s.scale.set(3.4,.85,1);s.renderOrder=10;return s;}

const inks=new Map();
function inkMaterial(color){if(!inks.has(color))inks.set(color,new THREE.MeshBasicMaterial({color,side:THREE.BackSide}));return inks.get(color);}
// Roughly constant line width: scale each hull by thickness relative to its own size.
export function ink(root,thickness=.045,color='#101216',minRadius=.07){
  const parts=[];
  root.traverse(part=>{if(part.isMesh&&part.material.isMeshToonMaterial&&!part.userData.noInk){part.geometry.computeBoundingSphere();if(part.geometry.boundingSphere.radius>minRadius)parts.push(part);}});
  for(const part of parts){const r=part.geometry.boundingSphere.radius,outline=new THREE.Mesh(part.geometry,inkMaterial(color));outline.position.copy(part.geometry.boundingSphere.center).multiplyScalar(-(thickness/r));outline.scale.setScalar(1+thickness/r);outline.castShadow=false;outline.receiveShadow=false;outline.userData.ink=true;part.add(outline);}
}

// Comic impact star used for hit sparks; one texture shared by every burst.
let starTexture=null;
export function starSprite(color='#fff27a'){
  if(!starTexture){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.translate(128,128);
    const star=(outer,inner,points)=>{g.beginPath();for(let i=0;i<points*2;i++){const r=i%2?inner:outer,a=i*Math.PI/points-Math.PI/2;g.lineTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();};
    star(120,46,10);g.fillStyle='#ffffff';g.fill();g.lineWidth=10;g.strokeStyle='#15171c';g.stroke();star(80,34,8);g.fillStyle='#ffe45c';g.fill();star(40,18,6);g.fillStyle='#ffffff';g.fill();
    starTexture=new THREE.CanvasTexture(c);starTexture.colorSpace=THREE.SRGBColorSpace;}
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:starTexture,color,transparent:true,depthTest:false}));s.renderOrder=11;return s;
}
