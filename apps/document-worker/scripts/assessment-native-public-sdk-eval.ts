/** Loopback-only supplement to the actual M07 publisher/Storage SDK evaluation.
 * The sole queued job is synthetic input. Every lease/capture/review is a command.
 * No Storage row, proposal receipt, accepted invocation or license is inserted.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {createAssessmentNativeRuntime} from '../src/assessment-native-runtime';
import type {CaseAnalysisJob,CapitalProjectAnalysisJob,QueueClient} from '../src/queue';
function sql(db:string,query:string){const target=new URL(db);assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname));const p=spawnSync('psql',[db,'-X','-Atq','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8'});if(p.status!==0)throw new Error('assessment_local_sql_failed');return p.stdout.trim();}
export async function evaluateAssessmentNativePublic(input:{db:string;client:SupabaseClient;realQueue:QueueClient;job:CapitalProjectAnalysisJob}){
 const {db,client,realQueue,job}=input;const id=randomUUID(),assessmentId=randomUUID(),commandId=randomUUID(),actor='10000000-0000-4000-8000-000000000201';
 const human=(body:string)=>`begin;set local role authenticated;select set_config('request.headers','{"x-offroad-workspace":"${job.organization_id}"}',true);select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true);${body}commit;`;
 const project=z.uuid().parse(job.payload.capital_project_id);
 sql(db,human(`select public.set_capital_project_review_policy_v1('${project}','allowed');`));
 assert.equal(sql(db,`select count(*)from private.assessment_proposal_receipts where job_id='${z.uuid().parse(job.job_id)}'and assessment_ref like 'm07-index:%';`),'1');
 // The existing SDK fixture has completed its native M07 work and kept genuine
 // licensed source bodies. Configure a new preliminary input, then really claim.
 sql(db,`insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,available_at)
 select '${id}',organization_id,processing_run_id,intake_session_id,'preliminary_analysis','queued',jsonb_build_object('locale','pt-BR','analysis_scope','preliminary_understanding','execution_mode','primary'),
 (select coalesce(min(available_at),clock_timestamp())-interval '1 second' from public.processing_jobs) from public.processing_jobs where id='${z.uuid().parse(job.job_id)}';`);
 const claimed=await realQueue.claim();assert.ok(claimed);assert.equal(claimed.kind,'preliminary_analysis');assert.equal(claimed.job_id,id);
 const port=createAssessmentNativeRuntime(client).forJob(claimed as CaseAnalysisJob);
 await port.loadPreliminaryInput();
 const research=await port.publicResearch();assert.equal(research.status,'succeeded');assert.ok(research.sourceCount>0);assert.ok(research.sources.every(source=>source.url==='https://example.invalid/capture-licensed'&&source.snippet==='Licensed excerpt only'));
 const metadata=JSON.parse(sql(db,`select jsonb_build_object('count',s.public_source_count,'snapshot',s.id,'licenseSources',(select jsonb_agg(jsonb_build_object('id',l.source_version_id,'publisher',l.licensing_organization_id)) from private.assessment_research_source_links x join private.capital_public_delivery_licenses l on(l.organization_id,l.id)=(x.organization_id,x.license_id) where x.snapshot_id=s.id)) from private.assessment_input_snapshots s where job_id='${id}'and origin='public_research';`))as {count:number;snapshot:string;licenseSources:Array<{id:string;publisher:string}>};
 assert.equal(metadata.count,research.sourceCount);assert.ok(metadata.licenseSources.length);assert.ok(metadata.licenseSources.every(source=>source.publisher==='20000000-0000-4000-8000-000000000993'));
 await port.recordAssessment({schemaVersion:'dcm-agent-assessment.v1',projectId:project,assessmentRef:`native:physical:${id}`,coverage:[],requests:[],decisions:[{schemaVersion:'dcm-decision.v1',id:assessmentId,projectId:project,decisionKey:'case.structure_direction',revision:1,status:'open',question:'A análise está pronta para revisão?',recommendation:null,alternatives:[],rationaleSummary:'Fonte pública licenciada fisicamente entregue. Nenhuma conclusão econômica.',evidence:[],assumptions:[],unresolved:[],confidence:'insufficient',proposedBy:'deal_captain',createdAt:new Date().toISOString(),fingerprint:'e'.repeat(64)}]});
 sql(db,human(`select public.review_assessment_v2('${project}','${assessmentId}',1,repeat('e',64),(public.read_assessment_review_basis_v2('${project}','${assessmentId}')->>'proposalFingerprint'),'${commandId}','approved',true,true);`));
 assert.equal(sql(db,`select count(*)from private.assessment_review_projections where command_id='${commandId}';`),'1');
 // Establish that the same live capability and fixed sources remain allowed
 // immediately before publisher revocation, so a dead lease is not the oracle.
 assert.equal((await port.publicResearch()).sourceCount,research.sourceCount);
 const source=z.uuid().parse(metadata.licenseSources[0]!.id);
 const publisher=(body:string)=>`begin;set local role authenticated;select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000993"}',true);select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000993","role":"authenticated"}',true);${body}commit;`;
 const rev=Number(sql(db,`select max(revision)from private.source_rights_versions where source_version_id='${source}';`));assert.ok(Number.isInteger(rev)&&rev>0);
 sql(db,publisher(`select public.set_source_rights_v1('${source}',${rev},array['store'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));`));
 await assert.rejects(()=>port.publicResearch(),/assessment_capture_denied/);
 // Existing approval is immutable, yet the current human basis is denied.
 sql(db,human(`do $$begin begin perform public.read_assessment_review_basis_v2('${project}','${assessmentId}');raise exception 'revoked_source_review_accepted';exception when insufficient_privilege then null;end;end$$;`));
 assert.equal(sql(db,`select count(*)from private.assessment_review_projections where command_id='${commandId}';`),'1');
 await realQueue.complete(claimed,{eval:'assessment-physical-source',source_count:research.sourceCount});
 process.stdout.write(JSON.stringify({eval:'assessment_native_public_sdk',result:'PASS',checks:['atomic-m07-index-produced','real-source-version-license','real-storage-bytes','real-job-claim','primary-and-public-capture','uncited-public-source-count','human-native-confirm-freeze','publisher-rights-revoked-denied','approval-history-preserved']})+'\n');
}
