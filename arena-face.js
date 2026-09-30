// Anime heads the way PS2-era brawlers built them: a sculpted head with a tapered chin, the face (eyes,
// brows, mouth, blush, marks) painted onto a canvas texture that wraps the front of the head, and hair
// made of big tapered locks that follow the skull instead of cones stuck on a ball.
// The face is repainted only when the expression changes, on one canvas per fighter.
import * as THREE from './vendor/three.module.js';
import {mesh} from './arena-gfx.js';

export const HEAD_R=.45;
// Skin gets a gentler ramp than the rest of the scene so faces stay clean instead of banded.
const SKIN_RAMP=new THREE.DataTexture(new Uint8Array([206,190,204,255, 238,230,236,255, 255,252,248,255]),3,1,THREE.RGBAFormat);
SKIN_RAMP.minFilter=SKIN_RAMP.magFilter=THREE.NearestFilter;SKIN_RAMP.generateMipmaps=false;SKIN_RAMP.needsUpdate=true;
const skinMats=new Map();
function skinMat(color){if(!skinMats.has(color))skinMats.set(color,new THREE.MeshToonMaterial({color,gradientMap:SKIN_RAMP}));return skinMats.get(color);}
// Hair shell: covers crown, sides and back; the lower front folds away so it never shows through the cheeks.
export function hairShellGeometry(R){
  const g=new THREE.SphereGeometry(R,28,20),p=g.attributes.position,v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const ny=v.y/R,nz=v.z/R;
    if(nz>-.1){const k=THREE.MathUtils.smoothstep(-ny,-.35,.25);v.z-=(v.z+.1*R)*k*.95;v.x*=1-.08*k;}
    p.setXYZ(i,v.x,v.y,v.z);}
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
    const sq=square*THREE.MathUtils.smoothstep(-ny,.35,.9);let x=nx*(1-.36*low*jaw*(1-square*.55))*(ny>-.35&&ny<.1?cheek:1),z=nz*(1-.1*low),y=ny*(ny<0?1.16*chin*(1-sq*.12):1.02);
    if(nz>0)z+=.1*low*nz;                                       // chin comes forward a little
    if(nz>.2&&ny>-.3&&ny<.35)z*=.96;                            // flatter face so painted eyes read
    p.setXYZ(i,x*R,y*R,z*R);
  }
  geo.computeVertexNormals();return geo;
}
export function headGeometry(R=HEAD_R,jaw=1,shape={}){return sculpt(new THREE.SphereGeometry(R,40,30),R,jaw,shape);}

// ---- tapered hair lock: a tube along a curve whose radius shrinks to a point and that lies flat on the head ----
export function lockGeometry(points,r0,r1=0,{flat=.55,center=new THREE.Vector3(),seg=18,radial=8}={}){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const g=new THREE.TubeGeometry(curve,seg,1,radial,false),pos=g.attributes.position,v=new THREE.Vector3(),out=new THREE.Vector3();
  for(let i=0;i<=seg;i++){
    const t=i/seg,P=curve.getPointAt(t),r=THREE.MathUtils.lerp(r0,r1,Math.pow(t,.85))*(t<.08?.7+t/.08*.3:1);
    out.copy(P).sub(center).normalize();
    for(let j=0;j<=radial;j++){
      const k=i*(radial+1)+j;v.fromBufferAttribute(pos,k).sub(P);
      const along=v.dot(out);v.addScaledVector(out,along*(flat-1));        // squash the thickness that points away from the skull
      v.multiplyScalar(r).add(P);pos.setXYZ(k,v.x,v.y,v.z);
    }
  }
  g.computeVertexNormals();return g;
}
// A lock that can swing: its group sits at the root so sway rotates it around where it grows.
export function lock(parent,color,points,r0,r1=0,opts={}){
  const g=new THREE.Group();g.position.set(...points[0]);parent.add(g);
  const local=points.map(p=>[p[0]-points[0][0],p[1]-points[0][1],p[2]-points[0][2]]);
  const c=opts.center||new THREE.Vector3(0,opts.cy??0,0);
  mesh(lockGeometry(local,r0,r1,{...opts,center:c.clone().sub(new THREE.Vector3(...points[0]))}),color,g,0,0,0);
  return g;
}

