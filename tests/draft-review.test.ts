// @vitest-environment jsdom
import { it,expect,vi } from 'vitest';
import { DraftReview,layoutGoals } from '../src/ui/draft';
import { graph,MemoryIO } from './fixtures';
import { Store,paths } from '../src/storage/store';
import { Service,MarkdownLedger } from '../src/service';
import { ModelRouter } from '../src/models/router';
import { writeNote } from '../src/storage/markdown';

async function setup(){const store=new Store(new MemoryIO());await store.init();await store.put(paths.draft,writeNote(graph,'Review notes'));
  const service=new Service(store,new ModelRouter(()=>store.config(),()=>null,async()=>{throw new Error('No provider calls');},new MarkdownLedger(store)));
  const root=document.createElement('div');document.body.append(root);const notify=vi.fn();const view=new DraftReview(root,service,{open:()=>{},notify});
  await vi.waitFor(()=>expect(root.querySelectorAll('.nl-map-node')).toHaveLength(graph.goals.length));return {root,view,store,service,notify};
}
it('lays out each goal exactly once without overlapping cards in the same column',()=>{
  const {positions}=layoutGoals(graph);expect(positions.size).toBe(graph.goals.length);
  for(const a of graph.goals)for(const b of graph.goals)if(a.id!==b.id&&a.level===b.level){expect(Math.abs(positions.get(a.id)!.y-positions.get(b.id)!.y)).toBeGreaterThanOrEqual(150);}
});
it('shows full goal details and highlights selected connections; zoom changes the map scale',async()=>{
  const {root,view}=await setup();const goal=graph.goals.find(g=>g.id==='event')!;
  root.querySelector<HTMLButtonElement>(`button[aria-label="L3: ${goal.title}"]`)!.click();
  const details=root.querySelector('.nl-draft-details')!;expect(details.textContent).toContain(goal.description);expect(details.textContent).toContain(goal.successCriteria);expect(details.textContent).toContain('30%');expect(details.textContent).toContain('70%');
  expect(root.querySelectorAll('path.is-selected')).toHaveLength(2);
  root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();expect((root.querySelector('.nl-draft-scene') as HTMLElement).style.transform).toBe('scale(1.25)');
  view.destroy();root.remove();
});
it('blocks approval if the file changes after it was reviewed',async()=>{
  const {store,service,view,root}=await setup();const reviewed=await store.io.read(paths.draft),active=await store.io.read(paths.goals);
  await store.io.process(paths.draft,text=>text+'\nChanged after review');await expect(service.approve(reviewed)).rejects.toThrow('draft changed');expect(await store.io.read(paths.goals)).toBe(active);view.destroy();root.remove();
});
it('adds the review map to an existing draft once and preserves its data and prose',async()=>{
  const store=new Store(new MemoryIO());await store.init();const original=writeNote(graph,'My review notes');await store.put(paths.draft,original);await store.init();await store.init();const updated=await store.io.read(paths.draft);
  expect(updated.startsWith(original)).toBe(true);expect(updated.match(/```noiseless\ndraft/g)).toHaveLength(1);
});
it('edits a goal in reading view and preserves invalid edits for correction',async()=>{
  const {root,view,store}=await setup();
  const click=(text:string)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text)!.click();
  click('Edit goal');const title=root.querySelector<HTMLInputElement>('[aria-label="Title"]')!;title.value='Updated mission';
  const importance=root.querySelector<HTMLInputElement>('[aria-label="Importance"]')!;importance.value='11';click('Save goal');
  await vi.waitFor(()=>expect(root.querySelector('.nl-draft-details .nl-alert')?.textContent).toBeTruthy());expect(title.value).toBe('Updated mission');expect(await store.io.read(paths.draft)).not.toContain('Updated mission');
  importance.value='8';click('Save goal');await vi.waitFor(async()=>expect(await store.io.read(paths.draft)).toContain('Updated mission'));view.destroy();root.remove();
});
it('renames draft IDs and their child references, and rejects invalid edges without saving',async()=>{
  const {store,service,root,view}=await setup();let text=await store.io.read(paths.draft);
  await service.editGoal('draft',text,'life',{...graph.goals[0],id:'renamed'});
  text=await store.io.read(paths.draft);expect(text).toContain('parentId: renamed');expect(text).toContain('Review notes');
  await expect(service.editGoal('draft',text,'renamed',{...graph.goals[0],id:'renamed',parents:[{parentId:'health',weight:1}]})).rejects.toThrow();expect(await store.io.read(paths.draft)).toBe(text);
  view.destroy();root.remove();
});
it('stages active graph edits for approval without modifying active goals',async()=>{
  const {store,service,root,view}=await setup();const active=writeNote(graph,'Active notes');await store.put(paths.goals,active);
  await service.editGoal('goals',active,'life',{...graph.goals[0],description:'A revised description'});
  expect(await store.io.read(paths.goals)).toBe(active);expect(await store.io.read(paths.draft)).toContain('A revised description');
  expect((await store.io.list()).some(p=>p.startsWith('Noiseless/History/Goal-draft-'))).toBe(true);view.destroy();root.remove();
});
