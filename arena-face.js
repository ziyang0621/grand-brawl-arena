// Anime heads the way PS2-era brawlers built them: a sculpted head with a tapered chin, the face (eyes,
// brows, mouth, blush, marks) painted onto a canvas texture that wraps the front of the head, and hair
// made of big tapered locks that follow the skull instead of cones stuck on a ball.
// The face is repainted only when the expression changes, on one canvas per fighter.
import * as THREE from './vendor/three.module.js';
import {mesh} from './arena-gfx.js';
import {costumeMaterial,SKIN_RAMP} from './arena-tailoring.js';

export const HEAD_R=.45;
// Skin gets a gentler ramp than the rest of the scene so faces stay clean instead of banded.
const skinMats=new Map();
export function skinMat(color){if(!skinMats.has(color))skinMats.set(color,new THREE.MeshToonMaterial({color,gradientMap:SKIN_RAMP}));return skinMats.get(color);}
// Open scalp cap: high under the fringe, lower at the temples and nape.
// Folding a whole sphere inward made its front intersect the face like a jagged patch.
export function hairShellGeometry(R,{headShape=null,back=0,frontHem=1.15}={}){
  const width=28,height=20,g=new THREE.SphereGeometry(R,width,height,0,Math.PI*2,0,2.2),p=g.attributes.position;
  for(let row=0;row<=height;row++)for(let col=0;col<=width;col++){
    const a=col/width*Math.PI*2-Math.PI/2,front=Math.cos(a);
    const hem=front>0?THREE.MathUtils.lerp(1.8,frontHem,THREE.MathUtils.smoothstep(front,0,1)):THREE.MathUtils.lerp(1.8,2.2,-front);
    const theta=row/height*hem,s=Math.sin(theta),i=row*(width+1)+col;
    p.setXYZ(i,Math.sin(a)*s*R,Math.cos(theta)*R,front*s*R);
  }
  if(headShape)sculpt(g,R,headShape.jaw,headShape.shape);
  // Add volume behind the skull without moving the forehead inside it.
  for(let i=0;i<p.count;i++)if(p.getZ(i)<0)p.setZ(i,p.getZ(i)*(1+back/R));
  g.computeVertexNormals();return g;
}
// Face plate spans this part of the sphere (radians): wide enough for eyes, narrow enough to stay on the face.
const PHI_W=1.95,THETA0=.9,THETA_L=1.5;
const CW=512,CH=384;

// Anime skull: round cranium, cheeks that narrow into a pointed chin, slightly flat face.
function sculpt(geo,R,jaw=1,{chin=1,square=0,cheek=1}={}){
  const p=geo.attributes.position,v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);const nx=v.x/R,ny=v.y/R,nz=v.z/R;
    const low=THREE.MathUtils.smoothstep(-ny,-.1,1);           // 0 above the cheekbones, 1 at the chin
    const sq=square*THREE.MathUtils.smoothstep(-ny,.35,.9);
    const cheekMask=THREE.MathUtils.smoothstep(ny,-.55,-.36)*(1-THREE.MathUtils.smoothstep(ny,.08,.23));
    const lower=THREE.MathUtils.smoothstep(-ny,0,.2);
    let x=nx*(1-.30*low*jaw*(1-square*.55))*(1+(cheek*1.03-1)*cheekMask),z=nz*(1-.08*low),y=ny*(1+(1.12*chin*(1-sq*.08)-1)*lower);
    if(nz>0)z+=.1*low*nz;                                       // chin comes forward a little
    const faceMask=THREE.MathUtils.smoothstep(nz,.1,.35)*THREE.MathUtils.smoothstep(ny,-.4,-.2)*(1-THREE.MathUtils.smoothstep(ny,.25,.45));
    z*=1-.04*faceMask;                                         // smooth cheek/eye transition; no surface steps
    p.setXYZ(i,x*R,y*R,z*R);
  }
  geo.computeVertexNormals();return geo;
}
export function headGeometry(R=HEAD_R,jaw=1,shape={}){return sculpt(new THREE.SphereGeometry(R,40,30),R,jaw,shape);}
export function facePlateGeometry(R=HEAD_R,jaw=1,shape={}){const radius=R*1.018;return sculpt(new THREE.SphereGeometry(radius,32,24,Math.PI/2-PHI_W/2,PHI_W,THETA0,THETA_L),radius,jaw,shape);}

