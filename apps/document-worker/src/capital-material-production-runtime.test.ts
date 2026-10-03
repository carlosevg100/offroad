import {test,expect,vi,afterEach} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createCapitalMaterialRuntime,materialDispatchSchema} from './capital-material-production-runtime';
const id='10000000-0000-4000-8000-000000000001',work='20000000-0000-4000-8000-000000000001',plan='30000000-0000-4000-8000-000000000001';
const job={job_id:id,capability_token:'current-capability',organization_id:work};
const dispatch={schemaVersion:'capital-material-dispatch.v1',mode:'material',workId:work,productionPlanId:plan,planRequestId:null}as const;
test('classifier accepts only server closed DTO and binds current job capability',async()=>{const rpc=vi.fn().mockResolvedValue({data:dispatch,error:null});const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);expect(await runtime.classify(job)).toEqual(dispatch);expect(rpc).toHaveBeenCalledExactlyOnceWith('worker_read_material_production_dispatch_v1',{p_job_id:id,p_capability_token:job.capability_token});expect(()=>materialDispatchSchema.parse({...dispatch,callerNative:true})).toThrow();});
test('native plan preserves original request on resume',async()=>{const rpc=vi.fn().mockResolvedValue({data:{prepared:true},error:null});const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);await runtime.preparePlan(job,{...dispatch,mode:'plan',planRequestId:plan});expect(rpc).toHaveBeenCalledExactlyOnceWith('worker_prepare_material_production_plan_v1',{p_job_id:id,p_capability_token:job.capability_token,p_request_id:plan});});
test('material begins with recovery and never reaches compiler or current capture on denial',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'42501'}});const compile=vi.fn();const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);await expect(runtime.produce(job,dispatch,compile)).rejects.toThrow('worker_recover_material_production_v1');expect(compile).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledExactlyOnceWith('worker_recover_material_production_v1',{p_job_id:id,p_capability_token:job.capability_token});});
test('case dispatch cannot invoke native producers',()=>{const runtime=createCapitalMaterialRuntime({}as SupabaseClient);expect(()=>runtime.preparePlan(job,{...dispatch,mode:'case'})).toThrow('dispatch_denied');expect(()=>runtime.produce(job,{...dispatch,mode:'case'},vi.fn())).toThrow('dispatch_denied');});

afterEach(()=>vi.useRealTimers());
test('classifier retries only transient NOWAIT contention with the identical capability and backoff',async()=>{
 vi.useFakeTimers();
 const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:'55P03',message:'could not obtain lock'}}).mockResolvedValue({data:dispatch,error:null});
 const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);
 const pending=runtime.classify(job);
 await vi.advanceTimersByTimeAsync(24);expect(rpc).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(await pending).toEqual(dispatch);
 expect(rpc).toHaveBeenCalledTimes(2);
 expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
 expect(rpc.mock.calls[1]![1]).toBe(rpc.mock.calls[0]![1]);
});
test('classifier rechecks revocation after contention and never retries denied authority',async()=>{
 vi.useFakeTimers();
 const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:'55P03'}}).mockResolvedValue({data:null,error:{code:'42501'}});
 const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);
 const pending=expect(runtime.classify(job)).rejects.toThrow('worker_read_material_production_dispatch_v1:42501');
 await vi.runAllTimersAsync();await pending;expect(rpc).toHaveBeenCalledTimes(2);
});
test.each([{code:'42501'}, {code:'40001',message:'context_changed'}])('classifier never retries a denial or another conflict (%j)',async error=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error});
 await expect(createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient).classify(job)).rejects.toThrow(`worker_read_material_production_dispatch_v1:${error.code}`);
 expect(rpc).toHaveBeenCalledTimes(1);
});
test('classifier exhausts eight lock attempts without starting production or any model',async()=>{
 vi.useFakeTimers();
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'55P03'}}),compile=vi.fn();
 const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);
 const pending=expect(runtime.classify(job).then(classified=>runtime.produce(job,classified,compile))).rejects.toThrow('worker_read_material_production_dispatch_v1:55P03');
 await vi.runAllTimersAsync();await pending;
 expect(rpc).toHaveBeenCalledTimes(8);expect(compile).not.toHaveBeenCalled();
 expect(rpc.mock.calls.every(([name,args])=>name==='worker_read_material_production_dispatch_v1'&&args===rpc.mock.calls[0]![1])).toBe(true);
});
test('NOWAIT errors from the plan writer remain terminal and are not retried',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'55P03'}});
 const runtime=createCapitalMaterialRuntime({rpc}as unknown as SupabaseClient);
 await expect(runtime.preparePlan(job,{...dispatch,mode:'plan',planRequestId:plan})).rejects.toThrow('worker_prepare_material_production_plan_v1:55P03');
 expect(rpc).toHaveBeenCalledTimes(1);
});
