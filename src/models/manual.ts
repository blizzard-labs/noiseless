import { z } from 'zod';
import { GoalGraph, graphSchema } from '../core/model';
import { validateGraph } from '../core/engine';
import { goalDraftPrompt } from './router';

export const manualFolder='Noiseless/Goal exchange';
export const outputFolder=`${manualFolder}/Outputs`;
export function exportGoalPrompt(brief:string,current:GoalGraph){
  const prompt=goalDraftPrompt(brief,current);
  return ['# Noiseless goal drafting request',
    'Follow the system instructions below using the supplied input data. Return exactly one JSON object matching the schema, without commentary. Save it as result.json. If you can write to this vault, write only Noiseless/Goal exchange/Outputs/result.json; do not modify active goals or other notes. Otherwise provide the JSON file for download. The user will import, review, and separately approve it.',
    '## System instructions',prompt.system,'## Input data',JSON.stringify(prompt.input,null,2),
    '## Required output JSON schema',JSON.stringify(z.toJSONSchema(graphSchema,{target:'draft-7'}),null,2),
    '## Validation requirements','Goal IDs must be unique. Parent IDs must exist. L3 connects only to L2, L2 only to L1. Each non-root goal’s parent weights sum to 1. All achieved values must be false. Dates use YYYY-MM-DD. Preserve existing IDs where possible.'].join('\n\n')+'\n';
}
export function parseGoalOutput(text:string):GoalGraph{
  const trimmed=text.trim().replace(/^\uFEFF/,'');
  const fenced=trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  let value:unknown;try{value=JSON.parse(fenced?fenced[1]:trimmed);}catch{throw new Error('Use a JSON object or a Markdown file containing one fenced JSON block, without extra commentary.');}
  const graph=graphSchema.parse(value);validateGraph(graph);
  if(graph.goals.some(goal=>goal.achieved))throw new Error('Draft goals must have achieved: false. Confirm outcomes after approval.');
  return graph;
}