// ---- painting ----
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
const LINE='#1a1414';
// Eye styles: each face has its own eye, not just a different colour.
//  h: height vs width, iris: iris size, pupil: pupil size, slant: outer corner tilt, lid: resting lid,
//  top: how flat the upper lid is, lash: lash-line weight, flick: lash sweep past the corner, shine: highlights
const EYES={
  sharp:{w:78,h:.62,iris:.8,pupil:.55,slant:.28,lid:.12,top:.7,lash:11,flick:.3,shine:1},     // hot-headed swordsman: narrow, slanted, intense
  stern:{w:70,h:.55,iris:.7,pupil:.5,slant:-.04,lid:.22,top:.95,lash:9,flick:.05,shine:1},    // guardian: level, heavy-lidded, serious
  fierce:{w:74,h:.78,iris:.42,pupil:.9,slant:.18,lid:0,top:.4,lash:10,flick:.1,shine:0},      // brawler: small pupils in a big white, wild
  round:{w:70,h:1.05,iris:.78,pupil:.5,slant:-.08,lid:0,top:.1,lash:7,flick:0,shine:2},       // gunner: big round goofy eyes
  cool:{w:76,h:.58,iris:.72,pupil:.45,slant:.1,lid:.38,top:.9,lash:8,flick:.35,shine:1},      // cook: half-lidded and cool
  cute:{w:80,h:1.18,iris:.9,pupil:.42,slant:-.12,lid:0,top:.3,lash:10,flick:.45,shine:3}      // storm caller: tall sparkly eyes
};
function drawEye(g,s,side,st){
  const E0=EYES[s.eyeStyle]||EYES.sharp,w=E0.w*s.eye,h=w*E0.h;
  const cx=CW/2+side*98*s.spread,cy=CH*(.5+s.eyeY);
  g.save();g.translate(cx,cy);g.scale(side,1);g.rotate(-E0.slant*.5);  // draw the right eye, mirror for the left
  g.lineCap='round';g.lineJoin='round';
  const E=st.eyes,lw=E0.lash;
  if(E==='happy'){g.lineWidth=lw;g.strokeStyle=LINE;g.beginPath();g.arc(0,h*.2,w*.48,Math.PI*1.1,Math.PI*1.9);g.stroke();g.restore();return;}
  if(E==='hurt'){g.lineWidth=lw;g.strokeStyle=LINE;g.beginPath();g.moveTo(-w*.45,-h*.4);g.lineTo(w*.35,0);g.lineTo(-w*.45,h*.4);g.stroke();g.restore();return;}
  if(E==='ko'){g.lineWidth=lw;g.strokeStyle=LINE;g.beginPath();g.moveTo(-w*.4,-h*.45);g.lineTo(w*.4,h*.45);g.moveTo(w*.4,-h*.45);g.lineTo(-w*.4,h*.45);g.stroke();g.restore();return;}
  if(E==='closed'){g.lineWidth=lw*.85;g.strokeStyle=LINE;g.beginPath();g.moveTo(-w*.5,2);g.quadraticCurveTo(0,h*.3,w*.55,-2);g.stroke();g.restore();return;}
  const top=-h*.62*(1-E0.top*.35),rest=Math.max(E0.lid,st.lid);
  const shape=()=>{g.beginPath();g.moveTo(-w*.5,-h*.04);g.bezierCurveTo(-w*.42,top-(1-E0.top)*h*.3,w*.35,top-(1-E0.top)*h*.3,w*.6,-h*.2);g.bezierCurveTo(w*.52,h*.5,-w*.2,h*.62,-w*.5,-h*.04);g.closePath();};
  shape();g.fillStyle='#ffffff';g.fill();
  g.save();shape();g.clip();
  if(E==='daze'){g.lineWidth=5;g.strokeStyle=LINE;g.beginPath();for(let a=0;a<Math.PI*5;a+=.2){const r=a*2.6;g.lineTo(Math.cos(a+st.t)*r,Math.sin(a+st.t)*r*.9);}g.stroke();}
  else{
    const ir=(E==='wide'?.62:1)*E0.iris,ix=st.gx*w*.18*side+w*.02,iy=h*.06-st.gy*h*.08;
    const grad=g.createLinearGradient(0,iy-h*.5,0,iy+h*.5);grad.addColorStop(0,s.iris0);grad.addColorStop(.5,s.iris1);grad.addColorStop(1,s.iris2);
    g.fillStyle=grad;g.beginPath();g.ellipse(ix,iy,w*.34*ir,h*.52*ir,0,0,Math.PI*2);g.fill();
    g.strokeStyle=s.iris0;g.lineWidth=3;g.stroke();
    g.fillStyle='#120e10';g.beginPath();g.ellipse(ix,iy+h*.02,w*.34*ir*E0.pupil,h*.52*ir*E0.pupil,0,0,Math.PI*2);g.fill();
    g.fillStyle='#ffffff';
    if(E0.shine>=1){g.beginPath();g.ellipse(ix-w*.1*ir,iy-h*.2*ir,w*.09,h*.11,0,0,Math.PI*2);g.fill();}
    if(E0.shine>=2){g.beginPath();g.arc(ix+w*.1*ir,iy+h*.22*ir,w*.045,0,Math.PI*2);g.fill();}
    if(E0.shine>=3){g.beginPath();g.arc(ix+w*.12*ir,iy-h*.24*ir,w*.03,0,Math.PI*2);g.fill();g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(ix,iy+h*.26*ir,w*.2*ir,h*.1*ir,0,0,Math.PI*2);g.fill();}
    g.fillStyle='rgba(110,100,150,.35)';g.fillRect(-w,-h,w*2,h*.5+top*.2);
    if(rest>0){g.fillStyle=s.skin;g.fillRect(-w,-h*1.2,w*2,h*.62+top*.5+rest*h*1.05);}
  }
  g.restore();
  // lash line and lower lid
  const lidY=top*.85+rest*h*1.05;
  g.strokeStyle=LINE;g.fillStyle=LINE;g.lineWidth=lw;
  g.beginPath();g.moveTo(-w*.52,-h*.02+rest*h*.3);g.bezierCurveTo(-w*.35,lidY-h*.05,w*.3,lidY-h*.05,w*.62,-h*.2+rest*h*.4);g.stroke();
  if(E0.flick>0){g.beginPath();g.moveTo(w*.55,-h*.18+rest*h*.4);g.lineTo(w*(.62+E0.flick*.4),-h*(.2+E0.flick*.6)+rest*h*.4);g.lineWidth=lw*.7;g.stroke();}
  if(s.lash==='long'){g.lineWidth=5;for(const [a,b] of [[.62,.35],[.72,.12]]){g.beginPath();g.moveTo(w*.5,lidY+h*.18);g.lineTo(w*(a+.12),lidY-h*b);g.stroke();}}
  g.lineWidth=3;g.beginPath();g.moveTo(-w*.18,h*.56);g.quadraticCurveTo(w*.15,h*.62,w*.44,h*.28);g.stroke();
  g.restore();
}
function drawBrow(g,s,side,st){
  const cx=CW/2+side*100*s.spread,cy=CH*(.27+s.eyeY)-st.raise*14+(st.eyes==='wide'?-10:0),B=s.browStyle;
  g.save();g.translate(cx,cy);g.scale(side,1);g.rotate(-st.tilt*.34+(B==='angry'?.25:B==='worried'?-.2:0));
  g.fillStyle=s.brow;g.strokeStyle=s.brow;g.lineCap='round';
  if(B==='bushy'){for(let i=0;i<6;i++){g.beginPath();g.moveTo(-44+i*16,10);g.lineTo(-38+i*16,-14-i%2*6);g.lineTo(-28+i*16,8);g.fill();}g.fillRect(-46,-2,92,12);}
  else if(B==='thin'){g.lineWidth=5;g.beginPath();g.moveTo(-34,6);g.quadraticCurveTo(0,-12,36,0);g.stroke();}
  else if(B==='straight'){g.beginPath();g.moveTo(-42,-2);g.lineTo(44,-6);g.lineTo(44,6);g.lineTo(-42,10);g.closePath();g.fill();}
  else if(B==='curl'){g.lineWidth=8;g.beginPath();g.moveTo(-40,6);g.quadraticCurveTo(0,-10,34,-4);g.stroke();g.lineWidth=5;g.beginPath();g.arc(34,6,10,-Math.PI/2,Math.PI*1.3);g.stroke();}
  else{g.beginPath();g.moveTo(-44,6*s.browW);g.quadraticCurveTo(0,-13*s.browW,48,-4);g.quadraticCurveTo(10,-1*s.browW,-44,14*s.browW);g.closePath();g.fill();}
  g.restore();
}
function drawMouth(g,s,name){
  const x=CW/2+s.mouthX,y=CH*(.86+s.mouthY);g.save();g.translate(x,y);g.scale(1.35*s.mouthW,1.35);g.lineCap='round';g.lineJoin='round';g.strokeStyle='#5a1e1e';g.lineWidth=5;
  const dark='#3a1010',tongue='#e8707a';
  const open=(w,h,teeth=true,ton=true)=>{g.fillStyle=dark;g.beginPath();g.moveTo(-w,-h*.2);g.quadraticCurveTo(0,-h*.45,w,-h*.2);g.quadraticCurveTo(w*.6,h,0,h);g.quadraticCurveTo(-w*.6,h,-w,-h*.2);g.fill();
    if(teeth&&s.teeth==='shark'){g.fillStyle='#fff';g.beginPath();g.moveTo(-w*.9,-h*.22);for(let i=0;i<=8;i++){const xx=-w*.9+i*w*.225;g.lineTo(xx,-h*.3);g.lineTo(xx+w*.11,h*.12);}g.lineTo(w*.9,-h*.22);g.fill();
      g.beginPath();g.moveTo(-w*.6,h*.9);for(let i=0;i<=5;i++){const xx=-w*.6+i*w*.24;g.lineTo(xx,h*.95);g.lineTo(xx+w*.12,h*.55);}g.fill();}
    else if(teeth&&s.teeth==='buck'){g.fillStyle='#fff';rr(g,-w*.28,-h*.28,w*.56,h*.5,4);g.fill();g.strokeStyle='#caa';g.lineWidth=2;g.beginPath();g.moveTo(0,-h*.28);g.lineTo(0,h*.22);g.stroke();}
    else if(teeth){g.fillStyle='#fff';g.beginPath();g.moveTo(-w*.85,-h*.2);g.quadraticCurveTo(0,-h*.42,w*.85,-h*.2);g.lineTo(w*.7,h*.05);g.quadraticCurveTo(0,-h*.1,-w*.7,h*.05);g.fill();}
    if(ton){g.fillStyle=tongue;g.beginPath();g.ellipse(0,h*.62,w*.45,h*.3,0,0,Math.PI*2);g.fill();}};
  switch(name){
    case 'grin':open(46*s.grinW,30*s.grinH);if(s.grinLines){g.lineWidth=4;g.strokeStyle='#5a1e1e';for(const sd of [-1,1]){g.beginPath();g.moveTo(sd*46*s.grinW,-10);g.quadraticCurveTo(sd*58*s.grinW,-2,sd*54*s.grinW,10);g.stroke();}}break;
    case 'open':open(26,24);break;
    case 'shout':open(30,42);break;
    case 'tongue':open(22,18,false,false);g.fillStyle=tongue;g.beginPath();g.ellipse(4,24,12,16,0,0,Math.PI*2);g.fill();break;
    case 'o':g.fillStyle=dark;g.beginPath();g.ellipse(0,4,11,15,0,0,Math.PI*2);g.fill();break;
    case 'grit':g.fillStyle='#fff';rr(g,-34,-12,68,26,8);g.fill();g.lineWidth=4;g.stroke();g.beginPath();for(const xx of [-17,0,17]){g.moveTo(xx,-12);g.lineTo(xx,14);}g.moveTo(-34,1);g.lineTo(34,1);g.lineWidth=2;g.stroke();break;
    case 'frown':g.beginPath();g.moveTo(-22,8);g.quadraticCurveTo(0,-8,22,8);g.stroke();break;
    case 'flat':g.beginPath();g.moveTo(-20,0);g.lineTo(18,-1);g.stroke();break;
    case 'smirk':g.beginPath();g.moveTo(-20,-2);g.quadraticCurveTo(6,8,26,-8);g.stroke();break;
    case 'cat':g.beginPath();g.moveTo(-22,-2);g.quadraticCurveTo(-11,10,0,-2);g.quadraticCurveTo(11,10,22,-2);g.stroke();break;
    default:g.beginPath();g.moveTo(-24,-4);g.quadraticCurveTo(0,14,24,-4);g.stroke();
  }
  g.restore();
}
function paintFace(g,s,st){
  g.clearRect(0,0,CW,CH);
  if(s.blush||st.flush){g.fillStyle=st.flush?'rgba(255,70,70,.45)':'rgba(255,120,130,.32)';for(const side of [-1,1]){g.beginPath();g.ellipse(CW/2+side*120*s.spread,CH*.7,36,15,0,0,Math.PI*2);g.fill();}}
  for(const [x,y] of s.freckles)for(const side of [-1,1]){g.fillStyle='rgba(150,80,50,.7)';g.beginPath();g.arc(CW/2+side*(x*s.spread),CH*y,3.2,0,Math.PI*2);g.fill();}
  for(const side of [-1,1])if(s.hideSide!==side){drawEye(g,s,side,st);drawBrow(g,s,side,st);}
  // nose: a small shading stroke
  const nY=CH*(.68+s.eyeY*.5);g.lineCap='round';
  if(s.nose==='broad'){g.strokeStyle='rgba(110,50,40,.8)';g.lineWidth=5;g.beginPath();g.moveTo(CW/2-22,nY+8);g.quadraticCurveTo(CW/2,nY+20,CW/2+22,nY+8);g.stroke();g.fillStyle='rgba(90,40,30,.8)';for(const sd of [-1,1]){g.beginPath();g.ellipse(CW/2+sd*11,nY+8,5,3.5,0,0,Math.PI*2);g.fill();}}
  else if(s.nose==='line'){g.strokeStyle='rgba(110,55,45,.75)';g.lineWidth=4;g.beginPath();g.moveTo(CW/2+8,nY-38);g.lineTo(CW/2+12,nY+2);g.lineTo(CW/2-2,nY+8);g.stroke();}
  else if(s.nose==='hook'){g.strokeStyle='rgba(110,55,45,.8)';g.lineWidth=4;g.beginPath();g.moveTo(CW/2+2,nY-20);g.quadraticCurveTo(CW/2+18,nY+2,CW/2,nY+8);g.stroke();}
  else if(s.nose==='button'){g.fillStyle='rgba(230,120,110,.55)';g.beginPath();g.ellipse(CW/2,nY+2,9,6,0,0,Math.PI*2);g.fill();}
  else if(s.nose!=='none'){g.strokeStyle='rgba(120,60,50,.7)';g.lineWidth=4;g.beginPath();g.moveTo(CW/2+4,nY-2);g.lineTo(CW/2-7,nY+4);g.stroke();}
  if(s.cheekLines){g.strokeStyle='rgba(100,45,35,.55)';g.lineWidth=3;for(const sd of [-1,1]){g.beginPath();g.moveTo(CW/2+sd*70,nY+26);g.quadraticCurveTo(CW/2+sd*82,nY+48,CW/2+sd*76,nY+70);g.stroke();}}
  if(s.stubble){g.fillStyle='rgba(50,45,60,.5)';for(let i=0;i<46;i++){const a=Math.PI*(.12+i/46*.76),r=96+(i%3)*9;g.beginPath();g.arc(CW/2+Math.cos(a)*r,CH*.8+Math.sin(a)*r*.42,2.2,0,Math.PI*2);g.fill();}}
  if(s.goatee){g.fillStyle=s.brow;g.beginPath();g.moveTo(CW/2-14,CH*.965);g.lineTo(CW/2+14,CH*.965);g.lineTo(CW/2+4,CH*1.02);g.lineTo(CW/2-4,CH*1.02);g.fill();}
  if(s.mole){g.fillStyle='#3a2020';g.beginPath();g.arc(CW/2+76,CH*.84,4,0,Math.PI*2);g.fill();}
  if(s.scar){g.strokeStyle='#b0504a';g.lineWidth=4;g.beginPath();g.moveTo(CW/2-150,CH*.58);g.lineTo(CW/2-110,CH*.7);g.moveTo(CW/2-146,CH*.66);g.lineTo(CW/2-120,CH*.6);g.stroke();}
  if(s.plaster){g.save();g.translate(CW/2+120,CH*.63);g.rotate(-.4);g.fillStyle='#f4e2c0';rr(g,-26,-9,52,18,6);g.fill();g.strokeStyle='#c8aa80';g.lineWidth=2;g.stroke();g.restore();}
  drawMouth(g,s,st.mouth);
  if(st.sweat){g.fillStyle='#8fd8ff';g.strokeStyle='#2a6a9a';g.lineWidth=3;g.beginPath();g.moveTo(CW/2+170,CH*.2);g.quadraticCurveTo(CW/2+190,CH*.3,CW/2+170,CH*.33);g.quadraticCurveTo(CW/2+150,CH*.3,CW/2+170,CH*.2);g.fill();g.stroke();}
  if(st.vein){g.strokeStyle='#e0352c';g.lineWidth=6;g.lineCap='round';g.save();g.translate(CW/2-150,CH*.12);for(const r of [0,Math.PI/2,Math.PI,Math.PI*1.5]){g.save();g.rotate(r+.4);g.beginPath();g.moveTo(5,5);g.quadraticCurveTo(14,4,18,14);g.stroke();g.restore();}g.restore();}
}

