import {it,expect} from 'vitest';
import {validateDeadline,DeadlineInterpretation} from '../src/core/deadlines';
import {effective,newTask} from '../src/core/model';
import {taskAnalysisPrompt} from '../src/models/router';
import {enrichment,graph} from './fixtures';
const evidence=(quote:string,offsetDays:number|null,weekday:number|null=null):DeadlineInterpretation=>({kind:'explicit',quote,offsetDays,weekday,explanation:'Calendar interpretation of the supplied constraint.'});
it.each([
 ['Before a fortnight has elapsed','2026-09-20',evidence('Before a fortnight has elapsed',14)],
 ['Two Wednesdays from today','2026-09-16',evidence('Two Wednesdays from today',10,3)],
 ['By the end of the first working week after today','2026-09-11',evidence('By the end of the first working week after today',5,5)],
])('accepts validated AI interpretations without parsing %s',(title,due,deadlineInterpretation)=>{
 expect(()=>validateDeadline({due,dateKind:'explicit',deadlineInterpretation},title,'2026-09-06')).not.toThrow();
});
it('rejects arithmetic errors, wrong weekdays, and invented evidence',()=>{
 expect(()=>validateDeadline({due:'2026-10-25',dateKind:'explicit',deadlineInterpretation:evidence('over two days',2)},'Research over two days','2026-09-06')).toThrow('calculation');
 expect(()=>validateDeadline({due:'2026-09-09',dateKind:'explicit',deadlineInterpretation:evidence('next Tuesday',3,2)},'Finish next Tuesday','2026-09-06')).toThrow('weekday');
 expect(()=>validateDeadline({due:'2026-09-08',dateKind:'explicit',deadlineInterpretation:evidence('over two days',2)},'Research patents','2026-09-06')).toThrow('quote');
});
it('flags ambiguity for review instead of accepting an arbitrary date',()=>{
 expect(()=>validateDeadline({due:'2026-09-08',dateKind:'inferred',deadlineInterpretation:{...evidence('before the conference',null),kind:'ambiguous'}},'Finish before the conference','2026-09-06')).toThrow('ambiguous');
});
it('keeps AI dates and manual precedence, and requests structured interpretation',()=>{
 const task=newTask('Finish before a fortnight has elapsed','deadline',new Date('2026-09-06T12:00:00'));
 task.inferred={...enrichment,due:'2026-09-20',dateKind:'explicit',deadlineInterpretation:evidence('before a fortnight has elapsed',14)};
 expect(effective(task).due).toBe('2026-09-20');const prompt=taskAnalysisPrompt(task,graph);
 expect(prompt.input.manualDeadline).toBeNull();expect(prompt.input.deadlineReferenceDate).toBe('2026-09-06');
 expect(prompt.responseSchema.safeParse(task.inferred).success).toBe(true);
 expect(prompt.responseSchema.safeParse({...task.inferred,due:'2026-10-25'}).success).toBe(false);
 task.overrides={due:'2026-09-12',dateKind:'explicit'};expect(effective(task).due).toBe('2026-09-12');
 expect(taskAnalysisPrompt(task,graph).input.manualDeadline).toBe('2026-09-12');
});
it('rejects impossible calendar dates at the response schema boundary',()=>{
 const task=newTask('Finish by February 30');expect(taskAnalysisPrompt(task,graph).responseSchema.safeParse({...enrichment,due:'2027-02-30'}).success).toBe(false);
});
