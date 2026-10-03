/** LOCAL actual Auth/SDK/Storage/Edge gate, both zero-model families.
 * Execution approval is an explicit grandfathered fixture; all native recipe,
 * upload, retained-byte receipt, seal, result and erasure operations are actual.
 * Catalogue publisher/leaf licences are synthetic local test rights, never a
 * commercial assertion. No source or licence is invented by the consumer. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {z} from "zod";
import {createClient} from "@supabase/supabase-js";
import {fingerprintJson,stableJson} from "@offroad/case-understanding";
import {publicCapitalCatalogSourceSnapshot,publicCapitalCatalogReference} from "@offroad/public-research/capital-catalog";
import {ensureInitialAgentPlan} from "../src/agent-plan";
import {createQueueClient,type CapitalProjectAnalysisJob} from "../src/queue";
import {createNativeProviderPorts} from "../src/capital-native-provider-adapter";
import {consumeNativeProviderWork} from "../src/capital-native-provider-consumer";
import type {CapitalPublicDeliveryRequest} from "../src/capital-public-capture-adapter";
let phase="startup";
const rpcNames=new Set(["worker_recover_capital_native_provider_v1","worker_prepare_capital_native_recipe_v1","worker_read_capital_native_allocation_v1","worker_commit_capital_body_v1","worker_finalize_capital_native_recipe_v1","worker_read_capital_native_recipe_v1","worker_prepare_capital_native_result_v1","worker_commit_capital_native_result_v1","worker_read_capital_native_result_v1"]);
type TransportDiagnostic={operation:string;status:number;errorCode:string|null;octetStream:boolean;noStore:boolean;physicalHeadersComplete:boolean};
const transportDiagnostics:TransportDiagnostic[]=[];
function diagnosticOperation(value:string):string|null{
 const path=new URL(value).pathname,command=path.split("/").at(-1)!;
 if(path.startsWith("/rest/v1/rpc/")&&rpcNames.has(command))return command;
 if(path==="/functions/v1/capital-body-read")return "capital_body_read";
 if(path.startsWith("/storage/v1/object/capital-input-capture/"))return "storage_upload";
 return null;
}
async function diagnosticFetch(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1]){
 const response=await fetch(input,{...init,redirect:"error"});
 const operation=diagnosticOperation(typeof input==="string"?input:input instanceof URL?input.href:input.url);
 if(operation){
  let errorCode:string|null=null;
  if(!response.ok){try{const value:unknown=await response.clone().json();if(value&&typeof value==="object"&&!Array.isArray(value)){
   const code=(value as Record<string,unknown>).code;if(typeof code==="string"&&["42501","22023","23505","40001","55P03","PGRST202","PGRST204"].includes(code))errorCode=code;
  }}catch{/* Never emit untrusted transport bodies. */}}
  transportDiagnostics.push({operation,status:response.status,errorCode,octetStream:response.headers.get("content-type")==="application/octet-stream",noStore:response.headers.get("cache-control")?.split(",").some(v=>v.trim()==="no-store")??false,
   physicalHeadersComplete:["x-offroad-recipe-id","x-offroad-allocation-id","x-offroad-object-id","x-offroad-storage-version","x-offroad-payload-sha256","x-offroad-byte-length"].every(key=>response.headers.has(key))});
  if(transportDiagnostics.length>24)transportDiagnostics.shift();
 }
 return response;
}

