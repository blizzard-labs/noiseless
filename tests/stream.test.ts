import {it,expect} from 'vitest';
import {LocalStream} from '../src/models/stream';
it('assembles split SSE events and keeps reasoning out of progress output',()=>{
  const progress:number[]=[];const s=new LocalStream(n=>progress.push(n));
  const events=[{choices:[{delta:{reasoning_content:'private'}}]},{choices:[{delta:{content:'{"ok":'}}]},{choices:[{delta:{content:'true}'},finish_reason:'stop'}]}];
  const text=events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+'data: [DONE]\n\n';
  for(let i=0;i<text.length;i+=7)s.push(text.slice(i,i+7));
  expect(s.result().choices[0].message.content).toBe('{"ok":true}');expect(progress).toEqual([0,6,11]);
});
