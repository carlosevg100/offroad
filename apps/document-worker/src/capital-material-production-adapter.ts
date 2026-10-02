/** Concrete SQL command adapter. Physical transport is mandatory and must prove
 * bytes through the authenticated Edge/Storage path; this module grants no raw
 * service-key read and never falls back to permanent legacy JSON. */
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {caseRunReportSchema} from '@offroad/case-runner';
import {fingerprintJson} from '@offroad/case-understanding';
import {redFlagTruthSetSchema} from '@offroad/case-understanding';
import {caseEngineVersion,publicCaseState,type CaseEngineResult} from '@offroad/case-engine';
import {caseMaterialsVersion} from '@offroad/case-materials';
import {capitalMaterialBodyScopeSchema,type CapitalMaterialProductionPorts,type MaterialBodyScope,type MaterialBundle} from './capital-material-production-native';

export function validateCapitalMaterialCompilerBundle(bundle:MaterialBundle,identity:{sessionId:string;runId:string}):MaterialBundle{
 const report=caseRunReportSchema.parse(bundle.calculationReport);
 const {reportFingerprint,...payload}=report;
 if(report.schemaVersion!=='2026.08.29-v4'||report.caseId!==identity.sessionId||report.runId!==identity.runId||report.versions.caseEngine!==caseEngineVersion||report.versions.materialCompiler!==caseMaterialsVersion||reportFingerprint!==fingerprintJson(payload))throw new Error('capital_material_compiler_report_denied');
 return structuredClone(bundle);
}
export type CapitalMaterialPhysicalTransport={
 retain(scope:MaterialBodyScope,bytes:Uint8Array):Promise<unknown>;
 read(scope:MaterialBodyScope):Promise<{scope:unknown;bytes:Uint8Array}>;
};
export function createCapitalMaterialSqlPorts(input:{client:SupabaseClient;jobId:string;capability:string;physical:CapitalMaterialPhysicalTransport}):CapitalMaterialProductionPorts{
 if(typeof input.physical?.retain!=='function'||typeof input.physical?.read!=='function')throw new Error('capital_material_physical_transport_required');
 const rpc=async(name:string,args:Record<string,unknown>={})=>{
  const r=await input.client.rpc(name,{p_job_id:input.jobId,p_capability_token:input.capability,...args});
  if(r.error)throw new Error(`${name}: ${r.error.message}`);if(r.data===undefined)throw new Error('capital_material_receipt_missing');return r.data as unknown;
 };
 return {
  capture:async requestId=>{const value=await rpc('worker_capture_material_production_v1',{p_request_id:requestId});if(!value||typeof value!=='object'||!('receipt'in value)||!('canonicalBody'in value)||typeof value.canonicalBody!=='string')throw new Error('capital_material_capture_receipt_invalid');return {receipt:value.receipt,canonicalBody:value.canonicalBody};},
  retain:async(scope,bytes)=>capitalMaterialBodyScopeSchema.parse(await input.physical.retain(scope,bytes)),
  sealContext:(recipeId,id)=>rpc('worker_seal_material_production_context_v1',{p_recipe_id:recipeId,p_context_retained_payload_id:id}),
  sealSources:(recipeId,research)=>rpc('worker_seal_material_production_sources_v1',{p_recipe_id:recipeId,p_delivery_ids:research.deliveryIds,p_research_status:research.researchStatus}),
  revalidate:c=>rpc('worker_revalidate_material_production_v1',{p_recipe_id:c.recipeId}),
  prepareOutput:async({recipeId,kind,body})=>{const value=await rpc('worker_prepare_material_production_output_v1',{p_recipe_id:recipeId,p_request_id:randomUUID(),p_kind:kind,p_body:body});if(!value||typeof value!=='object'||!('scope'in value)||!('canonicalBody'in value)||typeof value.canonicalBody!=='string')throw new Error('capital_material_prepare_receipt_invalid');return {scope:value.scope,canonicalBody:value.canonicalBody};},
  commit:({recipeId,outputs})=>rpc('worker_commit_material_production_v1',{p_recipe_id:recipeId,p_report_retained_payload_id:outputs.find(s=>s.kind==='calculation_report')?.retainedPayloadId,p_state_retained_payload_id:outputs.find(s=>s.kind==='case_state')?.retainedPayloadId,p_package_retained_payload_id:outputs.find(s=>s.kind==='material_package')?.retainedPayloadId}),
  recordTerminal:(recipeId,reportId,stateId)=>rpc('worker_record_material_production_terminal_v1',{p_recipe_id:recipeId,p_report_retained_payload_id:reportId,p_case_state_retained_payload_id:stateId}),
  recover:async()=>{const value=await rpc('worker_recover_material_production_v1');return value;},
  read:scope=>input.physical.read(scope),
 };
}

/** Called only after a parsed real failed/blocked report has been physically
 * retained. SQL derives the status from its immutable body basis. */
export async function recordCapitalMaterialTerminal(input:{client:SupabaseClient;jobId:string;capability:string;recipeId:string;reportRetainedPayloadId:string;caseStateRetainedPayloadId:string|null}){
 const r=await input.client.rpc('worker_record_material_production_terminal_v1',{p_job_id:input.jobId,p_capability_token:input.capability,p_recipe_id:input.recipeId,p_report_retained_payload_id:input.reportRetainedPayloadId,p_case_state_retained_payload_id:input.caseStateRetainedPayloadId});
 if(r.error)throw new Error(r.error.message);return r.data as unknown;
}

/** The producer supplies the actual engine result. This helper does not accept
 * a separate caller-authored governance whitelist. */
export function buildCapitalMaterialCompilerBundle(result:CaseEngineResult,identity:{sessionId:string;runId:string}):MaterialBundle{
 const state=publicCaseState(result.state);
 return validateCapitalMaterialCompilerBundle({calculationReport:result.report,caseState:{...state,materialProductionGovernance:{redFlags:redFlagTruthSetSchema.parse(result.state.redFlagTruth)}},materialPackage:{schemaVersion:'2026.08.29-v1',materials:state.materials,financialModel:state.financialModel,materialTruth:state.materialTruth,dataRoom:state.dataRoom}},identity);
}