// ---- tapered hair lock: a tube along a curve whose radius shrinks to a point and that lies flat on the head ----
export function lockGeometry(points,r0,r1=0,{flat=.55,center=new THREE.Vector3(),seg=18,radial=8}={}){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const g=new THREE.TubeGeometry(curve,seg,1,radial,false),pos=g.attributes.position,uv=g.attributes.uv,v=new THREE.Vector3(),out=new THREE.Vector3();
  for(let i=0;i<=seg;i++){
    const t=i/seg,P=curve.getPointAt(t),r=THREE.MathUtils.lerp(r0,r1,Math.pow(t,.85))*THREE.MathUtils.smoothstep(t,0,.18);
    out.copy(P).sub(center).normalize();
    for(let j=0;j<=radial;j++){
      const k=i*(radial+1)+j;v.fromBufferAttribute(pos,k).sub(P);
      const along=v.dot(out);v.addScaledVector(out,along*(flat-1));        // squash the thickness that points away from the skull
      v.multiplyScalar(r).add(P);pos.setXYZ(k,v.x,v.y,v.z);uv.setXY(k,j/radial,1-t);
    }
  }
  g.computeVertexNormals();
  // Tube UVs duplicate the first/last vertex; their lighting must still agree.
  const normal=g.attributes.normal;
  for(let i=0;i<=seg;i++){
    const a=i*(radial+1),b=a+radial,n=new THREE.Vector3().fromBufferAttribute(normal,a).add(new THREE.Vector3().fromBufferAttribute(normal,b)).normalize();
    normal.setXYZ(a,n.x,n.y,n.z);normal.setXYZ(b,n.x,n.y,n.z);
  }
  return g;
}
const hairInk=new THREE.MeshBasicMaterial({color:'#252129',side:THREE.BackSide});
hairInk.onBeforeCompile=shader=>{
  // A scaled hull exposes a black collar at every open root and makes overlapping
  // locks look glued on. Extrude along normals, fading into the shared crown.
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float strandT = 1.0 - uv.y;
    float strandInk = smoothstep(0.0, 0.22, strandT) * (1.0 - smoothstep(0.86, 1.0, strandT));
    transformed += normal * (0.008 * strandInk);`);
};
hairInk.customProgramCacheKey=()=>'tapered-hair-ink-v1';
// A lock that can swing: its group sits at the root so sway rotates it around where it grows.
export function lock(parent,color,points,r0,r1=0,opts={}){
  const g=new THREE.Group();g.position.set(...points[0]);parent.add(g);
  const local=points.map(p=>[p[0]-points[0][0],p[1]-points[0][1],p[2]-points[0][2]]);
  const c=opts.center||new THREE.Vector3(0,opts.cy??0,0);
  const hair=mesh(lockGeometry(local,r0,r1,{...opts,center:c.clone().sub(new THREE.Vector3(...points[0]))}),color,g,0,0,0);hair.material=costumeMaterial(color,'hair');
  hair.userData.noInk=true;
  const outline=new THREE.Mesh(hair.geometry,hairInk);outline.userData.ink=true;hair.add(outline);
  return g;
}

// ---- painting ----
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
const LINE='#1a1414';
// Eye styles: each face has its own eye, not just a different colour.
//  h: height vs width, iris: iris size, pupil: pupil size, slant: outer corner tilt, lid: resting lid,
//  top: how flat the upper lid is, lash: lash-line weight, flick: lash sweep past the corner, shine: highlights
const EYES={
  sharp:{w:88,h:.72,iris:.40,pupil:.90,slant:.16,lid:0,top:.3,lash:6,flick:.08,shine:0},     // broad sclera with small ink pupils, not vertical doll eyes
  stern:{w:76,h:.66,iris:.54,pupil:.78,slant:.08,lid:.14,top:.85,lash:8,flick:.04,shine:1},
  fierce:{w:78,h:.64,iris:.38,pupil:.95,slant:.24,lid:0,top:.65,lash:9,flick:.06,shine:0},
  round:{w:74,h:1.0,iris:.52,pupil:.82,slant:-.04,lid:0,top:.1,lash:6,flick:0,shine:1},
  cool:{w:80,h:.62,iris:.44,pupil:.85,slant:.15,lid:.15,top:.88,lash:7,flick:.15,shine:1},
  cute:{w:82,h:.96,iris:.70,pupil:.52,slant:-.08,lid:0,top:.3,lash:9,flick:.28,shine:1}
};
// One contour drives both the eye-white mask and its lash. Positive tension
// lowers the inner corner while lifting the outer edge into a fighting squint.
export function eyeUpperContour(w,h,top,lid,tilt=0){
  const tension=THREE.MathUtils.clamp(tilt,0,1),dl=lid*h*.72;
  return [[-w*.5,-h*.04+dl*.3+tension*h*.12],[-w*.42,top+dl+tension*h*.32],
    [w*.35,top+dl-tension*h*.06],[w*.6,-h*.2+dl*.4-tension*h*.08]];
}
function drawEye(g,s,side,st){
  const E0=EYES[s.eyeStyle]||EYES.sharp,w=E0.w*s.eye*1.42,h=w*E0.h;
  const cx=CW/2+side*114*s.spread,cy=CH*(.56+s.eyeY);
  g.save();g.translate(cx,cy);g.scale(side,1);g.rotate(-E0.slant*.5);  // draw the right eye, mirror for the left
  g.lineCap='round';g.lineJoin='round';
  const E=st.eyes,lw=E0.lash;
  if(E==='happy'){g.lineWidth=lw;g.strokeStyle=LINE;g.beginPath();g.arc(0,h*.2,w*.48,Math.PI*1.1,Math.PI*1.9);g.stroke();g.restore();return;}
  if(E==='hurt'){g.lineWidth=lw;g.strokeStyle=LINE;g.beginPath();g.moveTo(-w*.45,-h*.4);g.lineTo(w*.35,0);g.lineTo(-w*.45,h*.4);g.stroke();g.restore();return;}
  if(E==='ko'){g.lineWidth=lw;g.strokeStyle=LINE;g.beginPath();g.moveTo(-w*.4,-h*.45);g.lineTo(w*.4,h*.45);g.moveTo(w*.4,-h*.45);g.lineTo(-w*.4,h*.45);g.stroke();g.restore();return;}
  if(E==='closed'){g.lineWidth=lw*.85;g.strokeStyle=LINE;g.beginPath();g.moveTo(-w*.5,2);g.quadraticCurveTo(0,h*.3,w*.55,-2);g.stroke();g.restore();return;}
  const top=-h*.62*(1-E0.top*.35),rest=Math.max(E==='wide'?0:E0.lid,st.lid),T=top-(1-E0.top)*h*.3,dl=rest*h*.72;
  const contour=eyeUpperContour(w,h,T,rest,st.tilt),upper=()=>{g.moveTo(...contour[0]);g.bezierCurveTo(...contour[1],...contour[2],...contour[3]);};
  // The sclera, clipping path and lash share the same moving upper contour.
  // Painting a skin rectangle over a fixed eye left a second white strip above the lid.
  const shape=()=>{g.beginPath();upper();g.bezierCurveTo(w*.52,h*.5,-w*.2,h*.62,...contour[0]);g.closePath();};
  shape();g.fillStyle='#ffffff';g.fill();g.strokeStyle=LINE;g.lineWidth=2.7;g.stroke();
  g.save();shape();g.clip();
  if(E==='daze'){g.lineWidth=5;g.strokeStyle=LINE;g.beginPath();for(let a=0;a<Math.PI*5;a+=.2){const r=a*2.6;g.lineTo(Math.cos(a+st.t)*r,Math.sin(a+st.t)*r*.9);}g.stroke();}
  else{
    const ir=(E==='wide'?.62:1)*E0.iris,ix=st.gx*w*.18*side+w*.02,iy=-h*.10-st.gy*h*.08,ry=(s.eyeStyle==='cute'?h*.52:Math.min(w*.34,h*.45))*ir;
    const grad=g.createLinearGradient(0,iy-h*.5,0,iy+h*.5);grad.addColorStop(0,s.iris0);grad.addColorStop(.5,s.iris1);grad.addColorStop(1,s.iris2);
    g.fillStyle=grad;g.beginPath();g.ellipse(ix,iy,w*.34*ir,ry,0,0,Math.PI*2);g.fill();
    g.strokeStyle=s.iris0;g.lineWidth=3;g.stroke();
    g.fillStyle='#120e10';g.beginPath();g.ellipse(ix,iy+h*.02,w*.34*ir*E0.pupil,ry*E0.pupil,0,0,Math.PI*2);g.fill();
    g.fillStyle='#ffffff';
    if(E0.shine>=1){g.beginPath();g.ellipse(ix-w*.1*ir,iy-h*.2*ir,w*.055,h*.07,0,0,Math.PI*2);g.fill();}
    if(E0.shine>=2){g.beginPath();g.arc(ix+w*.1*ir,iy+h*.22*ir,w*.045,0,Math.PI*2);g.fill();}
    if(E0.shine>=3){g.beginPath();g.arc(ix+w*.12*ir,iy-h*.24*ir,w*.03,0,Math.PI*2);g.fill();g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(ix,iy+h*.26*ir,w*.2*ir,h*.1*ir,0,0,Math.PI*2);g.fill();}
    g.fillStyle='rgba(110,100,150,.35)';g.fillRect(-w,-h,w*2,h*.5+top*.2);
  }
  g.restore();
  // lash line and lower lid
  const lidY=T*.75+dl;
  g.strokeStyle=LINE;g.fillStyle=LINE;g.lineWidth=lw;
  g.beginPath();upper();g.stroke();
  if(E0.flick>0){g.beginPath();g.moveTo(...contour[3]);g.lineTo(w*(.62+E0.flick*.4),contour[3][1]-h*E0.flick*.6);g.lineWidth=lw*.7;g.stroke();}
  if(s.lash==='long'){g.lineWidth=5;for(const [a,b] of [[.62,.35],[.72,.12]]){g.beginPath();g.moveTo(w*.5,lidY+h*.18);g.lineTo(w*(a+.12),lidY-h*b);g.stroke();}}
  g.lineWidth=3;g.beginPath();g.moveTo(-w*.18,h*.56);g.quadraticCurveTo(w*.15,h*.62,w*.44,h*.28);g.stroke();
  g.restore();
}
function drawBrow(g,s,side,st){
  const cx=CW/2+side*116*s.spread,cy=CH*(.31+s.eyeY)-st.raise*14+(st.eyes==='wide'?-10:0),B=s.browStyle;
  g.save();g.translate(cx,cy);g.scale(side*1.25,1.3);g.rotate(-st.tilt*.34+(B==='angry'?.25:B==='worried'?-.2:0));
  g.fillStyle=s.brow;g.strokeStyle=s.brow;g.lineCap='round';
  if(B==='bushy'){for(let i=0;i<6;i++){g.beginPath();g.moveTo(-44+i*16,10);g.lineTo(-38+i*16,-14-i%2*6);g.lineTo(-28+i*16,8);g.fill();}g.fillRect(-46,-2,92,12);}
  else if(B==='thin'){g.lineWidth=5;g.beginPath();g.moveTo(-34,6);g.quadraticCurveTo(0,-12,36,0);g.stroke();}
  else if(B==='straight'){g.beginPath();g.moveTo(-42,-2);g.lineTo(44,-6);g.lineTo(44,6);g.lineTo(-42,10);g.closePath();g.fill();}
  else if(B==='curl'){g.lineWidth=8;g.beginPath();g.moveTo(-40,6);g.quadraticCurveTo(0,-10,34,-4);g.stroke();g.lineWidth=5;g.beginPath();g.arc(34,6,10,-Math.PI/2,Math.PI*1.3);g.stroke();}
  else{g.beginPath();g.moveTo(-44,6*s.browW);g.quadraticCurveTo(0,-13*s.browW,48,-4);g.quadraticCurveTo(10,-1*s.browW,-44,14*s.browW);g.closePath();g.fill();}
  g.restore();
}
function drawMouth(g,s,name){
  // Keep the lower lip within the face plate even for a shout or an oversized grin.
  const extent=name==='shout'?49:name==='grin'?30*s.grinH:28;
  const x=CW/2+s.mouthX,y=Math.min(CH*(.83+s.mouthY),CH-extent*1.6-14);g.save();g.translate(x,y);g.scale(1.7*s.mouthW,1.6);g.lineCap='round';g.lineJoin='round';g.strokeStyle='#5a1e1e';g.lineWidth=4;
  const dark='#3a1010',tongue='#e8707a';
  const open=(w,h,teeth=true,ton=true)=>{
    const shape=()=>{g.beginPath();g.moveTo(-w,-h*.2);g.quadraticCurveTo(0,-h*.43,w,-h*.2);g.bezierCurveTo(w*.87,h*.32,w*.6,h*.96,0,h);g.bezierCurveTo(-w*.6,h*.96,-w*.87,h*.32,-w,-h*.2);g.closePath();};
    const cavity=g.createLinearGradient(0,-h*.3,0,h);cavity.addColorStop(0,'#351822');cavity.addColorStop(.7,'#782c3b');cavity.addColorStop(1,'#ac4752');
    shape();g.fillStyle=cavity;g.fill();g.save();g.clip();
    if(teeth&&s.teeth==='shark'){g.fillStyle='#fff';g.beginPath();g.moveTo(-w*.9,-h*.22);for(let i=0;i<=8;i++){const xx=-w*.9+i*w*.225;g.lineTo(xx,-h*.3);g.lineTo(xx+w*.11,h*.12);}g.lineTo(w*.9,-h*.22);g.fill();
      g.beginPath();g.moveTo(-w*.6,h*.9);for(let i=0;i<=5;i++){const xx=-w*.6+i*w*.24;g.lineTo(xx,h*.95);g.lineTo(xx+w*.12,h*.55);}g.fill();}
    else if(teeth&&s.teeth==='buck'){g.fillStyle='#fff';rr(g,-w*.28,-h*.28,w*.56,h*.5,4);g.fill();g.strokeStyle='#caa';g.lineWidth=2;g.beginPath();g.moveTo(0,-h*.28);g.lineTo(0,h*.22);g.stroke();}
    else if(teeth){g.fillStyle='#fff7e6';g.beginPath();g.moveTo(-w,-h*.24);g.quadraticCurveTo(0,-h*.5,w,-h*.24);g.lineTo(w*.84,h*.02);g.quadraticCurveTo(0,-h*.14,-w*.84,h*.02);g.fill();}
    if(ton){g.fillStyle=tongue;g.beginPath();g.ellipse(0,h*.85,w*.62,h*.38,0,0,Math.PI*2);g.fill();}
    if(teeth&&s.teeth==='normal'&&name==='shout'){g.fillStyle='#f1eadc';g.beginPath();g.moveTo(-w*.78,h*.5);g.quadraticCurveTo(0,h*.95,w*.78,h*.5);g.lineTo(w*.78,h*1.1);g.lineTo(-w*.78,h*1.1);g.closePath();g.fill();}
    g.restore();shape();g.stroke();
  };
  switch(name){
    case 'grin':open(46*s.grinW,30*s.grinH);if(s.grinLines){g.lineWidth=4;g.strokeStyle='#5a1e1e';for(const sd of [-1,1]){g.beginPath();g.moveTo(sd*46*s.grinW,-10);g.quadraticCurveTo(sd*58*s.grinW,-2,sd*54*s.grinW,10);g.stroke();}}break;
    case 'open':open(26,24);break;
    case 'shout':open(70,49);break;
    case 'tongue':open(22,18,false,false);g.fillStyle=tongue;g.beginPath();g.ellipse(4,24,12,16,0,0,Math.PI*2);g.fill();break;
    case 'o':g.fillStyle=dark;g.beginPath();g.ellipse(0,4,11,15,0,0,Math.PI*2);g.fill();break;
    case 'grit':
      g.fillStyle='#fff8e9';g.beginPath();g.moveTo(-43,1);g.quadraticCurveTo(-18,-18,40,-14);g.lineTo(46,10);g.quadraticCurveTo(4,17,-43,13);g.closePath();g.fill();g.lineWidth=3;g.stroke();
      g.strokeStyle='#b59b83';g.lineWidth=1.8;g.beginPath();g.moveTo(-41,7);g.quadraticCurveTo(0,0,43,-1);g.stroke();break;
    case 'frown':g.beginPath();g.moveTo(-22,8);g.quadraticCurveTo(0,-8,22,8);g.stroke();break;
    case 'flat':g.beginPath();g.moveTo(-20,0);g.lineTo(18,-1);g.stroke();break;
    case 'smirk':g.beginPath();g.moveTo(-20,-2);g.quadraticCurveTo(6,8,26,-8);g.stroke();break;
    case 'cat':g.beginPath();g.moveTo(-22,-2);g.quadraticCurveTo(-11,10,0,-2);g.quadraticCurveTo(11,10,22,-2);g.stroke();break;
    default:g.beginPath();g.moveTo(-24,-4);g.quadraticCurveTo(0,14,24,-4);g.stroke();
  }
  g.restore();
}
function paintComplexion(g){
  // Baked, translucent planes sit under the expression: warm temples, cheekbones,
  // and a light nose bridge. Edges fade to the actual head material rather than a mask.
  g.save();
  for(const side of [-1,1]){
    const shade=g.createRadialGradient(CW/2+side*209,CH*.65,12,CW/2+side*209,CH*.65,117);
    shade.addColorStop(0,'rgba(121,59,40,.19)');shade.addColorStop(.7,'rgba(155,75,47,.07)');shade.addColorStop(1,'rgba(155,75,47,0)');
    g.fillStyle=shade;g.fillRect(side<0?0:CW/2,CH*.24,CW/2,CH*.76);
    g.fillStyle='rgba(255,235,190,.13)';g.beginPath();g.moveTo(CW/2+side*82,CH*.66);g.quadraticCurveTo(CW/2+side*140,CH*.64,CW/2+side*172,CH*.70);g.lineTo(CW/2+side*105,CH*.74);g.closePath();g.fill();
  }
  const bridge=g.createLinearGradient(CW/2-20,0,CW/2+22,0);bridge.addColorStop(0,'rgba(255,236,205,0)');bridge.addColorStop(.42,'rgba(255,239,200,.22)');bridge.addColorStop(.65,'rgba(150,75,45,.1)');bridge.addColorStop(1,'rgba(150,75,45,0)');
  g.fillStyle=bridge;g.beginPath();g.moveTo(CW/2-10,CH*.47);g.lineTo(CW/2+9,CH*.47);g.lineTo(CW/2+22,CH*.71);g.lineTo(CW/2-20,CH*.71);g.closePath();g.fill();
  // Complexion is a decal, not a second skin patch. Fade its alpha before
  // painting the eyes/mouth so the face-plate border cannot become a hard mask.
  g.globalCompositeOperation='destination-in';
  const across=g.createLinearGradient(0,0,CW,0);
  across.addColorStop(0,'rgba(255,255,255,0)');across.addColorStop(.16,'#fff');across.addColorStop(.84,'#fff');across.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=across;g.fillRect(0,0,CW,CH);
  const down=g.createLinearGradient(0,0,0,CH);
  down.addColorStop(0,'rgba(255,255,255,0)');down.addColorStop(.18,'#fff');down.addColorStop(.86,'#fff');down.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=down;g.fillRect(0,0,CW,CH);g.restore();
}
function paintFace(g,s,st){
  g.clearRect(0,0,CW,CH);
  paintComplexion(g);
  if(s.blush||st.flush){g.fillStyle=st.flush?'rgba(255,70,70,.45)':'rgba(255,120,130,.32)';for(const side of [-1,1]){g.beginPath();g.ellipse(CW/2+side*120*s.spread,CH*.7,36,15,0,0,Math.PI*2);g.fill();}}
  for(const [x,y] of s.freckles)for(const side of [-1,1]){g.fillStyle='rgba(150,80,50,.7)';g.beginPath();g.arc(CW/2+side*(x*s.spread),CH*y,3.2,0,Math.PI*2);g.fill();}
  for(const side of [-1,1])if(s.hideSide!==side){drawEye(g,s,side,st);drawBrow(g,s,side,st);}
  // nose: a small shading stroke
  const nY=CH*(.665+s.eyeY*.5);g.lineCap='round';
  if(s.nose==='broad'){g.strokeStyle='rgba(110,50,40,.8)';g.lineWidth=5;g.beginPath();g.moveTo(CW/2-22,nY+8);g.quadraticCurveTo(CW/2,nY+20,CW/2+22,nY+8);g.stroke();g.fillStyle='rgba(90,40,30,.8)';for(const sd of [-1,1]){g.beginPath();g.ellipse(CW/2+sd*11,nY+8,5,3.5,0,0,Math.PI*2);g.fill();}}
  else if(s.nose==='line'){g.strokeStyle='rgba(110,55,45,.75)';g.lineWidth=4;g.beginPath();g.moveTo(CW/2+8,nY-38);g.lineTo(CW/2+12,nY+2);g.lineTo(CW/2-2,nY+8);g.stroke();}
  else if(s.nose==='hook'){g.strokeStyle='rgba(110,55,45,.8)';g.lineWidth=4;g.beginPath();g.moveTo(CW/2+2,nY-20);g.quadraticCurveTo(CW/2+18,nY+2,CW/2,nY+8);g.stroke();}
  else if(s.nose==='button'){g.fillStyle='rgba(230,120,110,.55)';g.beginPath();g.ellipse(CW/2,nY+2,9,6,0,0,Math.PI*2);g.fill();}
  else if(s.nose!=='none'){g.strokeStyle='rgba(120,60,50,.7)';g.lineWidth=4;g.beginPath();g.moveTo(CW/2+4,nY-2);g.lineTo(CW/2-7,nY+4);g.stroke();}
  if(s.cheekLines){g.strokeStyle='rgba(100,45,35,.55)';g.lineWidth=3;for(const sd of [-1,1]){g.beginPath();g.moveTo(CW/2+sd*70,nY+26);g.quadraticCurveTo(CW/2+sd*82,nY+48,CW/2+sd*76,nY+70);g.stroke();}}
  if(s.stubble){g.fillStyle='rgba(50,45,60,.5)';for(let i=0;i<46;i++){const a=Math.PI*(.12+i/46*.76),r=96+(i%3)*9;g.beginPath();g.arc(CW/2+Math.cos(a)*r,CH*.8+Math.sin(a)*r*.42,2.2,0,Math.PI*2);g.fill();}}
  if(s.goatee){g.fillStyle=s.brow;g.beginPath();g.moveTo(CW/2-14,CH*.965);g.lineTo(CW/2+14,CH*.965);g.lineTo(CW/2+4,CH*1.02);g.lineTo(CW/2-4,CH*1.02);g.fill();}
  if(s.mole){g.fillStyle='#3a2020';g.beginPath();g.arc(CW/2+76,CH*.84,4,0,Math.PI*2);g.fill();}
  if(s.scar){g.strokeStyle='#b0504a';g.lineWidth=4;g.beginPath();g.moveTo(CW/2-150,CH*.72);g.lineTo(CW/2-112,CH*.82);g.moveTo(CW/2-146,CH*.8);g.lineTo(CW/2-120,CH*.74);g.stroke();}
  if(s.plaster){g.save();g.translate(CW/2+120,CH*.63);g.rotate(-.4);g.fillStyle='#f4e2c0';rr(g,-26,-9,52,18,6);g.fill();g.strokeStyle='#c8aa80';g.lineWidth=2;g.stroke();g.restore();}
  drawMouth(g,s,st.mouth);
  if(st.sweat){g.fillStyle='#8fd8ff';g.strokeStyle='#2a6a9a';g.lineWidth=3;g.beginPath();g.moveTo(CW/2+170,CH*.2);g.quadraticCurveTo(CW/2+190,CH*.3,CW/2+170,CH*.33);g.quadraticCurveTo(CW/2+150,CH*.3,CW/2+170,CH*.2);g.fill();g.stroke();}
  if(st.vein){g.strokeStyle='#e0352c';g.lineWidth=6;g.lineCap='round';g.save();g.translate(CW/2-150,CH*.12);for(const r of [0,Math.PI/2,Math.PI,Math.PI*1.5]){g.save();g.rotate(r+.4);g.beginPath();g.moveTo(5,5);g.quadraticCurveTo(14,4,18,14);g.stroke();g.restore();}g.restore();}
}

// Builds head, ears and face plate in head space (parent is the head group) and returns the face controller.
export function makeHead(parent,c,opts={}){
  const R=HEAD_R,HY=opts.hy??2.28,jaw=opts.jaw??1;
  const shape={chin:opts.chin??1,square:opts.square??0,cheek:opts.cheek??1};const head=mesh(headGeometry(R,jaw,shape),c.skin,parent,0,HY,.02);head.material=skinMat(c.skin);
  parent.headShape={jaw,shape};
  // A small actual bridge and tip give the painted anime face a readable profile.
  // The gunner already has a separate long nose in its costume builder.
  if(opts.noseStyle!=='none'){
    const nose=new THREE.BufferGeometry();const broad=opts.noseStyle==='broad',w=broad?.072:.043,tip=opts.noseStyle==='hook'?.52:.487;
    // Keep the base above the expanded shout; the old bridge crossed the teeth.
    nose.setAttribute('position',new THREE.Float32BufferAttribute([0,HY+.01,.45,-w,HY-.145,.425,0,HY-.11,tip,w,HY-.145,.425,0,HY-.15,.425],3));
    nose.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);nose.computeVertexNormals();
    const n=new THREE.Mesh(nose,skinMat(c.skin));n.userData.noInk=true;n.userData.facialNose=true;parent.add(n);
  }
  for(const side of [-1,1]){const ear=mesh(new THREE.SphereGeometry(.085,10,8),c.skin,parent,side*R*.93,HY-.03,-.03);ear.material=skinMat(c.skin);ear.scale.set(.55,1,.8);}
  const s={skin:c.skin,iris0:opts.iris0||'#140f18',iris1:opts.iris||'#3a2a20',iris2:opts.irisLow||'#9a6a3a',brow:opts.browColor||c.hair,
    eye:opts.eye??1,spread:opts.spread??1,browW:opts.brow??1,lash:opts.lash||'thin',blush:!!opts.cute,freckles:opts.freckles||[],scar:!!opts.scar,plaster:!!opts.plaster,hideSide:opts.hideSide||0,eyeStyle:opts.eyeStyle||'sharp',browStyle:opts.browStyle||'normal',nose:opts.noseStyle||'dot',teeth:opts.teeth||'normal',eyeY:opts.eyeY??0,mouthX:opts.mouthX??0,mouthY:opts.mouthY??0,mouthW:opts.mouthW??1,grinW:opts.grinW??1,grinH:opts.grinH??1,grinLines:!!opts.grinLines,cheekLines:!!opts.cheekLines,stubble:!!opts.stubble,goatee:!!opts.goatee,mole:!!opts.mole};
  const canvas=document.createElement('canvas');canvas.width=CW;canvas.height=CH;const g=canvas.getContext('2d');
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const plateGeo=facePlateGeometry(R,jaw,shape);
  const plateMat=new THREE.MeshToonMaterial({map:tex,gradientMap:SKIN_RAMP,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const plate=new THREE.Mesh(plateGeo,plateMat);plate.position.set(0,HY,.02);plate.userData.noInk=true;plate.renderOrder=2;parent.add(plate);
  // state flags kept for game code and tests: one mouth visible, eye shape flags per eye
  const mouths={};for(const n of ['smile','grin','flat','smirk','open','shout','grit','o','frown','tongue','cat'])mouths[n]={visible:false};
  const flag=()=>({visible:false});
  const eyes=[-1,1].map(side=>({side,white:flag(),happy:flag(),hurt:flag(),ko:flag(),daze:flag()}));
  const state={lid:0,tilt:0,raise:0,gx:0,gy:0,eyes:'open',mouth:null,sweat:false,vein:false,key:''};
  let t=0;
  function update(target,dt){
    t+=dt;const k=1-Math.exp(-dt*18);
    for(const f of ['tilt','raise','gx','gy'])state[f]+=(target[f]-state[f])*k;
    state.lid=target.lid;state.eyes=target.eyes;state.sweat=!!target.sweat;state.vein=!!target.vein;
    if(state.mouth!==target.mouth){for(const m of Object.values(mouths))m.visible=false;(mouths[target.mouth]||mouths.smile).visible=true;state.mouth=mouths[target.mouth]?target.mouth:'smile';}
    for(const e of eyes){e.white.visible=['open','wide','daze'].includes(target.eyes);for(const n of ['happy','hurt','ko','daze'])e[n].visible=target.eyes===n;}
    // repaint only when something visible changed (values are quantised so small drift does not repaint)
    const lidQ=target.eyes==='open'||target.eyes==='wide'?Math.round(Math.min(1,state.lid)*4)/4:0;
    const eyesKey=lidQ>=1?'closed':target.eyes;
    const key=[eyesKey,lidQ,Math.round(state.tilt*4),Math.round(state.raise*3),Math.round(state.gx*2),Math.round(state.gy*2),state.mouth,state.sweat,state.vein,!!target.flush,eyesKey==='daze'?Math.floor(t*8):0].join('|');
    if(key!==state.key){state.key=key;paintFace(g,s,{eyes:eyesKey,lid:lidQ>=1?0:lidQ,tilt:Math.round(state.tilt*4)/4,raise:Math.round(state.raise*3)/3,gx:Math.round(state.gx*2)/2,gy:Math.round(state.gy*2)/2,mouth:state.mouth,sweat:state.sweat,vein:state.vein,flush:!!target.flush,t:Math.floor(t*8)*.6});tex.needsUpdate=true;}
  }
  return {head,plate,eyes,mouths,update,state,dispose(){tex.dispose();plateMat.dispose();plateGeo.dispose();}};
}
