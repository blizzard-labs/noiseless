import { mkdir,readFile,writeFile,readdir,access,copyFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { defaultConfig, localDate, addDays, newTask, GoalGraph, Task } from '../src/core/model';
import { complete, logSession } from '../src/core/engine';
import { Store, VaultIO, paths } from '../src/storage/store';
import { writeNote, taskNote } from '../src/storage/markdown';
import { Service, MarkdownLedger } from '../src/service';
import { ModelRouter, enrichmentKey } from '../src/models/router';
class DiskIO implements VaultIO {
  constructor(readonly root:string){}
  async list(){const walk=async(dir:string):Promise<string[]>=>{const out:string[]=[];for(const ent of await readdir(join(this.root,dir),{withFileTypes:true})){const p=join(dir,ent.name);if(ent.isDirectory())out.push(...await walk(p));else out.push(p);}return out;};return walk('');}
  async exists(p:string){try{await access(join(this.root,p));return true;}catch{return false;}}
  async read(p:string){return readFile(join(this.root,p),'utf8');}
  async create(p:string,text:string){await mkdir(dirname(join(this.root,p)),{recursive:true});await writeFile(join(this.root,p),text,{flag:'wx'});}
  async process(p:string,fn:(t:string)=>string){await writeFile(join(this.root,p),fn(await this.read(p)));}
}
const today=localDate();
for(const example of [false,true]){
  const root=example?'example-vault':'starter-vault';await mkdir(root,{recursive:true});const io=new DiskIO(root),store=new Store(io);await store.init();
  if(example){
    const c=structuredClone(defaultConfig);c.weekdayMinutes=240;c.weekendMinutes=180;c.providers.lmstudio.enabled=false;
    await store.put(paths.config,writeNote(c,`\n# Example setup\n\n> Fictional demonstration. Model calls are disabled. Start from starter-vault for your own work.\n\n\`\`\`noiseless\nsetup\n\`\`\`\n`));
    const goal=(id:string,title:string,level:'L1'|'L2'|'L3',description:string,parents:{parentId:string;weight:number}[],days:number)=>({id,title,level,description,successCriteria:description,due:addDays(today,days),dateKind:'explicit' as const,importance:10,parents,achieved:false});
    const graph:GoalGraph={schema:1,version:1,goals:[
      goal('independence','More independent lives','L1','Help people have the independence to live fully.',[],3650),
      goal('learn','Build the knowledge to contribute','L2','Develop research and engineering skills with practical impact.',[{parentId:'independence',weight:1}],500),
      goal('community','Grow a community of support','L2','Bring people and resources together around accessible care.',[{parentId:'independence',weight:1}],365),
      goal('event','Community fundraiser','L3','Host a fundraising event that raises $10,000 for care research.',[{parentId:'learn',weight:.3},{parentId:'community',weight:.7}],30),
      goal('prototype','Accessible tool prototype','L3','Test an accessible daily-living tool with five volunteer users.',[{parentId:'learn',weight:1}],60),
      goal('study','Research foundations','L3','Complete a short literature review and summarize three promising directions.',[{parentId:'learn',weight:1}],45)
    ]};
    await store.put(paths.goals,writeNote(graph,'\n# Example goals\n\n> All goals and work in this vault are fictional examples.\n\n```noiseless\ngoals\n```\n'));
    const seeds:[string,string,number,number,number,number][]=[
      ['Email three potential sponsors','event',35,8,9,1],['Sketch the accessible onboarding flow','prototype',90,8,9,3],['Read and annotate the first research paper','study',60,6,8,5],['Shortlist two accessible venues','event',45,7,8,2],['Draft five interview questions','prototype',25,6,8,4],['Organize reference notes','study',20,3,5,7],['Send a thank-you to the volunteer team','event',15,5,7,1]
    ];
    const tasks:Task[]=[];
    for(let i=0;i<seeds.length;i++){const [title,goalId,estimateMinutes,impact,alignment,due]=seeds[i];const t=newTask(title,`example-task-${i+1}`);t.inferred={goalId,estimateMinutes,impact,reputation:goalId==='event'?8:3,missionFit:[{goalId:'independence',score:alignment}],due:addDays(today,due),dateKind:'inferred',confidence:.88,rationale:'Fictional example: this deliverable supports a defined checkpoint. Scores are illustrative.',complex:false};t.provider='Example';t.pending='';t.enrichmentKey=enrichmentKey(t,graph,c);tasks.push(t);}
    for(let i=0;i<10;i++){let t=newTask(['Map the first user journey','Summarize the research brief','Confirm the volunteer roles'][i%3],`example-complete-${i}`);t.inferred={...tasks[i%tasks.length].inferred!};t.pending='';t.provider='Example';const d=new Date(`${addDays(today,-i)}T12:00:00`);t=logSession(t,20+i*5,graph,c,d);t=complete(t,true,graph,c,d);tasks.push(t);}
    for(const t of tasks)await store.put(`Noiseless/Tasks/${t.id}.md`,taskNote(t));
    await store.put('README.md','# Noiseless · example vault\n\n**Fictional demonstration data.** Open [[Noiseless/Today]] to explore. Use the separate starter-vault for your own work.\n');
  }else if(!await io.exists('README.md'))await io.create('README.md','# Noiseless\n\nStart at [[Noiseless/Setup]], then open [[Noiseless/Today]].\n');
  const router=new ModelRouter(()=>store.config(),()=>null,async()=>{throw new Error('No requests while packaging');},new MarkdownLedger(store));const service=new Service(store,router);await service.refresh();
  if(service.error)throw new Error(service.error);
  await mkdir(`${root}/.obsidian/plugins/noiseless`,{recursive:true});
  for(const f of ['main.js','manifest.json','styles.css'])await copyFile(`dist/noiseless/${f}`,`${root}/.obsidian/plugins/noiseless/${f}`);
  for(const [file,data] of Object.entries({'community-plugins.json':['noiseless'],'app.json':{defaultViewMode:'preview',livePreview:true,readableLineLength:true,showInlineTitle:false,propertiesInDocument:'hidden'},'appearance.json':{accentColor:'#719183',baseFontSize:16},'workspace.json':{main:{id:'main',type:'split',children:[{id:'tabs',type:'tabs',children:[{id:'leaf',type:'leaf',state:{type:'markdown',state:{file:'Noiseless/Today.md',mode:'preview',source:false}}}]}],direction:'vertical'},left:{id:'left',type:'split',children:[],direction:'horizontal',width:260,collapsed:true},right:{id:'right',type:'split',children:[],direction:'horizontal',width:260,collapsed:true},active:'leaf',lastOpenFiles:[]}})){
    const p=`${root}/.obsidian/${file}`;try{await access(p);}catch{await writeFile(p,JSON.stringify(data,null,2));}
  }
}
console.log('Prepared starter-vault and example-vault.');
