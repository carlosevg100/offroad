import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";
import type {WorkContinuationSql} from "./work-continuation";

/**
 * Local E2E setup of stage 18, increment 5C, on the disposable stack only. The reconciled synthetic
 * facts the institutional model reads are recorded as the institutional journey records them (the
 * worker's document pipeline receipt and the accepted candidates of one document), in the intake
 * session of the journey's own work; the configuration, its review and approval and every
 * calculation go through the product's own actions and the local worker. Synthetic values only.
 */
const literal = (value: string) => `convert_from(decode('${Buffer.from(value, "utf8").toString("hex")}','hex'),'UTF8')`;

export function seedInstitutionalFacts(sql: WorkContinuationSql, input: {email: string; projectId: string; facts: unknown}): string {
  return sql(`begin;
do $$
declare actor uuid;s public.document_intake_sessions;r uuid:=gen_random_uuid();d uuid:=gen_random_uuid();
begin
 select id into strict actor from auth.users where email=${literal(input.email)} and email like 'e2e-continuation-%@example.com';
 select * into strict s from public.document_intake_sessions where capital_project_id='${input.projectId}' and started_by=actor order by created_at limit 1;
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
 values(r,s.organization_id,s.id,(select coalesce(max(x.run_no),0)+1 from public.processing_runs x where x.intake_session_id=s.id),'manual','succeeded','synthetic-reconciled-input-v1',actor);
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
 values(d,s.organization_id,s.id,s.organization_id::text||'/'||s.id::text||'/synthetic-accounts.xlsx','Synthetic reconciled accounts.xlsx',repeat('a',64),now(),'{"verdict":"clean"}','ready',actor);
 insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload)
 values(s.organization_id,r,s.id,d,'document_pipeline','succeeded',jsonb_build_object('sha256',repeat('a',64),'document_version',1));
 insert into public.intake_field_candidates(organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,normalized_value,value_type,
  information_class,evidence_rank,source_anchor,confidence,anchor_verified,period_start,period_end,entity_name,entity_scope,review_state,reviewed_by,reviewed_at,currency,unit,value_scale,
  extraction_method,created_by)
 select s.organization_id,s.id,d,r,f#>>'{key,fieldPath}',f#>>'{key,fieldPath}','historical_financials',f#>>'{key,fieldPath}',(f->>'value')::jsonb,'number','audited',1,
  f#>'{accepted,anchor}',1,true,(f#>>'{accepted,periodStart}')::date,(f#>>'{accepted,periodEnd}')::date,f#>>'{accepted,entityName}',f#>>'{accepted,entityScope}','accepted',actor,now(),
  'BRL','currency',1,'user_entry',actor from jsonb_array_elements(${literal(JSON.stringify(input.facts))}::jsonb) f;
 update public.document_intake_sessions set status='review_ready',current_run_id=r where id=s.id;
 perform set_config('e2e.document',d::text,true);
end $$;
select current_setting('e2e.document');
commit;`).split("\n").at(-1)!;
}

/**
 * The local worker the E2E job starts records its process id beside the repository; a journey that
 * must act before the worker does pauses it (SIGSTOP) and always resumes it (SIGCONT). The worker's
 * requests are separate transactions on the server, so a paused worker holds no lock. Null when no
 * local worker runs (a stack without it cannot run the journey).
 */
export function localWorker(): {pause: () => void; resume: () => void} | null {
  const file = join(__dirname, "../../../..", "worker.pid");
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 1) return null;
  return {pause: () => process.kill(pid, "SIGSTOP"), resume: () => process.kill(pid, "SIGCONT")};
}