// Builds head, ears and face plate in head space (parent is the head group) and returns the face controller.
export function makeHead(parent,c,opts={}){
  const R=HEAD_R,HY=opts.hy??2.28,jaw=opts.jaw??1;
  const shape={chin:opts.chin??1,square:opts.square??0,cheek:opts.cheek??1};const head=mesh(headGeometry(R,jaw,shape),c.skin,parent,0,HY,.02);head.material=skinMat(c.skin);
  for(const side of [-1,1]){const ear=mesh(new THREE.SphereGeometry(.085,10,8),c.skin,parent,side*R*.93,HY-.03,-.03);ear.material=skinMat(c.skin);ear.scale.set(.55,1,.8);}
  const s={skin:c.skin,iris0:opts.iris0||'#140f18',iris1:opts.iris||'#3a2a20',iris2:opts.irisLow||'#9a6a3a',brow:opts.browColor||c.hair,
    eye:opts.eye??1,spread:opts.spread??1,browW:opts.brow??1,lash:opts.lash||'thin',blush:!!opts.cute,freckles:opts.freckles||[],scar:!!opts.scar,plaster:!!opts.plaster,hideSide:opts.hideSide||0,eyeStyle:opts.eyeStyle||'sharp',browStyle:opts.browStyle||'normal',nose:opts.noseStyle||'dot',teeth:opts.teeth||'normal',eyeY:opts.eyeY??0,mouthX:opts.mouthX??0,mouthY:opts.mouthY??0,mouthW:opts.mouthW??1,grinW:opts.grinW??1,grinH:opts.grinH??1,grinLines:!!opts.grinLines,cheekLines:!!opts.cheekLines,stubble:!!opts.stubble,goatee:!!opts.goatee,mole:!!opts.mole};
  const canvas=document.createElement('canvas');canvas.width=CW;canvas.height=CH;const g=canvas.getContext('2d');
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const plateGeo=sculpt(new THREE.SphereGeometry(R*1.012,32,24,Math.PI/2-PHI_W/2,PHI_W,THETA0,THETA_L),R*1.012,jaw,shape);
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
