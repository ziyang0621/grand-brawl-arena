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
test('the Blender-authored Hongfan is a skinned, animated glTF with every clip the game asks for',()=>{
  const {json,bytes}=readGlb('../models/hongfan.glb');
  assert.ok(bytes<1.5*1024*1024,`small enough for a web page: ${bytes}`);
  assert.equal(json.skins.length,1);
  const joints=json.skins[0].joints.map(i=>json.nodes[i].name);
  for(const b of ['hips','spine','chest','neck','head','upper_arm.L','forearm.L','hand.L','upper_arm.R','forearm.R','hand.R','thigh.L','shin.L','foot.L','thigh.R','shin.R','foot.R'])assert.ok(joints.includes(b),`bone ${b}`);
  const clips=json.animations.map(a=>a.name);
  for(const c of ['idle','walk','run','jump','fall','land','slash_a','slash_b','guard','hurt'])assert.ok(clips.includes(c),`clip ${c}`);
  assert.ok(json.meshes.length>=30,'built from separate coloured parts');
});
test('every glb the game can load exists and matches the character table',()=>{
  const src=readFileSync(new URL('../arena.js',import.meta.url),'utf8');
  const m=src.match(/GLB_CHARS=\{([^}]*)\}/);assert.ok(m);
  for(const [,file] of m[1].matchAll(/'(models\/[^']+)'/g))assert.ok(readGlb('../'+file).json.animations.length>=10,file);
});
