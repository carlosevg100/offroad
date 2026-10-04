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
import {capitalProjectAnalysisJobSchema,createQueueClient,type CapitalProjectAnalysisJob} from "../src/queue";
import {createNativeProviderPorts} from "../src/capital-native-provider-adapter";
import {consumeNativeProviderWork} from "../src/capital-native-provider-consumer";
import type {CapitalPublicDeliveryRequest} from "../src/capital-public-capture-adapter";
let phase="startup";
function exactProviderClaim(claimed:Awaited<ReturnType<ReturnType<typeof createQueueClient>["claim"]>>,expectedJobId:string,organization:string,family:"provider_case_fit"|"provider_research"):CapitalProjectAnalysisJob {
 assert.ok(claimed&&claimed.kind==="capital_project_analysis");
 assert.equal(claimed.job_id,expectedJobId);
 assert.equal(claimed.payload.analysis_scope,family);
 assert.equal(claimed.organization_id,organization);
 return claimed;
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
  assert.equal(fingerprintJson(publicCapitalCatalogSourceSnapshot),publicCapitalCatalogReference.sourceFingerprint);
  assert.ok(missing(400,{statusCode:"404",error:"not_found",message:"Object not found"}));assert.equal(missing(403,{statusCode:"404",error:"not_found",message:"Object not found"}),false);
  for(const family of ["provider_case_fit","provider_research"] as const){
   const u=(last:number)=>`90000000-0000-4000-8000-${String(last).padStart(12,"0")}`;
   const claimed=capitalProjectAnalysisJobSchema.parse({claimed:true,job_id:u(1),capability_token:"x".repeat(64),lease_expires_at:"2026-10-04T12:00:00Z",attempt:1,kind:"capital_project_analysis",organization_id:u(2),intake_session_id:u(3),processing_run_id:u(4),payload:{analysis_scope:family,locale:"pt-BR",capital_project_id:u(5),capital_project_plan_id:u(6),capital_project_brief_id:u(7),capital_task_ids:["M01","K01","K02"],capital_artifact_required:true,model_budget:{max_cost_usd:0,max_calls:0}}});
   assert.equal(exactProviderClaim(claimed,u(1),u(2),family),claimed);
   // Reproduce the old wrong-field assertion; the canonical DTO has job_id only.
   assert.throws(()=>assert.equal((claimed as unknown as {id?:string}).id,u(1)));
   assert.throws(()=>exactProviderClaim(claimed,u(9),u(2),family));
   assert.throws(()=>exactProviderClaim(claimed,u(1),u(9),family));
   assert.throws(()=>exactProviderClaim(claimed,u(1),u(2),family==="provider_case_fit"?"provider_research":"provider_case_fit"));
   assert.throws(()=>exactProviderClaim(null,u(1),u(2),family));
  }
  process.stdout.write("capital_native_provider_exact_claim: PASS (canonical job_id both families; old id assertion reproduces; wrong job/org/family/null deny; no SQL/HTTP)\n");
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
  phase=`${family}_local_fixture_approval`;const fixtureLines=sql(db,expand(join(root,`supabase/tests/support/capital_native_provider_${family==="provider_research"?"research":"case_fit"}_sdk_fixture.sql`))).split("\n");
  const fixtureJobIds=fixtureLines.filter(line=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(line));assert.equal(fixtureJobIds.length,1);const expectedJobId=fixtureJobIds[0]!;
  const client=createClient(api,key,{global:{headers:{"x-offroad-workspace":organization},fetch:(input,init)=>fetch(input,{...init,redirect:"error"})},auth:{persistSession:false}});
  phase=`${family}_real_auth`;const login=await client.auth.signInWithPassword({email:family==="provider_research"?"provider-research-a@example.invalid":"case-fit-a@example.invalid",password:"native-provider-isolated-local-password"});assert.equal(login.error,null);assert.equal(login.data.user?.id,actor);
  const token=family==="provider_research"?"cfa6ec9950f2152fc7cd5aac980f1d6fafdaca4aaa054e4483e9df0c5d20e26d":"9748fe624d1a3d4253f3a38324320426fe64dc0b092839b048d0bd8e1cc03dd4",queue=createQueueClient(client,{workerToken:token,leaseSeconds:600});
  phase=`${family}_real_claim`;const job=exactProviderClaim(await queue.claim(),expectedJobId,organization,family);await ensureInitialAgentPlan(job,queue);
  assert.equal((await client.rpc("worker_claim_capital_capture_purge_v1",{p_worker_token:token,p_limit:100})).error,null);
  const ports=createNativeProviderPorts({client,job,cataloguePublication:async()=>publication});
  phase=`${family}_actual_native_producer`;const first=await consumeNativeProviderWork(job,ports);assert.equal(first.status,"succeeded");assert.equal(first.modelCalls,0);assert.equal(first.artifact.grantsApproval,false);
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
main().catch(error=>{const code=error instanceof Error&&/^[a-z0-9_]{3,120}$/.test(error.message)?error.message:null;process.stderr.write(JSON.stringify({eval:"capital_native_provider_sdk",result:"FAIL",phase,code})+"\n");process.exitCode=1;});
