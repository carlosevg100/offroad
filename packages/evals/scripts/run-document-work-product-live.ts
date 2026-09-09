/** Protected live executor evaluation, not authenticated application E2E or release promotion. */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {fingerprintJson} from "@offroad/case-understanding";
import {createModelGateway, createAnthropicAdapter, createOpenAIAdapter, defaultTaskPolicies, type GatewayCallLog} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {assertDocumentWorkLiveEnvironment, scoreDocumentWorkLive, compareDocumentWorkRepeats, type LiveProduct} from "../src/document-work-product-live";

async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("protected_provider_credentials_required");
  const outputDirectory = resolve(process.env.RUNNER_TEMP ?? ".", "document-work-product-live");
  mkdirSync(outputDirectory,{recursive:true});
  const calls: GatewayCallLog[] = [];
  const gateway = createModelGateway({adapters:{anthropic:createAnthropicAdapter({apiKey:process.env.ANTHROPIC_API_KEY}),openai:createOpenAIAdapter({apiKey:process.env.OPENAI_API_KEY})},budget:{maxCostUsd:3,maxCalls:6},onCall:call=>calls.push(call)});
  // Dynamic path loads the exact production executor without copying its prompt or relaxing its validation.
  const workerModule = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/document-worker/src/document-work-product.ts")).href;
  const {runDocumentWorkProduct} = await import(workerModule) as {runDocumentWorkProduct:(input:unknown,dependencies:{gateway:ReturnType<typeof createModelGateway>})=>Promise<LiveProduct>};
  const runs: Array<{caseId:string;repeat:number;product:LiveProduct|null;score:ReturnType<typeof scoreDocumentWorkLive>|null;failure:string|null;providerCallRange:{start:number;end:number}}> = [];
  const repeats: Array<{caseId:string;comparison:ReturnType<typeof compareDocumentWorkRepeats>|null}> = [];
  const persist = () => {
    const passed = runs.length === 6 && runs.every(run=>run.score?.passed) && repeats.length === 3 && repeats.every(repeat=>repeat.comparison?.passed) && gateway.spent().calls === 6 && gateway.spent().unknownCostCalls === 0;
    const evidence = {schemaVersion:"document-work-product-executor-eval.v1",synthetic:true,scope:"actual_executor_only_not_application_e2e",promotion:false,gitSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,workflowRef:process.env.GITHUB_WORKFLOW_REF,fixtureFingerprint:fingerprintJson(documentWorkProductLiveCases),policy:defaultTaskPolicies.preliminary_understanding,budget:{maxCostUsd:3,maxCalls:6},spent:gateway.spent(),passed,runs,repeats,calls};
    writeFileSync(resolve(outputDirectory,"evidence.json"),JSON.stringify(evidence,null,2));
    writeFileSync(resolve(outputDirectory,"summary.md"),`# Document work product executor evaluation\n\n${passed?"PASS":"FAIL"} · ${runs.length}/6 independent requests recorded.\n\nSynthetic cases; actual production executor and task policy. This is not application E2E, an independent domain review, or release approval.\n\n${runs.map(run=>`- ${run.caseId} repeat ${run.repeat}: ${run.score?.passed?"PASS":"FAIL"}${run.failure?` (${run.failure})`:""}`).join("\n")}\n\nRepeat comparisons require the same input and complete expected fact coverage. Full prose identity is reported separately, not required.\n\nProvider attempts: ${gateway.spent().calls}; measured USD: ${gateway.spent().costUsd}. Hard limits: 6 provider attempts and USD 3; retries/fallback consume this shared budget.\n`);
    return passed;
  };
  for (const sample of documentWorkProductLiveCases) {
    const input = {job:sample.job,locale:"en-US",approvedRequest:{text:sample.objective,fingerprint:fingerprintJson({objective:sample.objective})},passages:sample.passages.map(p=>({...p,documentId:p.id,version:"1",hash:fingerprintJson(p.text),anchor:"paragraph 1"})),coverage:{documentsConsidered:sample.passages.length,omittedPassages:0,limitations:["Synthetic document-only case; no financial calculations or independent diligence."]}};
    const outputs: LiveProduct[] = [];
    for (const repeat of [1,2]) {
      const callStart = calls.length;
      try {
        const product = await runDocumentWorkProduct(input,{gateway});
        outputs.push(product);
        runs.push({caseId:sample.id,repeat,product,score:scoreDocumentWorkLive(product,sample),failure:null,providerCallRange:{start:callStart,end:calls.length}});
      } catch {
        // Do not serialize provider exceptions: record the real failure through content-free gateway logs.
        runs.push({caseId:sample.id,repeat,product:null,score:null,failure:"executor_or_provider_rejected",providerCallRange:{start:callStart,end:calls.length}});
      }
      persist();
    }
    repeats.push({caseId:sample.id,comparison:outputs.length===2?compareDocumentWorkRepeats(outputs[0]!,outputs[1]!,sample):null});
    persist();
  }
  if (!persist()) process.exitCode = 1;
}
main().catch(()=>{console.error("document_work_product_live_setup_failed");process.exitCode=1;});
