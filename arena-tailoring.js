// Low-poly, continuous costume surfaces. Geometry carries the large folds;
// a small baked tonal map carries seams and cloth shading, as on painted game assets.
import * as THREE from './vendor/three.module.js';

const materials=new Map();
const ramp=new THREE.DataTexture(new Uint8Array([150,141,158,255,207,204,208,255,255,249,235,255]),3,1);
ramp.magFilter=ramp.minFilter=THREE.LinearFilter;ramp.needsUpdate=true;
export const SKIN_RAMP=new THREE.DataTexture(new Uint8Array([163,139,135,255,216,194,181,255,248,232,216,255,255,250,235,255]),4,1);
SKIN_RAMP.magFilter=SKIN_RAMP.minFilter=THREE.LinearFilter;SKIN_RAMP.generateMipmaps=false;SKIN_RAMP.needsUpdate=true;
function paintedMap(kind){
  const w=128,h=256,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/(w-1),v=y/(h-1),a=u*Math.PI*2;
    // Broad fabric planes, not a noise/bump filter. Creases converge near hems and joints.
    let value=.88+.08*Math.cos(a-.7)+.035*Math.cos(a*2+.4);
    const bands=kind==='sleeve'?[.06,.46,.89]:kind==='trouser'?[.09,.46,.85]:[.09,.33,.74];
    for(let i=0;i<bands.length;i++){
      const path=bands[i]+.035*Math.sin(a*2+i*1.8),d=v-path;
      const strength=(.45+.55*Math.pow(Math.sin(a+i*.9),2));
      value-=.14*Math.exp(-Math.pow(d/.013,2))*strength;
      value+=.07*Math.exp(-Math.pow((d+.021)/.023,2))*strength;
    }
    if(kind==='skin')value=.96+.035*Math.cos(a-.8)-.06*Math.exp(-Math.pow((v-.5)/.06,2));
    if(kind==='anatomy'){
      const front=Math.pow(Math.max(0,Math.cos(a)),8),side=Math.abs(Math.sin(a));
      value=.91+.065*Math.cos(a-.7);
      value-=front*(.18*Math.exp(-Math.pow((v-(.62+.09*side))/.021,2))+.11*Math.exp(-Math.pow(side/.035,2))*Math.exp(-Math.pow((v-.62)/.23,2)));
      value+=front*.065*Math.exp(-Math.pow((v-.75)/.08,2));
      value-=front*.10*Math.exp(-Math.pow((v-(.88-.08*side))/.02,2));
      for(const row of [.25,.37,.48])value-=front*.065*Math.exp(-Math.pow((v-row)/.012,2))*Math.exp(-Math.pow(side/.44,2));
    }
    if(kind==='hair')value=.69+.23*Math.pow(Math.max(0,Math.cos(a-.5)),3)+.07*Math.sin(v*Math.PI)-.08*Math.pow(Math.sin(a*3+v*.7),10);
    if(kind==='leather')value=.77+.16*Math.pow(Math.max(0,Math.cos(a-.7)),8)+.035*Math.cos(v*24);
    if(kind==='shoe')value=.90+.055*Math.cos(a-.5)-.08*Math.exp(-Math.pow((v-.18)/.025,2));
    if(kind==='sole'){
      const line=((v+Math.abs(u-.5)*.18)*11)%1;
      value=.86;
      if(u>.14&&u<.86&&v>.12&&v<.91)value-=.25*Math.exp(-Math.pow((line-.5)/.16,2));
      value-=.12*Math.exp(-Math.pow((u-.5)/.018,2));
    }
    if(kind==='hand')value=.96+.025*Math.cos(a)-.055*Math.exp(-Math.pow((v-.32)/.04,2))*Math.max(0,Math.cos(a));
    if(kind==='steel')value=.65+.25*Math.exp(-Math.pow((u-.34)/.16,2))+.08*Math.cos(v*Math.PI);
    if(kind==='brass')value=.74+.20*Math.pow(Math.max(0,Math.cos(a-.7)),3)-.08*Math.exp(-Math.pow((v-.08)/.04,2));
    if(kind==='wood')value=.80+.085*Math.cos(a-.7)-.055*Math.pow(Math.sin(a*5+Math.sin(v*9)*.22),12);
    if(kind==='headwear'){
      value=.89+.07*Math.cos(a-.7)-.12*Math.exp(-Math.pow((v-.08)/.045,2));
      value-=.055*Math.pow(Math.max(0,Math.cos(a*8)),24)*Math.sin(v*Math.PI);
    }
    if(kind==='skirt'){
      value=.84+.095*Math.cos(a*10-.45)+.045*Math.cos(a-.7);
      value-=.13*Math.exp(-Math.pow((v-.065)/.027,2));
    }
    // Cut fronts/lapels use flat pattern UVs, not the cylindrical sleeve UVs.
    // Wrapping the sleeve creases over them produces oversized wavy puckers.
    if(kind==='panel')value=.95+.025*Math.cos((u-.4)*Math.PI)-.035*Math.exp(-Math.pow((v-.08)/.025,2));
    if(kind==='jacket'){
      // Long folds pull towards the waist; avoid rings running around the chest.
      value=.91+.055*Math.cos(a-.6)+.025*Math.cos(2*a);
      for(const centre of [.17,.34,.66,.83]){
        const path=centre+.025*Math.sin(v*Math.PI),d=u-path,envelope=Math.sin(v*Math.PI)**2;
        value-=.16*Math.exp(-Math.pow(d/.023,2))*envelope;
        value+=.06*Math.exp(-Math.pow((d+.025)/.027,2))*envelope;
      }
      value-=.10*Math.exp(-Math.pow((v-.025)/.014,2));
      value-=.09*Math.exp(-Math.pow((v-.82)/.09,2))*Math.sin(a)**4;
    }
    if(!['skin','hand','anatomy','panel','shoe','sole','headwear','skirt','steel','brass','wood'].includes(kind))value-=.12*Math.exp(-Math.pow((u-.25)/.007,2));
    const k=(y*w+x)*4,b=Math.round(Math.min(1,Math.max(.45,value))*255);
    data[k]=b;data[k+1]=Math.round(b*.99);data[k+2]=Math.round(b*.98);data[k+3]=255;
  }
  const map=new THREE.DataTexture(data,w,h);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return map;
}
const maps=new Map();
export function costumeMaterial(color,kind='cloth'){
  const key=color+':'+kind;
  if(!materials.has(key)){
    if(!maps.has(kind))maps.set(kind,paintedMap(kind));
    const m=new THREE.MeshToonMaterial({color,map:maps.get(kind),gradientMap:['skin','hand','anatomy'].includes(kind)?SKIN_RAMP:ramp,side:THREE.DoubleSide,vertexColors:kind==='panel'});
    m.userData.costumeShared=true;materials.set(key,m);
  }
  return materials.get(key);
}

