import { addDays, effective, factors, localDate, Task, Provider } from '../core/model';
import { attribution, planDay, progress, rank, scores } from '../core/engine';
import { paths } from '../storage/store';
import { Service } from '../service';
import { DraftReview } from './draft';

export type Page='everything'|'today'|'progress'|'goals'|'setup';
export interface Host {open(path:string):void;notify(message:string):void;}
interface ViewState {expanded:Set<string>;draft:string;search:string;showDone:boolean;}
const states=new WeakMap<Service,Map<Page,ViewState>>();
export class Dashboard {
  private goalMap?:DraftReview;
  private state:ViewState;private pendingRender=false;
  private get expanded(){return this.state.expanded;}private get draft(){return this.state.draft;}private set draft(v:string){this.state.draft=v;}
  private get search(){return this.state.search;}private set search(v:string){this.state.search=v;}
  private get showDone(){return this.state.showDone;}private set showDone(v:boolean){this.state.showDone=v;}
  private listener=()=>{if(this.goalMap?.isEditing){this.pendingRender=true;return;}const a=this.root.ownerDocument.activeElement;if(a&&this.root.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){this.pendingRender=true;return;}this.render();};
  private focusout=()=>setTimeout(()=>{if(this.pendingRender){this.pendingRender=false;this.listener();}},0);
  constructor(readonly root:HTMLElement,readonly page:Page,readonly service:Service,readonly host:Host){let pages=states.get(service);if(!pages){pages=new Map();states.set(service,pages);}this.state=pages.get(page)??{expanded:new Set(),draft:'',search:'',showDone:false};pages.set(page,this.state);root.classList.add('noiseless');root.addEventListener('focusout',this.focusout);service.listeners.add(this.listener);this.render();}
  destroy(){this.goalMap?.destroy();this.service.listeners.delete(this.listener);this.root.removeEventListener('focusout',this.focusout);}
  private el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text='',parent:HTMLElement=this.root):HTMLElementTagNameMap[K]{const e=this.root.ownerDocument.createElement(tag);e.className=cls;e.textContent=text;parent.append(e);return e;}
  private button(parent:HTMLElement,text:string,fn:()=>void|Promise<void>,cls='nl-button'){const b=this.el('button',cls,text,parent);b.type='button';b.addEventListener('click',()=>void this.run(fn,b));return b;}
  private async run(fn:()=>void|Promise<void>,button?:HTMLButtonElement){if(button)button.disabled=true;try{await fn();}catch(e){this.host.notify((e as Error).message);}finally{if(button?.isConnected)button.disabled=false;}}
  private open(path:string){this.host.open(path);}
  private input(parent:HTMLElement,label:string,type='text',value=''){const l=this.el('label','nl-field',label,parent);const i=this.el('input','', '',l);i.type=type;i.value=value;if(type==='checkbox')l.classList.add('nl-checkbox-field');i.setAttribute('aria-label',label);return i;}
  render(){
    const s=this.service;this.goalMap?.destroy();this.root.replaceChildren();this.root.classList.toggle('nl-goals-page',this.page==='goals');
    const nav=this.el('nav','nl-nav');nav.setAttribute('aria-label','Noiseless');
    this.el('span','nl-brand','◌  noiseless',nav);
    for(const p of ['today','everything','progress','goals','setup'] as const){const b=this.button(nav,p[0].toUpperCase()+p.slice(1),()=>this.open(p==='setup'?paths.config:paths[p]),`nl-tab ${p===this.page?'is-active':''}`);if(p===this.page)b.setAttribute('aria-current','page');}
    if(s.error){const error=this.el('div','nl-alert',s.error);error.setAttribute('role','alert');this.button(error,'Open setup',()=>this.open(paths.config));return;}
    if(this.page==='today')this.today();if(this.page==='everything')this.everything();if(this.page==='progress')this.progress();if(this.page==='goals')this.goals();if(this.page==='setup')this.setup();
    this.arrangePage();
    const footer=this.el('footer','nl-footer');this.button(footer,'Goals',()=>this.open(paths.goals),'nl-link');this.button(footer,'Setup',()=>this.open(paths.config),'nl-link');
    const status=this.el('span','nl-status',s.busy?'● Working quietly…':`${s.tasks.filter(t=>!!t.pending&&t.status!=='done').length} awaiting enrichment`,footer);status.setAttribute('aria-live','polite');
    this.button(footer,'Refresh estimates',()=>s.enrich(true),'nl-link');
  }
  private arrangePage(){
    const sections=Array.from(this.root.children).filter(el=>!el.classList.contains('nl-nav'));
    const content=this.el('div',`nl-page-content nl-page-${this.page}`);
    if(this.page==='everything'||this.page==='today'){
      const side=this.el('aside','nl-page-sidebar','',content),main=this.el('div','nl-page-main','',content);
      sections.forEach((section,index)=>(index===0?side:main).append(section));
    }else sections.forEach(section=>content.append(section));
  }
  private capture(parent:HTMLElement){const form=this.el('form','nl-capture','',parent);const textarea=this.el('textarea','','',form);textarea.placeholder='What’s on your mind?';textarea.rows=2;textarea.value=this.draft;textarea.setAttribute('aria-label','Capture tasks, one per line');textarea.addEventListener('input',()=>this.draft=textarea.value);
    const bottom=this.el('div','nl-capture-bottom','',form);this.el('span','nl-hint','One task per line · ⌘/Ctrl + Enter to capture',bottom);
    const b=this.button(bottom,'Capture ↗',async()=>{const text=this.draft;if(!text.trim())return;await this.service.capture(text);this.draft='';this.render();},'nl-button nl-primary');
    form.addEventListener('submit',e=>{e.preventDefault();b.click();});textarea.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();b.click();}});
  }
  private everything(){this.capture(this.root);const toolbar=this.el('div','nl-toolbar');const search=this.input(toolbar,'Find a task','search',this.search);search.placeholder='Search tasks';search.addEventListener('input',()=>{this.search=search.value;const list=this.root.querySelector('.nl-task-list')!;for(const row of list.children as HTMLCollectionOf<HTMLElement>)row.hidden=!row.dataset.title?.includes(this.search.toLowerCase());});
    this.button(toolbar,this.showDone?'Hide completed':'Show completed',()=>{this.showDone=!this.showDone;this.render();},'nl-link');
    const list=this.el('div','nl-task-list');const tasks=this.service.tasks.filter(t=>this.showDone||t.status!=='done').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    tasks.forEach(t=>{const row=this.task(list,t);row.dataset.title=t.title.toLowerCase();row.hidden=!t.title.toLowerCase().includes(this.search.toLowerCase());});
    if(!tasks.length)this.empty(list,'A clear head starts here.','Jot down a task. No dates, tags, or fields required.');
  }
  private today(){const s=this.service,p=planDay(s.tasks,s.graph,s.config),ranked=rank(s.tasks,s.graph,s.config);
    const capacity=this.el('section','nl-capacity');const top=this.el('div','nl-spread','',capacity);this.el('span','nl-label','YOUR FOCUS BUDGET',top);this.el('strong','',`${p.remainingMinutes} min available`,top);
    const meter=this.el('progress','nl-meter','',capacity);meter.max=Math.max(1,p.capacity);meter.value=Math.min(p.loggedMinutes,p.capacity);meter.setAttribute('aria-label',`${p.loggedMinutes} of ${p.capacity} minutes logged`);
    const bottom=this.el('div','nl-spread','',capacity);this.el('span','nl-hint',`${p.loggedMinutes} logged · ${p.capacity} planned`,bottom);
    const details=this.el('details','','',bottom);this.el('summary','nl-link','Adjust today',details);const field=this.input(details,'Focused minutes','number',String(p.capacity));field.min='0';field.max='1440';this.button(details,'Save',()=>s.dailyCapacity(Number(field.value)));
    if(!p.capacity){this.empty(this.root,'Give today a little room.','Set your normal focused-work capacity in Setup, or adjust today above.');this.button(this.root,'Set up capacity',()=>this.open(paths.config),'nl-button nl-primary');}
    if(p.conflicts.length){const a=this.el('details','nl-alert');this.el('summary','',`${p.conflicts.length} planning ${p.conflicts.length===1?'note':'notes'}`,a);p.conflicts.forEach(c=>this.el('p','',c,a));}
    if(p.sessions.length){this.el('h3','nl-section-label','UP NEXT');const first=p.sessions[0];this.task(this.root,s.tasks.find(t=>t.id===first.taskId)!,first.minutes,true);
      if(p.sessions.length>1){this.el('h3','nl-section-label','THEN, WHEN YOU’RE READY');const list=this.el('div','nl-task-list');p.sessions.slice(1).forEach(x=>this.task(list,s.tasks.find(t=>t.id===x.taskId)!,x.minutes));}
    }else if(p.capacity)this.empty(this.root,'Room to breathe.','No more sessions fit today. Capture a task, revise a used-up estimate, or enjoy the space.');
    const all=this.el('details','nl-secondary');this.el('summary','',`Full priority list · ${ranked.length} tasks`,all);ranked.forEach(r=>this.task(all,r.task));
  }
  private task(parent:HTMLElement,t:Task,session?:number,hero=false):HTMLElement{
    const s=this.service,e=effective(t),goal=s.graph.goals.find(g=>g.id===e.goalId),row=this.el('article',`nl-task ${hero?'nl-hero':''} ${t.status==='done'?'is-done':''}`,'',parent);
    const head=this.el('div','nl-task-head','',row);const check=this.el('input','nl-check','',head);check.type='checkbox';check.checked=t.status==='done';check.setAttribute('aria-label',`Complete ${t.title}`);check.addEventListener('change',()=>void this.run(()=>s.toggle(t.id,check.checked)));
    const center=this.el('div','nl-task-main','',head);if(hero)this.el('p','nl-eyebrow','YOUR NEXT STEP',center);this.el(hero?'h3':'p','nl-task-title',t.title,center);
    const meta=this.el('div','nl-task-meta','',center);this.el('span','nl-goal-tag',goal?.title??'Unsorted',meta);this.el('span','',`${session??e.estimateMinutes} min${session&&session<e.estimateMinutes?' session':''}`,meta);
    if(e.due<localDate())this.el('span','nl-date-alert',e.dateKind==='explicit'?'Overdue':'Past planning date',meta);
    if(t.status==='blocked')this.el('span','','Blocked',meta);if(t.snoozedUntil&&t.snoozedUntil>localDate())this.el('span','',`Snoozed to ${t.snoozedUntil}`,meta);if(t.pending)this.el('span','nl-pending','Pending',meta);
    const more=this.el('details','nl-task-details','',row);more.open=this.expanded.has(t.id);this.el('summary','nl-link','Details & scores',more);more.addEventListener('toggle',()=>more.open?this.expanded.add(t.id):this.expanded.delete(t.id));
    const values=scores(t,s.graph,s.config),sum=Object.values(s.config.weights).reduce((a,b)=>a+b,0);
    const total=factors.reduce((n,k)=>n+values[k]*s.config.weights[k]/sum,0);this.el('p','nl-rank',`Priority ${total.toFixed(2)} / 10`,more);
    for(const k of factors){const line=this.el('div','nl-score-line','',more);this.el('span','',k[0].toUpperCase()+k.slice(1),line);const meter=this.el('progress','nl-score-meter','',line);meter.max=10;meter.value=values[k];meter.setAttribute('aria-label',`${k}: ${values[k].toFixed(1)} out of 10`);this.el('span','',`${values[k].toFixed(1)} × ${(100*s.config.weights[k]/sum).toFixed(0)}% = ${(values[k]*s.config.weights[k]/sum).toFixed(2)}`,line);}
    this.el('p','nl-rationale',e.rationale,more);this.el('p','nl-hint',`${e.dateKind==='explicit'?'Deadline':'Inferred planning date'}: ${e.due} · ${t.provider||'Provisional'} · confidence ${(e.confidence*100).toFixed(0)}%`,more);
    if(t.pending)this.el('p','nl-hint',t.pending,more);
    const form=this.el('div','nl-edit-grid','',more);const duration=this.input(form,'Estimated minutes','number',String(e.estimateMinutes));duration.min='1';
    const due=this.input(form,'Deadline override (optional)','date',t.overrides.due??'');
    const label=this.el('label','nl-field','Goal',form),select=this.el('select','','',label);for(const g of [{id:'unsorted',title:'Unsorted'},...s.graph.goals.filter(g=>g.level==='L3')]){const o=this.el('option','',g.title,select);o.value=g.id;}select.value=e.goalId;
    this.button(more,'Save overrides',()=>{const patch:Partial<Task['overrides']>={};if(Number(duration.value)!==e.estimateMinutes)patch.estimateMinutes=Number(duration.value);if(due.value){patch.due=due.value;patch.dateKind='explicit';}if(select.value!==e.goalId)patch.goalId=select.value;return s.override(t.id,patch);});
    const actions=this.el('div','nl-task-actions','',more);this.button(actions,'Open Markdown',()=>this.open(s.filePaths.get(t.id)!),'nl-link');
    if(t.status!=='done'){this.button(actions,t.status==='blocked'?'Unblock':'Block',()=>s.status(t.id,t.status==='blocked'?'open':'blocked'),'nl-link');this.button(actions,'Snooze to tomorrow',()=>s.status(t.id,'open',addDays(localDate(),1)),'nl-link');}
    if(t.snapshot)this.el('p','nl-hint',`Fixed output credit: ${t.snapshot.points.toFixed(1)} points · graph v${t.snapshot.graphVersion}`,more);
    if(t.status!=='done'){
      const log=this.el('div',`nl-log ${hero?'nl-log-hero':''}`,'',row);const minutes=this.input(log,'Session minutes','number',String(session??Math.min(60,e.estimateMinutes)));minutes.min='1';minutes.max='1440';
      this.button(log,'Log session',()=>s.session(t.id,Number(minutes.value)),hero?'nl-button nl-primary':'nl-button');
      if(!hero){more.append(log);}else this.el('span','nl-hint','Optional · credit arrives when the task is complete',log);
    }
    return row;
  }
  private progress(){const s=this.service,p=progress(s.tasks);const cards=this.el('div','nl-stats');for(const [label,value,sub]of [['This week',p.weekPoints.toFixed(1),'output points'],['All time',p.points.toFixed(1),'output points'],['Completed',String(p.done),'tasks']]){const card=this.el('section','nl-stat','',cards);this.el('p','nl-label',label,card);this.el('strong','nl-stat-value',value,card);this.el('p','nl-hint',sub,card);}
    this.el('p','nl-hint','Estimated contribution to your goals. Outcome attainment is recorded separately.');
    const activity=this.el('section','nl-panel nl-activity-panel');this.el('h3','','A little progress, day by day',activity);const chart=this.el('div','nl-chart','',activity);chart.setAttribute('role','img');chart.setAttribute('aria-label','Output points over the last fourteen days');const max=Math.max(1,...p.days.map(d=>d.points));
    for(const day of p.days){const col=this.el('div','nl-chart-column','',chart),bar=this.el('div','nl-chart-bar','',col);bar.style.height=`${Math.max(2,day.points/max*100)}%`;bar.title=`${day.date}: ${day.points.toFixed(1)} points`;this.el('span','nl-chart-day',day.date.slice(8),col);}
    const table=this.el('details','nl-secondary','',activity);this.el('summary','nl-link','Read chart values',table);p.days.forEach(d=>this.el('p','nl-hint',`${d.date}: ${d.points.toFixed(1)} points · ${d.minutes} minutes`,table));
    this.el('h3','nl-section-label','WHERE YOUR EFFORT GOES');this.el('p','nl-hint',`${p.loggedMinutes} logged minutes · ${p.estimatedMinutes} estimated minutes. Totals are shown separately at each level.`);
    for(const level of ['L1','L2','L3']){const rows=Object.values(p.byGoal).filter(x=>x.goal.level===level).sort((a,b)=>b.minutes-a.minutes);if(!rows.length)continue;const section=this.el('section','nl-panel nl-allocation-panel');this.el('h3','',level==='L1'?'Life missions':level==='L2'?'Milestones':'Checkpoints',section);const total=rows.reduce((n,x)=>n+x.minutes,0);rows.forEach(g=>{const row=this.el('div','nl-allocation','',section);const line=this.el('div','nl-spread','',row);this.el('span','',g.goal.title,line);this.el('span','nl-hint',`${Math.round(g.minutes)} min · ${g.points.toFixed(1)} pts`,line);const meter=this.el('progress','nl-meter','',row);meter.max=Math.max(1,total);meter.value=g.minutes;meter.setAttribute('aria-label',`${g.goal.title}: ${Math.round(g.minutes)} minutes`);});}
    if(!Object.keys(p.byGoal).length)this.empty(this.root,'Your first steps will appear here.','Log a work session or complete a task linked to your goals.');
    const milestones=s.graph.goals.filter(g=>g.achieved);if(milestones.length){this.el('h3','nl-section-label','MILESTONES REACHED');milestones.forEach(g=>this.el('p','','✓ '+g.title));}
    this.button(this.root,'Browse weekly reflections',()=>this.open('Noiseless/Insights/Week of '+this.monday()+'.md'),'nl-link');
  }
  private monday(){const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return localDate(d);}
  private goals(){const s=this.service;this.goalMap=new DraftReview(this.el('section','nl-active-goal-map'),s,this.host,'goals');if(!s.graph.goals.length)this.empty(this.root,'Give your work a direction.','Describe your missions, milestones, and checkpoints. Review the AI draft before activating it.');
    const tools=this.el('div','nl-toolbar');this.button(tools,'Write goal brief',()=>this.open(paths.brief));this.button(tools,'Draft from brief',async()=>{await s.draft();this.open(paths.draft);});this.button(tools,'Review draft',()=>this.open(paths.draft),'nl-link');
    this.manualDraft();
    for(const level of ['L1','L2','L3']){const goals=s.graph.goals.filter(g=>g.level===level);if(!goals.length)continue;this.el('h3','nl-section-label',level==='L1'?'LIFE MISSIONS':level==='L2'?'LARGE MILESTONES':'MAJOR CHECKPOINTS');for(const g of goals){const card=this.el('details','nl-goal-card');this.el('summary','',`${g.achieved?'✓ ':''}${g.title}`,card);this.el('p','',g.description,card);this.el('p','nl-rationale',`Success: ${g.successCriteria}`,card);this.el('p','nl-hint',`${g.dateKind==='inferred'?'Inferred target':'Target'}: ${g.due}`,card);
      for(const p of g.parents){const parent=s.graph.goals.find(x=>x.id===p.parentId);const row=this.el('div','nl-allocation','',card);this.el('span','nl-hint',`${Math.round(p.weight*100)}% → ${parent?.title}`,row);const bar=this.el('progress','nl-meter','',row);bar.max=1;bar.value=p.weight;bar.setAttribute('aria-label',`${Math.round(p.weight*100)}% to ${parent?.title}`);}
      const map=this.el('details','nl-secondary','',card);this.el('summary','nl-link','Contribution paths',map);this.relationshipDiagram(map,g.id);for(const [id,share]of Object.entries(attribution(g.id,s.graph)))this.el('p','nl-hint',`${g.title} → ${s.graph.goals.find(g=>g.id===id)?.title}: ${(share*100).toFixed(0)}%`,map);
      this.button(card,g.achieved?'Reopen outcome':'Mark outcome achieved',()=>s.goalOutcome(g.id,!g.achieved),'nl-link');this.el('p','nl-hint','Mark achieved only after verifying the success criteria.',card);
    }}
  }
  private relationshipDiagram(parent:HTMLElement,id:string){
    const graph=this.service.graph,shares=attribution(id,graph),goals=graph.goals.filter(g=>shares[g.id]);
    const columns=['L3','L2','L1'].map(level=>goals.filter(g=>g.level===level));
    const positions=new Map<string,{x:number;y:number}>();columns.forEach((col,i)=>col.forEach((g,j)=>positions.set(g.id,{x:12+i*218,y:35+j*85})));
    const height=Math.max(1,...columns.map(c=>c.length))*85+20;
    const box=this.el('div','nl-map','',parent),ns='http://www.w3.org/2000/svg';const svg=this.root.ownerDocument.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 650 ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Weighted contribution paths from checkpoint to life mission');box.append(svg);
    const node=(tag:string,attrs:Record<string,string>,text='')=>{const e=this.root.ownerDocument.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;svg.append(e);return e;};
    for(const g of goals){const a=positions.get(g.id)!;for(const edge of g.parents){const b=positions.get(edge.parentId);if(!b)continue;node('path',{d:`M ${a.x+180} ${a.y+23} C ${a.x+200} ${a.y+23}, ${b.x-20} ${b.y+23}, ${b.x} ${b.y+23}`,fill:'none',stroke:'var(--text-faint)','stroke-width':'1.5'});node('text',{x:String((a.x+180+b.x)/2),y:String((a.y+b.y)/2+15),'text-anchor':'middle',fill:'var(--text-muted)','font-size':'9'},`${Math.round(edge.weight*100)}%`);}}
    for(const g of goals){const p=positions.get(g.id)!;node('rect',{x:String(p.x),y:String(p.y),width:'180',height:'46',rx:'7',fill:'var(--background-secondary)',stroke:'var(--background-modifier-border)'});node('text',{x:String(p.x+10),y:String(p.y+15),'font-size':'9',fill:'var(--text-muted)'},g.level);const label=node('text',{x:String(p.x+10),y:String(p.y+33),'font-size':'11',fill:'var(--text-normal)'},g.title.length>25?g.title.slice(0,23)+'…':g.title);const title=this.root.ownerDocument.createElementNS(ns,'title');title.textContent=g.title;label.append(title);}
  }
  private setup(){const c=this.service.config;const panel=this.el('section','nl-panel');this.el('h3','','Your normal focus budget',panel);const form=this.el('div','nl-edit-grid','',panel);const weekday=this.input(form,'Weekday minutes','number',c.weekdayMinutes===null?'':String(c.weekdayMinutes));const weekend=this.input(form,'Weekend minutes','number',c.weekendMinutes===null?'':String(c.weekendMinutes));weekday.min=weekend.min='0';
    this.button(panel,'Save capacity',async()=>{const {configSchema}=await import('../core/model');await this.service.store.mutate(paths.config,configSchema,c=>({...c,weekdayMinutes:weekday.value===''?null:Number(weekday.value),weekendMinutes:weekend.value===''?null:Number(weekend.value)}));await this.service.refresh();},'nl-button nl-primary');
    const weightsPanel=this.el('section','nl-panel');this.el('h3','','Priority weights',weightsPanel);
    this.el('p','nl-hint','Choose how much each factor contributes to priority. Weights are relative and do not need to total 100. Set a factor to 0 to exclude it.',weightsPanel);
    this.el('p','nl-hint','Use the Goals tab to write your goal brief and review a draft before approving it.',weightsPanel);
    const weightsForm=this.el('div','nl-edit-grid','',weightsPanel);
    const labels={urgency:'Urgency',alignment:'Goal alignment',impact:'Expected impact',roi:'Return on effort',reputation:'Reputation'};
    const weightFields=factors.map(factor=>{const input=this.input(weightsForm,`${labels[factor]} weight`,'number',String(c.weights[factor]));input.min='0';input.step='any';return {factor,input};});
    const shares=this.el('p','nl-hint','',weightsPanel);shares.setAttribute('aria-live','polite');
    const updateShares=()=>{const values=weightFields.map(({input})=>input.value.trim()===''?NaN:Number(input.value));const total=values.reduce((sum,value)=>sum+value,0);
      shares.textContent=values.some(value=>!Number.isFinite(value)||value<0)?'Enter a non-negative number for each weight.':total===0?'At least one weight must be greater than zero.':weightFields.map(({factor},i)=>`${labels[factor]}: ${(100*values[i]/total).toFixed(1)}%`).join(' · ');
    };weightFields.forEach(({input})=>input.addEventListener('input',updateShares));updateShares();
    this.button(weightsPanel,'Save priority weights',async()=>{
      const weights={...this.service.config.weights};for(const {factor,input} of weightFields){const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||value<0)throw new Error('Enter a non-negative number for each priority weight.');weights[factor]=value;}
      if(!Object.values(weights).some(value=>value>0))throw new Error('At least one priority weight must be greater than zero.');
      const {configSchema}=await import('../core/model');await this.service.store.mutate(paths.config,configSchema,c=>({...c,weights}));await this.service.refresh();this.host.notify('Priority weights saved. Priorities and today’s plan have been updated.');
    },'nl-button nl-primary');
    this.manualDraft();
    for(const provider of ['lmstudio','openai','anthropic'] as const)this.connection(provider);
    const budgetPanel=this.el('section','nl-panel nl-budget-panel');this.el('h3','','Cloud spending limit',budgetPanel);
    const budget=this.input(budgetPanel,'Monthly cloud budget (USD)','number',String(c.monthlyCloudBudget));budget.min='0';budget.step='0.01';
    this.el('p','nl-hint','Zero pauses cloud processing. Set current token prices in each cloud connection. This is a local spending estimate.',budgetPanel);
    this.button(budgetPanel,'Save cloud budget',async()=>{const {configSchema}=await import('../core/model');if(!budget.value.trim())throw new Error('Enter a monthly budget, or 0 to pause cloud processing.');await this.service.store.mutate(paths.config,configSchema,c=>({...c,monthlyCloudBudget:Number(budget.value)}));await this.service.refresh();this.host.notify('Cloud budget saved.');});

  }
  private manualDraft(){
    const panel=this.el('section','nl-panel nl-manual-panel');this.el('h3','','Draft goals with your own agent',panel);
    this.el('p','nl-hint','Export one Markdown prompt with your goal brief, current goals, instructions, and output schema. Give it to ChatGPT, Claude, or another agent. No model request is made by these controls.',panel);
    this.button(panel,'Export goal prompt',async()=>this.open(await this.service.exportDraftPrompt()));
    this.el('p','nl-hint','Save the returned JSON in Noiseless/Goal exchange/Outputs, then enter its filename below. A Markdown file containing one JSON code block also works. Export creates the folder.',panel);
    const fields=this.el('div','nl-edit-grid','',panel);const filename=this.input(fields,'Output filename','text','result.json');
    this.button(panel,'Import for review',async()=>{await this.service.importDraftOutput(filename.value.trim());this.open(paths.draft);this.host.notify('Imported for review. Run Approve goal draft only after reviewing it.');});
    this.el('p','nl-hint','Import validates the graph, archives the previous draft, and updates Goal draft.md. Active goals stay unchanged until you approve.',panel);
  }
  private connection(provider:Provider){
    const p=this.service.config.providers[provider],local=provider==='lmstudio',name=local?'LM Studio':provider==='openai'?'OpenAI':'Anthropic';
    const panel=this.el('section','nl-panel');panel.dataset.provider=provider;this.el('h3','',`${name} connection`,panel);
    this.el('p','nl-hint',local?'Load a model in LM Studio and start its Developer server. Copy the exact model identifier below.':'Enter a model that supports structured output and its current USD prices per million tokens. Save your API key in Obsidian Settings → Noiseless.',panel);
    const enabled=this.input(panel,`Enable ${name}`,'checkbox');enabled.checked=p.enabled;
    const fields=this.el('div','nl-edit-grid nl-connection-fields','',panel);
    const endpoint=this.input(fields,'Server URL','url',p.baseUrl);
    const model=this.input(fields,'Model identifier','text',p.model);
    let inputPrice:HTMLInputElement|undefined,outputPrice:HTMLInputElement|undefined;
    if(!local){inputPrice=this.input(fields,'Input price (USD / million tokens)','number',String(p.inputPerMillion));outputPrice=this.input(fields,'Output price (USD / million tokens)','number',String(p.outputPerMillion));for(const field of [inputPrice,outputPrice]){field.min='0';field.step='any';}}
    this.el('p','nl-hint',local?'A bare server address automatically gets /v1. For authentication, choose an LM Studio token in Obsidian Settings → Noiseless.':`API-key secret: ${p.credential||'Not selected'}. Choose or create it in Obsidian Settings → Noiseless.`,panel);
    const assignments=this.el('fieldset','nl-assignments','',panel);this.el('legend','','Assign AI tasks',assignments);
    const enrichment=this.input(assignments,'Task analysis — goals, estimates, and scores','checkbox');enrichment.checked=p.tasks?.enrichment??true;
    const goalDraft=this.input(assignments,'Draft goals from your brief','checkbox');goalDraft.checked=p.tasks?.goalDraft??true;
    this.el('p','nl-hint','Unchecked tasks never use this connection. If both local and cloud analysis are checked, local prepares a draft and cloud refines it. Goal drafting tries Anthropic, OpenAI, then local, using only checked, enabled connections.',panel);
    this.button(panel,`Save ${name} connection`,async()=>{
      let url:URL;try{url=new URL(endpoint.value.trim());}catch{throw new Error('Enter a valid server URL.');}
      if(!['http:','https:'].includes(url.protocol))throw new Error('The server URL must use http or https.');
      if(url.username||url.password||url.search||url.hash)throw new Error('Use a server URL without credentials, query parameters, or a fragment. Store keys in Obsidian Settings → Noiseless.');
      if(url.pathname==='/'||!url.pathname)url.pathname='/v1';
      const baseUrl=url.toString().replace(/\/+$/,''),modelId=model.value.trim();
      if(enabled.checked&&!modelId)throw new Error('Enter the model identifier before enabling the connection.');
      if(inputPrice&&outputPrice&&(!inputPrice.value.trim()||!outputPrice.value.trim()))throw new Error('Enter both token prices.');
      const {configSchema}=await import('../core/model');
      await this.service.store.mutate(paths.config,configSchema,c=>({...c,providers:{...c.providers,[provider]:{...c.providers[provider],enabled:enabled.checked,baseUrl,model:modelId,tasks:{enrichment:enrichment.checked,goalDraft:goalDraft.checked},...(!local?{inputPerMillion:Number(inputPrice!.value),outputPerMillion:Number(outputPrice!.value)}:{})}}}));
      await this.service.refresh();this.host.notify(`${name} settings saved. Capture a task or refresh estimates to use the model.`);
    },'nl-button nl-primary');
  }
  private empty(parent:HTMLElement,title:string,body:string){const e=this.el('section','nl-empty','',parent);this.el('div','nl-empty-mark','◌',e);this.el('h3','',title,e);this.el('p','nl-hint',body,e);}
}
