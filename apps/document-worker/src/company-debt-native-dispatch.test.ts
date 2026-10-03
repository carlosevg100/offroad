/** Unit dispatch only; actual human/loader/Storage authority is the SQL/SDK gate. */
import {randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {processCompanyDebtViewJob} from './company-debt-view';
import type {CapitalProjectAnalysisJob,QueueClient} from './queue';
import type {CapitalCompanyDebtNativeRuntime} from './capital-company-debt-native-runtime';
import type {ModelGateway} from '@offroad/model-gateway';
const job:CapitalProjectAnalysisJob={claimed:true,job_id:randomUUID(),capability_token:'c'.repeat(64),lease_expires_at:'2030-01-01T00:00:00Z',attempt:1,organization_id:randomUUID(),intake_session_id:randomUUID(),processing_run_id:randomUUID(),kind:'capital_project_analysis',payload:{analysis_scope:'company_debt_view',locale:'pt-BR',capital_project_id:randomUUID(),capital_project_plan_id:randomUUID(),capital_project_brief_id:randomUUID(),capital_task_ids:['C11'],capital_artifact_required:true,trigger_event:{type:'project_started'},model_budget:{max_cost_usd:.95,max_calls:2}}};
function harness(recover:()=>Promise<unknown>){
 const load=vi.fn(async()=>{throw new Error('legacy_loader_forbidden');}),model=vi.fn(async()=>{throw new Error('legacy_gateway_forbidden');}),search=vi.fn(async()=>{throw new Error('research_forbidden_on_recovery');});
 const complete=vi.fn(async()=>{}),fail=vi.fn(async()=>{}),queue={loadCapitalProjectContext:load,writeStage:vi.fn(async()=>{}),complete,fail} as unknown as QueueClient;
 const createAdapter=vi.fn(()=>{throw new Error('fresh_adapter_forbidden_on_recovery');});
 const runtime={adapters:{},connections:{},maxCostUsd:.95,maxCalls:2,researchReserveUsd:.2,createRecoveryAdapter:()=>({recover}),createAdapter} as unknown as CapitalCompanyDebtNativeRuntime;
 const dependencies={queue,gateway:{complete:model}as unknown as ModelGateway,lineage:()=>[],researchProviders:[{id:'source_pack',maxCostUsdPerCall:0,search}]as any,nativeRuntime:runtime};
 return{dependencies,load,model,search,complete,fail,createAdapter};
}
describe('real company-debt producer native dispatch',()=>{
 it('uses recovery before any mutable loader, research, adapter or model and acknowledges fixed result',async()=>{
  const receipt={recipeId:randomUUID(),capitalArtifactId:randomUUID(),artifactFingerprint:'a'.repeat(64),revisionId:randomUUID(),replayed:true};const h=harness(async()=>receipt);
  expect(await processCompanyDebtViewJob(job,h.dependencies)).toEqual({status:'succeeded',artifactId:receipt.capitalArtifactId});
  expect(h.load).not.toHaveBeenCalled();expect(h.model).not.toHaveBeenCalled();expect(h.search).not.toHaveBeenCalled();expect(h.createAdapter).not.toHaveBeenCalled();expect(h.complete).toHaveBeenCalledOnce();expect(h.fail).not.toHaveBeenCalled();
 });
 it('denied recovery never becomes absent or falls back to historical loader/model',async()=>{
  const h=harness(async()=>{throw new Error('capital_debt_retained_recovery_required');});
  expect(await processCompanyDebtViewJob(job,h.dependencies)).toEqual({status:'failed'});expect(h.fail).toHaveBeenCalledOnce();expect(h.load).not.toHaveBeenCalled();expect(h.model).not.toHaveBeenCalled();expect(h.search).not.toHaveBeenCalled();expect(h.createAdapter).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled();
 });
});