// Rings are [y, half-width, half-depth, centre-z]. Matching seam vertices share normals.
export function profileGeometry(rings,{segments=16,fold=0,joint=null,startAngle=0,arc=Math.PI*2,caps=false}={}){
  const positions=[],uv=[],indices=[],weights=[],bones=[];
  const maxY=Math.max(...rings.map(r=>r[0])),minY=Math.min(...rings.map(r=>r[0])),height=maxY-minY||1;
  rings.forEach(([y,rx,rz,cz=0],i)=>{
    const v=(maxY-y)/height;
    for(let j=0;j<=segments;j++){
      const a=startAngle+j/segments*arc,crease=1+fold*Math.sin(a*5+v*7)*Math.sin(v*Math.PI);
      positions.push(Math.sin(a)*rx*crease,y,Math.cos(a)*rz*crease+cz);uv.push(j/segments,1-v);
      if(joint!==null){const k=THREE.MathUtils.smoothstep(joint-y,-.16,.16);bones.push(0,1,0,0);weights.push(1-k,k,0,0);}
      if(i<rings.length-1&&j<segments){const n=i*(segments+1)+j;indices.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2);}
    }
  });
  if(caps&&arc===Math.PI*2)for(const row of [0,rings.length-1]){
    const [y,rx,rz,cz=0]=rings[row],centre=positions.length/3;
    const append=(x,z,u,v)=>{positions.push(x,y,z);uv.push(u,v);if(joint!==null){const k=THREE.MathUtils.smoothstep(joint-y,-.16,.16);bones.push(0,1,0,0);weights.push(1-k,k,0,0);}};
    append(0,cz,.5,.5);
    for(let j=0;j<=segments;j++){
      const index=(row*(segments+1)+j)*3,x=positions[index],z=positions[index+2];
      append(x,z,.5+x/(rx*2),.5+(z-cz)/(rz*2));
    }
    for(let j=0;j<segments;j++)indices.push(...(row===0?[centre,centre+1+j,centre+2+j]:[centre,centre+2+j,centre+1+j]));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  if(joint!==null){g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(bones,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));}
  g.computeVertexNormals();
  const n=g.attributes.normal;
  if(arc===Math.PI*2)for(let i=0;i<rings.length;i++){const first=i*(segments+1),last=first+segments,v=new THREE.Vector3(n.getX(first)+n.getX(last),n.getY(first)+n.getY(last),n.getZ(first)+n.getZ(last)).normalize();n.setXYZ(first,v.x,v.y,v.z);n.setXYZ(last,v.x,v.y,v.z);}
  return g;
}

