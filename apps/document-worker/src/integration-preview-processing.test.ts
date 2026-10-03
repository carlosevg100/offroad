/** Synthetic unit ports only; SQL, licenses and Storage are proved by the SDK gate. */
import {randomUUID,createHash} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {conservativeMicroUsd,legacyGatewayFingerprint,retentionMatrixVersion,type AdapterRequest} from "@offroad/model-gateway";
import {preparePreviewNativeModelRecipe,type PreviewModelRecipeInput} from "./integration-preview-model-recipe";
import {createCapitalPreviewProcessing,type CapitalPreviewProcessingPorts,type CapitalPreviewRetainedOutput} from "./integration-preview-processing";
const questions:Extract<PreviewModelRecipeInput,{boundary:"questions"}>={boundary:"questions",input:{gateway:null,locale:"pt-BR",gaps:[],request:{desiredOutcome:null,audience:null,depth:null,form:null,undefinedAspects:[],sponsorInstruction:null},answered:[],documents:[],fixed:[]}};
const synthesis:Extract<PreviewModelRecipeInput,{boundary:"synthesis"}>={boundary:"synthesis",input:{gateway:null,locale:"pt-BR",outputs:new Map(),request:{turn:1,composition:"prepare_material",audience:null,form:"internal_briefing",pages:null,sponsorInstruction:null,undefinedAspects:[]},objectFingerprints:{},previous:null,skeleton:{source:{kind:"skeleton",model:null,costUsd:0,latencyMs:0,reason:null}}as Extract<PreviewModelRecipeInput,{boundary:"synthesis"}>["input"]["skeleton"]}};
function fixture(boundary:PreviewModelRecipeInput["boundary"]="questions",options:{denyPrimary?:boolean;failPrimary?:boolean;wrongDispatch?:boolean;recovery?:boolean;wrongBytes?:boolean;unresolved?:boolean;preparation?:PreviewModelRecipeInput}={}){
 const preparation=options.preparation??(boundary==="questions"?questions:synthesis),prepared=preparePreviewNativeModelRecipe(preparation);
 const jobId=randomUUID(),organizationId=randomUUID(),recipeId=randomUUID(),boundaryId=randomUUID(),operationId=randomUUID(),rootAttemptReceiptId=randomUUID();
 const output=boundary==="questions"?{questions:[],abstain:true,abstainReason:null}:{sections:[{id:"synthetic",title:"Synthetic",paragraphs:[{text:"Synthetic test text",references:[]}]}],abstain:false,abstainReason:null};
 const bytes=Buffer.from(JSON.stringify(output));
 const receipt={schemaVersion:"capital-preview-boundary-receipt.v1",state:options.unresolved?"unresolved":"ready",recipeId,boundaryId,boundary,jobId,organizationId,workId:randomUUID(),planId:randomUUID(),planTaskId:randomUUID(),rendererVersion:prepared.rendererVersion,
  reconstructionFingerprint:prepared.inputFingerprint,promptFingerprint:prepared.promptFingerprint,primaryRequestFingerprint:prepared.pins[0]!.requestFingerprint,fallbackRequestFingerprint:prepared.pins[1]!.requestFingerprint,inputRetainedPayloadId:randomUUID(),consumedBasisFingerprint:"a".repeat(64),operationalBudget:{maxExposureMicroUsd:600000,maxDispatches:boundary==="synthesis"?1:2},expiresAt:"2026-10-03T00:00:00Z"};
 const retain=(invocationId:string,inputReceiptId:string):CapitalPreviewRetainedOutput=>{const allocationId=randomUUID();return{binding:{recipeId,boundaryId,invocationId,inputReceiptId,outputFingerprint:legacyGatewayFingerprint(output)},scope:{schemaVersion:"capital-retained-body.v1",retentionState:"retained",allocationId,bodyBasisId:randomUUID(),retainedPayloadId:randomUUID(),bucket:"capital-input-capture",path:`${organizationId}/${allocationId}/payload.json`,payloadFingerprint:createHash("sha256").update(bytes).digest("hex"),byteLength:bytes.length,storageObjectId:randomUUID(),storageVersion:"unit",retainedAt:"2026-10-02T00:00:00Z",uploadExpiresAt:"2026-10-02T00:05:00Z",expiresAt:receipt.expiresAt,purgeAt:"2026-10-02T23:00:00Z",replayed:false}};};
 let retained=options.recovery?retain(randomUUID(),randomUUID()):null;const order:string[]=[],sends:AdapterRequest[]=[];
 const records=new Map<string,{attempt:Parameters<CapitalPreviewProcessingPorts["authorize"]>[0]["attempt"];decisionId:string;inputId?:string}>();
 const ports:CapitalPreviewProcessingPorts={loadRecipe:async()=>({receipt,preparation}),revalidateRecipe:async()=>receipt,recoverAccepted:async()=>retained,
  authorize:vi.fn(async({attempt})=>{const id=randomUUID(),decisionId=randomUUID(),allowed=!options.denyPrimary||attempt.usedProviderFallback;records.set(id,{attempt,decisionId});order.push(`authorize:${attempt.usedProviderFallback}`);return{schemaVersion:"capital-body-processing-decision.v2",allowed,policyVersion:retentionMatrixVersion,assuranceId:null,assuranceIds:allowed?[randomUUID(),randomUUID(),randomUUID()]:[],decisionId,classification:"restricted",reasons:allowed?[]:["processing_resource_ineligible:inference"],attemptReceiptId:id,invocationId:attempt.invocationId,requestFingerprint:attempt.requestFingerprint,eligibilityFingerprint:"b".repeat(64),replayed:false,operationId,rootAttemptReceiptId};}),
  dispatch:vi.fn(async(id)=>{const r=records.get(id)!;r.inputId=randomUUID();order.push("dispatch");return{schemaVersion:"capital-body-input-dispatch.v3",receiptId:r.inputId,invocationId:options.wrongDispatch?randomUUID():r.attempt.invocationId,requestFingerprint:r.attempt.requestFingerprint,operationId,attemptReceiptId:id,rootAttemptReceiptId,dispatchClaimId:randomUUID(),rendererPolicyFingerprint:prepared.pins[r.attempt.usedProviderFallback?1:0]!.policyFingerprint,reservationMicroUsd:conservativeMicroUsd(r.attempt.reservationUsd),serverReservationMicroUsd:conservativeMicroUsd(r.attempt.reservationUsd),dispatchAllowed:true,replayed:false};}),
  outcome:vi.fn(async(id,outcome)=>{const r=records.get(id)!;order.push(`outcome:${outcome.outcome}`);return{schemaVersion:"capital-body-attempt-outcome-receipt.v1",receiptId:randomUUID(),operationId,attemptReceiptId:id,inputReceiptId:r.inputId,rootAttemptReceiptId,invocationId:outcome.invocationId,requestFingerprint:outcome.requestFingerprint,fingerprintVersion:outcome.fingerprintVersion,outcomeFingerprint:outcome.outcomeFingerprint,outcome:outcome.outcome,failureCode:outcome.failureCode,replayed:false};}),
  retainAccepted:vi.fn(async({accepted})=>{order.push("retain");retained=retain(accepted.invocationId,accepted.inputAttestationReceiptId!);return retained;}),
  readAccepted:async(retainedOutput)=>({scope:retainedOutput.scope,bytes:options.wrongBytes?Buffer.from("changed"):bytes}),
  recordExecutionFailure:vi.fn(async({recipeId:rid,boundaryId:bid,reason})=>({schemaVersion:"capital-preview-boundary-failure.v1",recipeId:rid,boundaryId:bid,reason,replayed:false}))};
 const complete=async(request:AdapterRequest)=>{sends.push(request);order.push("send");if(options.failPrimary&&request.model==="claude-sonnet-5")throw new Error("unit provider error");return{output,rawText:JSON.stringify(output),model:request.model,usage:{inputTokens:1,outputTokens:1,cachedInputTokens:0},stopReason:"end"as const};};
 const connection={accountRef:"unit",projectRef:"unit",credentialBinding:"unit",region:"global"};
 const config={jobId,ports,connections:{anthropic:connection,openai:connection},adapters:{anthropic:{provider:"anthropic"as const,complete},openai:{provider:"openai"as const,complete}},now:()=>Date.parse("2026-10-02T12:00:00Z")};
 return{run:()=>createCapitalPreviewProcessing(config).run(boundary),config,ports,order,sends,receipt};
}
describe("preview actual paid boundary protocol / unit ports",()=>{
 it.each(["questions","synthesis"]as const)("persists %s terminal outcome and accepted physical bytes before returning",async boundary=>{const f=fixture(boundary),r=await f.run();expect(r.recovered).toBe(false);expect(f.order).toEqual(["authorize:false","dispatch","send","outcome:accepted","retain"]);expect(f.sends).toHaveLength(1);expect(f.sends[0]!.maxOutputTokens).toBe(boundary==="questions"?2000:6000);});
 it("recovers accepted physical output without model/authorize/dispatch",async()=>{const f=fixture("questions",{recovery:true});expect((await f.run()).recovered).toBe(true);expect(f.sends).toHaveLength(0);expect(f.ports.authorize).not.toHaveBeenCalled();});
 it.each(["unresolved","wrongDispatch"]as const)("denies %s before any model",async key=>{const f=fixture("questions",{[key]:true});await expect(f.run()).rejects.toThrow();expect(f.sends).toHaveLength(0);});
 it("allows denied primary then one synthesis fallback, never two paid synthesis calls",async()=>{const f=fixture("synthesis",{denyPrimary:true});await f.run();expect(f.sends.map(s=>s.model)).toEqual(["gpt-5.6-terra"]);});
 it("paid failed synthesis consumes its published one-call limit",async()=>{const f=fixture("synthesis",{failPrimary:true});await expect(f.run()).rejects.toThrow();expect(f.sends).toHaveLength(1);expect(f.ports.retainAccepted).not.toHaveBeenCalled();expect(f.order).toContain("outcome:provider_error");});
 it("awaits the primary error outcome before questions fallback",async()=>{const f=fixture("questions",{failPrimary:true});await f.run();expect(f.order.indexOf("outcome:provider_error")).toBeLessThan(f.order.indexOf("authorize:true"));expect(f.sends).toHaveLength(2);});
 it("does not expose an accepted result whose physical bytes changed",async()=>{const f=fixture("questions",{wrongBytes:true});await expect(f.run()).rejects.toThrow();expect(f.sends).toHaveLength(1);});
});

