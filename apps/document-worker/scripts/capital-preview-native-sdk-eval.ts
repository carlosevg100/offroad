/** Portable real HTTP proof. Model outputs are synthetic; all authority, physical
 * bodies, native task writes and recovery use the real Supabase stack. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash, randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {AdapterRequest} from "@offroad/model-gateway";
import {createQueueClient} from "../src/queue";
import {ensureInitialAgentPlan} from "../src/agent-plan";
import {createPreviewNativeRuntime} from "../src/integration-preview-native-runtime";
import {createInstalledPreviewCorpus} from "../src/integration-preview-installed-corpus";
import {createCapitalPublicCaptureStorage} from "../src/capital-public-capture-storage";
import {previewQuestionsOutputSchema} from "../src/preview-questions";
import {synthesisModelOutputSchema} from "../src/preview-synthesis";
const namespace=process.env.PREVIEW_HTTP_NAMESPACE??"a8830001";assert.match(namespace,/^[a-f0-9]{8}$/);
const actor=`${namespace}-0000-4000-8000-000000000001`,organization=`${namespace}-0000-4000-8000-000000000002`,publisher=`${namespace}-0000-4000-8000-000000000994`,workerToken=namespace.repeat(8);
const questions={questions:[],abstain:true,abstainReason:"Synthetic explicit abstention"};
const synthesis={sections:[{id:"synthetic",title:"Synthetic internal fixture",paragraphs:[{text:"Synthetic explicit abstention",references:[]}]}],abstain:true,abstainReason:"Synthetic explicit abstention"};
function local(value:string,protocol:string){const target=new URL(value);assert.equal(target.protocol,protocol);assert.ok(["localhost","127.0.0.1","[::1]"].includes(target.hostname));assert.equal(target.hash,"");assert.equal(target.search,"");if(protocol==='http:'){assert.equal(target.username,"");assert.equal(target.password,"");assert.equal(target.pathname,'/');}}
function anonKey(key:string){if(key.startsWith('sb_publishable_'))return;assert.equal(JSON.parse(Buffer.from(key.split('.')[1]??'','base64url').toString('utf8')).role,'anon');}
function sql(db:string,input:string){const result=spawnSync('psql',[db,'-XAtq','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'});if(result.error||result.status!==0)throw Error('capital_preview_sql_fixture_failed');return result.stdout.trim();}
let phase='startup';let timer:ReturnType<typeof setInterval>|undefined;
const proofRpcNames=new Set(['worker_claim_capital_capture_purge_v1','worker_record_capital_capture_purge_v1','worker_prepare_capital_preview_run_v1','worker_recover_capital_preview_run_v1','worker_prepare_capital_preview_body_v1','worker_commit_capital_preview_body_v1','worker_read_capital_preview_allocation_v1','worker_commit_capital_preview_task_v1','worker_finish_capital_preview_task_v1','worker_finalize_capital_preview_run_v1','worker_prepare_capital_preview_boundary_v1','worker_seal_capital_preview_boundary_v1','worker_authorize_capital_preview_processing_v1','worker_record_capital_preview_input_v1','worker_record_capital_preview_attempt_outcome_v1','worker_record_capital_preview_accepted_v1']);
const proofSqlCodes=new Set(['42501','22023','40001','55P03','23505','23503','P0001','P0002','PGRST202']);
const proofErrorCodes=new Set(["artifact_stored_bytes_not_governed", "capital_preview_accepted_mismatch", "capital_preview_actual_inputs_incomplete", "capital_preview_anchor_unmapped", "capital_preview_basis_configuration_invalid", "capital_preview_boundary_mismatch", "capital_preview_commit_mismatch", "capital_preview_completion_unavailable", "capital_preview_context_unavailable", "capital_preview_corpus_duplicate", "capital_preview_exact_fixture_job_required", "capital_preview_extraction_changed", "capital_preview_extraction_denied", "capital_preview_finalize_mismatch", "capital_preview_grant_required", "capital_preview_input_not_json", "capital_preview_input_unretained", "capital_preview_installed_manifest_changed", "capital_preview_integrated_review_failed", "capital_preview_janitor_failed", "capital_preview_model_policy_changed", "capital_preview_model_price_missing", "capital_preview_model_route_denied", "capital_preview_native_command_denied", "capital_preview_native_pipeline_denied", "capital_preview_partial_input_changed", "capital_preview_physical_body_denied", "capital_preview_processing_denied", "capital_preview_published_sources_required", "capital_preview_recovery_changed", "capital_preview_recovery_incomplete", "capital_preview_recovery_mismatch", "capital_preview_run_mismatch", "capital_preview_sql_fixture_failed", "capital_project_artifact_evidence_invalid", "capital_task_run_not_available", "claims_summary_mismatch", "unassured_fallback_must_not_dispatch"]);
const proofTransport:{operation:string;status:number;code:string|null}[]=[];
function closedProofError(error:unknown){
 const name=error instanceof Error?error.name:'';
 const message=error instanceof Error?error.message:'';
 const bodyPhases=new Set(["idle", "scope_path", "scope_ttl", "reader_request", "reader_bytes", "read_authorization_before", "read_receipt_identity", "read_authorization_after", "read_revalidation", "prepare_receipt", "canonical_byte_identity", "upload_expiry", "upload_http", "commit_receipt", "commit_identity"]);
 const bodyPhase=(error as {previewBodyPhase?:unknown}|null)?.previewBodyPhase;
 const known=new Map([['capital capture database authority denied','capture_database_authority_denied'],['capital capture retention expired','capture_retention_expired'],['capital capture purge lease expired','capture_purge_lease_expired'],['capital capture receipt mismatch','capture_receipt_mismatch']]);
 return{bodyPhase:typeof bodyPhase==="string"&&bodyPhases.has(bodyPhase)?bodyPhase:null,name:['AssertionError','ZodError','Error'].includes(name)?name:null,code:proofErrorCodes.has(message)?message:known.get(message)??null,
 ...(error instanceof z.ZodError?{issues:error.issues.slice(0,12).map(issue=>({code:issue.code,pathDepth:Math.min(issue.path.length,8)}))}:{})};
}

async function main(){
 if(process.argv[2]==='--self-test'){previewQuestionsOutputSchema.parse(questions);synthesisModelOutputSchema.parse(synthesis);assert.throws(()=>local('https://example.supabase.co','http:'));assert.throws(()=>local('postgresql://example.org/db','postgresql:'));assert.throws(()=>anonKey('sb_secret_forbidden'));console.log('capital_preview_sdk_static: PASS (schemas and loopback guards only)');return;}
 assert.equal(process.argv.length,2);const api=process.env.OFFROAD_E2E_API_URL!,db=process.env.DATABASE_URL!,key=process.env.OFFROAD_E2E_PUBLISHABLE_KEY!;local(api,'http:');local(db,'postgresql:');assert.ok(key&&!key.startsWith('sb_secret_'));anonKey(key);
 let stopAtFinalize=true;
 const client=createClient(api,key,{global:{headers:{'x-offroad-workspace':organization},fetch:(input,init)=>{if(stopAtFinalize&&(input instanceof Request?input.url:String(input)).includes('/rpc/worker_finalize_capital_preview_run_v1')){stopAtFinalize=false;return Promise.resolve(new Response(JSON.stringify({code:'synthetic_stop_after_terminal_task',message:'Synthetic fault before final marker'}),{status:409,headers:{'Content-Type':'application/json'}}));}return fetch(input,{...init,redirect:'error'}).then(async response=>{
 const path=new URL(input instanceof Request?input.url:String(input)).pathname,operation=path.startsWith('/rest/v1/rpc/')?path.slice('/rest/v1/rpc/'.length):path==='/functions/v1/capital-body-read'?'capital_body_read':path.startsWith('/storage/v1/object/capital-input-capture/')&&String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase()==='POST'?'capital_storage_upload':null;
 if(operation&&(proofRpcNames.has(operation)||operation==='capital_body_read'||operation==='capital_storage_upload')){let code:string|null=null;if(!response.ok){try{const failure=await response.clone().json();if(typeof failure?.code==='string'&&proofSqlCodes.has(failure.code))code=failure.code;}catch{}}
 proofTransport.push({operation,status:response.status,code});if(proofTransport.length>24)proofTransport.shift();}return response;
 });}},auth:{persistSession:false}});
 phase='actual-auth';const login=await client.auth.signInWithPassword({email:`native-agent-${namespace}@example.invalid`,password:'preview-isolated-local-eval-password'});assert.equal(login.error,null);assert.equal(login.data.user?.id,actor);
 const queue=createQueueClient(client,{workerToken,leaseSeconds:600});phase='actual-claim';const job=await queue.claim();if(!job||job.kind!=='capital_project_analysis'||job.organization_id!==organization||job.payload.analysis_scope!=='integration_preview')throw Error('capital_preview_exact_fixture_job_required');
 await ensureInitialAgentPlan(job,queue);const corpusDir=new URL('../../../docs/product/gold-cases/runs/gc01/ai-review-corpus/',import.meta.url),corpus=createInstalledPreviewCorpus(fileURLToPath(corpusDir),JSON.parse(readFileSync(new URL('manifest.json',corpusDir),'utf8')));
 const basisId=z.uuid().parse(sql(db,`select id from private.capital_preview_consumed_bases where organization_id='${publisher}';`));let sends=0;const boundaries:string[]=[];
 const runtime=createPreviewNativeRuntime({client,authority:{jobId:job.job_id,capabilityToken:job.capability_token},publishedBasis:{organizationId:publisher,basisId},corpusManifest:corpus.manifest,extraction:corpus.extraction,startTask:input=>queue.startCapitalTask(job,input),budget:{maxCostUsd:.5,maxCalls:4},connections:{anthropic:{accountRef:`preview-http-${namespace}-account`,projectRef:`preview-http-${namespace}-project`,credentialBinding:`preview-http-${namespace}-key`,region:'global'},openai:{accountRef:`preview-http-${namespace}-openai-account`,projectRef:`preview-http-${namespace}-openai-project`,credentialBinding:`preview-http-${namespace}-openai-key`,region:'global'}},adapters:{anthropic:{provider:'anthropic',complete:async(request:AdapterRequest)=>{sends++;assert.ok(['preview_questions_output','preview_synthesis_output'].includes(request.schemaName));boundaries.push(request.schemaName);const output=request.schemaName==='preview_questions_output'?questions:synthesis;return{output,rawText:JSON.stringify(output),model:request.model,usage:{inputTokens:1000,outputTokens:100,cachedInputTokens:0},stopReason:'end'};}},openai:{provider:'openai',complete:async()=>{throw Error('unassured_fallback_must_not_dispatch');}}}});
 phase='absent-publication-runtime-create';const missing=createPreviewNativeRuntime({client,authority:{jobId:job.job_id,capabilityToken:job.capability_token},corpusManifest:corpus.manifest,extraction:corpus.extraction,startTask:input=>queue.startCapitalTask(job,input),budget:{maxCostUsd:.5,maxCalls:4},connections:{},adapters:{}});phase='absent-publication-before-model';await assert.rejects(missing.run(),/published_sources_required/);phase='absent-publication-zero-model';assert.equal(sends,0);
 phase='initial-physical-janitor';const janitor=createCapitalPublicCaptureStorage(client);await janitor.purgeOnce(workerToken,20);let failure:unknown,pending:Promise<void>|undefined;
 timer=setInterval(()=>{if(pending)return;pending=janitor.purgeOnce(workerToken,20).then(results=>{if(results.some(item=>item.state!=='purged'))failure=Error('capital_preview_janitor_failed');},error=>{failure=error;}).finally(()=>{pending=undefined;});},20000);timer.unref();
 phase='actual-native-pipeline-fault-after-terminal-task';await assert.rejects(runtime.run(),error=>{if(stopAtFinalize)console.error(JSON.stringify({eval:'capital_preview_early_runtime_failure',...closedProofError(error)}));return true;});assert.equal(stopAtFinalize,false);assert.equal(sends,2);
 phase='partial-physical-recovery-no-new-paid-attempt';const result=await runtime.run();assert.equal(result.replayed,false);assert.equal(result.materialRecovery,'not_proven');assert.equal(sends,2);assert.deepEqual(boundaries,['preview_questions_output','preview_synthesis_output']);
 phase='actual-catalog';const proof=JSON.parse(sql(db,`select jsonb_build_object('tasks',(select count(*)from public.capital_project_task_runs where processing_job_id=j.id and status='succeeded'),'outputs',(select count(*)from private.capital_preview_task_projections where organization_id=j.organization_id and run_id=(select id from private.capital_preview_runs where job_id=j.id)),'paid',(select count(*)from private.capital_preview_input_dispatches where job_id=j.id),'accepted',(select count(*)from private.capital_preview_accepted_invocations where job_id=j.id),'sources',(select count(*)from private.capital_preview_body_bases where job_id=j.id and kind='source'))from public.processing_jobs j where id='${job.job_id}';`));assert.deepEqual(proof,{tasks:10,outputs:11,paid:2,accepted:2,sources:17});
 phase='physical-completed-replay';const replay=await runtime.run();assert.equal(replay.replayed,true);assert.equal(replay.capitalArtifactId,result.capitalArtifactId);assert.equal(replay.modelCalls,2);assert.equal(sends,2);
 phase='human-body';const revision=z.uuid().parse(sql(db,`select revision_id from private.capital_preview_native_bindings where capital_artifact_id='${z.uuid().parse(result.capitalArtifactId)}';`));const headers={apikey:key,Authorization:`Bearer ${login.data.session!.access_token}`,'x-offroad-workspace':organization,'Content-Type':'application/json'};
 const response=await fetch(`${api.replace(/\/$/,'')}/functions/v1/capital-body-read`,{method:'POST',redirect:'error',headers,body:JSON.stringify({kind:'preview_result',revisionId:revision})});assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),response.headers.get('x-offroad-payload-sha256'));assert.equal(response.headers.get('x-offroad-recipe-id'),sql(db,`select id from private.capital_preview_runs where job_id='${job.job_id}';`));
 phase='ordinary-storage-denied';const objectPath=sql(db,`select object_path from private.capital_public_payload_allocations where job_id='${job.job_id}'order by created_at limit1;`.replace('limit1','limit 1'));assert.ok((await client.storage.from('capital-input-capture').download(objectPath)).error);
 let integratedReviewFailure=false;let reviewUserId:string|undefined;
 if(process.env.PREVIEW_INTEGRATED_REVIEW_EVAL==='1'){
  // Tool-only and loopback-only: preserve the default SDK proof unchanged.
  // This runs before revoking the actual licence, never over a recovered denied body.
  phase='integrated-review-bootstrap';const fixtureNamespace=randomUUID(),reviewEmail=`stage20-review-${fixtureNamespace}-reviewer@example.invalid`,reviewPassword=`Synthetic-${randomUUID()}!`;
  const secondary=createClient(api,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error'})}});
  const signup=await secondary.auth.signUp({email:reviewEmail,password:reviewPassword});assert.equal(signup.error,null);reviewUserId=z.uuid().parse(signup.data.user?.id);
  // Auth created this identity. Confirm only its exact synthetic address in the disposable DB;
  // membership bootstrap is fixture data, while access and all review roles use product commands.
  sql(db,`begin;update auth.users set email_confirmed_at=coalesce(email_confirmed_at,clock_timestamp())where id='${reviewUserId}'and email='${reviewEmail}';insert into public.organization_memberships(organization_id,user_id,role,status)values('${organization}','${reviewUserId}','member','active');commit;`);
  const work=z.uuid().parse(sql(db,`select work_id from private.capital_preview_runs where job_id='${job.job_id}';`));
  const command=async(name:string,args:Record<string,unknown>)=>{const r=await(client as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>}).rpc(name,args);assert.equal(r.error,null);return r.data;};
  await command('set_resource_policy_grant_v1',{p_resource_id:work,p_user_id:reviewUserId,p_group_id:null,p_action:'work',p_effect:'allow'});
  await command('set_resource_policy_grant_v1',{p_resource_id:work,p_user_id:reviewUserId,p_group_id:null,p_action:'read',p_effect:'allow'});
  for(const person of[actor,reviewUserId])for(const role of['preparer','approver'])await command('set_capital_project_review_assignment_v1',{p_project_id:work,p_user_id:person,p_review_role:role,p_assigned:true});
  const regime=z.object({policy_fingerprint:z.string().regex(/^[a-f0-9]{64}$/),self_approval:z.object({effective:z.boolean()})}).parse(await command('read_capital_project_review_context_v2',{p_project_id:work}));
  assert.equal(regime.self_approval.effective,true,'existing brief ancestor requires its actual declared self-approval policy');
  await command('set_capital_project_review_policy_v2',{p_project_id:work,p_self_approval:'inherit',p_assignment_required:'required',p_expected_policy_fingerprint:regime.policy_fingerprint});
  const binding=z.object({recipeId:z.uuid(),retainedPayloadId:z.uuid()}).parse(JSON.parse(sql(db,`select jsonb_build_object('recipeId',run_id,'retainedPayloadId',retained_payload_id)from private.capital_preview_native_bindings where revision_id='${revision}';`)));
  const directory=mkdtempSync(join(tmpdir(),'offroad-integrated-review-')),fixture=join(directory,'fixture.json'),output=join(directory,'proof.json');
  try{
   writeFileSync(fixture,JSON.stringify({schemaVersion:'stage20-integrated-review-fixture.v1',namespace:fixtureNamespace,organizationId:organization,workId:work,artifactId:result.capitalArtifactId,revisionId:revision,...binding,ownerId:actor,reviewerId:reviewUserId,cleanupOwner:'disposable Supabase CI stack integrator'}),{mode:0o600,flag:'wx'});
   const runner=spawnSync(process.execPath,[fileURLToPath(new URL('../../../scripts/evals/stage20-integrated-review.mjs',import.meta.url))],{env:{...process.env,REVIEW_EVAL_API_URL:api,REVIEW_EVAL_DATABASE_URL:db,REVIEW_EVAL_PUBLISHABLE_KEY:key,REVIEW_EVAL_FIXTURE:fixture,REVIEW_EVAL_OUTPUT:output,REVIEW_EVAL_OWNER_EMAIL:`native-agent-${namespace}@example.invalid`,REVIEW_EVAL_OWNER_PASSWORD:'preview-isolated-local-eval-password',REVIEW_EVAL_REVIEWER_EMAIL:reviewEmail,REVIEW_EVAL_REVIEWER_PASSWORD:reviewPassword},encoding:'utf8',timeout:180000});
   integratedReviewFailure=!!runner.error||runner.status!==0;
   if(integratedReviewFailure)console.error('capital_preview_integrated_review: FAIL (raw Auth and SQL withheld)');
   else{const evidence=JSON.parse(readFileSync(output,'utf8'))as{proof:{name:string;result:string}[]};assert.equal(evidence.proof.length,8);assert.ok(evidence.proof.every(v=>v.result==='PASS'));console.log(JSON.stringify({eval:'capital_preview_integrated_review',result:'PASS',checks:evidence.proof.map(v=>v.name)}));}
  }finally{rmSync(directory,{recursive:true,force:true});}
 }
 if(timer){clearInterval(timer);timer=undefined;}if(pending)await pending;if(failure)throw failure;
 phase='own-source-revocation';sql(db,`update public.source_bindings set revoked_at=clock_timestamp()where organization_id='${publisher}'and id=(select source_binding_id from private.capital_preview_consumed_basis_sources where organization_id='${publisher}'and basis_id='${basisId}'order by file_name limit 1);`);
 const denied=await fetch(`${api.replace(/\/$/,'')}/functions/v1/capital-body-read`,{method:'POST',redirect:'error',headers,body:JSON.stringify({kind:'preview_result',revisionId:revision})});assert.equal(denied.status,403);await assert.rejects(runtime.run());assert.equal(sends,2);
 if(reviewUserId){
  phase='integrated-review-own-cleanup';
  const work=z.uuid().parse(sql(db,`select work_id from private.capital_preview_runs where job_id='${job.job_id}';`));
  const revoked=await(client as unknown as{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{error:unknown}>}).rpc('set_resource_policy_grant_v1',{p_resource_id:work,p_user_id:reviewUserId,p_group_id:null,p_action:'work',p_effect:'deny'});assert.equal(revoked.error,null);
  sql(db,`update auth.users set banned_until='infinity'where id='${reviewUserId}'and email like'stage20-review-%@example.invalid';`);
  // Physical deletion is performed only by the existing scoped purge worker; immutable
  // audit/review history remains synthetic evidence in the stack that CI destroys.
  await janitor.purgeOnce(workerToken,20);
 }
 if(integratedReviewFailure)throw Error('capital_preview_integrated_review_failed');
 console.log(JSON.stringify({eval:'capital_preview_native_sdk',result:'PASS',paidAttempts:sends,checks:['human-native-brief-approval','17-human-published-verified-source-versions','byte-preserving-CSV','real-Storage-Edge','10-native-TaskRuns-11-JSONs','two-real-paid-boundaries','stop-after-terminal-task-before-final-marker','partial-and-completed-physical-recovery-zero-model','missing-basis-zero-model','current-revocation-denied'],materialRecovery:'not_proven'}));
}
main().catch(error=>{if(timer)clearInterval(timer);console.error(JSON.stringify({eval:'capital_preview_native_sdk',result:'FAIL',phase,...closedProofError(error),transport:proofTransport,paidAttemptsObserved:proofTransport.filter(item=>item.operation==='worker_record_capital_preview_input_v1'&&item.status<300).length}));process.exitCode=1;});
