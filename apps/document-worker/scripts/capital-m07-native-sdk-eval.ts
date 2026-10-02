/** Actual LOCAL HTTP SDK/Storage + native producer/recovery. Synthetic provider only.
 * Setup uses human commands, never privileged attempt/receipt/Storage fabrication.
 * The first queue acknowledgement is deliberately deferred to simulate a crash
 * after native publication; the second invocation recovers it with zero models.
 */
import assert from 'node:assert/strict';
import {z} from 'zod';
import {legacyGatewayFingerprint,prepareAttemptOutcome,gatewayAttemptOutcomeSchema,prepareGatewayInput,buildEffectiveAdapterRequest} from '@offroad/model-gateway';
import {capitalM07DispatchPolicyFingerprint} from '../src/capital-m07-processing';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {originationSeniorReadoutSchema} from '@offroad/domain-contracts';
import {createQueueClient,type CapitalProjectAnalysisJob} from '../src/queue';
import {processOriginationThesisJob,transformCapitalM07FinalProduct} from '../src/origination-thesis';
import type {ModelGateway} from '@offroad/model-gateway';
const actor='10000000-0000-4000-8000-000000000201',organization='20000000-0000-4000-8000-000000000201';
const url='https://example.invalid/capture-licensed';
let phase='startup';
function localTarget(value:string,protocol:string){const parsed=new URL(value);if(parsed.protocol!==protocol||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||parsed.hash||parsed.search||(protocol==='http:'&&(parsed.username||parsed.password||!['','/'].includes(parsed.pathname))))throw new Error('local target required');return parsed;}
function keyAllowed(key:string){if(key.startsWith('sb_publishable_'))return;const claims:unknown=JSON.parse(Buffer.from(key.split('.')[1]??'','base64url').toString());if(!claims||typeof claims!=='object'||!('role'in claims)||claims.role!=='anon')throw new Error('anon required');}
function sql(command:string,db:string){const result=spawnSync('psql',[db,'-X','-v','ON_ERROR_STOP=1','-Atq'],{input:command,encoding:'utf8'});if(result.error||result.status!==0)throw new Error('local SQL failed');return result.stdout.trim();}
function expand(path:string):string{return readFileSync(path,'utf8').replace(/^\\ir (.+)$/gm,(_,reference:string)=>expand(join(path.slice(0,path.lastIndexOf('/')),reference.trim())));}
type Shape={const?:unknown;enum?:unknown[];anyOf?:Shape[];type?:string;required?:string[];properties?:Record<string,Shape>;items?:Shape;minItems?:number;format?:string;pattern?:string;minLength?:number;minimum?:number};
function synthetic(shape:Shape):unknown{
 if(shape.const!==undefined)return shape.const;if(shape.enum)return shape.enum[0];if(shape.anyOf)return synthetic(shape.anyOf.find(value=>value.type!=="null")??shape.anyOf[0]!);
 if(shape.type==='object')return Object.fromEntries((shape.required??[]).map(key=>[key,synthetic(shape.properties![key]!)]));
 if(shape.type==='array')return Array.from({length:shape.minItems??0},()=>synthetic(shape.items!));
 if(shape.type==='string')return shape.format==='uri'?url:shape.pattern?'assumption_a':'x'.repeat(Math.max(1,shape.minLength??1));
 if(shape.type==='number'||shape.type==='integer')return shape.minimum??0;if(shape.type==='boolean')return true;if(shape.type==='null')return null;throw new Error('unsupported fixture shape');
}
function syntheticOutput(){const output=originationSeniorReadoutSchema.parse(synthetic(z.toJSONSchema(originationSeniorReadoutSchema)as Shape));
 const assumptions=['revenue','costs_and_margin','working_capital','capex_and_depreciation','tax','macro_and_market','debt_service']as const;
 output.preliminaryForwardCase.assumptions=assumptions.map((category,index)=>({...output.preliminaryForwardCase.assumptions[0]!,id:`assumption_${String.fromCharCode(97+index)}`,category}));
 output.preliminaryForwardCase.projectedEffects=(['revenue','ebitda','cash_flow','net_debt_and_leverage','liquidity_and_debt_service']as const).map(category=>({...output.preliminaryForwardCase.projectedEffects[0]!,category}));
 output.preliminaryForwardCase.status='not_computable';return originationSeniorReadoutSchema.parse(output);
}
function staticQuality(){const parsed=syntheticOutput(),id='10000000-0000-4000-8000-000000000333';
 const originalContext={project:{id,organization_id:organization,project_name:'Synthetic',entry_job:'origination_thesis',access_basis:'public_information',current_phase:'understand'},session:{id,locale:'pt-BR',company_profile:{name:'Synthetic company'},privacy_status:'public_information',representation_status:'not_claimed'},brief:{id,kind:'origination_thesis',version:1,content:{meetingContext:'Discuss capital alternatives'},content_fingerprint:'b'.repeat(64)},plan:{id,version:1,fingerprint:'a'.repeat(64),compiler_version:'synthetic.v1',registry_version:'synthetic.v1'},tasks:[{id:'M07',ordinal:0,batch:0,dependencies:[],execution_class:'compilation',effect:'propose_state'}]};
 const source={provider:'source_pack'as const,topic:'identity'as const,title:'Synthetic licensed source',url,snippet:'Licensed excerpt only',contentHash:'b'.repeat(64),publishedAt:null,retrievedAt:'2026-10-02T00:00:00Z'};
 const transformed=transformCapitalM07FinalProduct({parsed,originalContext,sources:[source],asOfDate:'2026-10-02',accepted:{provider:'openai',reportedModel:'gpt-5.6-sol',outputFingerprint:legacyGatewayFingerprint(parsed)},researchStatus:'succeeded',modelInput:{asOfDate:'2026-10-02',locale:'pt-BR',company:{name:'Synthetic company',website:null},publicSources:[source],allowedMaterialNumericTokens:[]}});
 assert.equal(transformed.qualityResults.length,9);assert.ok(transformed.qualityResults.every(result=>result.passed));
}
function protocolParity(db:string,root:string){
 const vectors=JSON.parse(readFileSync(join(root,'scripts/ci/fixtures/capital-body-outcome-protocol.json'),'utf8'))as{outcomes:{dto:Record<string,unknown>}[]};
 assert.equal(vectors.outcomes.length,5);
 for(const {dto}of vectors.outcomes){const validated=gatewayAttemptOutcomeSchema.parse({...dto,task:'origination_thesis',provider:'openai',configuredModel:'gpt-5.6-sol',reportedModel:dto.reportedModel===null?null:'gpt-5.6-sol'});
  const{schemaVersion:_s,fingerprintVersion:_v,outcomeFingerprint:_f,...observed}=validated;const node=prepareAttemptOutcome(observed);
  const wire=JSON.stringify(node).replace(/'/g,"''");assert.equal(sql(`select private.capital_m07_attempt_outcome_fingerprint_v1('${wire}'::jsonb);`,db),node.outcomeFingerprint);
 }
 const system=readFileSync(join(root,'apps/document-worker/src/origination-thesis.ts'),'utf8').match(/const ORIGINATION_THESIS_SYSTEM = `([\s\S]*?)`;/)![1]!;
 const prepared=prepareGatewayInput({task:'origination_thesis',system,input:[{type:'text',text:'Synthetic parity only'}],schema:originationSeniorReadoutSchema,schemaName:'origination_senior_readout_v2',outputMode:'structured',timeoutMs:360000,cacheKey:'origination-senior-readout-v6'});
 for(const[model,bound]of [['gpt-5.6-sol',1150325],['gpt-5.6-terra',627963]]as const){const request=buildEffectiveAdapterRequest(prepared,{provider:'openai',model,effort:'high'},{maxOutputTokens:24000,timeoutMs:360000}).adapterRequest;
  const server=JSON.parse(sql(`select private.capital_m07_dispatch_policy_v1('${model}',100000);`,db));assert.equal(server.fingerprint,capitalM07DispatchPolicyFingerprint(request));assert.equal(server.serverBoundMicroUsd,bound);
 }
}
async function main(){
 if(process.argv[2]==='--self-test'){assert.throws(()=>localTarget('https://ifnogpksgdadruooqydi.supabase.co','http:'));assert.throws(()=>localTarget('http://example.test','http:'));assert.throws(()=>keyAllowed('sb_secret_forbidden'));localTarget('http://127.0.0.1:54321','http:');staticQuality();process.stdout.write('capital_m07_sdk_static_self_test: PASS (current-v3-schema + nine shared graders; no SQL or HTTP executed)\n');return;}
 if(process.argv[2]==='--protocol-sql-only'){const db=process.env.DATABASE_URL!,root=process.env.OFFROAD_REPOSITORY_ROOT!;localTarget(db,'postgresql:');phase='protocol-parity';protocolParity(db,root);process.stdout.write('capital_m07_node_sql_parity: PASS (five outcomes, two fixed policies and server bounds; no HTTP consumer run)\n');return;}
 if(process.argv.length!==2)throw new Error('unsupported args');
 const api=process.env.OFFROAD_E2E_API_URL!,db=process.env.DATABASE_URL!,key=process.env.OFFROAD_E2E_PUBLISHABLE_KEY!,root=process.env.OFFROAD_REPOSITORY_ROOT!;
 localTarget(api,'http:');localTarget(db,'postgresql:');keyAllowed(key);if(!root)throw new Error('repository required');
 phase='protocol-parity';protocolParity(db,root);
 phase='human-fixture';sql(expand(join(root,'supabase/tests/support/capital_m07_native_sdk_fixture.sql')),db);
 const client=createClient(api,key,{global:{headers:{'x-offroad-workspace':organization},fetch:async(input,init)=>{
  const response=await fetch(input,{...init,redirect:'error'});
  if(phase==='producer-http-storage'&&!response.ok){
   const pathname=new URL(input instanceof Request?input.url:String(input)).pathname;
   const operation=/^\/rest\/v1\/rpc\/[a-z0-9_]+$/.test(pathname)?pathname.split('/').at(-1):pathname==='/functions/v1/capital-body-read'?'capital-body-read':'storage';
   process.stderr.write(JSON.stringify({eval:'capital_m07_native_sdk',event:'http-failure',operation,status:response.status})+'\n');
  }
  return response;
 }},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 phase='login';const login=await client.auth.signInWithPassword({email:'origination-owner@example.invalid',password:'m07-isolated-local-eval-password'});assert.equal(login.error,null);assert.equal(login.data.user?.id,actor);
 const realQueue=createQueueClient(client,{workerToken:'w'.repeat(64),leaseSeconds:600});
 phase='real-claim';const claimed=await realQueue.claim();if(!claimed||claimed.kind!=='capital_project_analysis'||claimed.payload.analysis_scope!=='origination_thesis')throw new Error('origination required');const job:CapitalProjectAnalysisJob=claimed;
 const purge=await client.rpc('worker_claim_capital_capture_purge_v1',{p_worker_token:'w'.repeat(64),p_limit:100});assert.equal(purge.error,null);
 let sends=0,acknowledgements=0;
 const queue={...realQueue,complete:async(...args:Parameters<typeof realQueue.complete>)=>{acknowledgements++;if(acknowledgements===2)await realQueue.complete(...args);},
  fail:async(...args:Parameters<typeof realQueue.fail>)=>{
   const failure=args[1];const safe=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9_]{3,120}$/.test(value)?value:null;
   const cause=failure.cause&&typeof failure.cause==='object'?failure.cause as Record<string,unknown>:{};
   process.stderr.write(JSON.stringify({eval:'capital_m07_native_sdk',event:'producer-failure',code:safe(failure.code),causeCode:safe(cause.code),causeClass:safe(cause.class),causeMessage:safe(cause.message)})+'\n');
   return realQueue.fail(...args);
  }};
 const neverGateway={complete:async()=>{throw new Error('legacy model forbidden');},spent:()=>({costUsd:0,calls:0,unknownCostCalls:0,budgetExposureUsd:0})} as unknown as ModelGateway;
 const output=syntheticOutput();
 const dependencies={queue,gateway:neverGateway,lineage:()=>[],researchProviders:[{id:'source_pack' as const,maxCostUsdPerCall:0,search:async(query:import('@offroad/public-research').ResearchQuery)=>[{provider:'source_pack' as const,topic:query.topic,title:'Synthetic licensed source',url,snippet:'Licensed excerpt only',contentHash:'b'.repeat(64),publishedAt:null,retrievedAt:new Date().toISOString()}]}],m07Runtime:{connections:{openai:{accountRef:'m07-sql-account',projectRef:'m07-sql-project',credentialBinding:'m07-sql-key',region:'global'}},maxCostUsd:1.55,maxCalls:2,researchReserveUsd:0.3,adapters:{openai:{provider:'openai' as const,complete:async(request:import('@offroad/model-gateway').AdapterRequest)=>{sends++;return{output,rawText:JSON.stringify(output),model:request.model,usage:{inputTokens:1000,outputTokens:1000,cachedInputTokens:0},stopReason:'end' as const};}}}}};
 phase='producer-http-storage';const first=await processOriginationThesisJob(job,dependencies);assert.equal(first.status,'succeeded');assert.equal(sends,1);assert.equal(acknowledgements,1);
 phase='storage-direct-negative';const path=sql(`select object_path from private.capital_public_payload_allocations where job_id='${job.job_id}' order by created_at limit 1;`,db);assert.ok(path);assert.ok((await client.storage.from('capital-input-capture').download(path)).error);
 phase='recovery-no-model';const replay=await processOriginationThesisJob(job,dependencies);assert.equal(replay.status,'succeeded');assert.equal(replay.artifactId,first.artifactId);assert.equal(sends,1);assert.equal(acknowledgements,2);
 phase='catalog-oracle';const evidence=JSON.parse(sql(`select jsonb_build_object('recipes',(select count(*) from private.capital_m07_recipes where job_id=j.id),'accepted',(select count(*) from private.capital_m07_accepted_invocations where job_id=j.id),'artifacts',(select count(*) from private.capital_m07_native_bindings b join private.capital_m07_recipes r on r.organization_id=b.organization_id and r.id=b.recipe_id where r.job_id=j.id),'status',j.status) from public.processing_jobs j where j.id='${job.job_id}';`,db));assert.equal(evidence.recipes,1);assert.equal(evidence.accepted,1);assert.equal(evidence.artifacts,1);assert.equal(evidence.status,'succeeded');
 // LOCAL fixture clock acceleration only: no synthetic lease, erasure receipt or
 // storage.objects mutation. Every deletion below goes through Storage HTTP/RLS.
 phase='physical-purge-fixture-clock';
 const allocations=z.array(z.strictObject({allocationId:z.uuid(),path:z.string()})).min(4).max(100).parse(JSON.parse(sql(`select jsonb_agg(jsonb_build_object('allocationId',id,'path',object_path) order by id) from private.capital_public_payload_allocations where organization_id='${organization}' and job_id='${job.job_id}';`,db)));
 const allocationIds=new Set(allocations.map(item=>item.allocationId));
 sql(`update private.capital_public_payload_purge_queue q set next_check_at=(select least(clock_timestamp(),coalesce(min(next_check_at),clock_timestamp()))-interval '1 minute' from private.capital_public_payload_purge_queue),effective_purge_at=clock_timestamp()-interval '1 minute' where q.organization_id='${organization}' and q.allocation_id in(select id from private.capital_public_payload_allocations where organization_id='${organization}' and job_id='${job.job_id}');`,db);
 phase='physical-purge-real-lease';
 const claimedPurge=await client.rpc('worker_claim_capital_capture_purge_v1',{p_worker_token:'w'.repeat(64),p_limit:allocations.length});assert.equal(claimedPurge.error,null);
 const purgeItems=z.strictObject({items:z.array(z.strictObject({purgeId:z.uuid(),allocationId:z.uuid(),bucket:z.literal('capital-input-capture'),path:z.string(),storageObjectId:z.uuid().nullable(),storageVersion:z.string().nullable(),purgeCapability:z.string().min(1),leaseExpiresAt:z.iso.datetime({offset:true})})),polledAt:z.iso.datetime({offset:true})}).parse(claimedPurge.data).items;
 assert.equal(purgeItems.length,allocations.length);assert.ok(purgeItems.every(item=>allocationIds.has(item.allocationId)));
 for(const item of purgeItems){
  assert.equal(item.path,allocations.find(value=>value.allocationId===item.allocationId)!.path);assert.ok(item.storageObjectId);assert.ok(item.storageVersion);assert.ok(Date.parse(item.leaseExpiresAt)>Date.now());
  phase='physical-purge-sdk-delete';const removed=await client.storage.from(item.bucket).remove([item.path]);assert.equal(removed.error,null);assert.ok(Array.isArray(removed.data));assert.ok(removed.data.every(value=>value.name===item.path));
  phase='physical-purge-authenticated-absence';const absent=await client.storage.from(item.bucket).info(item.path);assert.equal(absent.data,null);
  const absentError=absent.error as unknown as {status?:unknown;statusCode?:unknown;message?:unknown};assert.ok(absentError);assert.equal(Number(absentError.statusCode),404);assert.match(String(absentError.message),/^(object not found|the resource was not found)$/i);
  const head:Response=await fetch(`${api.replace(/\/$/,'')}/storage/v1/object/authenticated/${item.bucket}/${item.path}`,{method:'HEAD',redirect:'error',headers:{apikey:key,Authorization:`Bearer ${login.data.session!.access_token}`,'x-offroad-workspace':organization}});assert.equal(head.status,404);
  phase='physical-purge-real-ack';const ackArgs={p_worker_token:'w'.repeat(64),p_purge_id:item.purgeId,p_purge_capability:item.purgeCapability,p_storage_delete_confirmed:true};
  const ack=await client.rpc('worker_ack_capital_capture_purge_v1',ackArgs);assert.equal(ack.error,null);assert.deepEqual(ack.data,{purged:true,replayed:false});
  const ackReplay=await client.rpc('worker_ack_capital_capture_purge_v1',ackArgs);assert.equal(ackReplay.error,null);assert.deepEqual(ackReplay.data,{purged:true,replayed:true});
 }
 phase='physical-purge-catalog-oracle';const erased=JSON.parse(sql(`select jsonb_build_object('objects',(select count(*) from storage.objects s join private.capital_public_payload_allocations a on a.bucket_id=s.bucket_id and a.object_path=s.name where a.organization_id='${organization}' and a.job_id='${job.job_id}'),'erasureEvents',(select count(*) from private.capital_public_payload_erasure_events e join private.capital_public_payload_allocations a on a.organization_id=e.organization_id and a.id=e.allocation_id where a.organization_id='${organization}' and a.job_id='${job.job_id}'),'purged',(select count(*) from private.capital_public_payload_purge_queue q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where a.organization_id='${organization}' and a.job_id='${job.job_id}' and q.status='purged'));`,db));assert.equal(erased.objects,0);assert.equal(erased.erasureEvents,allocations.length);assert.equal(erased.purged,allocations.length);
 process.stdout.write(JSON.stringify({eval:'capital_m07_native_sdk',result:'PASS',checks:['human-publication-license','real-approved-job-capability','producer','physical-context-source-parsed-final','native-accepted-outcome','direct-storage-denied','recovery-zero-model','one-artifact','job-completed','real-janitor-lease','sdk-storage-delete','authenticated-head-404','erasure-ack-idempotent'],syntheticModelCalls:sends})+'\n');
}
main().catch(error=>{
 const message=error instanceof Error?error.message:'';
 const boundedMessage=/^[a-z0-9_]{3,120}(: [a-z0-9_]{3,120})?$/.test(message)?message:null;
 process.stderr.write(JSON.stringify({eval:'capital_m07_native_sdk',result:'FAIL',phase,boundedMessage})+'\n');process.exitCode=1;
});
