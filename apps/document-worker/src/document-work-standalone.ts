import {buildCaseArtifactManifest, fingerprintJson} from "@offroad/case-understanding";
import {invocationManifest, pipelineVersions, type EconomicInputSnapshot} from "@offroad/case-engine";
import type {DocumentWorkProductInput} from "@offroad/domain-contracts";
import type {GatewayCallLog} from "@offroad/model-gateway";
import type {CaseAnalysisDependencies} from "./case-analysis";
import type {FullCaseAnalysisJob} from "./queue";
import type {DocumentWorkRequest} from "./document-work-input";
import {runDocumentWorkProduct} from "./document-work-product";

/** Completes only a specifically approved preliminary documentary deliverable.
 * No financial truth, workflow gate, matching eligibility or operating approval is produced. */
export async function processStandaloneDocumentWork(input: {
  job: FullCaseAnalysisJob;
  binding: DocumentWorkRequest;
  documentInput: DocumentWorkProductInput;
  economics: EconomicInputSnapshot;
  extractionVersion: string;
  priorModelLineage: GatewayCallLog[];
  expectedPriorModelCalls: number;
}, dependencies: CaseAnalysisDependencies): Promise<{status: "succeeded"; manifestId: string}> {
  const {job,binding,documentInput} = input;
  const callsBefore = dependencies.gateway.spent().calls;
  await dependencies.queue.writeStage(job,"document_work_product","started");
  const product = await runDocumentWorkProduct(documentInput,{gateway:dependencies.gateway});
  const lineage = dependencies.lineage();
  const allLineage = [...input.priorModelLineage,...lineage];
  const expectedCalls = input.expectedPriorModelCalls + dependencies.gateway.spent().calls - callsBefore;
  const versions = pipelineVersions({snapshot:input.economics,extractionVersion:input.extractionVersion});
  const inputFingerprint = fingerprintJson({scope:"documentary_only",binding,input:product.inputFingerprint,versions});
  const reportPayload = {
    schemaVersion:"document-work-execution.v1",status:"succeeded",executionScope:"documentary_only",
    jobId:job.job_id,runId:job.processing_run_id,inputFingerprint,productFingerprint:product.fingerprint,
    financialAnalysisStatus:"not_performed",externalEffectAllowed:false,
  };
  const report = {...reportPayload,reportFingerprint:fingerprintJson(reportPayload)};
  const state = {
    schemaVersion:"document-work-case-state.v1",executionScope:"documentary_only",financialAnalysisStatus:"not_performed",
    documentWorkProduct:{binding,product},fingerprint:inputFingerprint,locale:documentInput.locale === "pt-BR" ? "pt" : "en",
    modelInvocations:lineage,documentWorkExecution:report,dealStateObjectIds:[],
    executionPlan:{produceMaterials:false,screenMandates:false,introduce:false},
  };
  const sources = input.economics.sources.map(source=>({documentId:String(source.id),versionId:String(source.document_version ?? 1),sha256:typeof source.sha256 === "string" ? source.sha256 : null}));
  const manifest = buildCaseArtifactManifest({caseId:job.intake_session_id,runId:job.processing_run_id,
    createdAt:(dependencies.now?.() ?? new Date()).toISOString(),locale:documentInput.locale,inputFingerprint,
    capture:{sources:sources.length>0 && sources.every(source=>source.sha256!==null)?"complete":"partial",models:allLineage.length === expectedCalls ? "complete":"partial"},
    versions,models:allLineage.map(invocationManifest),sources,
    outputs:[{artifactId:`${job.intake_session_id}:case_state`,kind:"case_state",sha256:fingerprintJson(state)}],
  });
  await dependencies.queue.recordControlledExecution(job,report,manifest);
  const manifestId = await dependencies.queue.recordCaseSnapshot(job,manifest,{...state,manifestFingerprint:manifest.manifestFingerprint});
  await dependencies.queue.writeStage(job,"document_work_product","succeeded",{executionScope:"documentary_only",productStatus:product.status});
  await dependencies.queue.writeStage(job,"case_analysis","succeeded",{executionScope:"documentary_only",financialAnalysisStatus:"not_performed",manifestFingerprint:manifest.manifestFingerprint});
  await dependencies.queue.complete(job,{manifest_id:manifestId,report,analysis_scope:"documentary_only",model_lineage:lineage,spend:dependencies.gateway.spent()});
  return {status:"succeeded",manifestId};
}
