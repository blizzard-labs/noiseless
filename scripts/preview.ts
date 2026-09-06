// Offline visual test fixture; the production UI is imported unchanged.
import { Dashboard,Page } from '../src/ui/view';
import { Service,MarkdownLedger } from '../src/service';
import { Store } from '../src/storage/store';
import { ModelRouter } from '../src/models/router';
import { MemoryIO,config,graph,task,now } from '../tests/fixtures';
import { complete,logSession } from '../src/core/engine';
const store=new Store(new MemoryIO()),router=new ModelRouter(async()=>config,()=>null,async()=>{throw Error('Offline visual fixture');},new MarkdownLedger(store));
const service=new Service(store,router);service.config=config;service.graph=graph;
service.tasks=[task('a'),{...task('b'),title:'Sketch an accessible onboarding flow'},{...task('c'),title:'Read and annotate a research paper'},complete(logSession(task('d'),35,graph,config,now),true,graph,config,now)];
const params=new URLSearchParams(location.search),mode=params.get('mode')??'light',page=(params.get('page')??'today') as Page;
document.body.classList.toggle('dark',mode==='dark');const width=Number(params.get('width')??'380');
const frame=document.getElementById('frame')!;frame.style.width=`${width}px`;
new Dashboard(frame,page,service,{open:()=>{},notify:message=>document.getElementById('status')!.textContent=message});
const result=document.getElementById('status')!;
requestAnimationFrame(()=>{const overflow=[...frame.querySelectorAll<HTMLElement>('*')].filter(el=>el.getClientRects().length&&getComputedStyle(el).position!=='absolute'&&el.getBoundingClientRect().right>frame.getBoundingClientRect().right+1);result.textContent=`${page} · ${mode} · ${width}px · ${overflow.length} overflowing elements`;});
