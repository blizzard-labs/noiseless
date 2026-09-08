import { z } from 'zod';
import { Config, configSchema, defaultConfig, effective, Goal, goalSchema, GoalGraph, graphSchema, localDate, Task, taskSchema } from './core/model';
import { complete, logSession, planDay, progress, rank, validateGraph } from './core/engine';
import { ModelRouter, enrichmentKey, Ledger, Usage } from './models/router';
import { paths, ROOT, Store, withDraftReview } from './storage/store';
import { escapeCell, readNote, safeLink, writeNote, patchNote } from './storage/markdown';
import { exportGoalPrompt, manualFolder, outputFolder, parseGoalOutput } from './models/manual';

const usageSchema=z.object({schema:z.literal(1),rows:z.array(z.object({id:z.string(),at:z.string(),provider:z.enum(['lmstudio','openai','anthropic']),model:z.string(),operation:z.string(),status:z.enum(['reserved','ok','error']),cost:z.number(),inputTokens:z.number(),outputTokens:z.number(),message:z.string()}))});
export class MarkdownLedger implements Ledger {
  constructor(private store:Store){}
  private path=`${ROOT}/History/Model usage.md`;
  async all(){if(!await this.store.io.exists(this.path))return [];return readNote(await this.store.io.read(this.path),usageSchema).data.rows;}
  async save(row:Usage){
    if(!await this.store.io.exists(this.path))await this.store.io.create(this.path,writeNote({schema:1,rows:[]},'\n# Model usage\n\nCosts are estimates based on configured token prices. Reserved requests include a conservative allowance until their response is recorded.\n'));
    await this.store.mutate(this.path,usageSchema,d=>({...d,rows:[...d.rows.filter(x=>x.id!==row.id),row]}));
  }
}
export class Service {
  lastDeleted:string|null=null;
  tasks:Task[]=[];graph:GoalGraph={schema:1,version:1,goals:[]};config:Config=structuredClone(defaultConfig);
  filePaths=new Map<string,string>();error='';busy='';listeners=new Set<()=>void>();stopped=false;
  private chain:Promise<unknown>=Promise.resolve();private worker=false;private attempted=new Map<string,string>();
  constructor(readonly store:Store,readonly router:ModelRouter){}
  emit(){this.listeners.forEach(fn=>fn());}
  serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.chain.then(fn);this.chain=next.catch(()=>{});return next;}
  async refresh(ingest=false){return this.serial(async()=>{
    try{if(ingest)await this.store.ingest();this.config=await this.store.config();this.graph=await this.store.graph();let rows=await this.store.taskFiles();
      // Source-mode status edits must produce the same ledger events as dashboard checkboxes.
      for(const {task} of rows){const last=task.history.at(-1);if(task.status==='done'&&last?.action!=='complete')await this.store.updateTask(task.id,t=>complete({...t,status:'open'},true,this.graph,this.config));
        else if(task.status!=='done'&&last?.action==='complete')await this.store.updateTask(task.id,t=>({...complete({...t,status:'done'},false,this.graph,this.config),status:t.status}));}
      rows=await this.store.taskFiles();this.tasks=rows.map(x=>x.task);this.filePaths=new Map(rows.map(x=>[x.task.id,x.path]));this.error='';await this.summaries();}catch(e){this.error=(e as Error).message;}
    this.emit();
  });}
  async capture(text:string){await this.serial(()=>this.store.capture(text));await this.refresh();void this.enrich();}
  async deleteTask(id:string){await this.serial(async()=>{
    await this.store.updateTask(id,t=>({...t,deletedAt:new Date().toISOString()}));
    await this.store.io.process(paths.everything,text=>text.split('\n').filter(line=>!line.includes(`<!-- noiseless:task:${id} -->`)).join('\n'));
    this.lastDeleted=id;
  });await this.refresh();}
  async undoDelete(){const id=this.lastDeleted;if(!id)return;await this.serial(async()=>{
    const file=(await this.store.taskFiles(true)).find(row=>row.task.id===id);if(!file)return;
    await this.store.io.process(file.path,text=>patchNote(text,taskSchema,t=>({...t,deletedAt:null})));
    this.lastDeleted=null;
  });await this.refresh();}
  async toggle(id:string,done:boolean){await this.serial(async()=>{const task=await this.store.updateTask(id,t=>complete(t,done,this.graph,this.config));await this.store.synchronizeCapture(task);});await this.refresh();}
  async session(id:string,minutes:number){await this.serial(()=>this.store.updateTask(id,t=>logSession(t,minutes,this.graph,this.config)));await this.refresh();}
  async override(id:string,patch:Partial<Task['overrides']>){await this.serial(()=>this.store.updateTask(id,t=>({...t,overrides:{...t.overrides,...patch},pending:'Manual values saved'})));await this.refresh();void this.enrich();}
  async status(id:string,status:Task['status'],snoozedUntil:string|null=null){await this.serial(()=>this.store.updateTask(id,t=>({...t,status,snoozedUntil})));await this.refresh();}
  async dailyCapacity(minutes:number){await this.serial(()=>this.store.mutate(paths.config,configSchema,c=>({...c,dailyOverrides:{...c.dailyOverrides,[localDate()]:minutes}})));await this.refresh();}
  async goalOutcome(id:string,achieved:boolean){await this.serial(()=>this.store.mutate(paths.goals,graphSchema,g=>({...g,goals:g.goals.map(goal=>goal.id===id?{...goal,achieved}:goal)})));await this.refresh();}
  async draft(){if(this.worker)throw new Error('Wait for current model processing to finish');this.worker=true;this.busy='Drafting goals';this.emit();
    try{const brief=await this.store.io.read(paths.brief),graph=await this.router.draft(brief,this.graph);await this.store.put(paths.draft,withDraftReview(writeNote(graph,'\n# Review your goal draft\n\nThese are proposed goals, dates, and connections. Edit the properties in Source mode, then run **Noiseless: Approve goal draft**. Approval activates this graph and keeps the previous version in History.\n')));}finally{this.worker=false;this.busy='';this.emit();}
  }
  async exportDraftPrompt(){return this.serial(async()=>{
    const brief=await this.store.io.read(paths.brief),graph=await this.store.graph();
    const readme=`${outputFolder}/README.md`;
    if(!await this.store.io.exists(readme))await this.store.io.create(readme,'# Goal outputs\n\nPlace result.json here, or a .md file containing one fenced JSON block. In Noiseless Goals, enter its filename and choose Import for review. Import replaces Goal draft.md only; active goals change only after approval.\n');
    const path=`${manualFolder}/Prompt-${crypto.randomUUID()}.md`;
    await this.store.io.create(path,exportGoalPrompt(brief,graph));return path;
  });}
  async importDraftOutput(filename:string){return this.serial(async()=>{
    if(this.worker)throw new Error('Wait for current model processing to finish');
    if(!/^[^/\\]+\.(json|md)$/i.test(filename)||filename.toLowerCase()==='readme.md')throw new Error('Enter a .json or .md filename from the Outputs folder.');
    const graph=parseGoalOutput(await this.store.io.read(`${outputFolder}/${filename}`));
    if(await this.store.io.exists(paths.draft))await this.store.io.create(`${ROOT}/History/Goal-draft-${crypto.randomUUID()}.md`,await this.store.io.read(paths.draft));
    await this.store.put(paths.draft,withDraftReview(writeNote(graph,'\n# Review imported goal draft\n\nValidate these proposed goals and connections, then run **Noiseless: Approve goal draft**. Active goals have not changed.\n')));
  });}
  async editGoal(source:'draft'|'goals',reviewedText:string,id:string,edited:Goal){return this.serial(async()=>{
    const path=source==='draft'?paths.draft:paths.goals;
    if(await this.store.io.read(path)!==reviewedText)throw new Error('The graph changed. Cancel editing and reload before saving.');
    const goal=goalSchema.parse(edited),current=readNote(reviewedText,graphSchema).data;
    if(!current.goals.some(g=>g.id===id))throw new Error('Goal no longer exists.');
    if(goal.id!==id&&current.goals.some(g=>g.id===goal.id))throw new Error('Goal IDs must be unique.');
    const next={...current,goals:current.goals.map(g=>{const updated=g.id===id?goal:g;return {...updated,parents:updated.parents.map(p=>({...p,parentId:p.parentId===id?goal.id:p.parentId}))};})};
    validateGraph(next);
    if(source==='goals'){
      if(await this.store.io.exists(paths.draft))await this.store.io.create(`${ROOT}/History/Goal-draft-${crypto.randomUUID()}.md`,await this.store.io.read(paths.draft));
      await this.store.put(paths.draft,withDraftReview(writeNote(next,'\n# Review goal changes\n\nThese edits are staged for review. Approve the draft to activate them.\n')));
    }else await this.store.io.process(path,text=>{if(text!==reviewedText)throw new Error('The draft changed. Reload before saving.');return patchNote(text,graphSchema,()=>next);});
  });}
  async approve(reviewedText?:string){await this.serial(async()=>{if(reviewedText!==undefined&&await this.store.io.read(paths.draft)!==reviewedText)throw new Error('The draft changed. Reload and review it before approving.');await this.store.approveDraft();});this.attempted.clear();await this.refresh();void this.enrich();}
  retryPending(){this.attempted.clear();return this.enrich();}
  async enrich(force=false){
    if(this.worker||this.stopped||this.error)return;if(force)this.attempted.clear();this.worker=true;
    try{
      for(const candidate of this.tasks){
        if(this.stopped)break;if(candidate.status==='done')continue;
        const key=enrichmentKey(candidate,this.graph,this.config);
        if((candidate.enrichmentKey===key&&!force)||this.attempted.get(candidate.id)===key)continue;
        this.router.report('noiseless','queued',candidate.title);
        this.attempted.set(candidate.id,key);this.busy=`Clarifying “${candidate.title}”`;this.emit();
        try{
          const result=await this.router.enrich(candidate,this.graph);
          if(this.stopped)break;
          await this.serial(async()=>{
            if(this.stopped)return;
            const config=await this.store.config(),graph=await this.store.graph();
            await this.store.updateTask(candidate.id,current=>enrichmentKey(current,graph,config)!==key?current:{...current,inferred:result.data,provider:result.provider,pending:'',enrichmentKey:key});
          });
        }catch(e){if(this.stopped)break;await this.serial(()=>this.store.updateTask(candidate.id,t=>({...t,pending:(e as Error).message}))).catch(()=>{});}
        await this.refresh();
      }
    }finally{this.worker=false;this.busy='';this.emit();}
  }
  private link(task:Task){return safeLink(this.filePaths.get(task.id)??'',task.title);}
  async summaries(){
    const today=localDate(),ranked=rank(this.tasks,this.graph,this.config,today),plan=planDay(this.tasks,this.graph,this.config,today),stats=progress(this.tasks,today);
    const fallback=(text:string)=>`> [!note]- Markdown snapshot · ${today}\n${text.split('\n').map(line=>'> '+line).join('\n')}`;
    await this.store.section(paths.everything,'summary',fallback(`## All tasks\n\n${this.tasks.map(t=>`- ${t.status==='done'?'✓':'○'} ${this.link(t)} · ${effective(t).estimateMinutes} min · ${t.status}`).join('\n')||'Capture your first task above.'}`));
    await this.store.section(paths.today,'summary',fallback(`## Today · ${plan.remainingMinutes} / ${plan.capacity} minutes available\n\n${plan.sessions.map(s=>`- ${this.link(this.tasks.find(t=>t.id===s.taskId)!)} · ${s.minutes} min`).join('\n')||'Set your capacity in Setup or capture a task.'}\n\n${plan.conflicts.join('\n\n')}\n\n### Full priority order\n\n| Task | Priority | Estimate |\n|---|---:|---:|\n${ranked.map(r=>`| ${this.link(r.task)} | ${r.priority.toFixed(2)} | ${effective(r.task).estimateMinutes} min |`).join('\n')}`));
    await this.store.section(paths.progress,'summary',fallback(`## Output\n\n${stats.weekPoints.toFixed(1)} points this week · ${stats.points.toFixed(1)} all time · ${stats.done} completed tasks\n\nEstimated contribution, not verified outcomes.\n\n${stats.loggedMinutes} logged minutes · ${stats.estimatedMinutes} estimated minutes\n\n| Date | Output points | Effort minutes |\n|---|---:|---:|\n${stats.days.map(d=>`| ${d.date} | ${d.points.toFixed(1)} | ${d.minutes} |`).join('\n')}\n\n| Goal | Level | Output | Effort minutes |\n|---|---|---:|---:|\n${Object.values(stats.byGoal).map(g=>`| ${escapeCell(g.goal.title)} | ${g.goal.level} | ${g.points.toFixed(1)} | ${g.minutes.toFixed(0)} |`).join('\n')}`));
    const ledger=await this.router.ledger.all(),spent=ledger.filter(r=>localDate(new Date(r.at)).slice(0,7)===today.slice(0,7)).reduce((n,r)=>n+r.cost,0);
    await this.store.section(paths.diagnostics,'summary',`## This month\n\n$${spent.toFixed(4)} estimated / $${this.config.monthlyCloudBudget} budget\n\n| Time | Provider | Operation | State | Estimated USD | Message |\n|---|---|---|---|---:|---|\n${ledger.slice(-30).reverse().map(r=>`| ${r.at} | ${r.provider} | ${r.operation} | ${r.status} | ${r.cost.toFixed(5)} | ${escapeCell(r.message)} |`).join('\n')}`);
    const dayPath=`${ROOT}/Days/${today}.md`;
    if(!await this.store.io.exists(dayPath))await this.store.io.create(dayPath,`# ${today}\n`);
    await this.store.section(dayPath,'plan',`\`\`\`yaml\n${writeNote({schema:1,...plan},'').replace(/^---\n/,'').replace(/---\n$/,'')}\`\`\`\n\n${plan.sessions.map(s=>`- [[Noiseless/Tasks/${s.taskId}|${this.tasks.find(t=>t.id===s.taskId)?.title}]] · ${s.minutes} min`).join('\n')}`);
    const monday=new Date(`${today}T12:00:00`);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    const weekPath=`${ROOT}/Insights/Week of ${localDate(monday)}.md`;
    const roots=Object.values(stats.byGoal).filter(g=>g.goal.level==='L1').sort((a,b)=>b.minutes-a.minutes);
    const body=`# Weekly reflection\n\nAs of ${today}. These observations use recorded statistics; they do not infer milestone attainment.\n\n- **${stats.weekPoints.toFixed(1)} output points** in the last seven days.\n- **${stats.loggedMinutes} logged minutes** and **${stats.estimatedMinutes} estimated minutes** across recorded work.\n- ${roots[0]?`Most cumulative effort supports **${roots[0].goal.title}** (${roots[0].minutes.toFixed(0)} minutes).`:'Log a session or complete a task to see goal allocation.'}\n- **${this.tasks.filter(t=>t.status==='open'&&effective(t).due<today).length} open tasks** have past planning dates or deadlines.\n\n## A question for your next week\n\nDoes your observed allocation match what matters most right now? Adjust goals or ranking weights if your intentions have changed.\n`;
    if(!await this.store.io.exists(weekPath))await this.store.io.create(weekPath,'');await this.store.section(weekPath,'insight',body);
  }
}
