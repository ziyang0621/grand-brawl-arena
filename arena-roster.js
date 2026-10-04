// Pure roster/stage data shared by the simulation, renderer and tests.
// Movesets follow the Grand Battle pattern: shared buttons, character-specific
// move attack (move + J), heavy variant and a three-level special.
export const CHARACTERS={
  swordsman:{quote:'这把刀还没砍够呢！下一个是谁？',name:'红帆',title:'海盗剑士',color:'#d4462f',accent:'#ffd24a',skin:'#f2c08f',hair:'#2a2a38',speed:7.6,moveAttack:'dash',skill:'whirlwind',skillName:'红帆旋风斩',
    blurb:'冲刺斩快，旋风斩可打空中',heavy:{name:'突刺',reach:3.5,arc:.55,damage:17,force:9,lunge:8},grab:{name:'擒抱',reach:1.85,damage:12,speed:1,throwDamage:4},terrain:{},boost:{dash:1.1,air:1.1}},
  guardian:{quote:'港口的秩序，由我来守护。',name:'蓝潮',title:'港口守卫',color:'#2f7fb4',accent:'#e8d38e',skin:'#e9b98a',hair:'#1e3346',speed:7.6,moveAttack:'shieldBash',skill:'shieldQuake',skillName:'蓝潮震盾',
    blurb:'盾冲破防，震盾范围大可跳避',heavy:{name:'盾剑重砸',reach:3.1,arc:-1.01,damage:17,force:11},grab:{name:'盾牌擒拿',reach:1.95,damage:11,speed:1.1,throwDamage:8},terrain:{sand:.38,pull:1.2,sandJump:.55,ice:1.15,iceAccel:5,iceFriction:.15},boost:{heavy:1.2,upper:1.2,slam:1.2,shieldBash:1.2}},
  brawler:{quote:'哈哈！拳头说话最痛快！',name:'铁拳',title:'水手拳师',color:'#2e9b57',accent:'#ff8a3c',skin:'#d99a6c',hair:'#f0e6c8',speed:7.1,moveAttack:'rush',skill:'fistStorm',skillName:'铁拳暴风连打',
    blurb:'近身连打最痛，抓投更强',heavy:{name:'上勾拳',reach:2.1,arc:.2,damage:15,force:6,launch:true,lunge:4},grab:{name:'铁拳抱摔',reach:1.8,damage:16,speed:1,throwDamage:10},terrain:{sand:.55,pull:.85,sandJump:.7,spring:1.3},boost:{light:1.15,rush:1.1,grab:1.25}},
  gunner:{quote:'瞄准完毕——百发百中！',name:'火哨',title:'炮手狙击',color:'#e0a21c',accent:'#6b3fa0',skin:'#f0c49a',hair:'#8a3b1e',speed:8,moveAttack:'shot',skill:'barrage',skillName:'火哨流星弹幕',
    blurb:'移动+J 远程射击，弹幕瞄准对手',heavy:{name:'枪托猛击',reach:2.3,arc:.1,damage:16,force:12},grab:{name:'近身击发',reach:1.9,damage:9,speed:1.4,throwDamage:7},terrain:{ice:1.4,iceAccel:2.5,iceFriction:.5},boost:{}},
};
CHARACTERS.cook={quote:'饭要好好吃，架也要好好打。',name:'灶火',title:'踢技厨师',color:'#3a3f4c',accent:'#ffcf3a',skin:'#f3c9a0',hair:'#f2d46a',speed:7.7,moveAttack:'dash',skill:'flameKick',skillName:'灶火烈焰踢',
  blurb:'脚下功夫最快，烈焰踢会点燃对手',heavy:{name:'旋风腿',reach:2.55,arc:-1.01,damage:16,force:9},grab:{name:'踢飞',reach:2.1,damage:11,speed:1.25,throwDamage:6},terrain:{sand:.58,pull:.8,sandJump:.75,iceAccel:4,iceFriction:.25},boost:{dash:1.05,air:1.05}};
CHARACTERS.stormcaller={quote:'天气预报说，你今天会倒霉。',name:'云雀',title:'气象航海士',color:'#e0507a',accent:'#ffe27a',skin:'#f6cfa6',hair:'#ff8f2a',speed:7.9,moveAttack:'shot',skill:'thunder',skillName:'云雀落雷',
  shot:{speed:13,damage:4.5,life:.7,slow:.8,style:'bolt'},
  blurb:'移动+J 放电击，落雷范围大会麻痹',heavy:{name:'长杖横扫',reach:3.4,arc:.3,damage:15,force:8},grab:{name:'电击擒拿',reach:1.85,damage:8,speed:1,throwDamage:5,shock:2},terrain:{sandJump:.8,ice:1.45,iceAccel:2.5,iceFriction:.55,spring:1.5},boost:{}};
