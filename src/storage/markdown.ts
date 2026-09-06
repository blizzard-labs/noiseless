import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { Task, taskSchema, uid } from '../core/model';

export function readNote<T>(text:string,schema:z.ZodType<T>):{data:T;body:string;meta:Record<string,unknown>}{
  const m=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!m)throw new Error('Missing YAML properties');
  const meta=parse(m[1]);return {data:schema.parse(meta),body:text.slice(m[0].length),meta};
}
export function writeNote(data:unknown,body:string):string{return `---\n${stringify(data,{lineWidth:0})}---\n${body}`;}
export function patchNote<T>(text:string,schema:z.ZodType<T>,fn:(value:T)=>T):string{
  const old=readNote(text,schema),value=schema.parse(fn(old.data));
  return writeNote({...old.meta,...value},old.body);
}
export function taskNote(task:Task):string{return writeNote(task,`\n# ${task.title}\n\n${task.originalText}\n\n## Notes\n\n`);}
export function managed(text:string,key:string,content:string):string{
  const start=`<!-- noiseless:${key}:start -->`,end=`<!-- noiseless:${key}:end -->`;
  const a=text.indexOf(start),b=text.indexOf(end);
  if(a<0)return `${text.trimEnd()}\n\n${start}\n${content.trim()}\n${end}\n`;
  if(b<a)throw new Error(`Incomplete ${key} section; restore its closing marker`);
  return text.slice(0,a)+`${start}\n${content.trim()}\n${end}`+text.slice(b+end.length);
}
export interface Captured {id:string;title:string;done:boolean;}
export function captureLines(text:string):{text:string;items:Captured[]}{
  const start='<!-- noiseless:capture:start -->',end='<!-- noiseless:capture:end -->';
  const a=text.indexOf(start),b=text.indexOf(end);if(a<0||b<a)return {text,items:[]};
  const items:Captured[]=[];let fenced=false;
  const lines=text.slice(a+start.length,b).split('\n').map(line=>{
    if(/^\s*```/.test(line)){fenced=!fenced;return line;}
    if(fenced||!line.trim()||/^\s*(#|>|<!--)/.test(line))return line;
    const marked=line.match(/<!-- noiseless:task:([a-zA-Z0-9-]+) -->/);
    const done=/^\s*[-*]\s+\[[xX]\]/.test(line);
    const title=line.replace(/<!-- noiseless:task:[a-zA-Z0-9-]+ -->/,'').replace(/^\s*(?:[-*]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/,'').trim();
    if(!title)return line;const id=marked?.[1]??uid();items.push({id,title,done});
    return marked?line:`- [${done?'x':' '}] ${title} <!-- noiseless:task:${id} -->`;
  });
  return {text:text.slice(0,a+start.length)+lines.join('\n')+text.slice(b),items};
}
export function syncCapture(text:string,task:Task):string{
  return text.split('\n').map(line=>line.includes(`<!-- noiseless:task:${task.id} -->`)?line.replace(/^(\s*[-*]\s+)\[[ xX]\]/,`$1[${task.status==='done'?'x':' '}]`):line).join('\n');
}
export const escapeCell=(s:string)=>s.replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
export const safeLink=(path:string,title:string)=>`[${title.replace(/[\[\]]/g,'')}](${encodeURI(path).replace(/\(/g,'%28').replace(/\)/g,'%29')})`;
export const parseTask=(text:string)=>readNote(text,taskSchema).data;
