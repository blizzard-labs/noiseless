import { it,expect } from 'vitest';
import { exportGoalPrompt,parseGoalOutput,outputFolder } from '../src/models/manual';
import { goalDraftPrompt,ModelRouter } from '../src/models/router';
import { graph,MemoryIO } from './fixtures';
import { Store,paths } from '../src/storage/store';
import { Service,MarkdownLedger } from '../src/service';

it('exports the same instructions and input as built-in goal drafting plus the schema',()=>{
  const prompt=goalDraftPrompt('My exact brief',graph),text=exportGoalPrompt('My exact brief',graph);
  expect(text).toContain(prompt.system);expect(text).toContain(JSON.stringify(prompt.input,null,2));expect(text).toContain('"required"');expect(text).toContain(outputFolder);
});
it('accepts JSON and fenced JSON but rejects invalid relationships and achieved drafts',()=>{
  expect(parseGoalOutput(JSON.stringify(graph))).toEqual(graph);
  expect(parseGoalOutput('```json\n'+JSON.stringify(graph)+'\n```')).toEqual(graph);
  const bad=structuredClone(graph);bad.goals[2].parents[0].parentId='missing';expect(()=>parseGoalOutput(JSON.stringify(bad))).toThrow();
  const achieved=structuredClone(graph);achieved.goals[0].achieved=true;expect(()=>parseGoalOutput(JSON.stringify(achieved))).toThrow('achieved');
});
it('exports and imports without provider requests or changing active goals, preserving the previous draft',async()=>{
  const store=new Store(new MemoryIO());await store.init();let calls=0;
  const router=new ModelRouter(()=>store.config(),()=>null,async()=>{calls++;throw new Error('Unexpected request');},new MarkdownLedger(store));
  const service=new Service(store,router);const original=await store.io.read(paths.goals),oldDraft=await store.io.read(paths.draft);
  const path=await service.exportDraftPrompt();expect(await store.io.exists(path)).toBe(true);expect(await store.io.exists(`${outputFolder}/README.md`)).toBe(true);
  await store.io.create(`${outputFolder}/result.json`,JSON.stringify(graph));await service.importDraftOutput('result.json');
  expect(await store.io.read(paths.goals)).toBe(original);expect(await store.io.read(paths.draft)).toContain(graph.goals[0].title);
  const archive=(await store.io.list()).find(p=>p.startsWith('Noiseless/History/Goal-draft-'))!;expect(await store.io.read(archive)).toBe(oldDraft);
  const validDraft=await store.io.read(paths.draft);await store.io.create(`${outputFolder}/invalid.json`,'{}');
  await expect(service.importDraftOutput('invalid.json')).rejects.toThrow();expect(await store.io.read(paths.draft)).toBe(validDraft);
  await expect(service.importDraftOutput('../Goals.md')).rejects.toThrow();expect(calls).toBe(0);
});
