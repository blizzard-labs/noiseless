import http from 'node:http';
import https from 'node:https';
import { Transport } from './router';

export const transport:Transport=request=>new Promise((resolve,reject)=>{
  const url=new URL(request.url);if(!['http:','https:'].includes(url.protocol))return reject(new Error('Unsupported endpoint'));
  const data=JSON.stringify(request.body);
  const req=(url.protocol==='https:'?https:http).request(url,{method:'POST',headers:{...request.headers,'Content-Length':Buffer.byteLength(data)}},res=>{
    const chunks:Buffer[]=[];let size=0;
    res.on('data',(b:Buffer)=>{size+=b.length;if(size>4*1024*1024)req.destroy(new Error('Response too large'));else chunks.push(b);});
    res.on('end',()=>{try{resolve({status:res.statusCode??0,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('Invalid JSON'));}});
    res.on('error',reject);
  });
  const timer=setTimeout(()=>req.destroy(new Error('Request timed out')),request.timeoutMs);
  req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(data);
});
