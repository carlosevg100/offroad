/** Protected live executor evaluation, not authenticated application E2E or release promotion. */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {fingerprintJson} from "@offroad/case-understanding";
import {createModelGateway, createAnthropicAdapter, createOpenAIAdapter, defaultTaskPolicies, type GatewayCallLog} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {assertDocumentWorkLiveEnvironment, scoreDocumentWorkLive, compareDocumentWorkRepeats, type LiveProduct} from "../src/document-work-product-live";

import {summarizeDocumentWorkAttempts} from "../src/document-work-product-attempts";
import {documentWorkFailureDiagnostics} from "../src/document-work-product-diagnostics";

async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("protected_provider_credentials_required");
  const outputDirectory = resolve(process.env.RUNNER_TEMP ?? ".", "document-work-product-live");
  mkdirSync(outputDirectory,{recursive:true});
  const calls: GatewayCallLog[] = [];
  const gateway = createModelGateway({adapters:{anthropic:createAnthropicAdapter({apiKey:process.env.ANTHROPIC_API_KEY}),openai:createOpenAIAdapter({apiKey:process.env.OPENAI_API_KEY})},budget:{maxCostUsd:3,maxCalls:12},onCall:call=>calls.push(call)});
  // Dynamic path loads the exact production executor without copying its prompt or relaxing its validation.
  const workerModule = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/document-worker/src/document-work-product.ts")).href;
  const {runDocumentWorkProduct, validateDocumentWorkProductNarrative} = await import(workerModule) as {runDocumentWorkProduct:(input:unknown,dependencies:{gateway:ReturnType<typeof createModelGateway>})=>Promise<LiveProduct>;validateDocumentWorkProductNarrative:(input:unknown,raw:unknown)=>{sections:Array<{observations:unknown[]}>;gaps:unknown[]}};
  const runs: Array<{caseId:string;repeat:number;product:LiveProduct|null;score:ReturnType<typeof scoreDocumentWorkLive>|null;failure:string|null;diagnostics:ReturnType<typeof documentWorkFailureDiagnostics>|null;providerCallRange:{start:number;end:number};completeCalls:number;responses:Array<{providerCallIndex:number;contentFingerprint:string;syntheticOutput:{classification:"synthetic_executor_response_not_product";content:NonNullable<ReturnType<typeof documentWorkFailureDiagnostics>["rejectedOutput"]>["content"]}|null;validationPassed:boolean;diagnostics:ReturnType<typeof documentWorkFailureDiagnostics>|null}>}> = [];
  const repeats: Array<{caseId:string;comparison:ReturnType<typeof compareDocumentWorkRepeats>|null}> = [];
  const persist = () => {
    const accounting = summarizeDocumentWorkAttempts(runs.map(run=>({passed:run.score?.passed === true,completeCalls:run.completeCalls,firstResponseValid:run.responses[0]?.validationPassed === true,providerCalls:run.providerCallRange.end-run.providerCallRange.start})),repeats.map(repeat=>repeat.comparison?.passed === true),gateway.spent());
    const passed = accounting.passed;
    const evidence = {schemaVersion:"document-work-product-executor-eval.v2",synthetic:true,scope:"actual_executor_only_not_application_e2e",promotion:false,gitSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,workflowRef:process.env.GITHUB_WORKFLOW_REF,fixtureFingerprint:fingerprintJson(documentWorkProductLiveCases),policy:defaultTaskPolicies.preliminary_understanding,budget:{maxCostUsd:3,maxCalls:12},spent:gateway.spent(),accounting,passed,runs,repeats,calls};
    writeFileSync(resolve(outputDirectory,"evidence.json"),JSON.stringify(evidence,null,2));
    writeFileSync(resolve(outputDirectory,"summary.md"),`# Document work product executor evaluation\n\n${passed?"PASS":"FAIL"} · ${runs.length}/6 independent requests recorded.\n\nSynthetic cases; actual production executor and task policy. This is not application E2E, an independent domain review, or release approval.\n\n${runs.map(run=>`- ${run.caseId} repeat ${run.repeat}: ${run.score?.passed?"PASS":"FAIL"}${run.failure?` (${run.failure})`:""}`).join("\n")}\n\nRepeat comparisons require the same input and complete expected fact coverage. Full prose identity is reported separately, not required.\n\nProvider attempts: ${gateway.spent().calls}; measured USD: ${gateway.spent().costUsd}. First-pass success: ${accounting.firstPassSuccessCount}/${runs.length}; per-request attempts retained in evidence. Hard limits: 12 provider attempts and USD 3; retries/fallback consume this shared budget.\n`);
    return passed;
  };
  for (const sample of documentWorkProductLiveCases) {
    const input = {job:sample.job,locale:"en-US",approvedRequest:{text:sample.objective,fingerprint:fingerprintJson({objective:sample.objective})},passages:sample.passages.map(p=>({...p,documentId:p.id,version:"1",hash:fingerprintJson(p.text),anchor:"paragraph 1"})),coverage:{documentsConsidered:sample.passages.length,omittedPassages:0,limitations:["Synthetic document-only case; no financial calculations or independent diligence."]}};
    const outputs: LiveProduct[] = [];
    for (const repeat of [1,2]) {
      const callStart = calls.length;
      let capturedSyntheticOutput: unknown;
      let completeCalls = 0;
      const responses: (typeof runs)[number]["responses"] = [];
      // Observe the real response without altering request, policy, retries, validation or budget.
      const observedGateway: typeof gateway = {spent:gateway.spent, async complete(request) {
        completeCalls++;
        capturedSyntheticOutput = undefined;
        const response = await gateway.complete(request);
        capturedSyntheticOutput = response.output;
        let validationFailure: unknown;
        try {
          const narrative = validateDocumentWorkProductNarrative(input,response.output);
          if (!narrative.sections.some(section=>section.observations.length > 0) && narrative.gaps.length === 0) throw new Error("document_work_product_empty_without_gap");
        } catch (error) {validationFailure=error;}
        const diagnostic = documentWorkFailureDiagnostics(validationFailure,response.output,calls.length-1);
        responses.push({providerCallIndex:calls.length-1,contentFingerprint:fingerprintJson(response.output),syntheticOutput:diagnostic.rejectedOutput ? {classification:"synthetic_executor_response_not_product",content:diagnostic.rejectedOutput.content} : null,validationPassed:validationFailure === undefined,diagnostics:validationFailure === undefined ? null : diagnostic});
        return response;
      }};
      try {
        const product = await runDocumentWorkProduct(input,{gateway:observedGateway});
        outputs.push(product);
        runs.push({caseId:sample.id,repeat,product,score:scoreDocumentWorkLive(product,sample),failure:null,diagnostics:null,providerCallRange:{start:callStart,end:calls.length},completeCalls,responses});
      } catch (error) {
        // Only fixed synthetic narrative belongs in this private eval artifact, never general telemetry.
        const diagnostics = documentWorkFailureDiagnostics(error,capturedSyntheticOutput,capturedSyntheticOutput === undefined ? null : calls.length - 1);
        runs.push({caseId:sample.id,repeat,product:null,score:null,failure:diagnostics.code,diagnostics,providerCallRange:{start:callStart,end:calls.length},completeCalls,responses});
      }
      persist();
    }
    repeats.push({caseId:sample.id,comparison:outputs.length===2?compareDocumentWorkRepeats(outputs[0]!,outputs[1]!,sample):null});
    persist();
  }
  if (!persist()) process.exitCode = 1;
}
main().catch(()=>{console.error("document_work_product_live_setup_failed");process.exitCode=1;});