// Unit ports prove protocol behavior only; actual SQL/Storage admission runs in CI.
describe("preview retained request grammar and denied send",()=>{
 it("preserves a complete UTF8 request above 100k through the unchanged builder",async()=>{
  const text="synthetic intact content ".repeat(6000);const input={...questions,input:{...questions.input,request:{...questions.input.request,sponsorInstruction:text}}};
  const f=fixture("questions",{preparation:input});await f.run();expect(f.sends).toHaveLength(1);
  const sent=f.sends[0]!.input.filter(part=>part.type==='text').map(part=>part.text).join('');
  expect(Buffer.byteLength(sent,'utf8')).toBeGreaterThan(100000);expect(Buffer.byteLength(sent,'utf8')).toBeLessThan(1048576);expect(sent).toContain(text);
 });
 it("counts UTF8 bytes and denies a request over the physical ceiling before authorization",async()=>{
  const text='á'.repeat(530000);expect(text.length).toBeLessThan(1048576);
  const input={...questions,input:{...questions.input,request:{...questions.input.request,sponsorInstruction:text}}};const f=fixture("questions",{preparation:input});
  await expect(f.run()).rejects.toThrow();expect(f.ports.authorize).not.toHaveBeenCalled();expect(f.ports.dispatch).not.toHaveBeenCalled();expect(f.sends).toHaveLength(0);
 });
 it("server budget refusal never reaches a provider",async()=>{
  const f=fixture();f.ports.dispatch=vi.fn(async()=>{throw Error('capital_preview_budget_denied');});
  await expect(f.run()).rejects.toThrow();expect(f.sends).toHaveLength(0);expect(f.ports.retainAccepted).not.toHaveBeenCalled();
 });
 it("fallback retains the same provider-retention denial before any dispatch",async()=>{
  const f=fixture(),authorize=f.ports.authorize;
  f.ports.authorize=vi.fn(async value=>{const result=await authorize(value);return{...result,allowed:false,assuranceIds:[],reasons:['processing_resource_ineligible:inference']};});
  await expect(f.run()).rejects.toThrow();expect(f.ports.authorize).toHaveBeenCalledTimes(2);expect(f.ports.dispatch).not.toHaveBeenCalled();expect(f.sends).toHaveLength(0);
 });
 it("fallback cannot override a server refusal after the primary already spent",async()=>{
  const f=fixture('questions',{failPrimary:true}),dispatch=f.ports.dispatch;let claims=0;
  f.ports.dispatch=vi.fn(async id=>{if(++claims>1)throw Error('capital_preview_budget_denied');return dispatch(id);});
  await expect(f.run()).rejects.toThrow();expect(f.sends).toHaveLength(1);expect(f.order).toContain('outcome:provider_error');expect(f.ports.retainAccepted).not.toHaveBeenCalled();
 });
});
