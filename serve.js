import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Map([
  ['/','index.html'],['/index.html','index.html'],['/three-preview.html','three-preview.html'],
  ['/character-study.html','character-study.html'],
  ['/arena-tailoring.js','arena-tailoring.js'],
  ['/arena-posing.js','arena-posing.js'],
  ['/arena-tripo.js','arena-tripo.js'],
  ['/arena.js','arena.js'],['/arena-core.js','arena-core.js'],['/arena.css','arena.css'],
  ['/arena-session.js','arena-session.js'],['/arena-touch.js','arena-touch.js'],['/arena-guards.js','arena-guards.js'],['/arena-crew.js','arena-crew.js'],['/arena-audio.js','arena-audio.js'],['/arena-glb.js','arena-glb.js'],['/glb-study.html','glb-study.html'],['/vendor/addons/GLTFLoader.js','vendor/addons/GLTFLoader.js'],['/vendor/addons/BufferGeometryUtils.js','vendor/addons/BufferGeometryUtils.js'],['/vendor/addons/SkeletonUtils.js','vendor/addons/SkeletonUtils.js'],['/models/swordsman.glb','models/swordsman.glb'],['/models/guardian.glb','models/guardian.glb'],['/models/brawler.glb','models/brawler.glb'],['/models/gunner.glb','models/gunner.glb'],['/models/cook.glb','models/cook.glb'],['/models/stormcaller.glb','models/stormcaller.glb'],['/arena-face.js','arena-face.js'],['/arena-pieces.js','arena-pieces.js'],
  ['/arena-clouds.js','arena-clouds.js'],['/arena-roster.js','arena-roster.js'],['/arena-gfx.js','arena-gfx.js'],
  ['/arena-models.js','arena-models.js'],['/arena-stage.js','arena-stage.js'],
  ['/models/tripo-pirate.glb','models/tripo-pirate-animated.glb'],
  ['/vendor/three.module.js','vendor/three.module.js'],['/vendor/three.core.js','vendor/three.core.js'],
  ['/vendor/THREE-LICENSE.txt','vendor/THREE-LICENSE.txt'],
]);
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,tripoModel=path.match(/^\/models\/(tripo-[a-z]+-animated)\.glb$/),portrait=path.match(/^\/models\/portraits\/(tripo-[a-z]+)\.png$/),file=files.get(path)||(tripoModel?`models/${tripoModel[1]}.glb`:portrait?`models/portraits/${portrait[1]}.png`:undefined);
  if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.png')?'image/png':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}
  catch{res.writeHead(500);res.end('Unable to load game');}
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',function(){console.log('Grand Brawl: http://127.0.0.1:'+this.address().port+'/three-preview.html');});
