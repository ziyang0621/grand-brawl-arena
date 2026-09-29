// Pure roster/stage data shared by the simulation, renderer and tests.
// Movesets follow the Grand Battle pattern: shared buttons, character-specific
// move attack (move + J), heavy variant and a three-level special.
export const CHARACTERS={
  swordsman:{quote:'这把刀还没砍够呢！下一个是谁？',name:'红帆',title:'海盗剑士',color:'#d4462f',accent:'#ffd24a',skin:'#f2c08f',hair:'#2a2a38',speed:7.6,moveAttack:'dash',skill:'whirlwind',skillName:'红帆旋风斩',
    blurb:'冲刺斩快，旋风斩可打空中',boost:{dash:1.1,air:1.1}},
  guardian:{quote:'港口的秩序，由我来守护。',name:'蓝潮',title:'港口守卫',color:'#2f7fb4',accent:'#e8d38e',skin:'#e9b98a',hair:'#1e3346',speed:7.6,moveAttack:'shieldBash',skill:'shieldQuake',skillName:'蓝潮震盾',
    blurb:'盾冲破防，震盾范围大可跳避',boost:{heavy:1.2,upper:1.2,slam:1.2,shieldBash:1.2}},
  brawler:{quote:'哈哈！拳头说话最痛快！',name:'铁拳',title:'水手拳师',color:'#2e9b57',accent:'#ff8a3c',skin:'#d99a6c',hair:'#f0e6c8',speed:7.1,moveAttack:'rush',skill:'fistStorm',skillName:'铁拳暴风连打',
    blurb:'近身连打最痛，抓投更强',boost:{light:1.15,rush:1.1,grab:1.25}},
  gunner:{quote:'瞄准完毕——百发百中！',name:'火哨',title:'炮手狙击',color:'#e0a21c',accent:'#6b3fa0',skin:'#f0c49a',hair:'#8a3b1e',speed:8,moveAttack:'shot',skill:'barrage',skillName:'火哨流星弹幕',
    blurb:'移动+J 远程射击，弹幕瞄准对手',boost:{}},
};
CHARACTERS.cook={quote:'饭要好好吃，架也要好好打。',name:'灶火',title:'踢技厨师',color:'#3a3f4c',accent:'#ffcf3a',skin:'#f3c9a0',hair:'#f2d46a',speed:7.7,moveAttack:'dash',skill:'flameKick',skillName:'灶火烈焰踢',
  blurb:'脚下功夫最快，烈焰踢会点燃对手',boost:{dash:1.05,air:1.05}};
CHARACTERS.stormcaller={quote:'天气预报说，你今天会倒霉。',name:'云雀',title:'气象航海士',color:'#e0507a',accent:'#ffe27a',skin:'#f6cfa6',hair:'#ff8f2a',speed:7.9,moveAttack:'shot',skill:'thunder',skillName:'云雀落雷',
  shot:{speed:13,damage:4.5,life:.7,slow:.8,style:'bolt'},
  blurb:'移动+J 放电击，落雷范围大会麻痹',boost:{}};
export const CHARACTER_IDS=Object.keys(CHARACTERS);
// Slot colours for the 1P–4P rings, name tags and brawl HUD cards.
export const SLOT_COLORS=['#ffd24a','#5fd8ff','#ff7ac8','#8dff7a'],SLOT_LABELS=['1P','2P','3P','4P'];
// Each stage has its own decks, terrain zones and hazard pair. Ladders sit on the
// front edge of every deck, so they are derived rather than listed.
export const STAGES={
  port:{name:'风车港',sub:'弹跳网 · 炮击 · 巨浪',wave:'巨浪',cannon:'港口炮击',waveKind:'tide',cannonKind:'cannon',
    platforms:[{id:'deck-left',x:-6,z:0,w:4,d:3,top:1.6},{id:'deck-center',x:0,z:-2.2,w:4,d:3,top:2.2},{id:'deck-right',x:6,z:0,w:4,d:3,top:1.6}],
    zones:[{kind:'spring',x:-11,z:4.5,r:.95},{kind:'spring',x:11,z:4.5,r:.95}],
    crates:[[-6,3],[6,3],[0,-5]],
    pieces:[{kind:'mast',x:-9.2,z:-5.6,r:.6,h:7,hp:70,fall:'topple',length:6.5},{kind:'mast',x:9.2,z:-5.6,r:.6,h:7,hp:70,fall:'topple',length:6.5}]},
  desert:{name:'沙之王都',sub:'流沙坑 · 落石 · 沙暴',wave:'沙暴',cannon:'落石',waveKind:'sandstorm',cannonKind:'rockfall',
    platforms:[{id:'ruin-left',x:-9.5,z:-3,w:4,d:3,top:1.8},{id:'altar',x:0,z:-5.2,w:5,d:2.4,top:2.6},{id:'ruin-right',x:9.5,z:-3,w:4,d:3,top:1.8}],
    zones:[{kind:'quicksand',x:-7,z:4,r:2.3},{kind:'quicksand',x:7,z:4,r:2.3},{kind:'quicksand',x:0,z:-.8,r:1.7}],
    crates:[[-3.5,5],[3.5,5],[-12,4]],
    pieces:[{kind:'pillar',x:-3.8,z:-.3,r:.8,h:5,hp:90,fall:'topple',length:5.5},{kind:'pillar',x:3.8,z:-.3,r:.8,h:5,hp:90,fall:'topple',length:5.5}]},
  snow:{name:'冬樱雪岛',sub:'冰面打滑 · 雪球 · 雪崩',wave:'雪崩',cannon:'滚地雪球',waveKind:'avalanche',cannonKind:'snowball',
    platforms:[{id:'lodge-left',x:-10,z:-4.2,w:3.6,d:3,top:1.4},{id:'ice-rock',x:0,z:-3.4,w:6,d:3,top:2},{id:'lodge-right',x:10,z:-4.2,w:3.6,d:3,top:1.4}],
    zones:[{kind:'ice',x:-6,z:4.2,w:6,d:4},{kind:'ice',x:6,z:4.2,w:6,d:4},{kind:'ice',x:0,z:.6,w:5,d:2.6}],
    crates:[[-11,2],[11,2],[0,6]],
    pieces:[{kind:'ice',x:-3.8,z:-.6,r:.8,h:4,hp:60,fall:'burst',length:3.3},{kind:'ice',x:3.8,z:-.6,r:.8,h:4,hp:60,fall:'burst',length:3.3}]},
};
export function stageOf(id){return STAGES[id]||STAGES.port;}
export function laddersOf(stage){return stage.platforms.map(p=>({x:p.x,z:p.z+p.d/2+.12,top:p.top}));}
export function zoneAt(stage,x,z){return stage.zones.find(o=>o.r?Math.hypot(x-o.x,z-o.z)<o.r:Math.abs(x-o.x)<=o.w/2&&Math.abs(z-o.z)<=o.d/2)||null;}
export const STAGE_IDS=Object.keys(STAGES);
export const DEFAULT_CHARS=['swordsman','guardian'];
export function characterOf(p){return CHARACTERS[p?.char]||CHARACTERS[DEFAULT_CHARS[p?.id===1?1:0]];}
