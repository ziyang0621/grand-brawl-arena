// Procedural sound: every effect and the per-stage music is synthesised with Web Audio, so there are no audio files.
// Render-only: nothing here touches the simulation.
const MIDI=n=>440*Math.pow(2,(n-69)/12);

// Music: 32 sixteenth-note steps per loop. Numbers are scale degrees (0 = root), null = rest, 'x' = tie.
const SONGS={
  port:{bpm:136,root:62,scale:[0,2,4,7,9,12,14,16],lead:'square',
    bass:[0,null,0,null,3,null,3,null,0,null,0,null,4,null,3,null,0,null,0,null,3,null,3,null,4,null,3,null,2,null,3,null],
    mel:[5,null,6,5,4,null,3,null,2,null,3,4,5,null,null,null,5,null,6,5,4,null,3,null,2,3,4,2,0,null,null,null],
    drums:'kshs'},
  desert:{bpm:108,root:64,scale:[0,1,4,5,7,8,11,12],lead:'sawtooth',
    bass:[0,null,null,0,null,null,0,null,0,null,null,0,null,null,4,null,0,null,null,0,null,null,0,null,3,null,null,2,null,null,1,null],
    mel:[4,null,3,4,null,2,null,1,0,null,1,null,2,null,null,null,4,null,3,4,null,5,null,4,3,null,2,1,0,null,null,null],
    drums:'dum'},
  snow:{bpm:92,root:67,scale:[0,2,4,5,7,9,11,12],lead:'sine',
    bass:[0,null,null,null,null,null,null,null,4,null,null,null,null,null,null,null,5,null,null,null,null,null,null,null,3,null,null,null,null,null,null,null],
    mel:[7,null,5,null,4,null,2,null,4,null,null,null,5,null,null,null,7,null,9,null,7,null,5,null,4,null,2,null,0,null,null,null],
    drums:'soft'}
};