// A rounded rectangular palm with a narrower wrist and a padded knuckle edge.
// Unlike a sphere this has readable dorsal/palm planes and joins the wrist cleanly.
export function palmGeometry(scale=1){
  const rings=[[.065,.055,.038,0],[.025,.082,.047,0],[-.035,.093,.05,.006],[-.09,.092,.056,.015],[-.125,.075,.049,.018]];
  const g=profileGeometry(rings.map(r=>r.map(n=>n*scale)),{segments:12,caps:true}),p=g.attributes.position;
  // Square the palm's cross-section while retaining bevelled corners.
  for(let row=0;row<rings.length;row++)for(let col=0;col<=12;col++){
    const a=col/12*Math.PI*2,[y,rx,rz,cz]=rings[row],squircle=v=>Math.sign(v)*Math.pow(Math.abs(v),.7);
    p.setXYZ(row*13+col,squircle(Math.sin(a))*rx*scale,y*scale,(squircle(Math.cos(a))*rz+cz)*scale);
  }
  // Caps duplicate edge vertices for hard, closed end planes; update them too.
  for(const [n,row] of [0,rings.length-1].entries()){
    const cap=rings.length*13+n*14;
    for(let col=0;col<=12;col++){const source=row*13+col;p.setXYZ(cap+1+col,p.getX(source),p.getY(source),p.getZ(source));}
  }
  g.computeVertexNormals();
  const n=g.attributes.normal;
  for(let row=0;row<rings.length;row++){
    const a=row*13,b=a+12,v=new THREE.Vector3().fromBufferAttribute(n,a).add(new THREE.Vector3().fromBufferAttribute(n,b)).normalize();
    n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);
  }
  return g;
}

// Flared cloth panels widen towards a rolled hem; the interior folds back up
// so low-angle poses show lining rather than an open cone or a solid disk.
export function skirtGeometry(){
  const rings=[[.21,.30,.285],[.15,.32,.304],[.02,.40,.38],[-.15,.52,.494],[-.20,.555,.527],[-.225,.55,.522],[-.205,.522,.496],[-.15,.499,.474],[.02,.38,.361],[.15,.30,.285],[.21,.28,.266],[.21,.30,.285]];
  const g=profileGeometry(rings,{segments:40}),p=g.attributes.position;
  for(let row=0;row<rings.length;row++)for(let j=0;j<=40;j++){
    const k=row*41+j,[y,rx,rz]=rings[row],a=j/40*Math.PI*2,t=THREE.MathUtils.clamp((.21-y)/.435,0,1);
    const pleat=1+Math.cos(a*10)*(.009+.043*t*t);
    p.setXYZ(k,Math.sin(a)*rx*pleat,y,Math.cos(a)*rz*pleat);
  }
  g.computeVertexNormals();
  // Weld shading at both the radial seam and the lining's waist closure.
  const n=g.attributes.normal,shared=new Map(),keys=[];
  for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');keys.push(key);if(!shared.has(key))shared.set(key,new THREE.Vector3());shared.get(key).add(new THREE.Vector3().fromBufferAttribute(n,i));}
  for(const v of shared.values())v.normalize();keys.forEach((key,i)=>{const v=shared.get(key);n.setXYZ(i,v.x,v.y,v.z);});
  return g;
}

