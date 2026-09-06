// @vitest-environment jsdom
import { it,expect,vi } from 'vitest';
import { Dashboard, Page } from '../src/ui/view';
import { Service, MarkdownLedger } from '../src/service';
import { Store } from '../src/storage/store';
import { ModelRouter } from '../src/models/router';
import { MemoryIO, config, graph, task } from './fixtures';
import { configSchema } from '../src/core/model';
import { paths } from '../src/storage/store';
function setup(page:Page){const store=new Store(new MemoryIO()),router=new ModelRouter(async()=>config,()=>null,async()=>({status:500,body:{}}),new MarkdownLedger(store)),service=new Service(store,router);service.config=config;service.graph=graph;service.tasks=[task()];const root=document.createElement('div');document.body.append(root);const view=new Dashboard(root,page,service,{open:()=>{},notify:()=>{}});return {root,view,service};}
it.each(['everything','today','progress','goals','setup'] as Page[])('renders %s without unsafe HTML and has labelled controls',page=>{const {root,view}=setup(page);expect(root.querySelector('nav[aria-label="Noiseless"]')).not.toBeNull();for(const input of root.querySelectorAll('input,textarea,select'))expect(input.hasAttribute('aria-label')||input.closest('label')).toBeTruthy();expect(root.textContent).not.toContain('undefined');view.destroy();root.remove();});
it('renders task text as text, not injected markup',()=>{const {root,view,service}=setup('everything');service.tasks[0].title='<img src=x onerror=alert(1)>';view.render();expect(root.querySelector('img')).toBeNull();expect(root.textContent).toContain('<img');view.destroy();});
it('keeps scoring collapsed by default and presents one next step',()=>{const {root,view}=setup('today');expect(root.querySelectorAll('.nl-hero')).toHaveLength(1);expect(root.querySelector('details.nl-task-details')?.hasAttribute('open')).toBe(false);view.destroy();});
it('preserves unsubmitted capture text when Obsidian remounts a Markdown block',()=>{const {root,view,service}=setup('everything');const input=root.querySelector('textarea')!;input.value='Do not lose this draft';input.dispatchEvent(new Event('input'));view.destroy();const next=new Dashboard(root,'everything',service,{open:()=>{},notify:()=>{}});expect(root.querySelector('textarea')!.value).toBe('Do not lose this draft');next.destroy();});
it('saves LM Studio fields from reading view without replacing other settings',async()=>{
  const {root,view,service}=setup('setup');await service.store.init();
  await service.store.mutate(paths.config,configSchema,c=>({...c,weekdayMinutes:321,providers:{...c.providers,lmstudio:{...c.providers.lmstudio,credential:'local-token'}}}));
  const before=await service.store.config();
  root.querySelector<HTMLInputElement>('input[aria-label="Model identifier"]')!.value=' local-model ';
  root.querySelector<HTMLInputElement>('input[aria-label="Server URL"]')!.value=' http://localhost:1234 ';
  const button=[...root.querySelectorAll('button')].find(b=>b.textContent==='Save LM Studio connection')!;button.click();
  await vi.waitFor(()=>expect(service.config.providers.lmstudio.model).toBe('local-model'));
  expect(await service.store.config()).toEqual({...before,providers:{...before.providers,lmstudio:{...before.providers.lmstudio,enabled:true,model:'local-model',baseUrl:'http://localhost:1234/v1',tasks:{enrichment:true,goalDraft:true}}}});
  expect(service.config.providers.lmstudio.model).toBe('local-model');view.destroy();root.remove();
});

it('saves cloud connection prices and task selections while preserving secrets',async()=>{
  const {root,view,service}=setup('setup');await service.store.init();
  const panel=root.querySelector<HTMLElement>('[data-provider="openai"]')!;
  panel.querySelector<HTMLInputElement>('[aria-label="Enable OpenAI"]')!.checked=true;
  panel.querySelector<HTMLInputElement>('[aria-label="Model identifier"]')!.value='cloud-model';
  panel.querySelector<HTMLInputElement>('[aria-label="Input price (USD / million tokens)"]')!.value='1.5';
  panel.querySelector<HTMLInputElement>('[aria-label="Output price (USD / million tokens)"]')!.value='6';
  panel.querySelector<HTMLInputElement>('[aria-label="Task analysis — goals, estimates, and scores"]')!.checked=false;
  panel.querySelector('button')!.click();
  await vi.waitFor(()=>expect(service.config.providers.openai.model).toBe('cloud-model'));
  expect((await service.store.config()).providers.openai).toMatchObject({enabled:true,credential:'noiseless-openai',inputPerMillion:1.5,outputPerMillion:6,tasks:{enrichment:false,goalDraft:true}});
  view.destroy();root.remove();
});