// The select cards also name each character's own U move.
for(const c of Object.values(CHARACTERS))if(c.heavy&&!c.blurb.includes('U '))c.blurb+=` · U ${c.heavy.name}`;
export const CHARACTER_IDS=Object.keys(CHARACTERS);
// Slot colours for the 1P–4P rings, name tags and brawl HUD cards.
export const SLOT_COLORS=['#ffd24a','#5fd8ff','#ff7ac8','#8dff7a'],SLOT_LABELS=['1P','2P','3P','4P'];
// Each stage has its own decks, terrain zones and hazard pair. Ladders sit on the
// front edge of every deck, so they are derived rather than listed.
export const STAGES={
  // Each stage is its own structure: a ship's deck with a raised stern, a stepped desert ziggurat, a lopsided snow hill.
  port:{look:'ship',name:'风车港',sub:'船尾高台 · 炮击 · 巨浪 · 火药桶',wave:'巨浪',cannon:'港口炮击',waveKind:'tide',cannonKind:'cannon',
    platforms:[
      {id:'quarterdeck',x:0,z:-6.2,w:24,d:3.2,top:1.5,style:'ship',ladders:[{side:'front',at:-8},{side:'front',at:8}]},
      {id:'crows-nest',x:0,z:-6.2,w:3.6,d:2.6,top:3.5,style:'nest',ladder:false},
      {id:'cargo-left',x:-11.5,z:1.6,w:2.8,d:2.6,top:1.2,style:'crates',ladder:'right'},
      {id:'cargo-right',x:11.5,z:1.6,w:2.8,d:2.6,top:1.2,style:'crates',ladder:'left'}],
    zones:[{kind:'spring',x:-7.5,z:5.6,r:.95},{kind:'spring',x:7.5,z:5.6,r:.95}],
    crates:[[-6,3],[6,3],[0,-2.4]],
    kegs:[[-2.8,4.4],[2.8,4.4]],
    topLoot:[{deck:'crows-nest',kind:'chest'},{deck:'cargo-left',kind:'barrel'}],
    pieces:[{kind:'mast',x:-10.5,z:-1.6,r:.6,h:7,hp:70,fall:'topple',length:6.5},{kind:'mast',x:10.5,z:-1.6,r:.6,h:7,hp:70,fall:'topple',length:6.5}]},
  desert:{look:'stone',name:'沙之王都',sub:'阶梯金字塔 · 流沙 · 落石 · 沙暴 · 喷火口',wave:'沙暴',cannon:'落石',waveKind:'sandstorm',cannonKind:'rockfall',
    platforms:[
      {id:'tier-1',x:0,z:-3.6,w:7.6,d:4.4,top:1.1,style:'stone',ladders:[{side:'front',at:-2.6},{side:'front',at:2.6}]},
      {id:'tier-2',x:0,z:-4.1,w:4.8,d:3,top:2.2,style:'stone',ladder:false},
      {id:'tier-3',x:0,z:-4.5,w:2.4,d:2,top:3.4,style:'stone',ladder:false},
      {id:'ruin-tall',x:-10.8,z:-3.5,w:3.2,d:3.2,top:2.6,style:'ruin',ladder:'right'},
      {id:'ruin-low',x:10.2,z:-.5,w:3.4,d:2,top:1.3,style:'ruin',ladder:'left'}],
    zones:[{kind:'quicksand',x:-8.5,z:4,r:2.2},{kind:'quicksand',x:8,z:4.6,r:2},{kind:'quicksand',x:0,z:2.4,r:1.4}],
    vents:[{x:-5.2,z:.8,r:1.25,offset:0},{x:5.2,z:.8,r:1.25,offset:3.25}],
    crates:[[-3.5,5.5],[3.5,5.5],[-12,-.5]],
    topLoot:[{deck:'tier-3',kind:'chest'},{deck:'ruin-low',kind:'barrel'}],
    pieces:[{kind:'pillar',x:-3.8,z:-.3,r:.8,h:5,hp:90,fall:'topple',length:5.5},{kind:'pillar',x:3.8,z:-.3,r:.8,h:5,hp:90,fall:'topple',length:5.5}]},
  snow:{look:'snow',name:'冬樱雪岛',sub:'不对称雪山 · 冰湖 · 雪球 · 雪崩 · 温泉',wave:'雪崩',cannon:'滚地雪球',waveKind:'avalanche',cannonKind:'snowball',
    platforms:[
      {id:'snow-hill',x:-9.5,z:-3.6,w:7,d:5,top:2.8,style:'hill',ladder:'front',ladderAt:-1.5},
      {id:'igloo',x:8.2,z:-4.8,w:4,d:3,top:1.4,style:'igloo',ladder:'front'},
      {id:'ice-ledge',x:11.8,z:1.2,w:2.6,d:4,top:2.1,style:'ice',ladder:'left'},
      {id:'ice-step',x:2.4,z:-6.6,w:3,d:2,top:.9,style:'ice',ladder:false}],
    zones:[{kind:'ice',x:0,z:4.6,w:10,d:4},{kind:'ice',x:-8.5,z:5,w:4,d:3.4},{kind:'hotspring',x:0,z:-2.4,r:1.6}],
    crates:[[-3,-.5],[3,-.5],[0,6.8]],
    topLoot:[{deck:'snow-hill',kind:'chest',dx:-1.5},{deck:'ice-ledge',kind:'barrel'}],
    pieces:[{kind:'ice',x:-3.8,z:-.6,r:.8,h:4,hp:60,fall:'burst',length:3.3},{kind:'ice',x:3.8,z:-.6,r:.8,h:4,hp:60,fall:'burst',length:3.3}]},
  classic:{hidden:true,look:'classic',name:'风车港',sub:'弹跳网 · 炮击 · 巨浪',wave:'巨浪',cannon:'港口炮击',waveKind:'tide',cannonKind:'cannon',
    platforms:[{id:'deck-left',x:-6,z:0,w:4,d:3,top:1.6},{id:'deck-center',x:0,z:-2.2,w:4,d:3,top:2.2},{id:'deck-right',x:6,z:0,w:4,d:3,top:1.6}],
    zones:[{kind:'spring',x:-11,z:4.5,r:.95},{kind:'spring',x:11,z:4.5,r:.95}],
    crates:[[-6,3],[6,3],[0,-5]],
    pieces:[{kind:'mast',x:-9.2,z:-5.6,r:.6,h:7,hp:70,fall:'topple',length:6.5},{kind:'mast',x:9.2,z:-5.6,r:.6,h:7,hp:70,fall:'topple',length:6.5}]},
};
// Desert flame vents run on a fixed clock (a pure function of the tick), so every client agrees and nothing extra needs syncing:
// idle -> warn (glow + embers) -> erupt (flame column that burns and launches).
export const VENT_PERIOD=6.5,VENT_WARN=1.5,VENT_BURST=.9;
export function ventState(vent,tick,step=1/120){
  const clock=tick*step+(vent.offset||0),t=clock%VENT_PERIOD,cycle=Math.floor(clock/VENT_PERIOD);
  if(t<VENT_BURST)return {phase:'erupt',k:t/VENT_BURST,cycle};
  if(t>VENT_PERIOD-VENT_WARN)return {phase:'warn',k:(t-(VENT_PERIOD-VENT_WARN))/VENT_WARN,cycle};
  return {phase:'idle',k:0,cycle};
}
export function stageOf(id){return STAGES[id]||STAGES.port;}
// Each deck gets a ladder on its front by default; `ladder` picks another side or none, `ladders` lists several.
// dx/dz point from the ladder into the deck, so pushing that way climbs.
const LADDER_SIDES={front:{dx:0,dz:-1},back:{dx:0,dz:1},left:{dx:1,dz:0},right:{dx:-1,dz:0}};
export function ladderSpecs(d){return d.ladders||(d.ladder===false?[]:[{side:d.ladder||'front',at:d.ladderAt||0}]);}
export function laddersOf(stage){
  const out=[];
  for(const d of stage.platforms)for(const {side,at=0} of ladderSpecs(d)){
    const dir=LADDER_SIDES[side]||LADDER_SIDES.front;
    const x=side==='left'?d.x-d.w/2-.12:side==='right'?d.x+d.w/2+.12:d.x+at,z=side==='front'?d.z+d.d/2+.12:side==='back'?d.z-d.d/2-.12:d.z+at;
    out.push({x,z,top:d.top,dx:dir.dx,dz:dir.dz,side,deck:d.id});
  }
  return out;
}
export function zoneAt(stage,x,z){return stage.zones.find(o=>o.r?Math.hypot(x-o.x,z-o.z)<o.r:Math.abs(x-o.x)<=o.w/2&&Math.abs(z-o.z)<=o.d/2)||null;}
export const STAGE_IDS=Object.keys(STAGES).filter(id=>!STAGES[id].hidden);
export const DEFAULT_CHARS=['swordsman','guardian'];
export function characterOf(p){return CHARACTERS[p?.char]||CHARACTERS[DEFAULT_CHARS[p?.id===1?1:0]];}
