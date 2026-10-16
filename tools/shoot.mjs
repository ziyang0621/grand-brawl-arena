// Headless screenshots of the game for checking visuals: node tools/shoot.mjs <url> <out-prefix> <w> <h> <steps.json>
// steps: [{eval:"js (async body, may return a value)"}, {shot:"name", at:"js returning [x,y,w,h] to crop", scale:2}, {wait:ms}]
// Use ?debug in the url (window.__brawl); stop the page's own loop with window.requestAnimationFrame=()=>0 and step with __brawl.run(dt,fps,true).
import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [url,prefix,w='1280',h='720',stepsFile]=process.argv.slice(2);
const steps=JSON.parse(readFileSync(stepsFile,'utf8'));
const dir=mkdtempSync(join(tmpdir(),'gbshot-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=9444',`--user-data-dir=${dir}`,`--window-size=${w},${h}`,'--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','about:blank'],{stdio:['ignore','ignore','pipe']});
let errs='';chrome.stderr.on('data',d=>errs+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let target;for(let i=0;i<150;i++){try{const list=await (await fetch('http://127.0.0.1:9444/json')).json();target=list.find(t=>t.type==='page');if(target)break;}catch{}await sleep(200);}
if(!target){chrome.kill();console.error('chrome not reachable',errs.slice(-300));process.exit(1);}
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();const logs=[];
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){pending.get(d.id)(d);pending.delete(d.id);}if(d.method==='Runtime.exceptionThrown')logs.push('EXCEPTION: '+JSON.stringify(d.params.exceptionDetails).slice(0,600));};
const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:+w,height:+h,deviceScaleFactor:1,mobile:+w<700});
await send('Page.navigate',{url});for(let i=0;i<150;i++){await sleep(200);const r=await send('Runtime.evaluate',{expression:'typeof __brawl',returnByValue:true});if(r.result?.result?.value==='object')break;}await sleep(1500);
for(const s of steps){
  if(s.wait)await sleep(s.wait);
  if(s.eval){const r=await send('Runtime.evaluate',{expression:'(async()=>{'+s.eval+'})()',awaitPromise:true,returnByValue:true});const v=r.result?.result?.value;if(r.result?.exceptionDetails)logs.push('EVAL ERROR: '+JSON.stringify(r.result.exceptionDetails).slice(0,500));else if(v!==undefined)console.log('=>',JSON.stringify(v).slice(0,1200));}
  if(s.shot){const params={format:'jpeg',quality:85};
    if(s.at){const rr=await send('Runtime.evaluate',{expression:s.at,returnByValue:true});const [x,y,cw,ch]=rr.result.result.value;params.clip={x:Math.max(0,x),y:Math.max(0,y),width:cw,height:ch,scale:s.scale||2};}
    const r=await send('Page.captureScreenshot',params);writeFileSync(`${prefix}-${s.shot}.jpg`,Buffer.from(r.result.data,'base64'));console.log('saved',`${prefix}-${s.shot}.jpg`);}
}
if(logs.length)console.log(logs.join('\n'));
ws.close();chrome.kill();process.exit(0);
