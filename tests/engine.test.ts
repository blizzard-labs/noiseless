import { describe,it,expect } from 'vitest';
import { attribution, complete, effectiveDue, logSession, planDay, progress, rank, scores, validateGraph } from '../src/core/engine';
import { configSchema, effective, localDate } from '../src/core/model';
import { config, graph, now, task } from './fixtures';

describe('weighted goal graph',()=>{
  it('conserves attribution at each level, including converging paths',()=>{validateGraph(graph);const a=attribution('event',graph);expect(a.research).toBe(.3);expect(a.community).toBe(.7);expect(a.life).toBeCloseTo(.65);expect(a.health).toBeCloseTo(.35);for(const level of ['L1','L2','L3'])expect(graph.goals.filter(g=>g.level===level).reduce((n,g)=>n+(a[g.id]??0),0)).toBeCloseTo(1);});
  it('rejects invalid totals, cross-level links, duplicate IDs, cycles and duplicate edges',()=>{
    for(const mutate of [(g:typeof graph)=>g.goals[4].parents[0].weight=.1,(g:typeof graph)=>g.goals[4].parents[0].parentId='life',(g:typeof graph)=>g.goals[4].id='life',(g:typeof graph)=>g.goals[0].parents=[{parentId:'event',weight:1}],(g:typeof graph)=>g.goals[4].parents=[{parentId:'research',weight:.5},{parentId:'research',weight:.5}]]){const g=structuredClone(graph);mutate(g);expect(()=>validateGraph(g)).toThrow();}
  });
  it('keeps mission strength separate from allocation and respects importance',()=>{const a=scores(task(),graph,config,'2026-09-06');expect(a.alignment).toBeCloseTo(8.6);const g=structuredClone(graph);g.goals[0].importance=5;expect(scores(task(),g,config).alignment).toBeCloseTo(5.35);});
  it('leaves unsorted schedulable with minimum alignment',()=>{const t=task();t.overrides.goalId='unsorted';expect(attribution('unsorted',graph)).toEqual({});expect(scores(t,graph,config).alignment).toBe(1);expect(rank([t],graph,config)).toHaveLength(1);});
});
describe('scores and daily sessions',()=>{
  it('honors overrides without destroying inference',()=>{const t=task();t.overrides={impact:2,estimateMinutes:10};expect(effective(t).impact).toBe(2);expect(t.inferred?.impact).toBe(8);});
  it('normalizes weights and rejects all-zero, negative or invalid capacity',()=>{const w={...config,weights:{urgency:0,alignment:1,impact:0,roi:0,reputation:0}};expect(rank([task()],graph,w)[0].priority).toBeCloseTo(8.6);expect(()=>configSchema.parse({...w,weights:{...w.weights,alignment:0}})).toThrow();expect(()=>configSchema.parse({...w,weekdayMinutes:-1})).toThrow();});
  it('bounds scores for extreme dates and durations',()=>{for(const due of ['2000-01-01','2099-01-01']){const t=task();t.overrides={due,estimateMinutes:1};for(const score of Object.values(scores(t,graph,config,'2026-09-06')))expect(score).toBeGreaterThanOrEqual(1);expect(scores(t,graph,config,'2026-09-06').urgency).toBeLessThanOrEqual(10);}});
  it('uses the earlier L3 date and identifies overdue capacity conflicts',()=>{const t=task();t.overrides.due='2028-01-01';expect(effectiveDue(t,graph)).toBe('2026-10-01');const p=planDay([t],graph,{...config,dailyOverrides:{'2027-01-01':60}},'2027-01-01');expect(p.conflicts.length).toBe(1);});
  it('keeps long tasks intact and fits bounded sessions',()=>{const p=planDay([task('a'),task('b'),task('c')],graph,config,'2026-09-06');expect(p.sessions.map(s=>s.minutes)).toEqual([60,60]);expect(p.sessions.map(s=>s.taskId)).toEqual(['a','b']);});
  it('subtracts logged minutes and rolls date without mutating tasks',()=>{const t=logSession(task(),45,graph,config,now);const p=planDay([t],graph,config,localDate(now));expect(p.remainingMinutes).toBe(75);expect(p.sessions[0].minutes).toBe(60);expect(planDay([t],graph,config,'2026-09-07').remainingMinutes).toBe(240);});
  it('excludes blocked, snoozed and done; breaks ties deterministically',()=>{const a=task('a'),b=task('b'),c=task('c'),d=task('d');b.status='blocked';c.snoozedUntil='2099-01-01';d.status='done';expect(rank([d,c,b,a],graph,config).map(x=>x.task.id)).toEqual(['a']);expect(rank([task('z'),task('a')],graph,config).map(x=>x.task.id)).toEqual(['a','z']);});
  it('does not silently schedule extra effort after estimate is consumed',()=>{const t=logSession(task(),180,graph,config,now);const p=planDay([t],graph,config,'2026-09-07');expect(p.sessions).toEqual([]);expect(p.conflicts[0]).toContain('estimate used up');});
});
describe('personal GDP',()=>{
  it('freezes output on first session, independent of urgency and later graph changes',()=>{let t=logSession(task(),30,graph,config,now);expect(t.snapshot!.points).toBeCloseTo(68.8);const g=structuredClone(graph);g.goals[0].importance=1;t.overrides.impact=1;t=complete(t,true,g,config,new Date('2026-10-06T12:00:00'));expect(t.snapshot!.points).toBeCloseTo(68.8);expect(t.snapshot!.graphVersion).toBe(1);});
  it('awards once, reverses on reopening, and restores credit on recompletion',()=>{let t=complete(task(),true,graph,config,now);t=complete(t,true,graph,config,now);expect(t.history).toHaveLength(1);expect(progress([t]).points).toBeCloseTo(68.8);t=complete(t,false,graph,config,now);expect(progress([t]).points).toBe(0);t=complete(t,true,graph,config,now);expect(progress([t]).points).toBeCloseTo(68.8);});
  it('never adds estimated duration on top of logged sessions',()=>{const a=complete(logSession(task('a'),30,graph,config,now),true,graph,config,now),b=complete(task('b'),true,graph,config,now);const p=progress([a,b],localDate(now));expect(p.loggedMinutes).toBe(30);expect(p.estimatedMinutes).toBe(180);expect(p.byGoal.life.minutes).toBeCloseTo(210*.65);expect(p.days.at(-1)?.minutes).toBe(210);});
  it('tracks effort on unfinished work without awarding points',()=>{const p=progress([logSession(task(),20,graph,config,now)]);expect(p.points).toBe(0);expect(p.byGoal.event.minutes).toBe(20);});
});
