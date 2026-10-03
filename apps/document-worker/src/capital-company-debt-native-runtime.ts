/** SDK factory selected by the worker's joint native rollout. SQL decides
 * eligibility; the factory cannot turn a legacy result into a retained input. */
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ModelGatewayConfig} from '@offroad/model-gateway';
import type {ProviderConnections} from './provider-processing';
import type {CapitalProjectAnalysisJob} from './queue';
import {readCapitalDebtRevisionBodyBytes,readCapitalDebtRevisionSourceBytes,readCapitalDebtRevisionTaskBytes,readCapitalDebtBodyBytes} from './capital-body-read-client';
import {capitalCompanyDebtRetentionScopeSchema} from './capital-company-debt-protocol';
import {createCapitalCompanyDebtRevisionQueueAdapter} from './capital-company-debt-revision-queue-adapter';
import {createCapitalCompanyDebtQueueAdapter} from './capital-company-debt-queue-adapter';
import {createCapitalCompanyDebtRecoveryQueueAdapter} from './capital-company-debt-recovery-queue-adapter';
const allocation=z.strictObject({schemaVersion:z.literal('capital-debt-worker-read-scope.v1'),recipeId:z.uuid(),retention:capitalCompanyDebtRetentionScopeSchema});
export function createCapitalCompanyDebtNativeRuntime(client:SupabaseClient,config:{adapters:ModelGatewayConfig['adapters'];connections:ProviderConnections;maxCostUsd:number;maxCalls:number;researchReserveUsd:number}){
 if(!Number.isFinite(config.maxCostUsd)||config.maxCostUsd<=0||!Number.isInteger(config.maxCalls)||config.maxCalls<1||!Number.isFinite(config.researchReserveUsd)||config.researchReserveUsd<0)throw new Error('capital_debt_runtime_budget_invalid');
 const readBytes=async(authority:{jobId:string;capabilityToken:string},scope:z.infer<typeof capitalCompanyDebtRetentionScopeSchema>)=>{
  const result=await client.rpc('worker_read_capital_debt_allocation_v1',{p_job_id:authority.jobId,p_capability_token:authority.capabilityToken,p_allocation_id:scope.allocationId});
  if(result.error)throw new Error('capital_debt_read_denied');
  const current=allocation.parse(result.data);if(current.retention.allocationId!==scope.allocationId)throw new Error('capital_debt_read_denied');
  return readCapitalDebtBodyBytes(client,authority,{recipeId:current.recipeId},scope);
 };
 return Object.freeze({...config,createRecoveryAdapter:(job:CapitalProjectAnalysisJob)=>createCapitalCompanyDebtRecoveryQueueAdapter(client,job),createAdapter:(job:CapitalProjectAnalysisJob)=>{
  if(!job.payload.revision_of_artifact_id)return createCapitalCompanyDebtQueueAdapter(client,job,readBytes);
  const authority={jobId:job.job_id,capabilityToken:job.capability_token};
  return createCapitalCompanyDebtRevisionQueueAdapter(client,job,readBytes,{
   prior:scope=>readCapitalDebtRevisionBodyBytes(client,authority,{retainedPayloadId:z.uuid().parse(scope.retainedPayloadId)},scope),
   task:(scope,taskRunId)=>readCapitalDebtRevisionTaskBytes(client,authority,{taskRunId},scope),
   source:scope=>readCapitalDebtRevisionSourceBytes(client,authority,{retainedPayloadId:scope.retainedPayloadId},scope),
  });
 }});
}
export type CapitalCompanyDebtNativeRuntime=ReturnType<typeof createCapitalCompanyDebtNativeRuntime>;
