import {z} from "zod";
import type {ReconciledFact} from "@offroad/reconciliation";
import {institutionalModelConfigurationSchema,institutionalReviewedSourceSchema,type InstitutionalReviewedSource} from "./institutional-configuration";
import {prepareInstitutionalModelInput,fingerprintInstitutionalModelConfiguration,type InstitutionalModelConfiguration,type PreparedInstitutionalModelInput} from "./institutional-input";
import {buildInstitutionalFinancialModel,type InstitutionalFinancialModel} from "./institutional-model";
import {reviewInstitutionalFinancialModel,type InstitutionalModelReview} from "./review";
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const approvedInstitutionalConfigurationSchema=z.strictObject({id:z.uuid(),revision:z.number().int().positive(),fingerprint:hash,configuration:institutionalModelConfigurationSchema,reviewedBy:z.uuid(),reviewedAt:z.iso.datetime({offset:true}),sourceBindings:z.array(institutionalReviewedSourceSchema).max(1000)});
export const institutionalModelRuntimeContextSchema=z.object({projectId:z.uuid(),sourceManifestFingerprint:hash,currentSources:z.array(z.object({sourceDocument:z.string(),version:z.string(),hash,hashVerified:z.boolean(),originalName:z.string().optional()})).max(1000),candidates:z.array(z.record(z.string(),z.unknown())).max(5000),approvedConfigurations:z.array(approvedInstitutionalConfigurationSchema).max(12),reviewedSources:z.array(institutionalReviewedSourceSchema).max(1000),modelResultRequest:z.object({id:z.uuid(),configurationId:z.uuid(),configurationFingerprint:hash,sourceManifestFingerprint:hash,status:z.enum(["queued","completed","blocked"]),artifact:z.unknown().nullable(),blockers:z.array(z.string())}).nullable().optional(),pendingSetup:z.object({submissionId:z.uuid(),configuration:z.unknown(),sourceReviews:z.array(institutionalReviewedSourceSchema).max(1000),submittedBy:z.uuid(),submittedAt:z.iso.datetime({offset:true}),sourceManifestFingerprint:hash}).nullable()});
export type InstitutionalModelRuntimeContext=z.infer<typeof institutionalModelRuntimeContextSchema>;
export type ApprovedInstitutionalScenario={configurationId:string;revision:number;configurationFingerprint:string;reviewedBy:string;reviewedAt:string;prepared:PreparedInstitutionalModelInput;sourceBindings:readonly InstitutionalReviewedSource[];model:InstitutionalFinancialModel;review:InstitutionalModelReview};
/** Approval and denomination come from the governed worker reader, never conversational text. */
export function calculateApprovedInstitutionalScenarios(input:{context:InstitutionalModelRuntimeContext;facts:readonly ReconciledFact[]}):{status:"ready";scenarios:ApprovedInstitutionalScenario[]}|{status:"blocked";blockers:string[]}{
 const context=institutionalModelRuntimeContextSchema.parse(input.context);
 if(!context.approvedConfigurations.length)return {status:"blocked",blockers:["institutional_configuration_review_required"]};
 const scenarios:ApprovedInstitutionalScenario[]=[];const blockers:string[]=[];
 // Approval history is not an implicit request to compare every past revision.
 // A corrected current configuration must not be blocked by a superseded numeric proposal.
 for(const snapshot of [...context.approvedConfigurations].sort((a,b)=>b.revision-a.revision).slice(0,1)){
  const configuration=JSON.parse(JSON.stringify(snapshot.configuration)) as InstitutionalModelConfiguration;
  if(fingerprintInstitutionalModelConfiguration(configuration)!==snapshot.fingerprint){blockers.push("institutional_configuration_fingerprint_mismatch");continue;}
  if(snapshot.sourceBindings.some(source=>!context.currentSources.some(current=>current.sourceDocument===source.sourceDocument&&current.version===source.version&&current.hash===source.hash&&current.hashVerified))){blockers.push("institutional_approved_source_stale");continue;}
  const prepared=prepareInstitutionalModelInput({configuration,facts:input.facts,sources:snapshot.sourceBindings});
  if(prepared.status!=="ready"){blockers.push(...prepared.missingInputs.map(g=>`${g.code}:${g.targetPath}`));continue;}
  try{const model=buildInstitutionalFinancialModel(prepared.input!);const review=reviewInstitutionalFinancialModel(prepared.input!,model);
   if(review.status==="blocked"){blockers.push(...review.findings.filter(f=>f.severity==="blocker").map(f=>f.id));continue;}
   scenarios.push({configurationId:snapshot.id,revision:snapshot.revision,configurationFingerprint:snapshot.fingerprint,reviewedBy:snapshot.reviewedBy,reviewedAt:snapshot.reviewedAt,prepared,sourceBindings:snapshot.sourceBindings,model,review});
  }catch(error){if(!(error instanceof RangeError))throw error;blockers.push("institutional_calculation_input_invalid");}
 }
 return blockers.length?{status:"blocked",blockers:[...new Set(blockers)]}:{status:"ready",scenarios};
}
