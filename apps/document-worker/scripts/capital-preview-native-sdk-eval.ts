/** Portable real HTTP proof. Model outputs are synthetic; all authority, physical
 * bodies, native task writes and recovery use the real Supabase stack. */
import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
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
// Preserve an early real failure; only the deliberately injected final marker
// may satisfy the fault/recovery exercise.
async function requireInjectedFinalizeFailure(run:()=>Promise<unknown>,faultWasInjected:()=>boolean){
 try{await run();}catch(error){
  if(!faultWasInjected()||!(error instanceof Error)||error.message!=='capital_preview_native_command_denied')throw error;
  return;
 }
 throw Error('capital_preview_expected_fault_missing');
}
let earlyRuntimeType:'schema_validation'|'error'|'non_error'|null=null;
let physicalProofPhase:'none'|'storage_authority'|'native_publication'='none';
let lastPreviewTransport:{surface:'rpc'|'storage'|'edge';operation:string;status:number;sqlState:string|null;reason:string|null}|null=null;
const previewRpcNames=new Set(['worker_prepare_capital_preview_run_v1','worker_recover_capital_preview_run_v1','worker_prepare_capital_preview_body_v1','worker_read_capital_preview_allocation_v1','worker_commit_capital_preview_body_v1','worker_commit_capital_preview_task_v1','worker_finish_capital_preview_task_v1','worker_prepare_capital_preview_boundary_v1','worker_seal_capital_preview_boundary_v1','worker_revalidate_capital_preview_boundary_v1','worker_recover_capital_preview_accepted_v1','worker_authorize_capital_preview_processing_v1','worker_record_capital_preview_input_v1','worker_record_capital_preview_attempt_outcome_v1','worker_record_capital_preview_accepted_v1','worker_record_capital_preview_execution_failure_v1','worker_capital_preview_boundary_usage_v1','worker_lookup_capital_preview_boundary_v1','worker_finalize_capital_preview_run_v1']);
const previewServerReasons=new Set(['capital_preview_denied','capital_preview_context_changed','capital_preview_parent_denied','capital_preview_task_denied','capital_preview_processing_denied','capital_preview_body_denied','capital_preview_result_incomplete','artifact_stored_bytes_not_governed','artifact_revision_replay_mismatch','capital_capture_retry']);
function previewTechnicalCode(value:unknown):string|null{return typeof value==='string'&&(/^[0-9A-Z]{5}$/.test(value)||/^PGRST[0-9]{3}$/.test(value))?value:null;}
async function recordPreviewTransport(input:RequestInfo|URL,response:Response){
 const pathname=new URL(input instanceof Request?input.url:String(input)).pathname;
 const rpc=pathname.startsWith('/rest/v1/rpc/')?pathname.slice('/rest/v1/rpc/'.length):'';
 if(previewRpcNames.has(rpc)){
  let sqlState:string|null=null,reason:string|null=null;
  if(!response.ok){try{const body:unknown=await response.clone().json();if(body&&typeof body==='object'){const fields=body as Record<string,unknown>;sqlState=previewTechnicalCode(fields.code);if(typeof fields.message==='string'&&previewServerReasons.has(fields.message))reason=fields.message;}}catch{}}
  lastPreviewTransport={surface:'rpc',operation:rpc,status:response.status,sqlState,reason};
 }else if(pathname.startsWith('/storage/v1/object/'))lastPreviewTransport={surface:'storage',operation:'preview_object_transport',status:response.status,sqlState:null,reason:null};
 else if(pathname==='/functions/v1/capital-body-read')lastPreviewTransport={surface:'edge',operation:'capital_body_read',status:response.status,sqlState:null,reason:null};
}

