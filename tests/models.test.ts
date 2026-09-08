import { describe,it,expect } from 'vitest';
import { ModelRouter, Ledger, Usage, Request, enrichmentKey } from '../src/models/router';
import { config, graph, task, enrichment } from './fixtures';
class MemoryLedger implements Ledger {rows:Usage[]=[];async all(){return this.rows;}async save(row:Usage){this.rows=[...this.rows.filter(r=>r.id!==row.id),structuredClone(row)];}}
function setup(){const c=structuredClone(config);for(const p of Object.values(c.providers)){p.enabled=true;p.model='test-model';p.inputPerMillion=1;p.outputPerMillion=2;}c.monthlyCloudBudget=10;return c;}
const respond=(provider:string,value:unknown=enrichment)=>({status:200,body:provider==='local'?{choices:[{message:{content:JSON.stringify({constraint:null,explanation:'No timeframe stated.',...(value as object)})}}],usage:{prompt_tokens:100,completion_tokens:50}}:provider==='openai'?{output:[{content:[{type:'output_text',text:JSON.stringify({constraint:null,explanation:'No timeframe stated.',...(value as object)})}]}],usage:{input_tokens:100,output_tokens:50}}:{content:[{type:'text',text:JSON.stringify({constraint:null,explanation:'No timeframe stated.',...(value as object)})}],usage:{input_tokens:100,output_tokens:50}}});
describe('model routing and contracts',()=>{
  it('uses LM Studio chat completions and OpenAI Responses with validated schema output',async()=>{const requests:Request[]=[],ledger=new MemoryLedger(),c=setup();const r=new ModelRouter(async()=>c,()=> 'secret',async req=>{requests.push(req);return respond(req.url.includes('1234')?'local':'openai');},ledger,async()=>{});const result=await r.enrich(task(),graph);expect(result.provider).toBe('openai');expect(requests[0].url).toBe('http://127.0.0.1:1234/v1/chat/completions');expect((requests[0].body as any).response_format.type).toBe('json_schema');expect((requests[2].body as any).text.format.type).toBe('json_schema');expect((requests[2].body as any).store).toBe(false);expect(ledger.rows.every(r=>r.status==='ok')).toBe(true);expect(JSON.stringify(ledger.rows)).not.toContain('secret');});
  it('routes complex work to Anthropic with current output_config shape',async()=>{const c=setup(),requests:Request[]=[];const r=new ModelRouter(async()=>c,()=> 'secret',async req=>{requests.push(req);return respond(req.url.includes('1234')?'local':'anthropic',{...enrichment,complex:true});},new MemoryLedger(),async()=>{});expect((await r.enrich(task(),graph)).provider).toBe('anthropic');expect((requests[2].body as any).output_config.format.type).toBe('json_schema');expect(requests[2].headers['anthropic-version']).toBe('2023-06-01');});
  it('falls back on cloud errors and retries transient failures at most twice',async()=>{let openai=0;const r=new ModelRouter(async()=>setup(),()=> 'secret',async req=>{if(req.url.includes('openai')){openai++;return {status:503,body:{}};}return respond(req.url.includes('1234')?'local':'anthropic');},new MemoryLedger(),async()=>{});expect((await r.enrich(task(),graph)).provider).toBe('anthropic');expect(openai).toBe(3);});
  it('continues with confident local scores when cloud is paused',async()=>{const c=setup();c.monthlyCloudBudget=0;const requests:Request[]=[];const r=new ModelRouter(async()=>c,()=> 'secret',async req=>{requests.push(req);return respond('local');},new MemoryLedger(),async()=>{});expect((await r.enrich(task(),graph)).provider).toBe('lmstudio');expect(requests).toHaveLength(2);});
  it('does not accept low-confidence local results when escalation is unavailable',async()=>{const c=setup();c.monthlyCloudBudget=0;const r=new ModelRouter(async()=>c,()=>null,async()=>respond('local',{...enrichment,confidence:.5}),new MemoryLedger(),async()=>{});await expect(r.enrich(task(),graph)).rejects.toThrow();});
  it('recovers from an unavailable LM Studio server',async()=>{const r=new ModelRouter(async()=>setup(),()=> 'secret',async req=>{if(req.url.includes('1234'))throw new Error('ECONNREFUSED');return respond('openai');},new MemoryLedger(),async()=>{});expect((await r.enrich(task(),graph)).provider).toBe('openai');});
  it('rejects malformed JSON and unknown goal identifiers',async()=>{const c=setup();c.providers.lmstudio.enabled=false;c.providers.anthropic.enabled=false;const r=new ModelRouter(async()=>c,()=> 'secret',async()=>respond('openai',{...enrichment,goalId:'invented'}),new MemoryLedger(),async()=>{});await expect(r.enrich(task(),graph)).rejects.toThrow('schema validation');const bad=new ModelRouter(async()=>c,()=> 'secret',async()=>({status:200,body:{output:[{content:[{type:'output_text',text:'bad json'}]}]}}),new MemoryLedger(),async()=>{});await expect(bad.enrich(task(),graph)).rejects.toThrow('valid JSON');});
  it('reserves budget before requests and preserves reservations on ambiguous failures',async()=>{const c=setup();c.providers.lmstudio.enabled=false;c.providers.anthropic.enabled=false;c.monthlyCloudBudget=.02;const ledger=new MemoryLedger();let calls=0;const r=new ModelRouter(async()=>c,()=> 'secret',async()=>{calls++;expect((await ledger.all()).at(-1)?.status).toBe('reserved');throw new Error('timeout');},ledger,async()=>{});await expect(r.enrich(task(),graph)).rejects.toThrow();expect(calls).toBeLessThanOrEqual(2);expect(ledger.rows.reduce((n,r)=>n+r.cost,0)).toBeGreaterThan(0);});
  it('invalidates cache for meaningful task, graph and rubric changes',()=>{const t=task(),key=enrichmentKey(t,graph,config);t.title+=' edited';expect(enrichmentKey(t,graph,config)).not.toBe(key);expect(enrichmentKey(task(),{...graph,version:2},config)).not.toBe(key);expect(enrichmentKey(task(),graph,{...config,rubricVersion:2})).not.toBe(key);});
  it('validates the graph proposal before returning it',async()=>{const c=setup();const r=new ModelRouter(async()=>c,()=> 'secret',async()=>respond('anthropic',graph),new MemoryLedger(),async()=>{});expect((await r.draft('My goals',graph)).goals).toHaveLength(5);});
  it('never sends analysis to unchecked cloud connections',async()=>{
    const c=setup();for(const p of [c.providers.openai,c.providers.anthropic])p.tasks={enrichment:false,goalDraft:true};
    const requests:Request[]=[];const r=new ModelRouter(async()=>c,()=> 'secret',async req=>{requests.push(req);return respond('local');},new MemoryLedger(),async()=>{});
    expect((await r.enrich(task(),graph)).provider).toBe('lmstudio');expect(requests).toHaveLength(2);expect(requests[0].url).toContain('1234');
  });
  it('supports cloud-only analysis and local-only goal drafting',async()=>{
    const c=setup();c.providers.lmstudio.tasks={enrichment:false,goalDraft:true};for(const p of [c.providers.openai,c.providers.anthropic])p.tasks={enrichment:true,goalDraft:false};
    const requests:Request[]=[];const r=new ModelRouter(async()=>c,()=> 'secret',async req=>{requests.push(req);return req.url.includes('1234')?respond('local',graph):respond('openai');},new MemoryLedger(),async()=>{});
    expect((await r.enrich(task(),graph)).provider).toBe('openai');expect(requests).toHaveLength(2);
    await r.draft('My brief',graph);expect(requests).toHaveLength(3);expect(requests[2].url).toContain('1234');
  });
  it('makes no requests when every connection has the operation unchecked',async()=>{
    const c=setup();for(const p of Object.values(c.providers))p.tasks={enrichment:false,goalDraft:false};let calls=0;
    const r=new ModelRouter(async()=>c,()=> 'secret',async()=>{calls++;return respond('local');},new MemoryLedger(),async()=>{});
    await expect(r.enrich(task(),graph)).rejects.toThrow('unchecked');await expect(r.draft('brief',graph)).rejects.toThrow('unchecked');expect(calls).toBe(0);
  });

  it('reports the local failure instead of only disabled cloud fallbacks',async()=>{
    const c=setup();c.providers.openai.enabled=c.providers.anthropic.enabled=false;
    const r=new ModelRouter(async()=>c,()=>null,async()=>({status:404,body:{}}),new MemoryLedger(),async()=>{});
    await expect(r.enrich(task(),graph)).rejects.toThrow('lmstudio: HTTP 404');
  });
  it('recovers schema-valid JSON misrouted to the reasoning field without exposing reasoning',async()=>{
    const c=setup();c.providers.openai.enabled=c.providers.anthropic.enabled=false;
    const r=new ModelRouter(async()=>c,()=>null,async()=>({status:200,body:{choices:[{message:{content:'',reasoning_content:JSON.stringify({...enrichment,constraint:null,explanation:'No timeframe stated.'})},finish_reason:'stop'}]}}),new MemoryLedger(),async()=>{});
    expect((await r.enrich(task(),graph)).data).toEqual({...enrichment,due:'2026-09-13',deadlineInterpretation:{...enrichment.deadlineInterpretation,explanation:'No deadline stated. Provisional planning date: seven days after capture.'}});expect(r.activity.at(-1)?.status).toBe('result');
    const bad=new ModelRouter(async()=>c,()=>null,async()=>({status:200,body:{choices:[{message:{content:'',reasoning_content:'private chain of thought'}}]}}),new MemoryLedger(),async()=>{});
    await expect(bad.enrich(task(),graph)).rejects.toThrow('no structured result');expect(JSON.stringify(bad.activity)).not.toContain('private chain');
  });

  it('isolates deadline interpretation from goals and prevents scoring from replacing it',async()=>{
    const c=setup();c.providers.openai.enabled=c.providers.anthropic.enabled=false;const requests:Request[]=[];
    const deadline={constraint:{due:'2026-09-08',quote:'over next two days',offsetDays:2,weekday:null},explanation:'Two days after the reference date.'};
    const r=new ModelRouter(async()=>c,()=>null,async req=>{requests.push(req);return respond('local',requests.length===1?deadline:{...enrichment,due:'2026-10-25'});},new MemoryLedger(),async()=>{});
    const result=await r.enrich({...task(),title:'Review patents over next two days'},graph);
    const first=JSON.parse((requests[0].body as any).messages[1].content);expect(first.goals).toBeUndefined();expect(first.referenceDate).toBe('2026-09-06');
    expect(result.data.due).toBe('2026-09-08');expect(result.data.dateKind).toBe('explicit');
  });
  it.each(['draft the next version of the common app','complete introduction to Alaska expedition research paper'])('analyzes an untimed task: %s',async title=>{
    const c=setup();c.providers.openai.enabled=c.providers.anthropic.enabled=false;const requests:Request[]=[];
    const r=new ModelRouter(async()=>c,()=>null,async req=>{requests.push(req);return respond('local',requests.length===1?{constraint:null,explanation:'No completion timeframe is stated.'}:enrichment);},new MemoryLedger(),async()=>{});
    const result=await r.enrich({...task(),title},graph);
    expect(requests).toHaveLength(2);expect(result.data.goalId).toBe('event');expect(result.data.estimateMinutes).toBe(180);
    expect(result.data.due).toBe('2026-09-13');expect(result.data.dateKind).toBe('inferred');
    expect(result.data.deadlineInterpretation).toMatchObject({kind:'inferred',quote:'',offsetDays:null,weekday:null});
  });
  it('keeps unresolved stated timing pending rather than treating it as absent',async()=>{
    const c=setup();c.providers.openai.enabled=c.providers.anthropic.enabled=false;
    const r=new ModelRouter(async()=>c,()=>null,async()=>respond('local',{constraint:{due:null,quote:'before the conference',offsetDays:null,weekday:null},explanation:'Conference date is unknown.'}),new MemoryLedger(),async()=>{});
    await expect(r.enrich({...task(),title:'Finish paper before the conference'},graph)).rejects.toThrow('ambiguous');
  });
  it('corrects invalid output once with specific feedback and then stops',async()=>{
    const c=setup();c.providers.openai.enabled=c.providers.anthropic.enabled=false;let calls=0;let feedback='';
    const invalid={constraint:{due:'2026-09-09',quote:'next two days',offsetDays:2,weekday:null},explanation:'Two days later.'};
    const r=new ModelRouter(async()=>c,()=>null,async req=>{calls++;feedback=JSON.stringify(req.body);return respond('local',invalid);},new MemoryLedger(),async()=>{});
    await expect(r.enrich({...task(),title:'Write essay next two days'},graph)).rejects.toThrow('expected 2026-09-08');expect(calls).toBe(2);expect(feedback).toContain('Previous JSON');expect(feedback).toContain('expected 2026-09-08');
  });

});