export function createAudio(){
  let ctx=null,master=null,sfxBus=null,musicBus=null,noise=null,muted=false,song=null,songId=null,timer=null,nextTime=0,step=0,duck=0,sfxCount=0;
  try{muted=localStorage.getItem('gb-muted')==='1';}catch{}
  const T=()=>ctx.currentTime;
  function unlock(){
    if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
      ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:.8;master.connect(ctx.destination);
      sfxBus=ctx.createGain();sfxBus.gain.value=.9;sfxBus.connect(master);
      musicBus=ctx.createGain();musicBus.gain.value=.22;musicBus.connect(master);
      noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      if(songId){const id=songId;songId=null;music(id);}}
    ctx.resume?.();return true;
  }
  const out=(bus,pan)=>{if(!pan||!ctx.createStereoPanner)return bus;const p=ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));p.connect(bus);return p;};
  function osc(type,f0,f1,dur,vol,dest,t=T(),delay=0){
    const o=ctx.createOscillator(),g=ctx.createGain(),s=t+delay;o.type=type;o.frequency.setValueAtTime(f0,s);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),s+dur);
    g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(vol,s+.004);g.gain.exponentialRampToValueAtTime(.0008,s+dur);o.connect(g);g.connect(dest);o.start(s);o.stop(s+dur+.02);
  }
  function hiss(type,f0,f1,dur,vol,dest,delay=0,q=1){
    const s=T()+delay,src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=noise;src.loop=true;
    f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,s);if(f1)f.frequency.exponentialRampToValueAtTime(Math.max(30,f1),s+dur);
    g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(vol,s+.003);g.gain.exponentialRampToValueAtTime(.0008,s+dur);src.connect(f);f.connect(g);g.connect(dest);src.start(s);src.stop(s+dur+.02);
  }
  const SFX={
    // level 0 light, 1 medium, 2 heavy; pitch rises a little along a combo so strings of hits sound like they build
    hit(d,o){const l=o.level??0,c=Math.min(6,o.combo||0),k=1+c*.04;
      hiss('highpass',2500,1200,.05+l*.02,.5,d);hiss('lowpass',1400,200,.09+l*.06,.6+l*.1,d);
      osc('sine',(150-l*28)*k,45,.14+l*.1,.7+l*.15,d);if(l>=1)osc('triangle',320*k,90,.07,.18,d);
      if(l>=2){osc('sine',70,28,.4,.8,d);hiss('lowpass',900,60,.35,.5,d,.02);}},
    block(d){osc('square',900,880,.07,.12,d);osc('square',2480,2400,.06,.07,d);hiss('highpass',4000,3000,.04,.25,d);osc('sine',180,90,.08,.4,d);},
    parry(d){osc('triangle',1400,1380,.25,.25,d);osc('square',2100,2050,.2,.1,d);hiss('highpass',5000,3000,.08,.3,d);osc('sine',900,600,.3,.15,d,T(),.03);},
    guardBreak(d){hiss('bandpass',2200,300,.25,.7,d,0,2);osc('sawtooth',260,60,.3,.3,d);osc('square',1500,200,.12,.15,d);},
    whoosh(d,o){const h=o.heavy?1.5:1;hiss('bandpass',500,2600*h,.14*h,.38,d,0,1.3);},
    jump(d){osc('square',260,540,.12,.1,d);osc('sine',180,320,.1,.12,d);},
    airJump(d){osc('triangle',520,980,.14,.12,d);hiss('highpass',3000,6000,.1,.12,d);},
    land(d,o){const v=Math.min(1,(o.power||.4));hiss('lowpass',700,90,.1+v*.1,.4*v+.15,d);osc('sine',90,40,.12,.5*v+.1,d);},
    launch(d){osc('triangle',300,1200,.2,.18,d);hiss('bandpass',900,4200,.2,.25,d,0,2);},
    spike(d){osc('sine',110,28,.5,.9,d);hiss('lowpass',1600,60,.5,.8,d);osc('sawtooth',400,60,.2,.2,d);},
    bounce(d){osc('sine',100,40,.15,.6,d);osc('triangle',330,520,.18,.15,d);},
    explosion(d,o){const s=o.big?1.3:1;hiss('lowpass',2200,50,.7*s,1,d);osc('sine',90,24,.7*s,1,d);hiss('highpass',3000,800,.12,.4,d);},
    cannon(d){hiss('lowpass',1800,70,.6,.9,d);osc('sine',130,30,.45,1,d);hiss('highpass',2500,1200,.06,.5,d);},
    crash(d){hiss('lowpass',1500,50,.9,1,d);osc('sine',70,24,.9,1,d);for(let i=0;i<5;i++)hiss('highpass',2000+i*400,900,.08,.3,d,.04+i*.07);},
    rock(d){hiss('lowpass',900,40,.7,1,d);osc('sine',60,22,.8,1,d);},
    splash(d){hiss('bandpass',1800,600,.35,.5,d,0,.8);hiss('highpass',4000,2000,.2,.25,d,.05);},
    wood(d){hiss('bandpass',1200,500,.1,.5,d,0,3);osc('triangle',220,120,.08,.3,d);for(let i=0;i<3;i++)hiss('highpass',2500,1500,.04,.25,d,.05+i*.05);},
    ice(d){osc('triangle',2200,1500,.2,.15,d);osc('triangle',3300,2400,.15,.1,d,T(),.03);hiss('highpass',6000,4000,.1,.3,d);},
    pickup(d){[0,4,7,12].forEach((n,i)=>osc('triangle',MIDI(76+n),null,.14,.18,d,T(),i*.05));},
    power(d){[0,4,7,12,16].forEach((n,i)=>osc('square',MIDI(64+n),null,.12,.1,d,T(),i*.045));osc('sine',MIDI(40),MIDI(52),.4,.3,d);},
    charge(d,o){const L=o.level||1;osc('sawtooth',160*L,700*L,.45,.12,d);osc('sine',90,360,.45,.3,d);hiss('bandpass',400,3000,.45,.15,d,0,3);},
    skill(d,o){const L=o.level||1;osc('sawtooth',500,90,.5+L*.1,.25,d);osc('sine',80,28,.6,.7+L*.1,d);hiss('lowpass',3000,100,.5+L*.1,.6,d);if(L>=3)[0,7,12].forEach((n,i)=>osc('square',MIDI(60+n),MIDI(60+n)*.5,.5,.1,d,T(),.05+i*.05));},
    shot(d,o){o.bolt?(osc('sawtooth',1600,300,.12,.18,d),hiss('highpass',4000,2000,.08,.2,d)):(hiss('lowpass',2400,200,.12,.7,d),osc('square',420,90,.1,.2,d));},
    warn(d,o){osc('square',(o.k??0)*200+700,null,.09,.08,d);},
    grab(d){osc('square',240,200,.08,.12,d);hiss('lowpass',800,300,.1,.3,d);},
    throw(d){hiss('bandpass',400,1800,.2,.35,d,0,1.2);osc('triangle',200,90,.2,.2,d);},
    fight(d){[0,7,12].forEach((n,i)=>osc('square',MIDI(65+n),null,.22,.16,d,T(),i*.09));hiss('highpass',3000,1000,.15,.2,d);},
    ko(d){osc('sine',110,26,1.1,1,d);hiss('lowpass',2000,50,1,1,d);osc('sawtooth',330,70,.9,.25,d);[0,-3,-7].forEach((n,i)=>osc('triangle',MIDI(67+n),MIDI(67+n)*.6,.9,.14,d,T(),.25+i*.18));},
    cheer(d){for(const [f,v] of [[700,.5],[1250,.4],[2400,.2]]){const s=T(),src=ctx.createBufferSource(),b=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=noise;src.loop=true;b.type='bandpass';b.frequency.value=f;b.Q.value=2.5;
      g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(v*.35,s+.18);g.gain.linearRampToValueAtTime(v*.25,s+.6);g.gain.exponentialRampToValueAtTime(.001,s+1.1);src.connect(b);b.connect(g);g.connect(d);src.start(s);src.stop(s+1.2);}
      [0,4].forEach(i=>osc('sawtooth',380+i*40,520,.5,.03,d,T(),i*.05));},
    flame(d){hiss('bandpass',300,1800,.6,.7,d,0,.7);hiss('lowpass',1500,100,.7,.6,d);osc('sawtooth',140,60,.4,.15,d);},
    tick(d){osc('square',1000,1000,.03,.07,d);},
    ui(d){osc('triangle',660,880,.08,.12,d);}
  };
  function play(name,o={}){
    if(!ctx||muted||!SFX[name])return;
    if(sfxCount>14)return;sfxCount++;setTimeout(()=>sfxCount--,120);
    const pan=o.x!=null?Math.max(-.8,Math.min(.8,o.x/16)):0,d=out(sfxBus,pan);
    SFX[name](d,o);
  }
  // ---- music ----
  function note(type,n,t,len,vol){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=MIDI(n);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);g.gain.exponentialRampToValueAtTime(.0008,t+len);o.connect(g);g.connect(musicBus);o.start(t);o.stop(t+len+.02);}
  function drum(kind,t,vol=1){
    const mk=(type,f,len,v,q)=>{const s=ctx.createBufferSource(),b=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;s.loop=true;b.type=type;b.frequency.value=f;if(q)b.Q.value=q;g.gain.setValueAtTime(v*vol,t);g.gain.exponentialRampToValueAtTime(.001,t+len);s.connect(b);b.connect(g);g.connect(musicBus);s.start(t);s.stop(t+len+.02);};
    if(kind==='k'){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(40,t+.13);g.gain.setValueAtTime(.9*vol,t);g.gain.exponentialRampToValueAtTime(.001,t+.17);o.connect(g);g.connect(musicBus);o.start(t);o.stop(t+.2);}
    else if(kind==='s')mk('bandpass',1800,.1,.6,1.2);else if(kind==='h')mk('highpass',7000,.03,.28);
    else if(kind==='D'){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(90,t+.12);g.gain.setValueAtTime(.7*vol,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.connect(g);g.connect(musicBus);o.start(t);o.stop(t+.2);}
    else if(kind==='t')mk('bandpass',2400,.05,.4,3);
  }
  const PATTERNS={kshs:'k.h.s.h.k.h.s.hk',dum:'D..t.tD.t.D.t.t.',soft:'k.......h.......'};
  function schedule(){
    if(!song||!ctx)return;
    const sixteenth=60/song.bpm/4;
    while(nextTime<T()+.35){
      const i=step%32,degree=song.scale,root=song.root;
      const b=song.bass[i];if(b!=null)note('triangle',root-12+degree[b%degree.length],nextTime,sixteenth*3.2,.55);
      const m=song.mel[i];if(m!=null){const len=song.mel.slice(i+1,i+4).findIndex(x=>x!=null);note(song.lead,root+12+degree[m%degree.length],nextTime,sixteenth*(len<0?3:len+1)*.9,song.lead==='sine'?.5:.16);}
      const pat=PATTERNS[song.drums]||'';const ch=pat[i%pat.length];if(ch&&ch!=='.')drum(ch==='k'&&song.drums==='dum'?'D':ch,nextTime,song.drums==='soft'?.5:1);
      if(song.drums==='soft'&&i%8===4)note('sine',root+24+degree[(i/4)%degree.length|0],nextTime,.5,.12);
      nextTime+=sixteenth;step++;
    }
  }
  function music(id){
    if(id===songId)return;songId=id;clearInterval(timer);timer=null;
    if(!ctx)return;
    song=id?SONGS[id]:null;if(!song)return;
    nextTime=T()+.1;step=0;timer=setInterval(schedule,90);schedule();
  }
  function setMuted(v){muted=!!v;try{localStorage.setItem('gb-muted',muted?'1':'0');}catch{}if(master)master.gain.setTargetAtTime(muted?0:.8,T(),.03);}
  // Short dip in the music so a K.O. or a big special cuts through.
  function dip(sec=.8){if(!musicBus)return;const t=T();musicBus.gain.cancelScheduledValues(t);musicBus.gain.setTargetAtTime(.05,t,.03);musicBus.gain.setTargetAtTime(.22,t+sec,.25);}
  return {unlock,play,music,setMuted,dip,get muted(){return muted;},get ready(){return !!ctx;}};
}