function localTarget(value:string,protocol:string){const p=new URL(value);assert.equal(p.protocol,protocol);assert.ok(["localhost","127.0.0.1","[::1]"].includes(p.hostname));assert.equal(p.search,"");assert.equal(p.hash,"");if(protocol==="http:"){assert.equal(p.username,"");assert.equal(p.password,"");assert.ok(["","/"].includes(p.pathname));}return p;}
function allowedKey(value:string){if(value.startsWith("sb_publishable_"))return;assert.equal(JSON.parse(Buffer.from(value.split(".")[1]??"","base64url").toString()).role,"anon");}
function missing(status:number,value:unknown){if(!value||typeof value!=="object"||Array.isArray(value))return false;const v=value as Record<string,unknown>;return[400,404].includes(status)&&String(v.statusCode)==="404"&&["not_found","Not Found"].includes(String(v.error))&&["object not found","the resource was not found"].includes(String(v.message).toLowerCase());}
function sql(db:string,input:string){const r=spawnSync("psql",[db,"-XAtq","-v","ON_ERROR_STOP=1"],{input,encoding:"utf8"});if(r.error||r.status!==0)throw Error("native_provider_local_sql_failed");return r.stdout.trim();}
function expand(path:string):string{return readFileSync(path,"utf8").replace(/^\\ir (.+)$/gm,(_,reference:string)=>expand(join(dirname(path),reference.trim())));}
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
async function main(){
 if(process.argv[2]==="--self-test"){
  assert.throws(()=>localTarget("https://production.supabase.co","http:"));assert.throws(()=>localTarget("postgresql://remote.invalid/db","postgresql:"));assert.throws(()=>allowedKey("sb_secret_never"));
  assert.equal(diagnosticOperation("http://localhost:54321/rest/v1/rpc/worker_prepare_capital_native_recipe_v1"),"worker_prepare_capital_native_recipe_v1");
  assert.equal(diagnosticOperation("http://localhost:54321/rest/v1/rpc/arbitrary_secret_name"),null);
  assert.equal(diagnosticOperation("http://localhost:54321/storage/v1/object/capital-input-capture/private/path"),"storage_upload");
  assert.equal(diagnosticOperation("http://localhost:54321/auth/v1/token?password=private"),null);
  const actualFetch=globalThis.fetch;
  try{
   globalThis.fetch=async()=>new Response(JSON.stringify({code:"42501",message:"private raw body",details:"private token"}),{status:403,headers:{"content-type":"application/json"}});
   await diagnosticFetch("http://localhost:54321/rest/v1/rpc/worker_prepare_capital_native_recipe_v1",{body:"private capability"});
   assert.deepEqual(transportDiagnostics.at(-1),{operation:"worker_prepare_capital_native_recipe_v1",status:403,errorCode:"42501",octetStream:false,noStore:false,physicalHeadersComplete:false});
   assert.ok(!JSON.stringify(transportDiagnostics).includes("private"));
   globalThis.fetch=async()=>new Response(JSON.stringify({code:"arbitrary_private_code",message:"private raw body"}),{status:400});
   await diagnosticFetch("http://localhost:54321/functions/v1/capital-body-read");assert.equal(transportDiagnostics.at(-1)?.errorCode,null);
  }finally{globalThis.fetch=actualFetch;transportDiagnostics.length=0;}
  assert.equal(fingerprintJson(publicCapitalCatalogSourceSnapshot),publicCapitalCatalogReference.sourceFingerprint);
  assert.ok(missing(400,{statusCode:"404",error:"not_found",message:"Object not found"}));assert.equal(missing(403,{statusCode:"404",error:"not_found",message:"Object not found"}),false);
  process.stdout.write("capital_native_provider_sdk_static: PASS (local target/anon guard, catalogue fingerprint, strict absence; no SQL or HTTP)\n");return;
 }
 if(process.argv[2]==="--sql-contracts"){
  const db=process.env.DATABASE_URL!,root=process.env.OFFROAD_REPOSITORY_ROOT!;localTarget(db,"postgresql:");assert.ok(root);
  const payload={url:"https://example.invalid/native-provider-catalog",title:"Synthetic local authorised catalogue snapshot",contentHash:publicCapitalCatalogReference.sourceFingerprint,snippet:stableJson(publicCapitalCatalogSourceSnapshot)};
  const seed=expand(join(root,"supabase/tests/support/capital_native_provider_catalog_sdk_fixture.sql")).split("update auth.users set instance_id")[0]!.replace(/^begin;$/m,"").replace("--NATIVE_CATALOG_PAYLOAD",literal(JSON.stringify(payload))+"::jsonb");
  const contract=expand(join(root,"supabase/tests/support/capital_native_provider_catalog_contract.sql"));
  const fixture=expand(join(root,"supabase/tests/support/capital_native_provider_recipe.sql")).replace(/^begin;$/m,"");
  sql(db,"begin;\n"+seed+"\nselect set_config('request.headers','{}',true);\n"+contract+fixture);
  process.stdout.write("capital_native_provider_catalog_sql: PASS (actual catalogue snapshot/licence graph, original retry, revocation/wakes; SQL metadata-only rollback, no HTTP)\n");return;
 }
 assert.equal(process.argv.length,2);const api=process.env.OFFROAD_E2E_API_URL!,db=process.env.DATABASE_URL!,key=process.env.OFFROAD_E2E_PUBLISHABLE_KEY!,root=process.env.OFFROAD_REPOSITORY_ROOT!;
 localTarget(api,"http:");localTarget(db,"postgresql:");allowedKey(key);assert.ok(root);
 const payload={url:"https://example.invalid/native-provider-catalog",title:"Synthetic local authorised catalogue snapshot",contentHash:publicCapitalCatalogReference.sourceFingerprint,snippet:stableJson(publicCapitalCatalogSourceSnapshot)};
 phase="local-fixture-human-publication";const publisherFixture=expand(join(root,"supabase/tests/support/capital_native_provider_catalog_sdk_fixture.sql"));
 const lines=sql(db,publisherFixture.replace("--NATIVE_CATALOG_PAYLOAD",literal(JSON.stringify(payload))+"::jsonb")).split("\n");
 const publication=JSON.parse(lines.find(line=>line.startsWith('{"origin"'))??lines.find(line=>line.startsWith("{")&&line.includes('"deliveryKey"'))!)as CapitalPublicDeliveryRequest;
 for(const family of ["provider_case_fit","provider_research"]as const){
  const suffix=family==="provider_research"?"981":"971",organization=`20000000-0000-4000-8000-000000000${suffix}`,actor=`10000000-0000-4000-8000-000000000${suffix}`;
  phase=`${family}_local_fixture_approval`;sql(db,expand(join(root,`supabase/tests/support/capital_native_provider_${family==="provider_research"?"research":"case_fit"}_sdk_fixture.sql`)));
  const client=createClient(api,key,{global:{headers:{"x-offroad-workspace":organization},fetch:diagnosticFetch},auth:{persistSession:false}});
  phase=`${family}_real_auth`;const login=await client.auth.signInWithPassword({email:family==="provider_research"?"provider-research-a@example.invalid":"case-fit-a@example.invalid",password:"native-provider-isolated-local-password"});assert.equal(login.error,null);assert.equal(login.data.user?.id,actor);
  const token=family==="provider_research"?"v".repeat(64):"u".repeat(64),queue=createQueueClient(client,{workerToken:token,leaseSeconds:600});
  phase=`${family}_real_claim`;const claimed=await queue.claim();assert.ok(claimed&&claimed.kind==="capital_project_analysis");const job=claimed as CapitalProjectAnalysisJob;assert.equal(job.payload.analysis_scope,family);assert.equal(job.organization_id,organization);await ensureInitialAgentPlan(job,queue);
  assert.equal((await client.rpc("worker_claim_capital_capture_purge_v1",{p_worker_token:token,p_limit:100})).error,null);
  const ports=createNativeProviderPorts({client,job,cataloguePublication:async()=>publication});
  phase=`${family}_actual_native_producer`;
  const observedPorts={...ports,
   recover:async()=>{phase=`${family}_native_recover`;return ports.recover();},
   capture:async()=>{phase=`${family}_native_capture`;return ports.capture();},
   readContext:async(recipe:Parameters<typeof ports.readContext>[0])=>{phase=`${family}_native_read_context`;return ports.readContext(recipe);},
   readCatalog:async(recipe:Parameters<typeof ports.readCatalog>[0])=>{phase=`${family}_native_read_catalog`;return ports.readCatalog(recipe);},
   commit:async(value:Parameters<typeof ports.commit>[0])=>{phase=`${family}_native_commit_${value.taskId.toLowerCase()}`;return ports.commit(value);},
  };
  const first=await consumeNativeProviderWork(job,observedPorts);assert.equal(first.status,"succeeded");assert.equal(first.modelCalls,0);assert.equal(first.artifact.grantsApproval,false);
  const recipeId=z.uuid().parse(first.artifact.recipeId),revision=z.uuid().parse(first.artifact.revisionId);
  phase=`${family}_catalog_oracle`;const oracle=JSON.parse(sql(db,`select jsonb_build_object('recipes',(select count(*)from private.capital_native_recipes where job_id=j.id),'bindings',(select count(*)from private.capital_native_result_bindings where recipe_id='${recipeId}'),'calls',j.model_calls,'accepted',(select count(*)from private.capital_body_accepted_invocations accepted join private.capital_body_invocation_inputs input on input.organization_id=accepted.organization_id and input.id=accepted.input_receipt_id where input.job_id=j.id),'tasks',(select count(*)from public.capital_project_task_runs where processing_job_id=j.id and status='succeeded'))from public.processing_jobs j where j.id='${job.job_id}';`));
  assert.deepEqual(oracle,{recipes:1,bindings:3,calls:0,accepted:0,tasks:3});
  phase=`${family}_recovery_before_context_builder`;const noRebuild={...ports,capture:async()=>{throw Error("must_not_capture_replay");},readContext:async()=>{throw Error("must_not_build_replay");},readCatalog:async()=>{throw Error("must_not_catalogue_replay");},commit:async()=>{throw Error("must_not_overwrite_replay");}};
  const replay=await consumeNativeProviderWork(job,noRebuild);assert.equal(replay.replayed,true);assert.deepEqual(replay.artifact,first.artifact);
  const httpHeaders={apikey:key,Authorization:`Bearer ${login.data.session!.access_token}`,"x-offroad-workspace":organization,"Content-Type":"application/json"};
  const human=()=>fetch(`${api.replace(/\/$/,"")}/functions/v1/capital-body-read`,{method:"POST",headers:httpHeaders,redirect:"error",cache:"no-store",body:JSON.stringify({kind:"native_provider_human",revisionId:revision})});
  phase=`${family}_human_physical`;const display=await human();assert.equal(display.status,200);assert.equal(display.headers.get("x-offroad-revision-id"),revision);const displayed=new Uint8Array(await display.arrayBuffer());assert.equal(createHash("sha256").update(displayed).digest("hex"),first.artifact.bodyFingerprint);const body=JSON.parse(new TextDecoder().decode(displayed));assert.equal(body.shortlistAuthorized,false);assert.equal(body.externalEffectAllowed,false);
  const allocations=z.array(z.strictObject({allocationId:z.uuid(),path:z.string()})).min(4).max(5).parse(JSON.parse(sql(db,`select jsonb_agg(jsonb_build_object('allocationId',id,'path',object_path)order by id)from private.capital_public_payload_allocations where job_id='${job.job_id}';`)));
  assert.equal(allocations.length,family==="provider_research"?5:4);phase=`${family}_direct_storage_negative`;assert.ok((await client.storage.from("capital-input-capture").download(allocations[0]!.path)).error);
  phase=`${family}_actual_queue_completion`;await queue.complete(job,{[`${family}_artifact_id`]:first.artifact.artifactId,artifact_fingerprint:first.artifact.artifactFingerprint});assert.equal(sql(db,`select status from public.processing_jobs where id='${job.job_id}';`),"succeeded");
  if(family==="provider_research"){
   phase="publisher_actual_rights_revocation";const publisher=createClient(api,key,{global:{headers:{"x-offroad-workspace":"20000000-0000-4000-8000-000000000983"}},auth:{persistSession:false}});
   assert.equal((await publisher.auth.signInWithPassword({email:"native-provider-publisher@example.invalid",password:"native-provider-publisher-local-password"})).error,null);
   const sourceId=z.uuid().parse(publication.origin!.sourceVersionId);const revised=await publisher.rpc("set_source_rights_v1",{p_version_id:sourceId,p_expected_revision:1,p_operations:["read"],p_purposes:["analysis"],p_expires_at:null,p_store_until:null,p_evidence_id:sourceId,p_evidence_sha256:"e".repeat(64)});assert.equal(revised.error,null);
   assert.equal((await human()).status,403);
   assert.equal(sql(db,`select count(*)from private.capital_native_result_bindings where recipe_id='${recipeId}';`),"3");
  }
  phase=`${family}_fixture_purge_clock`;sql(db,`update private.capital_public_payload_purge_queue set next_check_at=clock_timestamp()-interval'1 minute',effective_purge_at=clock_timestamp()-interval'1 minute'where organization_id='${organization}'and allocation_id in(select id from private.capital_public_payload_allocations where job_id='${job.job_id}');`);
  phase=`${family}_real_janitor_lease`;const ticket=await client.rpc("worker_claim_capital_capture_purge_v1",{p_worker_token:token,p_limit:allocations.length});assert.equal(ticket.error,null);
  const items=z.object({items:z.array(z.object({purgeId:z.uuid(),allocationId:z.uuid(),bucket:z.literal("capital-input-capture"),path:z.string(),purgeCapability:z.string().min(1)}))}).parse(ticket.data).items;assert.equal(items.length,allocations.length);
  for(const item of items){assert.ok(allocations.some(a=>a.allocationId===item.allocationId&&a.path===item.path));phase=`${family}_physical_erase`;assert.equal((await client.storage.from(item.bucket).remove([item.path])).error,null);
   const absent=await client.storage.from(item.bucket).info(item.path);assert.equal(absent.data,null);assert.ok(absent.error);
   const info=await fetch(`${api.replace(/\/$/,"")}/storage/v1/object/info/${item.bucket}/${item.path}`,{headers:httpHeaders,redirect:"error",cache:"no-store"});assert.ok(missing(info.status,await info.json()));assert.equal(sql(db,`select count(*)from storage.objects where bucket_id='${item.bucket}'and name='${item.path}';`),"0");
   phase=`${family}_real_erase_ack`;const a={p_worker_token:token,p_purge_id:item.purgeId,p_purge_capability:item.purgeCapability,p_storage_delete_confirmed:true};const ack=await client.rpc("worker_ack_capital_capture_purge_v1",a);assert.equal(ack.error,null);assert.deepEqual(ack.data,{purged:true,replayed:false});const again=await client.rpc("worker_ack_capital_capture_purge_v1",a);assert.equal(again.error,null);assert.deepEqual(again.data,{purged:true,replayed:true});
  }
  phase=`${family}_post_purge_human_denied`;assert.equal((await human()).status,403);
  process.stdout.write(JSON.stringify({eval:family,result:"PASS",modelCalls:0,checks:["grandfathered-fixture-approval-explicit","native-recipe-source-bytes","three-real-task-results","zero-accepted","replay-before-build","human-physical-current-read","direct-Storage-denied","actual-queue-completed","real-janitor-SDK-delete-info404-catalog-absence","erase-ack-idempotent","post-purge-human-denied"]})+"\n");
 }
}
main().catch(error=>{const code=error instanceof Error&&/^[a-z0-9_]{3,120}$/.test(error.message)?error.message:null;process.stderr.write(JSON.stringify({eval:"capital_native_provider_sdk",result:"FAIL",phase,code,transport:transportDiagnostics})+"\n");process.exitCode=1;});
