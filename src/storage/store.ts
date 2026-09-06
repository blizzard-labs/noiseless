import { z } from 'zod';
import { configSchema, defaultConfig, GoalGraph, graphSchema, Task, taskSchema, newTask } from '../core/model';
import { complete, validateGraph } from '../core/engine';
import { captureLines, managed, patchNote, readNote, syncCapture, taskNote, writeNote } from './markdown';

export interface VaultIO { list():Promise<string[]>; read(path:string):Promise<string>; exists(path:string):Promise<boolean>; create(path:string,text:string):Promise<void>; process(path:string,fn:(text:string)=>string):Promise<void>; }
export const ROOT='Noiseless';
export const paths={everything:`${ROOT}/Everything.md`,today:`${ROOT}/Today.md`,progress:`${ROOT}/Progress.md`,goals:`${ROOT}/Goals.md`,draft:`${ROOT}/Goal draft.md`,config:`${ROOT}/Setup.md`,diagnostics:`${ROOT}/Diagnostics.md`,brief:`${ROOT}/Goal brief.md`};
export const emptyGraph:GoalGraph={schema:1,version:1,goals:[]};
export class Store {
  constructor(readonly io:VaultIO){}
  async init(){for(const [p,t] of Object.entries(initialNotes()))if(!await this.io.exists(p))await this.io.create(p,t);}
  async config(){return readNote(await this.io.read(paths.config),configSchema).data;}
  async graph(){const g=readNote(await this.io.read(paths.goals),graphSchema).data;validateGraph(g);return g;}
  async taskFiles(){const files=(await this.io.list()).filter(p=>p.startsWith(`${ROOT}/Tasks/`)&&p.endsWith('.md'));const rows:{path:string;task:Task}[]=[];const ids=new Set<string>();
    for(const path of files){let task:Task;try{task=readNote(await this.io.read(path),taskSchema).data;}catch(e){throw new Error(`${path}: ${e instanceof z.ZodError?e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):(e as Error).message}`);}if(ids.has(task.id))throw new Error(`Duplicate task ID in ${path}; give the copied task a new ID.`);ids.add(task.id);rows.push({path,task});}return rows;
  }
  async updateTask(id:string,fn:(task:Task)=>Task){const file=(await this.taskFiles()).find(f=>f.task.id===id);if(!file)throw new Error('Task not found');let result:Task=file.task;
    await this.io.process(file.path,text=>patchNote(text,taskSchema,t=>result=taskSchema.parse(fn(t))));return result;
  }
  async mutate<T>(path:string,schema:z.ZodType<T>,fn:(d:T)=>T){await this.io.process(path,t=>patchNote(t,schema,fn));}
  async section(path:string,key:string,body:string){const text=await this.io.read(path);if(managed(text,key,body)===text)return;await this.io.process(path,t=>managed(t,key,body));}
  async put(path:string,text:string){if(await this.io.exists(path))await this.io.process(path,()=>text);else await this.io.create(path,text);}
  async capture(text:string){if(!text.trim())return;await this.io.process(paths.everything,s=>{
    const end='<!-- noiseless:capture:end -->';if(!s.includes(end))throw new Error('Restore the capture section in Everything');return s.replace(end,`${text.trim()}\n${end}`);
  });await this.ingest();}
  async ingest(){
    let items:ReturnType<typeof captureLines>['items']=[];
    await this.io.process(paths.everything,text=>{const parsed=captureLines(text);items=parsed.items;return parsed.text;});
    const existing=await this.taskFiles(),config=await this.config(),graph=await this.graph();
    for(const item of items){
      const old=existing.find(r=>r.task.id===item.id);
      if(!old){let t=newTask(item.title,item.id);t.captureState={title:item.title,done:item.done};if(item.done)t=complete(t,true,graph,config);await this.io.create(`${ROOT}/Tasks/${item.id}.md`,taskNote(t));}
      else if(old.task.captureState?.title!==item.title||old.task.captureState?.done!==item.done){await this.updateTask(item.id,t=>{if(t.captureState?.title!==item.title)t={...t,title:item.title,enrichmentKey:'',pending:'Task changed'};if(t.captureState?.done!==item.done)t=complete(t,item.done,graph,config);return {...t,captureState:{title:item.title,done:item.done}};});}
    }
  }
  async synchronizeCapture(task:Task){await this.updateTask(task.id,t=>({...t,captureState:t.captureState?{...t.captureState,done:task.status==='done'}:null}));await this.io.process(paths.everything,text=>syncCapture(text,task));}
  async approveDraft(){
    const draftText=await this.io.read(paths.draft),draft=readNote(draftText,graphSchema).data;validateGraph(draft);
    const current=await this.graph();const next={...draft,version:current.version+1};
    await this.io.create(`${ROOT}/History/Goals-${current.version}-${Date.now()}.md`,await this.io.read(paths.goals));
    await this.io.process(paths.goals,text=>patchNote(text,graphSchema,()=>next));
  }
}
export function initialNotes():Record<string,string>{
  const view=(title:string,page:string)=>`# ${title}\n\n\`\`\`noiseless\n${page}\n\`\`\`\n`;
  return {
    [`${ROOT}/README.md`]:`# Noiseless\n\nA little less noise. A little more progress.\n\n[[Noiseless/Today|Today]] · [[Noiseless/Everything|Everything]] · [[Noiseless/Progress|Progress]]\n\nStart with [[Noiseless/Setup|Setup]], then describe what matters in [[Noiseless/Goal brief|Goal brief]].\n\nAll your work stays in Markdown. The plugin adds an interactive layer.\n`,
    [paths.everything]:view('Everything','everything')+'\n## Capture\n\nJot one task per line here, or use the capture box above.\n\n<!-- noiseless:capture:start -->\n\n<!-- noiseless:capture:end -->\n',
    [paths.today]:view('Today','today'), [paths.progress]:view('Progress','progress'),
    [paths.goals]:writeNote(emptyGraph,view('Your goals','goals')),
    [paths.draft]:writeNote(emptyGraph,'\n# Goal draft\n\nReview goal descriptions, success criteria, dates, and parent weights in Properties (Source mode). Then run **Noiseless: Approve goal draft**. Each child’s parent weights total 1.\n'),
    [paths.brief]:'# What matters to you?\n\nDescribe your life missions, milestones, checkpoints, and what success looks like. Include dates where you know them. Replace this paragraph with your own goals, then run **Noiseless: Draft goals from brief**.\n',
    [paths.config]:writeNote(defaultConfig,'\n# Make room for what matters\n\n```noiseless\nsetup\n```\n\n## One-time setup\n\nIn Source mode, edit the properties above:\n\n1. Set weekdayMinutes and weekendMinutes (focused work, not your entire workday).\n2. Start the local server in LM Studio → Developer. Put its loaded model identifier under providers.lmstudio.model.\n3. Optionally enable OpenAI and Anthropic, set their model IDs and current USD input/output rates per million tokens, and choose a monthlyCloudBudget. Cloud stays paused until a positive budget and rates are configured.\n4. Store API keys in Obsidian Settings → Noiseless. Only credential names belong here.\n5. Describe goals in [[Noiseless/Goal brief]], draft them, then review [[Noiseless/Goal draft]] before approval.\n\n## Priority weights\n\nWeights are relative and editable. An all-zero set is invalid. Bump rubricVersion if you change your scoring interpretation. Daily overrides use YYYY-MM-DD keys.\n\n## Scoring anchors\n\nImpact: 1 = minor maintenance; 5 = meaningful checkpoint deliverable; 10 = major measurable outcome.\nMission fit: 1 = little causal connection; 5 = useful indirect support; 10 = direct, substantial mission contribution.\nReputation: 1 = private or negligible external effect; 5 = strengthens a meaningful relationship; 10 = major durable trust or visibility.\n\nChange task values in its overrides properties to preserve them across enrichment. A due override should include dateKind: explicit.\n'),
    [paths.diagnostics]:'# Diagnostics\n\nProvider activity and recoverable errors appear here. No API keys or request bodies are recorded.\n'
  };
}