// Accept only the child runner's already-sanitized failure record, never stderr.
const integratedReviewPhases=new Set(["create_artifact_revision_v1", "decide_capital_project_artifact_v2", "decide_material_package_v1", "read_artifact_revision_reviews_v1", "read_artifact_revision_v1", "read_capital_project_artifact_review_v2", "read_capital_project_review_context_v2", "read_material_package_review_basis_v1", "read_material_production_result_v1", "read_work_decision_v1", "read_work_review_dashboard_v1", "reaffirm_work_revision_v1", "reassign_pending_review_v1", "record_work_report_v1", "review_artifact_revision_v1", "set_capital_project_review_assignment_v1", "target_validation"]);
function integratedReviewChildFailure(stderr:unknown){
 if(typeof stderr!=='string')return {childPhase:null,childCode:null,childDiagnosticFound:false};
 for(const line of stderr.split(/\r?\n/)){
  const match=/^stage20_integrated_review: FAIL phase=([a-z][a-z0-9_]+) code=([A-Z0-9]{5}|PGRST(?:[0-9]{3}|X00)|unavailable)(?: operation=(initial|owner_implicit_self_approval|reviewer_native_confirm|authored_revision_sequence) reason=(capital_project_self_approval_forbidden|capital_artifact_review_projection_missing|review_source_access_required|capital_artifact_review_target_inactive|review_substance_required|review_assignment_required|capital_artifact_review_stale|unavailable))?(?: assertion=(r2_before_reaffirm|r2_after_reaffirm|r2_after_base_revocation|r3_before_new_approval|r3_after_new_approval|unavailable) actual=(internal|released|blocked|unavailable) expected=(internal|released|blocked|unavailable))? \(raw error withheld\)$/.exec(line);
  if(match&&integratedReviewPhases.has(match[1]!))return {childPhase:match[1]!,childCode:match[2]==='unavailable'?null:match[2]!,childDiagnosticFound:true,...(match[3]?{childReviewOperation:match[3],childReviewReason:match[4]==='unavailable'?null:match[4]}:{}) ,...(match[5]?{childAssertion:match[5],childActualRelease:match[6],childExpectedRelease:match[7]}:{})};
 }
 return {childPhase:null,childCode:null,childDiagnosticFound:false};
}

