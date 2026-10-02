// Render-only combat articulation. Shared by the game and the model study;
// never writes fighter state, collision bounds or damage timings.
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const mix=(a,b,t)=>a+(b-a)*t;
export function attackDuration(type){
  return ['heavy','slam','upper','shieldBash'].includes(type)?.5:type==='grab'?.42:type==='rush'?.4:type==='dash'?.38:type==='shot'?.32:.34;
}
export function attackPhase(p){
  const total=attackDuration(p.attackType),remaining=p.attackTime||0;
  const active=['heavy','upper','shieldBash'].includes(p.attackType)?.29:p.attackType==='slam'?.27:p.attackType==='grab'?.25:p.attackType==='rush'?.26:p.attackType==='shot'?.2:['air','dash'].includes(p.attackType)?.24:.22;
  const phase=clamp(1-remaining/total),contact=1-active/total;
  // Chamber first, extend at the simulation's contact point, then recover.
  const wind=smooth(phase/(contact*.55));
  const extension=phase<=contact?smooth((phase-contact*.55)/(contact*.45)):1-smooth((phase-contact)/(1-contact));
  return {phase,wind,extension,contact};
}
export function poseStance(m,char){
  // Shoulder / elbow angles and foot spread distinguish the six silhouettes.
  const presets={
    swordsman:[[-.35,-.2,-.62],[-.65,.15,-.45],.11],
    guardian:[[-.65,.12,-.8],[-.35,.16,-.5],.12],
    brawler:[[-.7,.22,-1.25],[-.75,-.2,-1.2],.17],
    gunner:[[-.22,-.15,-.5],[-1.1,-.1,-.38],.1],
    cook:[[-.1,-.1,-.38],[-.12,.1,-.4],.09],
    stormcaller:[[-.25,-.25,-.55],[-.8,-.1,-.4],.08],
  },[left,right,spread]=presets[char]||presets.swordsman;
  [left,right].forEach(([x,z,elbow],i)=>{m.arms[i].rotation.set(x,0,z);m.arms[i].userData.elbow.rotation.x=elbow;});
  m.legs.forEach((leg,i)=>{leg.rotation.set(i?.05:-.12,i?.06:-.06,(i?1:-1)*spread);leg.userData.knee.rotation.x=i?.09:.2;});
}
export function poseCombat(m,p,tick=0){
  const c=p.char,arms=m.arms,legs=m.legs;
  const arm=(i,x,z=0,y=0)=>arms[i].rotation.set(x,y,z);
  const elbows=(a,b)=>{arms[0].userData.elbow.rotation.x=a;arms[1].userData.elbow.rotation.x=b;};
  const knees=(a,b)=>{legs[0].userData.knee.rotation.x=a;legs[1].userData.knee.rotation.x=b;};
  m.upper?.rotation.set(0,0,0);m.head?.rotation.set(0,0,0);
  // A punch extends through rotation, never by detaching the shoulder seam.
  for(const a of arms)a.position.z=0;
  if(c==='gunner'&&m.weapon)m.weapon.rotation.set(2.9,0,0);
  if(p.attackTime>0){
    const {phase,wind,extension:e,contact}=attackPhase(p),arc=Math.sin(phase*Math.PI);
    if(m.upper){
      const windOnly=phase<contact?wind*(1-e):0,side=p.combo===1?-1:1;
      if(c==='cook'){m.upper.rotation.set(.15*e,side*(.12*e-.08*windOnly),side*.08*e);}
      else if(c==='brawler'){m.upper.rotation.set(-.08*e,side*(.28*e-.20*windOnly),0);}
      else if(p.attackType!=='shot'&&p.attackType!=='grab'){m.upper.rotation.set(-.06*e,side*(.32*e-.22*windOnly),0);}
      // Eyes remain directed at the opponent while the shoulders lead the strike.
      if(m.head)m.head.rotation.y=-m.upper.rotation.y*.7;
    }
    elbows(-.35,-.45);
    if(p.attackType==='grab'){
      arm(0,-.8-e*.7,-.2);arm(1,-.8-e*.7,.2);elbows(-.8+e*.6,-.8+e*.6);
    }else if(p.attackType==='shot'){
      arm(1,-1.5+e*.18);arm(0,-1.05,.45);elbows(-1.15,-.15-e*.15);
      if(c==='gunner'&&m.weapon)m.weapon.rotation.x=Math.PI/2-arms[1].rotation.x-arms[1].userData.elbow.rotation.x;
    }else if(c==='cook'&&['light','dash','air','rush','heavy','upper'].includes(p.attackType)){
      const k=p.combo===1?0:1,big=['heavy','upper'].includes(p.attackType);
      legs[k].rotation.x=mix(-.1,-1.1,wind)*(1-e)-(big?2.05:1.65)*e;
      legs[k].userData.knee.rotation.x=mix(.1,1.35,wind)*(1-e)+.08*e;
      legs[1-k].rotation.x=-.08;legs[1-k].userData.knee.rotation.x=.16;
      arm(0,-.45,-.45);arm(1,-.45,.45);elbows(-.65,-.8);
    }else if(c==='brawler'&&['light','rush','air','heavy','upper'].includes(p.attackType)){
      const k=p.combo===1||p.attackType==='rush'?0:1;
      arm(k,mix(-.55,-1.55,e),k?-.08:.08);
      arm(1-k,-.65,k?.25:-.25);elbows(-1.45,-1.45);
      arms[k].userData.elbow.rotation.x=mix(-1.45,-.1,e);
      if(p.attackType==='upper'){arm(k,mix(-.5,-2.2,e));arms[k].userData.elbow.rotation.x=-.8;}
    }else if(p.attackType==='slam'){
      arm(1,-2.3+arc*3.4,-.6+arc*1.4);elbows(-.8,-.9+e*.7);
    }else if(p.attackType==='shieldBash'){
      arm(0,-1.2,.25);arm(1,-.65,-.25);elbows(-.9+e*.55,-.7);
    }else{
      const big=['heavy','upper'].includes(p.attackType),swing=p.attackType==='light'&&p.combo===1?2.8:2.6;
      arm(1,-1.5+arc*(big?3.1:swing),-.8+arc*(big?2.15:1.8));
      arm(0,-.45,-.3);elbows(-.7,-.85+e*.65);
    }
  }
  if(p.skillTime>0&&!p.pendingSkill){
    if(c==='guardian'){arm(0,-1.7,.3);arm(1,-.8,-.4);elbows(-.45,-.9);}
    else if(c==='brawler'){
      const k=Math.floor(tick/8)%2,e=Math.sin((tick%8)/8*Math.PI);
      arm(k,mix(-.65,-1.55,e));arm(1-k,-.65);elbows(-1.45,-1.45);arms[k].userData.elbow.rotation.x=mix(-1.45,-.1,e);
    }else if(c==='gunner'||c==='stormcaller'){arm(0,-2.6,.2);arm(1,-2.7,-.2);elbows(-.25,-.25);}
    else if(c==='cook'){
      const k=Math.floor(tick/8)%2,e=Math.sin((tick%8)/8*Math.PI);
      legs[k].rotation.x=-1.1-e*.65;legs[k].userData.knee.rotation.x=1.25*(1-e)+.08;
      legs[1-k].rotation.x=-.08;legs[1-k].userData.knee.rotation.x=.16;
      arm(0,-.45,-.5);arm(1,-.45,.5);elbows(-.7,-.7);
    }else{arm(0,-.25,-1.2);arm(1,-.25,1.3);elbows(-.25,-.25);}
  }else if(p.blocking){
    if(c==='swordsman'){arm(0,-1.35,.35);arm(1,-1.35,-.35);elbows(-.85,-.85);}
    else if(c==='guardian'){arm(0,-1.05,.25);arm(1,-.7,-.3);elbows(-1,-.85);}
    else if(c==='brawler'){arm(0,-.85,.25);arm(1,-.85,-.25);elbows(-1.7,-1.7);}
    else if(c==='gunner'){arm(0,-1.1,.4);arm(1,-1.0,-.35);elbows(-1.1,-.65);}
    else if(c==='cook'){arm(0,-.5,-.45);arm(1,-.5,.45);elbows(-1,-1);legs[1].rotation.x=-1.5;knees(.16,1.5);}
    else{arm(0,-.55,-1.15);arm(1,-.55,1.15);elbows(-.5,-.5);}
  }
  if(p.carrying||p.grabbedTarget!=null){
    const lift=p.carrying?1:clamp((2.2-p.grabHoldTime)/.25);
    arm(0,-1.1-lift*1.55,-.18);arm(1,-1.1-lift*1.55,.18);elbows(-.45,-.45);
  }
  // The forearm can bend without turning the strapped shield into a serving tray.
  if(m.buckler)m.buckler.rotation.x=-arms[0].rotation.x-arms[0].userData.elbow.rotation.x-.12;
}
