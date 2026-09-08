import type {SupabaseClient} from "@supabase/supabase-js";
import {receivablesEvidenceScopeContextSchema} from "@offroad/receivables-analysis";
import {z} from "zod";
import {loadReceivablesScope} from "./scope";
import type {Database} from "@/types/database";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const summarySchema = z.object({case_manifest:z.object({id:z.uuid(),fingerprint:hash,input_fingerprint:hash}),case_state:z.object({fingerprint:hash,manifestFingerprint:hash,receivablesVertical:z.object({evidenceScope:z.object({id:z.uuid(),fingerprint:hash}),sourceManifest:z.object({fingerprint:hash}).passthrough(),supportPeriodAssessment:z.object({reportingDate:z.iso.date()}).passthrough()}).passthrough()}).passthrough()});
/** Read only the published result of this session's completed current run, independently of broad diagnostic approval. */
export async function loadReceivablesTemporalReport(supabase:SupabaseClient<Database>,organizationId:string,sessionId:string,context:unknown):Promise<unknown|null>{
 const parsed=receivablesEvidenceScopeContextSchema.safeParse(context);
 if(!parsed.success||parsed.data.state!=="current"||!parsed.data.scope||!parsed.data.sourceManifest)return null;
 const scope=parsed.data.scope;
 const {data:session,error}=await supabase.from("document_intake_sessions").select("current_run_id,updated_at,result_summary").eq("organization_id",organizationId).eq("id",sessionId).maybeSingle();
 const summary=summarySchema.safeParse(session?.result_summary);
 if(error||!session?.current_run_id||!summary.success)return null;
 const {case_state:state,case_manifest:reference}=summary.data;
 if(state.fingerprint!==reference.input_fingerprint||state.manifestFingerprint!==reference.fingerprint||state.receivablesVertical.evidenceScope.id!==scope.id||state.receivablesVertical.evidenceScope.fingerprint!==scope.fingerprint||state.receivablesVertical.sourceManifest.fingerprint!==parsed.data.sourceManifest.fingerprint||state.receivablesVertical.supportPeriodAssessment.reportingDate!==scope.reportingDate)return null;
 const [{data:manifest,error:manifestError},{data:jobs,error:jobsError}]=await Promise.all([
  supabase.from("case_artifact_manifests").select("processing_run_id,created_at,manifest_fingerprint,input_fingerprint").eq("organization_id",organizationId).eq("intake_session_id",sessionId).eq("id",reference.id).maybeSingle(),
  supabase.from("processing_jobs").select("status,created_at").eq("organization_id",organizationId).eq("intake_session_id",sessionId).eq("processing_run_id",session.current_run_id).eq("kind","case_analysis").order("created_at",{ascending:false}).limit(1),
 ]);
 if(manifestError||jobsError||!manifest||jobs?.[0]?.status!=="succeeded"||manifest.processing_run_id!==session.current_run_id||manifest.manifest_fingerprint!==reference.fingerprint||manifest.input_fingerprint!==reference.input_fingerprint)return null;
 const published=Date.parse(manifest.created_at),confirmed=Date.parse(scope.confirmedAt),started=Date.parse(jobs[0].created_at);
 if(!Number.isFinite(published)||!Number.isFinite(confirmed)||!Number.isFinite(started)||published<confirmed||published<started)return null;
 // Recheck the source and session after reading the publication: never reuse a locally
 // "current" context when a replacement/confirmation happened during these requests.
 const [freshScope,{data:freshSession,error:freshSessionError}]=await Promise.all([
  loadReceivablesScope(supabase,sessionId),
  supabase.from("document_intake_sessions").select("current_run_id,updated_at").eq("organization_id",organizationId).eq("id",sessionId).maybeSingle(),
 ]);
 return !freshSessionError&&freshSession?.current_run_id===session.current_run_id&&freshSession.updated_at===session.updated_at&&freshScope.state==="current"&&freshScope.scope?.id===scope.id&&freshScope.scope.fingerprint===scope.fingerprint&&freshScope.sourceManifest?.fingerprint===parsed.data.sourceManifest.fingerprint?state:null;
}
