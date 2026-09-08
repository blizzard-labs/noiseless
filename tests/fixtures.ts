import { Config, defaultConfig, enrichmentSchema, GoalGraph, newTask } from '../src/core/model';
import { VaultIO } from '../src/storage/store';
export const now=new Date('2026-09-06T12:00:00');
export const config:Config={...structuredClone(defaultConfig),weekdayMinutes:240,weekendMinutes:120};
export const graph:GoalGraph={schema:1,version:1,goals:[
  {id:'life',title:'Independence',level:'L1',description:'Enable independence',successCriteria:'People live independently',due:'2035-01-01',dateKind:'explicit',importance:10,parents:[],achieved:false},
  {id:'health',title:'Health',level:'L1',description:'Improve health',successCriteria:'Health outcomes',due:'2035-01-01',dateKind:'explicit',importance:10,parents:[],achieved:false},
  {id:'research',title:'Research',level:'L2',description:'Research program',successCriteria:'Program established',due:'2027-01-01',dateKind:'explicit',importance:10,parents:[{parentId:'life',weight:1}],achieved:false},
  {id:'community',title:'Community',level:'L2',description:'Community program',successCriteria:'Program established',due:'2027-01-01',dateKind:'explicit',importance:10,parents:[{parentId:'life',weight:0.5},{parentId:'health',weight:0.5}],achieved:false},
  {id:'event',title:'Fundraising event',level:'L3',description:'Raise funds',successCriteria:'Raise $10k',due:'2026-10-01',dateKind:'explicit',importance:10,parents:[{parentId:'research',weight:0.3},{parentId:'community',weight:0.7}],achieved:false}
]};
export const enrichment=enrichmentSchema.parse({goalId:'event',estimateMinutes:180,due:'2026-09-10',dateKind:'inferred',impact:8,reputation:5,missionFit:[{goalId:'life',score:10},{goalId:'health',score:6}],confidence:.9,rationale:'A concrete contribution to sponsor funding.',complex:false,deadlineInterpretation:{kind:'inferred',quote:'',explanation:'No deadline was stated.',offsetDays:null,weekday:null}});
export function task(id='task-1'){return {...newTask('Email three sponsors',id,now),inferred:structuredClone(enrichment),pending:''};}
export class MemoryIO implements VaultIO {
  files=new Map<string,string>();queues=new Map<string,Promise<unknown>>();
  async list(){return [...this.files.keys()];}async exists(path:string){return this.files.has(path);}
  async read(path:string){if(!this.files.has(path))throw new Error('Missing: '+path);return this.files.get(path)!;}
  async create(path:string,text:string){if(this.files.has(path))throw new Error('Already exists');this.files.set(path,text);}
  async process(path:string,fn:(text:string)=>string){const p=(this.queues.get(path)??Promise.resolve()).then(async()=>{this.files.set(path,fn(await this.read(path)));});this.queues.set(path,p.catch(()=>{}));await p;}
}
