import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {retryCapitalCaptureRpc} from './capital-capture-rpc-retry';
import {createCapitalMaterialSqlPorts} from './capital-material-production-adapter';
import {createCapitalMaterialProducer,type MaterialBundle,type MaterialCapture,type MaterialResearchInput} from './capital-material-production-native';
import {createCapitalMaterialStorageTransport} from './capital-material-production-storage';
export const materialDispatchSchema=z.strictObject({schemaVersion:z.literal('capital-material-dispatch.v1'),mode:z.enum(['legacy','case','plan','material']),workId:z.uuid(),productionPlanId:z.uuid().nullable(),planRequestId:z.uuid().nullable()});
export type MaterialDispatch=z.infer<typeof materialDispatchSchema>;
export interface CapitalMaterialRuntime{
 classify(job:{job_id:string;capability_token:string}):Promise<MaterialDispatch>;
 preparePlan(job:{job_id:string;capability_token:string},dispatch:MaterialDispatch):Promise<unknown>;
 produce(job:{job_id:string;capability_token:string;organization_id:string},dispatch:MaterialDispatch,compile:(context:Record<string,unknown>,capture:MaterialCapture,sealResearch:(input:MaterialResearchInput)=>Promise<void>)=>Promise<MaterialBundle>):Promise<unknown>;
}
export function createCapitalMaterialRuntime(client:SupabaseClient):CapitalMaterialRuntime{
 const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.rpc(name,args);if(r.error)throw new Error(`${name}:${r.error.code}`);return r.data as unknown;};
 return {
  classify:async job=>{
   const name='worker_read_material_production_dispatch_v1';
   const args={p_job_id:job.job_id,p_capability_token:job.capability_token};
   let observedErrorCode:string|undefined;
   const result=await retryCapitalCaptureRpc(async()=>{
    const response=await client.rpc(name,args);
    observedErrorCode=response.error?.code;
    // This read-only classifier has NOWAIT authority guards. Retry its lock
    // contention with unchanged arguments; no other RPC gains this category.
    return response.error?.code==='55P03'
     ? {...response,error:{...response.error,code:'40001',message:'capital_capture_retry'}}
     : response;
   });
   if(result.error)throw new Error(`${name}:${observedErrorCode}`);
   return materialDispatchSchema.parse(result.data);
  },
  preparePlan:(job,dispatch)=>{if(dispatch.mode!=='plan')throw new Error('material_dispatch_denied');return call('worker_prepare_material_production_plan_v1',{p_job_id:job.job_id,p_capability_token:job.capability_token,p_request_id:dispatch.planRequestId??job.job_id});},
  produce:(job,dispatch,compile)=>{if(dispatch.mode!=='material'||!dispatch.productionPlanId)throw new Error('material_dispatch_denied');
   const physical=createCapitalMaterialStorageTransport({client,jobId:job.job_id,capability:job.capability_token,organizationId:job.organization_id,workId:dispatch.workId});
   const ports=createCapitalMaterialSqlPorts({client,jobId:job.job_id,capability:job.capability_token,physical});
   return createCapitalMaterialProducer({jobId:job.job_id,workId:dispatch.workId,ports}).run(randomUUID(),compile);
  },
 };
}
