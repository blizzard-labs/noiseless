import { z } from 'zod';

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, 'Use a real YYYY-MM-DD date');
const score = z.number().min(1).max(10);
export const factors = ['urgency', 'alignment', 'impact', 'roi', 'reputation'] as const;
export type Factor = typeof factors[number];
export const connectionSchema = z.object({ parentId: z.string(), weight: z.number().positive().max(1) });
export const goalSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), level: z.enum(['L1','L2','L3']),
  description: z.string(), successCriteria: z.string(), due: date,
  dateKind: z.enum(['explicit','inferred']), importance: score.default(10),
  parents: z.array(connectionSchema), achieved: z.boolean().default(false)
});
export type Goal = z.infer<typeof goalSchema>;
export type GoalConnection = z.infer<typeof connectionSchema>;
export const graphSchema = z.object({ schema: z.literal(1), version: z.number().int().positive(), goals: z.array(goalSchema) });
export type GoalGraph = z.infer<typeof graphSchema>;
export const enrichmentSchema = z.object({
  goalId: z.string(), estimateMinutes: z.number().int().min(1).max(525600),
  due: date, dateKind: z.enum(['explicit','inferred']),
  impact: score, reputation: score,
  missionFit: z.array(z.object({ goalId: z.string(), score })),
  confidence: z.number().min(0).max(1), rationale: z.string().min(1),
  complex: z.boolean()
});
export type Enrichment = z.infer<typeof enrichmentSchema>;
export const overridesSchema = enrichmentSchema.omit({confidence:true,rationale:true,complex:true}).partial();
const snapshotSchema = z.object({
  at: z.string(), impact: score, alignment: score, points: z.number().min(1).max(100),
  estimateMinutes: z.number().positive(), graphVersion: z.number(), rubricVersion: z.number(),
  attribution: z.record(z.string(), z.number()),
  goals: z.array(goalSchema)
});
export const sessionSchema = z.object({id:z.string(), at:z.string(), date, minutes:z.number().int().min(1).max(1440)});
export const completionSchema = z.object({id:z.string(), at:z.string(), date, action:z.enum(['complete','reopen'])});
export const taskSchema = z.object({
  schema: z.literal(1), kind: z.literal('task'), id: z.string(), title: z.string().min(1),
  originalText: z.string(), createdAt: z.string(), status: z.enum(['open','done','blocked']).default('open'),
  snoozedUntil: date.nullable().default(null),
  inferred: enrichmentSchema.nullable().default(null), overrides: overridesSchema.default({}),
  enrichmentKey: z.string().default(''), provider: z.string().default(''),
  captureState: z.object({title:z.string(),done:z.boolean()}).nullable().default(null),
  pending: z.string().default('Waiting for model setup'),
  snapshot: snapshotSchema.nullable().default(null),
  sessions: z.array(sessionSchema).default([]), history: z.array(completionSchema).default([])
});
export type Task = z.infer<typeof taskSchema>;
export type WorkSession = z.infer<typeof sessionSchema>;
export type CompletionEvent = z.infer<typeof completionSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const providerSchema = z.object({
  enabled:z.boolean(), baseUrl:z.string().url(), model:z.string(), credential:z.string(),
  inputPerMillion:z.number().nonnegative(), outputPerMillion:z.number().nonnegative(),
  tasks:z.object({enrichment:z.boolean(),goalDraft:z.boolean()}).optional()
});
export const configSchema = z.object({
  schema:z.literal(1), rubricVersion:z.number().int().positive(),
  weekdayMinutes:z.number().int().min(0).max(1440).nullable(), weekendMinutes:z.number().int().min(0).max(1440).nullable(),
  dailyOverrides:z.record(date,z.number().int().min(0).max(1440)),
  weights:z.object({urgency:z.number().nonnegative(),alignment:z.number().nonnegative(),impact:z.number().nonnegative(),roi:z.number().nonnegative(),reputation:z.number().nonnegative()}).refine(w=>Object.values(w).some(n=>n>0),'At least one weight must be positive'),
  monthlyCloudBudget:z.number().nonnegative(), maxOutputTokens:z.number().int().min(256).max(16384),
  providers:z.object({lmstudio:providerSchema,openai:providerSchema,anthropic:providerSchema})
});
export type Config = z.infer<typeof configSchema>;
export type ScoringConfig = Config['weights'];
export type Provider = keyof Config['providers'];
export const defaultConfig: Config = {
  schema:1,rubricVersion:1,weekdayMinutes:null,weekendMinutes:null,dailyOverrides:{},
  weights:{urgency:25,alignment:30,impact:20,roi:20,reputation:5}, monthlyCloudBudget:0,maxOutputTokens:2048,
  providers:{
    lmstudio:{enabled:true,baseUrl:'http://127.0.0.1:1234/v1',model:'',credential:'',inputPerMillion:0,outputPerMillion:0},
    openai:{enabled:false,baseUrl:'https://api.openai.com/v1',model:'',credential:'noiseless-openai',inputPerMillion:0,outputPerMillion:0},
    anthropic:{enabled:false,baseUrl:'https://api.anthropic.com/v1',model:'',credential:'noiseless-anthropic',inputPerMillion:0,outputPerMillion:0}
  }
};
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const dayDifference = (a:string,b:string) => (Date.parse(a)-Date.parse(b))/86400000;
export const addDays = (d:string,n:number) => new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
export const uid = () => crypto.randomUUID();
export function newTask(title:string, id:string=uid(), now=new Date()):Task {
  return taskSchema.parse({schema:1,kind:'task',id,title,originalText:title,createdAt:now.toISOString()});
}
export function effective(task:Task):Enrichment {
  return {...{goalId:'unsorted',estimateMinutes:30,due:addDays(localDate(new Date(task.createdAt)),7),dateKind:'inferred' as const,impact:1,reputation:1,missionFit:[],confidence:0,rationale:'Provisional values until enrichment is available.',complex:false},...task.inferred,...task.overrides};
}