async function main(){
 if(process.argv[2]==='--self-test'){assert.equal(previewTechnicalCode('42501'),'42501');assert.equal(previewTechnicalCode('PGRST202'),'PGRST202');assert.equal(previewTechnicalCode('PGRST203'),'PGRST203');assert.equal(previewTechnicalCode('secret email or token'),null);assert.equal(previewTechnicalCode('PGRST202 secret'),null);assert.equal(previewTechnicalCode({code:'42501'}),null);const early=Error('capital_preview_physical_body_denied');await assert.rejects(requireInjectedFinalizeFailure(async()=>{throw early;},()=>false),error=>error===early);await requireInjectedFinalizeFailure(async()=>{throw Error('capital_preview_native_command_denied');},()=>true);await assert.rejects(requireInjectedFinalizeFailure(async()=>{},()=>false),/capital_preview_expected_fault_missing/);await assert.rejects(requireInjectedFinalizeFailure(async()=>{throw early;},()=>true),error=>error===early);assert.deepEqual(integratedReviewChildFailure('stage20_integrated_review: FAIL phase=read_capital_project_artifact_review_v2 code=42501 (raw error withheld)'),{childPhase:'read_capital_project_artifact_review_v2',childCode:'42501',childDiagnosticFound:true});assert.equal(integratedReviewChildFailure('stage20_integrated_review: FAIL phase=unknown_private_email code=42501 (raw error withheld)').childDiagnosticFound,false);assert.equal(JSON.stringify(integratedReviewChildFailure('secret email token\nstage20_integrated_review: FAIL phase=target_validation code=unavailable (raw error withheld)')).includes('secret'),false);assert.equal(integratedReviewChildFailure('stage20_integrated_review: FAIL phase=decide_capital_project_artifact_v2 code=P0001 operation=reviewer_native_confirm reason=capital_artifact_review_projection_missing (raw error withheld)').childDiagnosticFound,true);assert.deepEqual(integratedReviewChildFailure('stage20_integrated_review: FAIL phase=read_artifact_revision_v1 code=unavailable operation=authored_revision_sequence reason=unavailable assertion=r2_after_reaffirm actual=internal expected=released (raw error withheld)'),{childPhase:'read_artifact_revision_v1',childCode:null,childDiagnosticFound:true,childReviewOperation:'authored_revision_sequence',childReviewReason:null,childAssertion:'r2_after_reaffirm',childActualRelease:'internal',childExpectedRelease:'released'});previewQuestionsOutputSchema.parse(questions);synthesisModelOutputSchema.parse(synthesis);assert.throws(()=>local('https://example.supabase.co','http:'));assert.throws(()=>local('postgresql://example.org/db','postgresql:'));assert.throws(()=>anonKey('sb_secret_forbidden'));console.log('capital_preview_sdk_static: PASS (schemas and loopback guards only)');return;}
 assert.equal(process.argv.length,2);const api=process.env.OFFROAD_E2E_API_URL!,db=process.env.DATABASE_URL!,key=process.env.OFFROAD_E2E_PUBLISHABLE_KEY!;local(api,'http:');local(db,'postgresql:');assert.ok(key&&!key.startsWith('sb_secret_'));anonKey(key);
 let stopAtFinalize=true,storageAuthorityProved=false,nativePublicationProved=false;
 const client=createClient(api,key,{global:{headers:{'x-offroad-workspace':organization},fetch:(input,init)=>{if(stopAtFinalize&&(input instanceof Request?input.url:String(input)).includes('/rpc/worker_finalize_capital_preview_run_v1')){stopAtFinalize=false;return Promise.resolve(new Response(JSON.stringify({code:'synthetic_stop_after_terminal_task',message:'Synthetic fault before final marker'}),{status:409,headers:{'Content-Type':'application/json'}}));}return fetch(input,{...init,redirect:'error'}).then(async response=>{
  await recordPreviewTransport(input,response);

  if(!nativePublicationProved&&response.ok&&new URL(input instanceof Request?input.url:String(input)).pathname==='/rest/v1/rpc/worker_commit_capital_preview_task_v1'){
   if(!job)throw Error('capital_preview_exact_fixture_job_required');
   const quote=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
   physicalProofPhase='native_publication';
   const fixture=readFileSync(new URL('../../../supabase/tests/support/capital_preview_native_artifact_publication_actual.sql',import.meta.url),'utf8');
   const result=z.strictObject({schemaVersion:z.literal('capital-preview-native-publication-proof.v1'),nativePhysicalRevision:z.literal(true),sharedCoreStillDenies:z.literal(true),replayPreservesHistory:z.literal(true),checksPassed:z.literal(11)}).parse(JSON.parse(sql(db,`begin;\n${fixture}\nselect pg_temp.prove_preview_native_artifact_publication(${quote(z.uuid().parse(job.job_id))}::uuid,${quote(z.uuid().parse(login.data.user?.id))}::uuid);\nrollback;`)));
   physicalProofPhase='none';nativePublicationProved=true;console.log(JSON.stringify({eval:'capital_preview_native_artifact_publication',result:'PASS',...result}));
  }
  if(!storageAuthorityProved&&response.ok&&new URL(input instanceof Request?input.url:String(input)).pathname==='/rest/v1/rpc/worker_prepare_capital_preview_body_v1'){
   if(!job)throw Error('capital_preview_exact_fixture_job_required');
   physicalProofPhase='storage_authority';
   const allocation=z.object({allocationId:z.uuid(),retentionState:z.literal('allocated')}).parse(await response.clone().json());
   const quote=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
   const testSql=readFileSync(new URL('../../../supabase/tests/support/capital_preview_storage_job_authority_actual.sql',import.meta.url),'utf8');
   // Only stdin carries the actual capability and ids; sql() withholds all
   // database stderr and only this fixed proof DTO is emitted.
   const result=z.strictObject({schemaVersion:z.literal('capital-preview-storage-authority-proof.v1'),beforeSharedAuthority:z.literal(false),actualLeaseAndAccount:z.literal(true),afterPreviewAuthority:z.literal(true),checksPassed:z.literal(9)}).parse(JSON.parse(sql(db,
    `begin;\n${testSql}\nselect pg_temp.prove_preview_storage_job_authority(${quote(z.uuid().parse(job.job_id))}::uuid,${quote(job.capability_token)},${quote(z.uuid().parse(login.data.user?.id))}::uuid,${quote(allocation.allocationId)}::uuid);\nrollback;`)));
   physicalProofPhase='none';storageAuthorityProved=true;console.log(JSON.stringify({eval:'capital_preview_storage_job_authority',result:'PASS',...result}));
  }
  return response;
 });}},auth:{persistSession:false}});
 phase='actual-auth';const login=await client.auth.signInWithPassword({email:`native-agent-${namespace}@example.invalid`,password:'preview-isolated-local-eval-password'});assert.equal(login.error,null);assert.equal(login.data.user?.id,actor);
 const queue=createQueueClient(client,{workerToken,leaseSeconds:600});phase='actual-claim';const job=await queue.claim();if(!job||job.kind!=='capital_project_analysis'||job.organization_id!==organization||job.payload.analysis_scope!=='integration_preview')throw Error('capital_preview_exact_fixture_job_required');
 await ensureInitialAgentPlan(job,queue);const corpusDir=new URL('../../../docs/product/gold-cases/runs/gc01/ai-review-corpus/',import.meta.url),corpus=createInstalledPreviewCorpus(fileURLToPath(corpusDir),JSON.parse(readFileSync(new URL('manifest.json',corpusDir),'utf8')));
 const basisId=z.uuid().parse(sql(db,`select id from private.capital_preview_consumed_bases where organization_id='${publisher}';`));let sends=0;const boundaries:string[]=[];
 const runtime=createPreviewNativeRuntime({client,authority:{jobId:job.job_id,capabilityToken:job.capability_token},publishedBasis:{organizationId:publisher,basisId},corpusManifest:corpus.manifest,extraction:corpus.extraction,startTask:input=>queue.startCapitalTask(job,input),budget:{maxCostUsd:.5,maxCalls:4},connections:{anthropic:{accountRef:`preview-http-${namespace}-account`,projectRef:`preview-http-${namespace}-project`,credentialBinding:`preview-http-${namespace}-key`,region:'global'},openai:{accountRef:`preview-http-${namespace}-openai-account`,projectRef:`preview-http-${namespace}-openai-project`,credentialBinding:`preview-http-${namespace}-openai-key`,region:'global'}},adapters:{anthropic:{provider:'anthropic',complete:async(request:AdapterRequest)=>{sends++;assert.ok(['preview_questions_output','preview_synthesis_output'].includes(request.schemaName));boundaries.push(request.schemaName);const output=request.schemaName==='preview_questions_output'?questions:synthesis;return{output,rawText:JSON.stringify(output),model:request.model,usage:{inputTokens:1000,outputTokens:100,cachedInputTokens:0},stopReason:'end'};}},openai:{provider:'openai',complete:async()=>{throw Error('unassured_fallback_must_not_dispatch');}}}});
 phase='absent-publication-before-model';const missing=createPreviewNativeRuntime({client,authority:{jobId:job.job_id,capabilityToken:job.capability_token},corpusManifest:corpus.manifest,extraction:corpus.extraction,startTask:input=>queue.startCapitalTask(job,input),budget:{maxCostUsd:.5,maxCalls:4},connections:{},adapters:{}});await assert.rejects(missing.run(),/published_sources_required/);assert.equal(sends,0);
 const janitor=createCapitalPublicCaptureStorage(client);await janitor.purgeOnce(workerToken,20);let failure:unknown,pending:Promise<void>|undefined;
 timer=setInterval(()=>{if(pending)return;pending=janitor.purgeOnce(workerToken,20).then(results=>{if(results.some(item=>item.state!=='purged'))failure=Error('capital_preview_janitor_failed');},error=>{failure=error;}).finally(()=>{pending=undefined;});},20000);timer.unref();
 phase='actual-native-pipeline-fault-after-terminal-task';try{await requireInjectedFinalizeFailure(()=>runtime.run(),()=>!stopAtFinalize);}catch(error){earlyRuntimeType=error instanceof z.ZodError?'schema_validation':error instanceof Error?'error':'non_error';throw error;}assert.equal(stopAtFinalize,false);assert.equal(storageAuthorityProved,true);assert.equal(nativePublicationProved,true);assert.equal(sends,2);
 phase='partial-physical-recovery-no-new-paid-attempt';const result=await runtime.run();assert.equal(result.replayed,false);assert.equal(result.materialRecovery,'not_proven');assert.equal(sends,2);assert.deepEqual(boundaries,['preview_questions_output','preview_synthesis_output']);
 phase='actual-catalog';const proof=JSON.parse(sql(db,`select jsonb_build_object('tasks',(select count(*)from public.capital_project_task_runs where processing_job_id=j.id and status='succeeded'),'outputs',(select count(*)from private.capital_preview_task_projections where organization_id=j.organization_id and run_id=(select id from private.capital_preview_runs where job_id=j.id)),'paid',(select count(*)from private.capital_preview_input_dispatches where job_id=j.id),'accepted',(select count(*)from private.capital_preview_accepted_invocations where job_id=j.id),'sources',(select count(*)from private.capital_preview_body_bases b join private.capital_preview_runs r on(r.organization_id,r.id)=(b.organization_id,b.run_id)where r.organization_id=j.organization_id and r.job_id=j.id and b.kind='source'))from public.processing_jobs j where id='${job.job_id}';`));assert.deepEqual(proof,{tasks:10,outputs:11,paid:2,accepted:2,sources:17});
 phase='physical-completed-replay';const replay=await runtime.run();assert.equal(replay.replayed,true);assert.equal(replay.capitalArtifactId,result.capitalArtifactId);assert.equal(replay.modelCalls,2);assert.equal(sends,2);
 phase='human-body';const revision=z.uuid().parse(sql(db,`select revision_id from private.capital_preview_native_bindings where capital_artifact_id='${z.uuid().parse(result.capitalArtifactId)}';`));const headers={apikey:key,Authorization:`Bearer ${login.data.session!.access_token}`,'x-offroad-workspace':organization,'Content-Type':'application/json'};
 const response=await fetch(`${api.replace(/\/$/,'')}/functions/v1/capital-body-read`,{method:'POST',redirect:'error',headers,body:JSON.stringify({kind:'preview_result',revisionId:revision})});assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),response.headers.get('x-offroad-payload-sha256'));assert.equal(response.headers.get('x-offroad-recipe-id'),sql(db,`select id from private.capital_preview_runs where job_id='${job.job_id}';`));
 phase='ordinary-storage-denied';const objectPath=sql(db,`select object_path from private.capital_public_payload_allocations where job_id='${job.job_id}'order by created_at limit1;`.replace('limit1','limit 1'));assert.ok((await client.storage.from('capital-input-capture').download(objectPath)).error);
 let integratedReviewFailure=false;let reviewUserId:string|undefined;const reviewFailureMetadata:{assertion?:string;authStatus?:number|null;authCode?:string|null;rpcCode?:string|null;rpcReason?:string|null}={};
 if(process.env.PREVIEW_INTEGRATED_REVIEW_EVAL==='1'){try{
  // Tool-only and loopback-only: preserve the default SDK proof unchanged.
  // This runs before revoking the actual licence, never over a recovered denied body.
  phase='integrated-review-bootstrap';const fixtureNamespace=randomUUID(),reviewEmail=`stage20-review-${fixtureNamespace}-reviewer@example.invalid`,reviewPassword=`Synthetic-${randomUUID()}!`;
  const secondary=createClient(api,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error'})}});
  phase='integrated-review-signup';const signup=await secondary.auth.signUp({email:reviewEmail,password:reviewPassword});reviewFailureMetadata.assertion='auth_signup_error_null';if(signup.error){
   reviewFailureMetadata.authStatus=[400,422,429].includes(signup.error.status??0)?(signup.error.status??null):null;
   reviewFailureMetadata.authCode=['unexpected_failure','signup_disabled','user_already_exists','weak_password','over_request_rate_limit','over_email_send_rate_limit','over_sms_send_rate_limit','email_address_not_authorized','email_address_invalid'].includes(signup.error.code??'')?(signup.error.code??null):null;
   throw Error('capital_preview_review_signup_denied');
  }delete reviewFailureMetadata.assertion;reviewUserId=z.uuid().parse(signup.data.user?.id);
  // Auth created this identity. Confirm only its exact synthetic address in the disposable DB;
  // membership bootstrap is fixture data, while access and all review roles use product commands.
  phase='integrated-review-membership';sql(db,`begin;update auth.users set email_confirmed_at=coalesce(email_confirmed_at,clock_timestamp())where id='${reviewUserId}'and email='${reviewEmail}';insert into public.organization_memberships(organization_id,user_id,role,status)values('${organization}','${reviewUserId}','member','active');commit;`);
  const work=z.uuid().parse(sql(db,`select work_id from private.capital_preview_runs where job_id='${job.job_id}';`));
  const command=async(name:string,args:Record<string,unknown>)=>{const r=await(client as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>}).rpc(name,args);reviewFailureMetadata.assertion='public_review_command_error_null';if(r.error){const error=r.error as {code?:unknown;message?:unknown};reviewFailureMetadata.rpcCode=typeof error.code==='string'&&/^(?:[A-Z0-9]{5}|PGRST(?:[0-9]{3}|X00))$/.test(error.code)?error.code:null;throw Error('capital_preview_review_command_denied');}delete reviewFailureMetadata.assertion;return r.data;};
  phase='integrated-review-work-grant';await command('set_resource_policy_grant_v1',{p_resource_id:work,p_user_id:reviewUserId,p_group_id:null,p_action:'work',p_effect:'allow'});
  phase='integrated-review-read-grant';await command('set_resource_policy_grant_v1',{p_resource_id:work,p_user_id:reviewUserId,p_group_id:null,p_action:'read',p_effect:'allow'});
  phase='integrated-review-assignments';for(const person of[actor,reviewUserId])for(const role of['preparer','approver'])await command('set_capital_project_review_assignment_v1',{p_project_id:work,p_user_id:person,p_review_role:role,p_assigned:true});
  phase='integrated-review-policy-context';const regime=z.object({policy_fingerprint:z.string().regex(/^[a-f0-9]{64}$/),self_approval:z.object({effective:z.boolean()})}).parse(await command('read_capital_project_review_context_v2',{p_project_id:work}));
  phase='integrated-review-self-approval-basis';reviewFailureMetadata.assertion='declared_self_approval_effective';assert.equal(regime.self_approval.effective,true,'existing brief ancestor requires its actual declared self-approval policy');
  phase='integrated-review-policy-command';await command('set_capital_project_review_policy_v2',{p_project_id:work,p_self_approval:'inherit',p_assignment_required:'required',p_expected_policy_fingerprint:regime.policy_fingerprint});
  phase='integrated-review-physical-binding';const binding=z.object({recipeId:z.uuid(),retainedPayloadId:z.uuid()}).parse(JSON.parse(sql(db,`select jsonb_build_object('recipeId',run_id,'retainedPayloadId',retained_payload_id)from private.capital_preview_native_bindings where revision_id='${revision}';`)));
  const directory=mkdtempSync(join(tmpdir(),'offroad-integrated-review-')),fixture=join(directory,'fixture.json'),output=join(directory,'proof.json');
  try{
   writeFileSync(fixture,JSON.stringify({schemaVersion:'stage20-integrated-review-fixture.v1',namespace:fixtureNamespace,organizationId:organization,workId:work,artifactId:result.capitalArtifactId,revisionId:revision,...binding,ownerId:actor,reviewerId:reviewUserId,cleanupOwner:'disposable Supabase CI stack integrator'}),{mode:0o600,flag:'wx'});
   const profiler=fileURLToPath(new URL('../../../scripts/evals/preview-dashboard-safe-profiler.py',import.meta.url)),sampleFile=join(directory,'samples.json');
   const sampler=spawn('python3',[profiler,'--sample',sampleFile],{env:{...process.env,DATABASE_URL:db},stdio:'ignore'});
   sampler.on('error',()=>{});
   const runner=spawnSync(process.execPath,[fileURLToPath(new URL('../../../scripts/evals/stage20-integrated-review.mjs',import.meta.url))],{env:{...process.env,REVIEW_EVAL_API_URL:api,REVIEW_EVAL_DATABASE_URL:db,REVIEW_EVAL_PUBLISHABLE_KEY:key,REVIEW_EVAL_FIXTURE:fixture,REVIEW_EVAL_OUTPUT:output,REVIEW_EVAL_OWNER_EMAIL:`native-agent-${namespace}@example.invalid`,REVIEW_EVAL_OWNER_PASSWORD:'preview-isolated-local-eval-password',REVIEW_EVAL_REVIEWER_EMAIL:reviewEmail,REVIEW_EVAL_REVIEWER_PASSWORD:reviewPassword},encoding:'utf8',timeout:180000});
   sampler.kill('SIGTERM');
   const metrics=z.record(z.string(),z.number().finite());
   const sampleSchema=z.strictObject({diagnosticOnly:z.literal(true),samples:z.number().int().nonnegative(),dashboardSamples:z.number().int().nonnegative(),lockSamples:z.number().int().nonnegative(),blockedSamples:z.number().int().nonnegative(),idleTransactionBlockerSamples:z.number().int().nonnegative(),maxDurationMs:z.number().nonnegative(),queryFailures:z.number().int().nonnegative(),waitCounts:z.record(z.enum(['Lock','IO','LWLock','Client','IPC','Timeout','BufferPin','Activity','ActiveOrOther']),z.number().int().nonnegative())});
   try{console.log(JSON.stringify({eval:'preview_dashboard_wait_diagnostic',...sampleSchema.parse(JSON.parse(readFileSync(sampleFile,'utf8')))}));}catch{console.log(JSON.stringify({eval:'preview_dashboard_wait_diagnostic',diagnosticOnly:true,result:'unavailable'}));}
   const measured=spawnSync('python3',[profiler,'--profile'],{env:{...process.env,DATABASE_URL:db},input:JSON.stringify({org:organization,work,actor:reviewUserId,revision}),encoding:'utf8',timeout:30000});
   const profileSchema=z.strictObject({diagnosticOnly:z.literal(true),scope:z.enum(['own_bound_revision','denied']),profiles:z.array(z.strictObject({operation:z.enum(['native_read','sources','release','run_deadline','projection_deadline','allocation_deadline','reviews','dashboard']),result:z.enum(['total_bound','error','plan','process_bound']),code:z.string().regex(/^(?:[0-9A-Z]{5}|unavailable|invalid_json)$/).nullable().optional(),metrics:metrics.optional()}))});
   try{console.log(JSON.stringify({eval:'preview_dashboard_plan_diagnostic',...profileSchema.parse(JSON.parse(measured.stdout))}));}catch{console.log(JSON.stringify({eval:'preview_dashboard_plan_diagnostic',diagnosticOnly:true,result:'unavailable'}));}
   integratedReviewFailure=!!runner.error||runner.status!==0;
   if(integratedReviewFailure)console.error(JSON.stringify({eval:'capital_preview_integrated_review',result:'FAIL',...integratedReviewChildFailure(runner.stderr),childExitStatus:typeof runner.status==='number'&&runner.status>=0&&runner.status<=255?runner.status:null,childProcessError:runner.error&&'code' in runner.error?(['ETIMEDOUT','ENOENT','EACCES'].includes(String(runner.error.code))?String(runner.error.code):'other'):runner.error?'other':null}));
   else{const evidence=JSON.parse(readFileSync(output,'utf8'))as{proof:{name:string;result:string}[]};assert.equal(evidence.proof.length,8);assert.ok(evidence.proof.every(v=>v.result==='PASS'));console.log(JSON.stringify({eval:'capital_preview_integrated_review',result:'PASS',checks:evidence.proof.map(v=>v.name)}));}
  }finally{rmSync(directory,{recursive:true,force:true});}
  }catch{integratedReviewFailure=true;console.error(JSON.stringify({eval:'capital_preview_integrated_review_bootstrap',result:'FAIL',phase,...reviewFailureMetadata}));}
 }
 if(timer){clearInterval(timer);timer=undefined;}if(pending)await pending;if(failure)throw failure;
 phase='own-source-revocation';sql(db,`update public.source_bindings set revoked_at=clock_timestamp()where organization_id='${publisher}'and id=(select source_binding_id from private.capital_preview_consumed_basis_sources where organization_id='${publisher}'and basis_id='${basisId}'order by file_name limit 1);`);
 const denied=await fetch(`${api.replace(/\/$/,'')}/functions/v1/capital-body-read`,{method:'POST',redirect:'error',headers,body:JSON.stringify({kind:'preview_result',revisionId:revision})});assert.equal(denied.status,403);await assert.rejects(runtime.run());assert.equal(sends,2);console.log(JSON.stringify({eval:'capital_preview_current_source_revocation',result:'PASS',additionalModelCalls:0}));
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
main().catch(error=>{if(timer)clearInterval(timer);const message=error instanceof Error?error.message:'';console.error(JSON.stringify({eval:'capital_preview_native_sdk',result:'FAIL',phase,earlyRuntimeType,physicalProofPhase,lastPreviewTransport,code:/^[a-z0-9_]{3,120}$/.test(message)?message:null}));process.exitCode=1;});
