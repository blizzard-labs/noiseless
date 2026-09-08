import { z } from 'zod';

export const deadlineInterpretationSchema=z.object({
  kind:z.enum(['explicit','inferred','ambiguous']),
  quote:z.string(),
  explanation:z.string().min(1),
  offsetDays:z.number().int().min(-36600).max(36600).nullable(),
  weekday:z.number().int().min(0).max(6).nullable()
});
export type DeadlineInterpretation=z.infer<typeof deadlineInterpretationSchema>;

/** Validate an AI interpretation without recognizing a fixed vocabulary of phrases. */
export function validateDeadline(result:{due:string;dateKind:'explicit'|'inferred';deadlineInterpretation:DeadlineInterpretation},title:string,reference:string,manualDate?:string){
  const evidence=result.deadlineInterpretation;
  const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  if(manualDate){if(result.due!==manualDate||result.dateKind!=='explicit')throw new Error('The model changed the manual deadline.');return;}
  if(evidence.kind==='ambiguous')throw new Error('Deadline is ambiguous. Set Deadline manually or clarify the task wording.');
  if(evidence.kind==='explicit'){
    if(!normalized(evidence.quote)||!normalized(title).includes(normalized(evidence.quote)))throw new Error('Deadline evidence must quote the task itself.');
    if(result.dateKind!=='explicit')throw new Error('A stated task deadline must be marked explicit.');
  }else{
    if(result.dateKind!=='inferred'||evidence.quote.trim()||evidence.offsetDays!==null||evidence.weekday!==null)throw new Error('An inferred planning date cannot claim an explicit time constraint.');
  }
  if(evidence.offsetDays!==null){
    const expected=new Date(Date.parse(reference+'T00:00:00Z')+evidence.offsetDays*86400000).toISOString().slice(0,10);
    if(result.due!==expected)throw new Error(`Deadline calculation disagrees with the interpreted offset: expected ${expected}.`);
  }
  if(evidence.weekday!==null&&new Date(result.due+'T00:00:00Z').getUTCDay()!==evidence.weekday)throw new Error('Deadline does not fall on the interpreted weekday.');
}
