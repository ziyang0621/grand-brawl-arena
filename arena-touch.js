// Touch controls: a virtual stick plus action buttons that drive the same `keys` set and action() as the keyboard.
const DEAD_ZONE=.28,DOUBLE_TAP_MS=260,TAP_MS=220;
export const TOUCH_BUTTONS=[
  {code:'KeyK',label:'弹',name:'bomb'},{code:'KeyI',label:'抓',name:'grab'},{code:'KeyU',label:'重',name:'heavy'},
  {code:'KeyL',label:'技',name:'skill'},{code:'KeyJ',label:'攻',name:'attack',main:true},{code:'Space',label:'跳',name:'jump'},
  {code:'KeyR',label:'防',name:'guard',hold:true},{code:'ShiftLeft',label:'闪',name:'dodge',hold:true},{code:'KeyQ',label:'瞄',name:'aim'}
];
// Stick offset (dx,dy in px, radius in px) -> movement key codes; 8 directions, diagonals inside a 45° window.
export function stickToKeys(dx,dy,radius){
  const dist=Math.hypot(dx,dy);
  if(!radius||dist<radius*DEAD_ZONE)return [];
  const a=Math.atan2(dy,dx),out=[];
  if(Math.cos(a)>.38)out.push('KeyD');else if(Math.cos(a)<-.38)out.push('KeyA');
  if(Math.sin(a)>.38)out.push('KeyS');else if(Math.sin(a)<-.38)out.push('KeyW');
  return out;
}
// Tap-then-hold on the stick = run, mirroring the keyboard's double-tap. Times come from event timestamps.
export function createSprintDetector(doubleTapMs=DOUBLE_TAP_MS,tapMs=TAP_MS){
  let lastTapEnd=0,downAt=0,armed=false,moved=false;
  return {
    down(t){downAt=t;moved=false;armed=lastTapEnd>0&&t-lastTapEnd<doubleTapMs;},
    // Returns true once, on the first direction after an armed press.
    direction(has){if(!has||moved)return false;moved=true;const fire=armed;armed=false;return fire;},
    up(t){lastTapEnd=!moved&&t-downAt<tapMs?t:0;armed=false;}
  };
}
export function isTouchDevice(win=globalThis){
  try{if(new URLSearchParams(win.location?.search).has('touch'))return true;}catch{}
  return Boolean(win.matchMedia?.('(pointer:coarse)').matches)||'ontouchstart' in win;
}
export function createTouchControls({keys,action,unlock,doc=document}){
  const root=doc.createElement('div');root.id='touchPad';root.setAttribute('aria-label','触控操作');
  root.innerHTML='<div class="stick" id="touchStick"><i class="knob"></i></div><div class="btns"></div>';
  const stick=root.querySelector('.stick'),knob=root.querySelector('.knob'),btns=root.querySelector('.btns');
  doc.body.append(root);doc.body.classList.add('touch');
  let held=new Set(),stickId=null,origin=null,radius=1,sprint=createSprintDetector();
  const setKeys=next=>{for(const c of held)if(!next.includes(c))keys.delete(c);for(const c of next)keys.add(c);held=new Set(next);};
  const place=(dx,dy)=>{const d=Math.hypot(dx,dy),k=d>radius?radius/d:1;knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;};
  const update=e=>{
    const dx=e.clientX-origin.x,dy=e.clientY-origin.y,next=stickToKeys(dx,dy,radius);
    place(dx,dy);
    if(sprint.direction(next.length>0))action('Sprint');
    setKeys(next);
  };
  stick.addEventListener('pointerdown',e=>{
    if(stickId!==null)return;e.preventDefault();unlock?.();
    stickId=e.pointerId;stick.setPointerCapture?.(e.pointerId);
    const r=stick.getBoundingClientRect();origin={x:r.left+r.width/2,y:r.top+r.height/2};radius=r.width/2*.8;
    sprint.down(e.timeStamp);stick.classList.add('active');update(e);
  });
  stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId){e.preventDefault();update(e);}});
  const endStick=e=>{
    if(e.pointerId!==stickId)return;stickId=null;setKeys([]);knob.style.transform='';stick.classList.remove('active');
    sprint.up(e.timeStamp);
  };
  stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  const pressed=new Map();
  for(const b of TOUCH_BUTTONS){
    const el=doc.createElement('button');el.type='button';el.className='tbtn'+(b.main?' main':'')+' '+b.name;el.textContent=b.label;el.dataset.code=b.code;el.setAttribute('aria-label',b.name);btns.append(el);
    el.addEventListener('pointerdown',e=>{
      e.preventDefault();unlock?.();el.setPointerCapture?.(e.pointerId);pressed.set(e.pointerId,b);el.classList.add('down');
      if(b.hold)keys.add(b.code);
      action(b.code);
    });
    const up=e=>{if(!pressed.delete(e.pointerId))return;el.classList.remove('down');if(b.hold&&![...pressed.values()].includes(b))keys.delete(b.code);};
    el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
    el.addEventListener('contextmenu',e=>e.preventDefault());
  }
  return {root,release(){setKeys([]);knob.style.transform='';stickId=null;for(const b of TOUCH_BUTTONS)if(b.hold)keys.delete(b.code);pressed.clear();for(const el of btns.children)el.classList.remove('down');}};
}
