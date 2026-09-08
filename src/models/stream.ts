/** Assemble OpenAI-compatible SSE responses without exposing reasoning events. */
export class LocalStream {
  private pending='';private content='';private reasoning='';private finish:string|null=null;private usage:unknown;
  constructor(private progress?:(characters:number)=>void){}
  push(text:string){this.pending+=text;let end:number;while((end=this.pending.indexOf('\n'))>=0){const line=this.pending.slice(0,end).trim();this.pending=this.pending.slice(end+1);if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;const event=JSON.parse(data);if(event.error)throw new Error('Local stream error');const choice=event.choices?.[0];this.content+=choice?.delta?.content??'';this.reasoning+=choice?.delta?.reasoning_content??'';if(choice?.finish_reason)this.finish=choice.finish_reason;if(event.usage)this.usage=event.usage;this.progress?.(this.content.length);}}
  result(){this.push('\n');return {choices:[{message:{content:this.content,reasoning_content:this.reasoning},finish_reason:this.finish}],usage:this.usage};}
}
