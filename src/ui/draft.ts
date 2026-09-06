import { Goal, GoalGraph, graphSchema } from '../core/model';
import { validateGraph } from '../core/engine';
import { readNote } from '../storage/markdown';
import { paths } from '../storage/store';
import { Service } from '../service';
import type { Host } from './view';

export function layoutGoals(graph:GoalGraph){
  const positions=new Map<string,{x:number;y:number}>();
  for(const [column,level] of ['L1','L2','L3'].entries()){
    const goals=graph.goals.filter(g=>g.level===level).sort((a,b)=>{
      const parentY=(g:Goal)=>g.parents.reduce((sum,p)=>sum+(positions.get(p.parentId)?.y??0)*p.weight,0);
      return parentY(a)-parentY(b);
    });
    goals.forEach((g,row)=>positions.set(g.id,{x:28+column*360,y:70+row*150}));
  }
  return {positions,width:1080,height:Math.max(430,...[...positions.values()].map(p=>p.y+150))};
}

export class DraftReview {
  private dead=false;private generation=0;private selected='';private zoom=1;private editing=false;
  constructor(private root:HTMLElement,private service:Service,private host:Host,private source:'draft'|'goals'='draft'){root.classList.add('noiseless','nl-draft-review');void this.reload();}
  get isEditing(){return this.editing;}
  destroy(){this.dead=true;this.generation++;}
  private el<K extends keyof HTMLElementTagNameMap>(tag:K,parent:HTMLElement,cls='',text=''){const el=this.root.ownerDocument.createElement(tag);el.className=cls;el.textContent=text;parent.append(el);return el;}
  private button(parent:HTMLElement,text:string,action:()=>void|Promise<void>,cls='nl-button'){
    const button=this.el('button',parent,cls,text);button.type='button';button.onclick=async()=>{button.disabled=true;try{await action();}catch(e){this.host.notify((e as Error).message);}finally{button.disabled=false;}};return button;
  }
  async reload(){
    if(this.editing)return;
    const generation=++this.generation;
    try{const text=await this.service.store.io.read(this.source==='draft'?paths.draft:paths.goals),graph=readNote(text,graphSchema).data;validateGraph(graph);
      if(this.dead||generation!==this.generation)return;this.render(graph,text);
    }catch(e){if(this.dead||generation!==this.generation)return;this.root.replaceChildren();const alert=this.el('p',this.root,'nl-alert',`Cannot display draft: ${(e as Error).message}`);alert.setAttribute('role','alert');this.button(this.root,'Reload draft',()=>this.reload());}
  }
  private edit(panel:HTMLElement,goal:Goal,graph:GoalGraph,reviewedText:string,cancel:()=>void){
    this.editing=true;panel.replaceChildren();this.el('h3',panel,'','Edit goal');
    const field=(label:string,value:string,type='text')=>{const wrap=this.el('label',panel,'nl-field',label);const input=this.el('input',wrap);input.type=type;input.value=value;input.setAttribute('aria-label',label);return input;};
    const area=(label:string,value:string)=>{const wrap=this.el('label',panel,'nl-field',label),input=this.el('textarea',wrap);input.value=value;input.rows=4;input.setAttribute('aria-label',label);return input;};
    const choose=(label:string,value:string,options:string[])=>{const wrap=this.el('label',panel,'nl-field',label),input=this.el('select',wrap);input.setAttribute('aria-label',label);for(const v of options){const option=this.el('option',input,'',v);option.value=v;}input.value=value;return input;};
    const id=field('Goal ID',goal.id),title=field('Title',goal.title),level=choose('Level',goal.level,['L1','L2','L3']);
    const description=area('Description',goal.description),criteria=area('Success criteria',goal.successCriteria),due=field('Target date',goal.due,'date'),dateKind=choose('Date kind',goal.dateKind,['explicit','inferred']),importance=field('Importance',String(goal.importance),'number');importance.min='1';importance.max='10';importance.step='any';
    const achieved=field('Achieved','', 'checkbox');achieved.checked=goal.achieved;achieved.parentElement!.classList.add('nl-checkbox-field');
    this.el('h4',panel,'','Parent connections');this.el('p',panel,'nl-hint','Select parents one level above. Weights must total 100%. Level changes must also remain valid for existing children.');
    const parents=this.el('div',panel);const rows:{select:HTMLSelectElement;weight:HTMLInputElement;el:HTMLElement}[]=[];
    const add=(parentId='',weight=1)=>{const row=this.el('div',parents,'nl-parent-editor');const select=this.el('select',row);select.setAttribute('aria-label','Parent goal');const empty=this.el('option',select,'','Choose parent');empty.value='';for(const g of graph.goals.filter(g=>g.id!==goal.id)){const o=this.el('option',select,'',`${g.level} · ${g.title}`);o.value=g.id;}select.value=parentId;const input=this.el('input',row);input.type='number';input.min='0';input.max='100';input.step='any';input.value=String(weight*100);input.setAttribute('aria-label','Parent weight percent');const item={select,weight:input,el:row};rows.push(item);this.button(row,'Remove',()=>{rows.splice(rows.indexOf(item),1);row.remove();},'nl-link');};
    goal.parents.forEach(p=>add(p.parentId,p.weight));this.button(panel,'Add parent',()=>add());
    this.el('p',panel,'nl-hint',this.source==='goals'?'Saving stages these changes in Goal draft and archives the previous draft. Continue editing there, then approve. Changing IDs can detach existing task assignments.':'Saving updates this draft only. Renamed IDs are updated in its parent connections.');
    const error=this.el('p',panel,'nl-alert');error.hidden=true;error.setAttribute('role','alert');
    this.button(panel,this.source==='draft'?'Save goal':'Save to draft',async()=>{
      try{if(!importance.value.trim())throw new Error('Enter an importance from 1 to 10.');
        await this.service.editGoal(this.source,reviewedText,goal.id,{id:id.value.trim(),title:title.value.trim(),level:level.value as Goal['level'],description:description.value,successCriteria:criteria.value,due:due.value,dateKind:dateKind.value as Goal['dateKind'],importance:Number(importance.value),achieved:achieved.checked,parents:rows.map(r=>({parentId:r.select.value,weight:Number(r.weight.value)/100}))});
        this.editing=false;this.selected=id.value.trim();if(this.source==='goals')this.host.open(paths.draft);else await this.reload();
      }catch(e){error.hidden=false;error.textContent=(e as Error).message;}
    },'nl-button nl-primary');this.button(panel,'Cancel',cancel);
  }
  private render(graph:GoalGraph,reviewedText:string){
    this.root.replaceChildren();
    const toolbar=this.el('div',this.root,'nl-draft-toolbar');
    this.el('span',toolbar,'nl-label',`${this.source==='draft'?'DRAFT':'ACTIVE'} · ${graph.goals.length} GOALS`);
    this.button(toolbar,'Goals',()=>this.host.open(paths.goals),'nl-link');
    this.button(toolbar,'Reload',()=>this.reload(),'nl-link');
    if(this.source==='draft')this.button(toolbar,'Approve draft',async()=>{await this.service.approve(reviewedText);this.host.notify('Goal graph activated.');this.host.open(paths.goals);},'nl-button nl-primary').disabled=!graph.goals.length;
    this.el('p',this.root,'nl-hint','Drag the background or scroll to explore. Select a goal to inspect its details and connections. Edits stay in Reading view; changes to active goals are staged as a draft for approval.');
    if(!graph.goals.length){this.el('p',this.root,'nl-empty','No draft goals yet. Generate or import a draft from Goals.');return;}
    const body=this.el('div',this.root,'nl-draft-body');
    const mapPanel=this.el('section',body,'nl-draft-map-panel');
    const controls=this.el('div',mapPanel,'nl-draft-controls');
    const viewport=this.el('div',mapPanel,'nl-draft-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','Goal map. Scroll or drag background to pan. Use zoom controls to resize.');
    const space=this.el('div',viewport,'nl-draft-space'),scene=this.el('div',space,'nl-draft-scene');
    const details=this.el('aside',body,'nl-draft-details');details.setAttribute('aria-label','Selected goal details');details.setAttribute('aria-live','polite');
    const {positions,width,height}=layoutGoals(graph);scene.style.width=width+'px';scene.style.height=height+'px';
    const applyZoom=()=>{scene.style.transform=`scale(${this.zoom})`;space.style.width=width*this.zoom+'px';space.style.height=height*this.zoom+'px';zoomLabel.textContent=Math.round(this.zoom*100)+'%';};
    this.button(controls,'−',()=>{this.zoom=Math.max(.2,this.zoom/1.25);applyZoom();}).setAttribute('aria-label','Zoom out');
    const zoomLabel=this.el('span',controls,'nl-hint');
    this.button(controls,'+',()=>{this.zoom=Math.min(2,this.zoom*1.25);applyZoom();}).setAttribute('aria-label','Zoom in');
    this.button(controls,'Fit map',()=>{this.zoom=Math.max(.1,Math.min(1,(viewport.clientWidth-20)/width,(viewport.clientHeight-20)/height));applyZoom();viewport.scrollTo(0,0);});
    this.button(controls,'Reset',()=>{this.zoom=1;applyZoom();viewport.scrollTo(0,0);});applyZoom();
    for(const [i,label] of ['LIFE MISSIONS','MILESTONES','CHECKPOINTS'].entries()){const heading=this.el('div',scene,'nl-map-column',label);heading.style.left=28+i*360+'px';}
    const ns='http://www.w3.org/2000/svg',svg=this.root.ownerDocument.createElementNS(ns,'svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.classList.add('nl-draft-edges');svg.setAttribute('aria-hidden','true');scene.append(svg);
    const edges:{el:SVGPathElement;child:string;parent:string}[]=[];
    for(const goal of graph.goals)for(const parent of goal.parents){const a=positions.get(parent.parentId)!,b=positions.get(goal.id)!;const line=this.root.ownerDocument.createElementNS(ns,'path');line.setAttribute('d',`M ${a.x+280} ${a.y+55} C ${a.x+320} ${a.y+55},${b.x-40} ${b.y+55},${b.x} ${b.y+55}`);svg.append(line);edges.push({el:line,child:goal.id,parent:parent.parentId});}
    const nodes=new Map<string,HTMLButtonElement>();
    const select=(id:string,center=false)=>{
      if(this.editing){this.host.notify('Save or cancel your edit before selecting another goal.');return;}
      this.selected=id;const goal=graph.goals.find(g=>g.id===id)!;
      const related=new Set([id,...goal.parents.map(p=>p.parentId),...graph.goals.filter(g=>g.parents.some(p=>p.parentId===id)).map(g=>g.id)]);
      for(const [nodeId,node] of nodes){node.classList.toggle('is-selected',nodeId===id);node.classList.toggle('is-muted',!related.has(nodeId));node.setAttribute('aria-pressed',String(nodeId===id));}
      edges.forEach(edge=>edge.el.classList.toggle('is-selected',edge.child===id||edge.parent===id));
      details.replaceChildren();this.el('p',details,'nl-label',`${goal.level} · ${goal.level==='L1'?'Life mission':goal.level==='L2'?'Milestone':'Checkpoint'}`);this.el('h3',details,'',goal.title);
      for(const [label,value] of [['Description',goal.description||'No description provided'],['Success criteria',goal.successCriteria||'No success criteria provided'],['Target date',`${goal.due} (${goal.dateKind==='inferred'?'inferred planning date':'explicit target'})`],['Importance',`${goal.importance} / 10`],['Outcome',goal.achieved?'Marked achieved':'Not yet achieved']]){this.el('h4',details,'',label);this.el('p',details,'',value);}
      this.el('h4',details,'','Contributes to');if(!goal.parents.length)this.el('p',details,'nl-hint','Top-level mission');
      goal.parents.forEach(p=>this.button(details,`${Math.round(p.weight*100)}% → ${graph.goals.find(g=>g.id===p.parentId)!.title}`,()=>select(p.parentId,true),'nl-draft-relation'));
      this.el('h4',details,'','Supported by');const children=graph.goals.filter(g=>g.parents.some(p=>p.parentId===id));if(!children.length)this.el('p',details,'nl-hint','No child goals');
      children.forEach(g=>this.button(details,`${g.title} · ${Math.round(g.parents.find(p=>p.parentId===id)!.weight*100)}%`,()=>select(g.id,true),'nl-draft-relation'));
      this.el('p',details,'nl-hint',`ID: ${goal.id}`);
      this.button(details,'Edit goal',()=>this.edit(details,goal,graph,reviewedText,()=>{this.editing=false;select(id);}),'nl-button nl-primary');
      if(center){const p=positions.get(id)!;viewport.scrollTo({left:(p.x+140)*this.zoom-viewport.clientWidth/2,top:(p.y+55)*this.zoom-viewport.clientHeight/2});}
    };
    for(const goal of graph.goals){const p=positions.get(goal.id)!,node=this.button(scene,'',()=>select(goal.id),'nl-map-node');nodes.set(goal.id,node);node.dataset.level=goal.level;node.style.left=p.x+'px';node.style.top=p.y+'px';node.setAttribute('aria-label',`${goal.level}: ${goal.title}`);this.el('span',node,'nl-label',goal.level);this.el('strong',node,'',goal.title);this.el('span',node,'nl-hint',goal.due);}
    const search=this.el('input',controls);search.type='search';search.placeholder='Find a goal';search.setAttribute('aria-label','Find a draft goal');
    search.oninput=()=>{const query=search.value.trim().toLowerCase();if(!query)return;const goal=graph.goals.find(g=>(g.title+' '+g.id).toLowerCase().includes(query));if(goal)select(goal.id,true);};
    let drag:{x:number;y:number;left:number;top:number;id:number}|undefined;
    viewport.onpointerdown=e=>{if(e.button!==0||(e.target as Element).closest('button'))return;drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,id:e.pointerId};viewport.setPointerCapture(e.pointerId);};
    viewport.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;viewport.scrollLeft=drag.left-(e.clientX-drag.x);viewport.scrollTop=drag.top-(e.clientY-drag.y);};
    viewport.onpointerup=viewport.onpointercancel=()=>{drag=undefined;};
    select(graph.goals.some(g=>g.id===this.selected)?this.selected:graph.goals[0].id);
  }
}
