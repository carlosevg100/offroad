import type {SupabaseClient} from "@supabase/supabase-js";
import {documentWorkProductSchema, documentWorkRequestBindingSchema} from "@offroad/domain-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";
import type {Database} from "@/types/database";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = documentWorkRequestBindingSchema;
const summarySchema = z.object({
  case_manifest:z.object({id:z.uuid(),fingerprint:hash,input_fingerprint:hash}),
  case_state:z.object({fingerprint:hash,manifestFingerprint:hash,documentWorkProduct:z.object({binding:bindingSchema,product:documentWorkProductSchema})}),
});

/** Only the current, completed and still-authorized result may become a work surface or download. */
export async function loadDocumentWorkProduct(supabase:SupabaseClient<Database>,organizationId:string,projectId:string) {
  const {data:session,error}=await supabase.from("document_intake_sessions")
    .select("id,current_run_id,updated_at,result_summary").eq("organization_id",organizationId).eq("capital_project_id",projectId)
    .order("created_at",{ascending:true}).limit(1).maybeSingle();
  const summary=summarySchema.safeParse(session?.result_summary);
  if(error||!session?.current_run_id||!summary.success)return null;
  const {case_state:state,case_manifest:reference}=summary.data;
  const {binding,product}=state.documentWorkProduct;
  const {fingerprint,...unsigned}=product;
  if(binding.projectId!==projectId||fingerprintJson(unsigned)!==fingerprint||product.requestFingerprint!==binding.requestFingerprint
    ||state.fingerprint!==reference.input_fingerprint||state.manifestFingerprint!==reference.fingerprint)return null;
  const [{data:manifest,error:manifestError},{data:jobs,error:jobsError},{data:sources,error:sourceError},{data:current,error:bindingError}]=await Promise.all([
    supabase.from("case_artifact_manifests").select("processing_run_id,created_at,manifest_fingerprint,input_fingerprint")
      .eq("organization_id",organizationId).eq("intake_session_id",session.id).eq("id",reference.id).maybeSingle(),
    supabase.from("processing_jobs").select("id,status,created_at").eq("organization_id",organizationId).eq("intake_session_id",session.id)
      .eq("processing_run_id",session.current_run_id).eq("kind","case_analysis").order("created_at",{ascending:false}).limit(1),
    supabase.from("source_documents").select("id,document_version,sha256,processing_status").eq("organization_id",organizationId).eq("intake_session_id",session.id),
    supabase.rpc("read_advisor_document_work_binding_v1",{p_project_id:projectId,p_job_id:binding.jobId}),
  ]);
  const parsedBinding=bindingSchema.safeParse(current);
  if(manifestError||jobsError||sourceError||bindingError||!manifest||!parsedBinding.success
    ||fingerprintJson(parsedBinding.data)!==fingerprintJson(binding)||jobs?.[0]?.id!==binding.jobId||jobs[0].status!=="succeeded"
    ||manifest.processing_run_id!==session.current_run_id||manifest.manifest_fingerprint!==reference.fingerprint
    ||manifest.input_fingerprint!==reference.input_fingerprint)return null;
  const published=Date.parse(manifest.created_at),started=Date.parse(jobs[0].created_at);
  if(!Number.isFinite(published)||!Number.isFinite(started)||published<started)return null;
  const byId=new Map((sources??[]).map(source=>[source.id,source]));
  if(product.sources.some(passage=>{const source=byId.get(passage.documentId);return !source||source.processing_status!=="ready"||String(source.document_version)!==passage.version||source.sha256!==passage.hash;}))return null;
  // A concurrent edit/upload invalidates the approval even when a previous snapshot still exists.
  const [{data:freshSession,error:freshError},{data:freshBinding,error:freshBindingError}]=await Promise.all([
    supabase.from("document_intake_sessions").select("current_run_id,updated_at").eq("organization_id",organizationId).eq("id",session.id).maybeSingle(),
    supabase.rpc("read_advisor_document_work_binding_v1",{p_project_id:projectId,p_job_id:binding.jobId}),
  ]);
  const fresh=bindingSchema.safeParse(freshBinding);
  if(freshError||freshBindingError||!fresh.success||fingerprintJson(fresh.data)!==fingerprintJson(binding)
    ||freshSession?.current_run_id!==session.current_run_id||freshSession.updated_at!==session.updated_at)return null;
  return {product,binding,publishedAt:manifest.created_at};
}