// A single closed blade, with a tapered point and narrow bevel faces. Its UVs
// run across/along the steel instead of restarting on a separate cone tip.
export function bladeGeometry(width=.14,length=1.5,thickness=.055){
  const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);
  shape.lineTo(width*.44,length*.82);shape.lineTo(-width*.10,length);shape.lineTo(-width*.46,length*.86);shape.closePath();
  const bevel=Math.min(width*.075,thickness*.18),g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1,curveSegments:1});
  g.translate(0,0,-thickness/2);
  const p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)uv.setXY(i,THREE.MathUtils.clamp(p.getX(i)/(width+bevel*2)+.5,0,1),THREE.MathUtils.clamp(p.getY(i)/length,0,1));
  g.clearGroups();g.computeBoundingBox();return g;
}

const outlineMaterial=new THREE.MeshBasicMaterial({color:'#29232b',side:THREE.BackSide});
outlineMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed += objectNormal * 0.012;');};
outlineMaterial.customProgramCacheKey=()=>'costume-skinned-outline';

// Existing animation owns the elbow/knee Groups. Two bones copy their rotations so
// combat poses stay unchanged while the visible skin bridges the moving joint.
export function skinnedLimb(parent,joint,rings,color,kind,{fold=.035,bottomColor=null,bottomAt=-Infinity,bottomKind='leather'}={}){
  const geo=profileGeometry(rings,{fold,joint:joint.position.y});
  const bone0=new THREE.Bone(),bone1=new THREE.Bone();bone1.position.copy(joint.position);bone0.add(bone1);parent.add(bone0);
  const mats=[costumeMaterial(color,kind)];
  if(bottomColor){mats.push(costumeMaterial(bottomColor,bottomKind));for(let i=0;i<rings.length-1;i++)geo.addGroup(i*16*6,16*6,(rings[i][0]+rings[i+1][0])/2<bottomAt?1:0);}
  const surface=new THREE.SkinnedMesh(geo,bottomColor?mats:mats[0]);surface.userData.noInk=true;surface.castShadow=surface.receiveShadow=true;parent.add(surface);
  parent.updateWorldMatrix(true,true);const skeleton=new THREE.Skeleton([bone0,bone1]);surface.bind(skeleton);
  const line=new THREE.SkinnedMesh(geo,outlineMaterial);line.userData.ink=true;parent.add(line);line.bind(skeleton,surface.bindMatrix);
  parent.costumeSurface={surface,bone:bone1,joint,skeleton};
  return surface;
}
export function syncCostume(rig){
  for(const limb of [...rig.arms,...rig.legs]){
    const s=limb.costumeSurface;if(s){s.bone.quaternion.copy(s.joint.quaternion);s.bone.scale.copy(s.joint.scale);}
  }
}
export function freezeSkinnedGeometry(source){
  source.updateWorldMatrix(true,false);source.skeleton.bones[0].updateWorldMatrix(true,true);source.skeleton.update();
  const geometry=source.geometry.clone(),pos=geometry.attributes.position,v=new THREE.Vector3();
  for(let j=0;j<pos.count;j++){source.getVertexPosition(j,v);pos.setXYZ(j,v.x,v.y,v.z);}
  geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.clearGroups();geometry.computeBoundingSphere();return geometry;
}

