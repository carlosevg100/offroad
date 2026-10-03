import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {ModelGatewayConfig} from "@offroad/model-gateway";
import type {CapitalProjectAnalysisJob,QueueClient} from "./queue";
import type {ProviderConnections} from "./provider-processing";
import {createPreviewNativeRuntime} from "./integration-preview-native-runtime";
import {createInstalledPreviewCorpus} from "./integration-preview-installed-corpus";
import {describeJobFailure} from "./job-failure";
const basisSchema=z.strictObject({organizationId:z.uuid(),basisId:z.uuid()});
export function previewPublishedBasisFromEnvironment(raw:string|undefined){
 if(!raw)return undefined;
 try{if(Buffer.byteLength(raw)>1024)throw Error();return basisSchema.parse(JSON.parse(raw));}catch{throw Error('capital_preview_basis_configuration_invalid');}
}
/** The native production branch never calls the historical preview executor. */
export async function processNativePreviewJob(job:CapitalProjectAnalysisJob,dependencies:{queue:QueueClient;client:SupabaseClient;adapters:ModelGatewayConfig['adapters'];connections:ProviderConnections;budget:{maxCostUsd:number;maxCalls:number};publishedBasis?:z.infer<typeof basisSchema>|undefined;evidenceDir?:string;log?:(event:string,detail?:Record<string,unknown>)=>void}){
 const {queue}=dependencies,stage='integration_preview';
 try{
  if(job.integration_preview!==true||job.payload.analysis_scope!=='integration_preview')throw Error('capital_preview_grant_required');
  if(!dependencies.publishedBasis)throw Error('capital_preview_published_sources_required');
  const directory=dependencies.evidenceDir??'/app/evidence17',corpus=createInstalledPreviewCorpus(directory,JSON.parse(await readFile(join(directory,'manifest.json'),'utf8')));
  await queue.writeStage(job,stage,'started',{sourceCount:17});
  const runtime=createPreviewNativeRuntime({client:dependencies.client,authority:{jobId:job.job_id,capabilityToken:job.capability_token},publishedBasis:dependencies.publishedBasis,corpusManifest:corpus.manifest,extraction:corpus.extraction,adapters:dependencies.adapters,connections:dependencies.connections,budget:dependencies.budget,startTask:input=>queue.startCapitalTask(job,input)});
  const result=await runtime.run(),artifactId=z.uuid().parse(result.capitalArtifactId),artifactFingerprint=z.string().regex(/^[a-f0-9]{64}$/).parse(result.artifactFingerprint);
  if(!queue.completeIntegrationPreviewRun)throw Error('capital_preview_completion_unavailable');
  await queue.writeStage(job,stage,'succeeded',{artifactId:result.capitalArtifactId,modelCalls:result.modelCalls,unknownCostCalls:result.unknownCostCalls,materialRecovery:result.materialRecovery});
  await queue.completeIntegrationPreviewRun(job,{completionMessageId:randomUUID(),artifactId,artifactFingerprint,content:job.payload.locale==='en-US'?'Internal validation finished. The results are ready for review. Office materials have not been validated in this run.':'Validação interna concluída. Os resultados estão disponíveis para revisão. Os materiais Office não foram validados nesta execução.',result:{schemaVersion:'capital-preview-completion.v1',artifactId,artifactFingerprint,modelCalls:result.modelCalls,costUsd:result.costUsd,unknownCostCalls:result.unknownCostCalls,replayed:result.replayed,materialRecovery:result.materialRecovery}});
  dependencies.log?.('integration_preview.native_completed',{job:job.job_id,modelCalls:result.modelCalls,replayed:result.replayed});
  return{status:'succeeded' as const,artifactId:result.capitalArtifactId};
 }catch(error){await queue.writeStage(job,stage,'failed',{code:'capital_preview_native_denied'}).catch(()=>undefined);await queue.fail(job,describeJobFailure(error,{code:'capital_preview_native_denied',stage,retryable:false}),{retryable:false});return{status:'failed' as const};}
}
