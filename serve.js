import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Map([
  ['/','index.html'],['/index.html','index.html'],['/three-preview.html','three-preview.html'],
  ['/arena.js','arena.js'],['/arena-core.js','arena-core.js'],['/arena.css','arena.css'],
  ['/vendor/three.module.js','vendor/three.module.js'],['/vendor/three.core.js','vendor/three.core.js'],
  ['/vendor/THREE-LICENSE.txt','vendor/THREE-LICENSE.txt'],
]);
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=files.get(path);
  if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}
  catch{res.writeHead(500);res.end('Unable to load game');}
}).listen(4173,'127.0.0.1',()=>console.log('Grand Brawl: http://127.0.0.1:4173/three-preview.html'));
