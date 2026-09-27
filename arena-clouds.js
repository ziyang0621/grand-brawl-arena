import * as THREE from './vendor/three.module.js';

export function createCloudVisual(kind){
  const color=kind==='virus'?'#b66cff':kind==='slow'?'#6db9ff':'#72e889';
  const root=new THREE.Group();
  const fog=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.2,depthWrite:false}));
  fog.scale.y=.45;
  const edge=new THREE.Mesh(new THREE.RingGeometry(.965,1,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
  edge.rotation.x=-Math.PI/2;edge.position.y=.025;
  root.add(fog,edge);root.userData={fog,edge};return root;
}

export function updateCloudVisual(root,cloud){
  root.position.set(cloud.x,cloud.y,cloud.z);
  // Match the authoritative horizontal collision radius throughout its lifetime.
  root.scale.set(cloud.radius,1,cloud.radius);
  const fade=Math.min(1,Math.max(0,cloud.life)/.7);
  root.userData.fog.material.opacity=.2*fade;
  // Keep the boundary readable until the hazard actually expires.
  root.userData.edge.material.opacity=cloud.life>0?.5+.35*fade:0;
}
