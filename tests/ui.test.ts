// @vitest-environment jsdom
import { it,expect } from 'vitest';
import { Dashboard, Page } from '../src/ui/view';
import { Service, MarkdownLedger } from '../src/service';
import { Store } from '../src/storage/store';
import { ModelRouter } from '../src/models/router';
import { MemoryIO, config, graph, task } from './fixtures';
function setup(page:Page){const store=new Store(new MemoryIO()),router=new ModelRouter(async()=>config,()=>null,async()=>({status:500,body:{}}),new MarkdownLedger(store)),service=new Service(store,router);service.config=config;service.graph=graph;service.tasks=[task()];const root=document.createElement('div');document.body.append(root);const view=new Dashboard(root,page,service,{open:()=>{},notify:()=>{}});return {root,view,service};}
it.each(['everything','today','progress','goals','setup'] as Page[])('renders %s without unsafe HTML and has labelled controls',page=>{const {root,view}=setup(page);expect(root.querySelector('nav[aria-label="Noiseless"]')).not.toBeNull();for(const input of root.querySelectorAll('input,textarea,select'))expect(input.hasAttribute('aria-label')||input.closest('label')).toBeTruthy();expect(root.textContent).not.toContain('undefined');view.destroy();root.remove();});
it('renders task text as text, not injected markup',()=>{const {root,view,service}=setup('everything');service.tasks[0].title='<img src=x onerror=alert(1)>';view.render();expect(root.querySelector('img')).toBeNull();expect(root.textContent).toContain('<img');view.destroy();});
it('keeps scoring collapsed by default and presents one next step',()=>{const {root,view}=setup('today');expect(root.querySelectorAll('.nl-hero')).toHaveLength(1);expect(root.querySelector('details.nl-task-details')?.hasAttribute('open')).toBe(false);view.destroy();});
it('preserves unsubmitted capture text when Obsidian remounts a Markdown block',()=>{const {root,view,service}=setup('everything');const input=root.querySelector('textarea')!;input.value='Do not lose this draft';input.dispatchEvent(new Event('input'));view.destroy();const next=new Dashboard(root,'everything',service,{open:()=>{},notify:()=>{}});expect(root.querySelector('textarea')!.value).toBe('Do not lose this draft');next.destroy();});
