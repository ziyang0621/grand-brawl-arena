import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Reads the glTF JSON chunk of a .glb without any dependencies.
function readGlb(path){
  const buf=readFileSync(new URL(path,import.meta.url));
  assert.equal(buf.toString('utf8',0,4),'glTF');assert.equal(buf.readUInt32LE(4),2);
  const len=buf.readUInt32LE(12);assert.equal(buf.toString('utf8',16,20),'JSON');
  return {json:JSON.parse(buf.toString('utf8',20,20+len)),bytes:buf.length};
}
const CHARS=['swordsman','guardian','brawler','gunner','cook','stormcaller'];
const CLIPS=['idle','walk','run','jump','fall','land','attack_a','attack_b','heavy','dash','shoot','skill','guard','hurt','carry','grab'];
const BONES=['hips','spine','chest','neck','head','upper_arm.L','forearm.L','hand.L','upper_arm.R','forearm.R','hand.R','thigh.L','shin.L','foot.L','thigh.R','shin.R','foot.R'];
test('every Blender-authored character is a skinned glTF with the shared rig, every clip the game asks for, and a face that can emote',()=>{
  for(const id of CHARS){
    const {json,bytes}=readGlb(`../models/${id}.glb`);
    assert.ok(bytes<1.6*1024*1024,`${id} small enough for a web page: ${bytes}`);
    assert.equal(json.skins.length,1,id);
    const joints=json.skins[0].joints.map(i=>json.nodes[i].name);
    for(const b of BONES)assert.ok(joints.includes(b),`${id} bone ${b}`);
    const clips=json.animations.map(a=>a.name);
    for(const c of CLIPS)assert.ok(clips.includes(c),`${id} clip ${c}`);
    assert.ok(json.meshes.length>=30,`${id} is built from separate coloured parts`);
    const morphs=new Set(json.meshes.flatMap(m=>m.extras?.targetNames||[]));
    for(const k of ['blink','open','shut','angry','sad'])assert.ok(morphs.has(k),`${id} face key ${k}`);
  }
});
test('every glb the game can load exists and matches the character table',()=>{
  const src=readFileSync(new URL('../arena.js',import.meta.url),'utf8');
  const m=src.match(/GLB_CHARS=Object.fromEntries\(\[([^\]]*)\]/);assert.ok(m);
  const ids=[...m[1].matchAll(/'([a-z]+)'/g)].map(x=>x[1]);assert.deepEqual(ids,CHARS);
  for(const id of ids)assert.ok(readGlb(`../models/${id}.glb`).json.animations.length>=CLIPS.length,id);
});