export function tailoredTorso(parent,color,rings){
  const m=new THREE.Mesh(profileGeometry(rings,{segments:24,fold:.016}),costumeMaterial(color,'jacket'));m.castShadow=m.receiveShadow=true;parent.add(m);return m;
}
export function openCoat(parent,color,{width=.43,waist=.3,hem=1.3,depth=.76}={}){
  const profile=[[2.41,.15],[2.33,width*.78],[2.24,width*1.1],[2.14,width],[1.92,width*.94],[1.7,waist],[1.44,waist*1.1],[1.3,waist*1.1]];
  const rings=profile.filter(([y])=>y>hem+.02).map(([y,r])=>[y,r+.025,r*depth+.025]);
  rings.push([hem,waist*1.15+.025,waist*1.15*depth+.025]);
  const coat=new THREE.Mesh(profileGeometry(rings,{segments:24,fold:.018,startAngle:.5,arc:Math.PI*2-1}),costumeMaterial(color,'jacket'));coat.castShadow=coat.receiveShadow=true;coat.userData.noInk=true;parent.add(coat);
  for(const side of [-1,1])clothPanel(parent,color,[[side*.105,2.4,.13],[side*.31,2.29,.27],[side*.24,2.1,.33],[side*.13,2.02,.29]],{lift:.048});
  return coat;
}
// Cut fabric pieces, with deliberate corners for lapels, pointed collars and coat panels.
export function clothPanel(parent,color,points,{lift=.018}={}){
  const g=new THREE.BufferGeometry(),positions=[],uv=[];
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),dx=Math.max(...xs)-minX||1,minY=Math.min(...ys),dy=Math.max(...ys)-minY||1;
  const place=p=>{
    const [x,y]=p;let z=p[2];const profile=parent.costumeProfile;
    if(profile)for(let i=0;i<profile.length-1;i++){
      const a=profile[i],b=profile[i+1];if(y<=a[0]&&y>=b[0]){
        const k=(a[0]-y)/(a[0]-b[0]),rx=THREE.MathUtils.lerp(a[1],b[1],k),rz=THREE.MathUtils.lerp(a[2],b[2],k);
        z=rz*Math.sqrt(Math.max(0,1-(x/rx)**2))+lift;break;
      }
    }
    positions.push(x,y,z);uv.push((x-minX)/dx,(y-minY)/dy);
  };
  const subdivide=(a,b,c,level)=>{
    if(!level){place(a);place(b);place(c);return;}
    const mid=(p,q)=>p.map((v,i)=>(v+q[i])/2),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
    subdivide(a,ab,ca,level-1);subdivide(ab,b,bc,level-1);subdivide(ca,bc,c,level-1);subdivide(ab,bc,ca,level-1);
  };
  // Lapels are concave patterns: a triangle fan can fold over its own notch.
  const triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  // Split at the chest/waist profile bends before projecting. Otherwise a
  // triangle spanning a shoulder ridge can sink through the layer below it.
  const cuts=[minY,...(parent.costumeProfile||[]).map(p=>p[0]).filter(y=>y>minY&&y<minY+dy),minY+dy].sort((a,b)=>a-b);
  const clip=(polygon,y,above)=>{
    const out=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],inside=p=>above?p[1]>=y:p[1]<=y;
      if(inside(a))out.push(a);
      if(inside(a)!==inside(b)){const t=(y-a[1])/(b[1]-a[1]);out.push(a.map((v,j)=>j===1?y:THREE.MathUtils.lerp(v,b[j],t)));}
    }
    return out;
  };
  for(const [a,b,c] of triangles)for(let band=0;band<cuts.length-1;band++){
    const polygon=clip(clip([points[a],points[b],points[c]],cuts[band],true),cuts[band+1],false);
    for(let i=1;i<polygon.length-1;i++){
      const p=polygon[0],q=polygon[i],r=polygon[i+1];
      if(Math.abs((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))>1e-10)subdivide(p,q,r,2);
    }
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  // The pattern is expanded for UVs, but still represents one smooth sheet.
  // Share normals across coincident vertices instead of lighting every tiny
  // triangle separately (which made white shirts look crumpled/torn).
  const normals=g.attributes.normal,shared=new Map(),keys=[];
  for(let i=0;i<positions.length/3;i++){
    const key=positions.slice(i*3,i*3+3).map(v=>Math.round(v*1e6)).join(',');keys.push(key);
    if(!shared.has(key))shared.set(key,new THREE.Vector3());
    shared.get(key).add(new THREE.Vector3().fromBufferAttribute(normals,i));
  }
  for(const n of shared.values())n.normalize();
  keys.forEach((key,i)=>{const n=shared.get(key);normals.setXYZ(i,n.x,n.y,n.z);});
  // Baked edge depth follows the actual cut pattern, including concave notches.
  // Shared positions receive identical color, so triangulation adds no false seams.
  const colors=[];
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1];let distance=Infinity;
    for(let j=0;j<points.length;j++){
      const a=points[j],b=points[(j+1)%points.length],ex=b[0]-a[0],ey=b[1]-a[1],length=ex*ex+ey*ey;
      const t=length?THREE.MathUtils.clamp(((x-a[0])*ex+(y-a[1])*ey)/length,0,1):0;
      distance=Math.min(distance,Math.hypot(x-a[0]-t*ex,y-a[1]-t*ey));
    }
    const width=Math.min(.025,dx*.12,dy*.12),shade=1-.18*Math.exp(-Math.pow(distance/width,2));
    colors.push(shade,shade,shade);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const m=new THREE.Mesh(g,costumeMaterial(color,'panel'));m.castShadow=m.receiveShadow=true;m.userData.noInk=true;parent.add(m);return m;
}
