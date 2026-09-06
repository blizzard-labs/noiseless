import { addDays, Config, dayDifference, effective, Factor, factors, Goal, GoalGraph, localDate, Snapshot, Task, uid } from './model';

export const clamp = (x:number,a:number,b:number) => Math.max(a,Math.min(b,x));
export function validateGraph(graph:GoalGraph):void {
  const byId=new Map(graph.goals.map(g=>[g.id,g]));
  if(byId.size!==graph.goals.length) throw new Error('Goal IDs must be unique');
  for(const g of graph.goals){
    if(g.id==='unsorted') throw new Error('unsorted is a reserved goal ID');
    if(g.level==='L1' && g.parents.length) throw new Error('L1 missions cannot have parents');
    if(g.level!=='L1' && Math.abs(g.parents.reduce((s,p)=>s+p.weight,0)-1)>1e-6) throw new Error(`${g.title}: connections must total 100%`);
    if(new Set(g.parents.map(p=>p.parentId)).size!==g.parents.length) throw new Error(`${g.title}: duplicate parent`);
    for(const p of g.parents){
      const parent=byId.get(p.parentId);
      if(!parent || Number(parent.level[1])!==Number(g.level[1])-1) throw new Error(`${g.title}: connect only to the next level above`);
    }
  }
}
export function attribution(goalId:string,graph:GoalGraph):Record<string,number>{
  const out:Record<string,number>={};
  const walk=(id:string,w:number)=>{const g=graph.goals.find(g=>g.id===id);if(!g)return;out[id]=(out[id]??0)+w;g.parents.forEach(p=>walk(p.parentId,w*p.weight));};
  walk(goalId,1);return out;
}
export function capacity(config:Config,date:string):number{
  const day=new Date(`${date}T12:00:00`).getDay();
  return config.dailyOverrides[date]??((day===0||day===6?config.weekendMinutes:config.weekdayMinutes)??0);
}
export function remaining(task:Task):number{return Math.max(0,effective(task).estimateMinutes-task.sessions.reduce((s,x)=>s+x.minutes,0));}
export function effectiveDue(task:Task,graph:GoalGraph):string{
  const e=effective(task),g=graph.goals.find(g=>g.id===e.goalId);return g&&g.due<e.due?g.due:e.due;
}
export function scores(task:Task,graph:GoalGraph,config:Config,today=localDate()):Record<Factor,number>{
  const e=effective(task),shares=attribution(e.goalId,graph),roots=graph.goals.filter(g=>g.level==='L1');
  const maxImportance=Math.max(1,...roots.map(g=>g.importance));
  const alignment=clamp(roots.reduce((n,g)=>n+(shares[g.id]??0)*(e.missionFit.find(f=>f.goalId===g.id)?.score??1)*g.importance/maxImportance,0),1,10);
  const regular=Math.max(1,config.weekdayMinutes??config.weekendMinutes??240);
  const slack=dayDifference(effectiveDue(task,graph),today)-remaining(task)/regular;
  const rate=e.impact/(e.estimateMinutes/60);
  return {urgency:clamp(10-9*slack/14,1,10),alignment,impact:e.impact,roi:1+9*rate/(rate+10),reputation:e.reputation};
}
export function rank(tasks:Task[],graph:GoalGraph,config:Config,today=localDate()){
  const sum=Object.values(config.weights).reduce((s,x)=>s+x,0);
  return tasks.filter(t=>t.status==='open'&&(!t.snoozedUntil||t.snoozedUntil<=today)).map(task=>{
    const values=scores(task,graph,config,today);
    const contributions=Object.fromEntries(factors.map(k=>[k,values[k]*config.weights[k]/sum])) as Record<Factor,number>;
    return {task,values,contributions,priority:Object.values(contributions).reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>b.priority-a.priority||effectiveDue(a.task,graph).localeCompare(effectiveDue(b.task,graph))||a.task.createdAt.localeCompare(b.task.createdAt)||a.task.id.localeCompare(b.task.id));
}
export interface DailyPlan { date:string; capacity:number; loggedMinutes:number; remainingMinutes:number; sessions:{taskId:string;minutes:number;priority:number}[]; conflicts:string[]; }
export function planDay(tasks:Task[],graph:GoalGraph,config:Config,today=localDate()):DailyPlan{
  const total=capacity(config,today),logged=tasks.flatMap(t=>t.sessions).filter(s=>s.date===today).reduce((n,s)=>n+s.minutes,0);
  let budget=Math.max(0,total-logged);const ranked=rank(tasks,graph,config,today),sessions:DailyPlan['sessions']=[];
  const conflicts=ranked.filter(r=>remaining(r.task)===0).map(r=>`${r.task.title}: estimate used up; revise the estimate or mark complete.`);
  for(const r of ranked){if(budget<=0)break;const minutes=Math.min(60,remaining(r.task),budget);if(minutes>0){sessions.push({taskId:r.task.id,minutes,priority:r.priority});budget-=minutes;}}
  const dueWork=ranked.filter(r=>effectiveDue(r.task,graph)<=today).reduce((n,r)=>n+remaining(r.task),0);
  if(dueWork>Math.max(0,total-logged)) conflicts.push(`${dueWork} minutes due or overdue exceeds today's remaining capacity.`);
  return {date:today,capacity:total,loggedMinutes:logged,remainingMinutes:Math.max(0,total-logged),sessions,conflicts};
}
export function freeze(task:Task,graph:GoalGraph,config:Config,now=new Date()):Snapshot{
  if(task.snapshot)return task.snapshot;const values=scores(task,graph,config,localDate(now));
  return {at:now.toISOString(),impact:values.impact,alignment:values.alignment,points:values.impact*values.alignment,estimateMinutes:effective(task).estimateMinutes,graphVersion:graph.version,rubricVersion:config.rubricVersion,attribution:attribution(effective(task).goalId,graph),goals:structuredClone(graph.goals)};
}
export function logSession(task:Task,minutes:number,graph:GoalGraph,config:Config,now=new Date()):Task{
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('Minutes must be between 1 and 1440');
  return {...task,snapshot:freeze(task,graph,config,now),sessions:[...task.sessions,{id:uid(),at:now.toISOString(),date:localDate(now),minutes}]};
}
export function complete(task:Task,done:boolean,graph:GoalGraph,config:Config,now=new Date()):Task{
  if((task.status==='done')===done)return task;
  return {...task,status:done?'done':'open',snapshot:done?freeze(task,graph,config,now):task.snapshot,history:[...task.history,{id:uid(),at:now.toISOString(),date:localDate(now),action:done?'complete':'reopen'}]};
}
export interface Progress {points:number;weekPoints:number;done:number;loggedMinutes:number;estimatedMinutes:number;byGoal:Record<string,{goal:Goal;points:number;minutes:number}>;days:{date:string;points:number;minutes:number}[];}
export function progress(tasks:Task[],today=localDate()):Progress{
  const out:Progress={points:0,weekPoints:0,done:0,loggedMinutes:0,estimatedMinutes:0,byGoal:{},days:Array.from({length:14},(_,i)=>({date:addDays(today,i-13),points:0,minutes:0}))};
  for(const t of tasks){
    const s=t.snapshot;if(!s)continue;
    const awarded=t.status==='done'?s.points:0;
    const event=[...t.history].reverse().find(e=>e.action==='complete');
    out.points+=awarded;if(t.status==='done')out.done++;
    if(event&&event.date>=addDays(today,-6)&&event.date<=today)out.weekPoints+=awarded;
    if(event){const day=out.days.find(d=>d.date===event.date);if(day)day.points+=awarded;}
    const logged=t.sessions.reduce((n,x)=>n+x.minutes,0),estimated=t.status==='done'&&!t.sessions.length?s.estimateMinutes:0;
    out.loggedMinutes+=logged;out.estimatedMinutes+=estimated;
    t.sessions.forEach(s=>{const d=out.days.find(d=>d.date===s.date);if(d)d.minutes+=s.minutes;});
    if(event&&estimated){const d=out.days.find(d=>d.date===event.date);if(d)d.minutes+=estimated;}
    for(const [id,share] of Object.entries(s.attribution)){
      const goal=s.goals.find(g=>g.id===id);if(!goal)continue;
      const row=out.byGoal[id]??={goal,points:0,minutes:0};row.points+=awarded*share;row.minutes+=(logged+estimated)*share;
    }
  }
  return out;
}
