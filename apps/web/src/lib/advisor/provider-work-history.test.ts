import {describe,expect,it} from 'vitest';
import {compileProviderResearchArtifact} from '@offroad/work-plan';
import {readProviderWorkHistory} from './provider-work-history';
const org='10000000-0000-4000-8000-000000000001',project='10000000-0000-4000-8000-000000000002',plan='10000000-0000-4000-8000-000000000003';
const content=compileProviderResearchArtifact({schemaVersion:'provider-research.v1',scope:'research_only',projectId:project,planId:plan,planFingerprint:'a'.repeat(64),locale:'pt-BR',objective:'Pesquisa original',asOf:'2026-09-01T00:00:00Z',sourceFingerprint:'b'.repeat(64),providers:[],limitations:['Pesquisa sintética'],shortlistAuthorized:false,externalEffectAllowed:false});
const row={id:'artifact',artifact_type:'provider_research',schema_version:'provider-research.v1',artifact_version:1,status:'stale',plan_id:plan,task_run_id:'run',content};
const plans=[{id:plan,plan_fingerprint:'a'.repeat(64)}],runs=[{id:'run',plan_id:plan,status:'succeeded'}],binding={organizationId:org,projectId:project,currentPlanId:org};
describe('provider history binding',()=>{
 it('preserves a stale result only with its original plan and completed run',()=>{expect(readProviderWorkHistory([row],plans,runs,binding)[0]).toMatchObject({status:'stale',research:content});expect(readProviderWorkHistory([row],plans,runs,{...binding,currentPlanId:plan})).toEqual([]);});
 it('does not reinterpret old results using a new plan or another project',()=>{expect(readProviderWorkHistory([row],[{id:plan,plan_fingerprint:'f'.repeat(64)}],runs,binding)).toEqual([]);expect(readProviderWorkHistory([row],plans,[{...runs[0]!,plan_id:org}],binding)).toEqual([]);expect(readProviderWorkHistory([row],plans,runs,{...binding,projectId:org})).toEqual([]);});
 it('limits history to ten and does not fallback around invalid rows',()=>{expect(readProviderWorkHistory(Array.from({length:20},(_,i)=>({...row,id:String(i)})),plans,runs,binding)).toHaveLength(10);expect(readProviderWorkHistory([{...row,content:{...content,objective:'Changed'}}],plans,runs,binding)).toEqual([]);});
});
