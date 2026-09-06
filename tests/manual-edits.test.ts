import { it,expect } from 'vitest';
import { Store,paths } from '../src/storage/store';
import { Service,MarkdownLedger } from '../src/service';
import { ModelRouter } from '../src/models/router';
import { MemoryIO,config,graph,task } from './fixtures';
import { taskNote,writeNote } from '../src/storage/markdown';
it('records credit and reversal for direct Markdown status edits',async()=>{
  const store=new Store(new MemoryIO());await store.init();await store.put(paths.config,writeNote(config,''));await store.put(paths.goals,writeNote(graph,''));
  await store.put('Noiseless/Tasks/manual.md',taskNote(task()));const router=new ModelRouter(()=>store.config(),()=>null,async()=>{throw Error('No network');},new MarkdownLedger(store));const service=new Service(store,router);
  await store.updateTask('task-1',t=>({...t,status:'done'}));await service.refresh();expect(service.tasks[0].snapshot?.points).toBeCloseTo(68.8);expect(service.tasks[0].history.at(-1)?.action).toBe('complete');
  await store.updateTask('task-1',t=>({...t,status:'open'}));await service.refresh();expect(service.tasks[0].history.at(-1)?.action).toBe('reopen');
  expect(await store.io.read(paths.today)).toContain('> [!note]- Markdown snapshot');expect(await store.io.read(paths.everything)).toContain('Noiseless/Tasks/manual.md');
});
