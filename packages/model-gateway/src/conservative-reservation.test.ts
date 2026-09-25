import {describe, expect, it} from "vitest";
import {z} from "zod";
import {conservativeTextReservationUsd} from "./conservative-reservation";
import {createModelGateway} from "./gateway";
import {COST_RESERVATION_SAFETY_FACTOR, listPrices} from "./pricing";
import {retentionMatrixVersion} from "./retention-matrix";
import {estimateRequestInputTokens} from "./token-estimate";
import type {AdapterRequest, AdapterResponse, GatewayRequest, ProviderAdapter} from "./types";

const schema=z.object({ok:z.boolean()});
const request:GatewayRequest<typeof schema>={task:"preliminary_understanding",system:"Review faithfully.",input:[{type:"text",text:"Example"}],schema,schemaName:"example",maxOutputTokens:100};
const adapterRequest:AdapterRequest={...request,model:"claude-sonnet-5",effort:"medium",timeoutMs:1000,maxOutputTokens:100};
function adapter(provider:"anthropic"|"openai",outputs:Array<unknown|Error>=[{ok:true}]) {
 const calls:AdapterRequest[]=[];
 const implementation:ProviderAdapter={provider,async complete(input){calls.push(input);const output=outputs.shift();if(output instanceof Error)throw output;
  return {output,model:input.model,rawText:JSON.stringify(output),usage:{inputTokens:10,outputTokens:10,cachedInputTokens:0},stopReason:"end"} as AdapterResponse;}};
 return {calls,implementation};
}
describe("calibrated reservation of every attempt",()=>{
 it("reserves the calibrated input: the cache-writable prefix at the write rate, the rest at the input rate, and the whole output",()=>{
  const estimate=estimateRequestInputTokens("anthropic",adapterRequest);
  expect(estimate.cacheWritableInputTokens).toBeGreaterThan(0);expect(estimate.cacheWritableInputTokens).toBeLessThan(estimate.inputTokens);
  const price=listPrices["claude-sonnet-5"]!;
  const expected=Math.round(estimate.cacheWritableInputTokens*price.cacheWrite+(estimate.inputTokens-estimate.cacheWritableInputTokens)*price.input+100*price.output)/1_000_000*COST_RESERVATION_SAFETY_FACTOR;
  expect(conservativeTextReservationUsd("anthropic",adapterRequest,listPrices)).toBeCloseTo(expected,9);
  // OpenAI's implicit caching may write the whole prompt at 1.25x from GPT-5.6 on.
  const openai={...adapterRequest,model:"gpt-5.6-terra"};const openaiEstimate=estimateRequestInputTokens("openai",openai);
  expect(openaiEstimate.cacheWritableInputTokens).toBe(openaiEstimate.inputTokens);
  expect(conservativeTextReservationUsd("openai",openai,listPrices)).toBeCloseTo(Math.round(openaiEstimate.inputTokens*2.5+100*12)/1_000_000*COST_RESERVATION_SAFETY_FACTOR,9);
 });
 it("prices a request estimated above 272K input tokens at the GPT-5.6 long-context tariff, in full",()=>{
  const long={...adapterRequest,model:"gpt-5.6-sol",input:[{type:"text" as const,text:"a".repeat(1_200_000)}],maxOutputTokens:1000};
  const estimate=estimateRequestInputTokens("openai",long);
  expect(estimate.inputTokens).toBeGreaterThan(272_000);
  // 2x input (cache writes included) and 1.5x output for the whole request.
  expect(conservativeTextReservationUsd("openai",long,listPrices)).toBeCloseTo(Math.round(estimate.inputTokens*10+1000*30)/1_000_000*COST_RESERVATION_SAFETY_FACTOR,9);
  const short={...long,input:[{type:"text" as const,text:"a".repeat(1_000_000)}]};
  const shortEstimate=estimateRequestInputTokens("openai",short);
  expect(shortEstimate.inputTokens).toBeLessThanOrEqual(272_000);
  expect(conservativeTextReservationUsd("openai",short,listPrices)).toBeCloseTo(Math.round(shortEstimate.inputTokens*5+1000*20)/1_000_000*COST_RESERVATION_SAFETY_FACTOR,9);
 });
 for(const part of ["system","schema"] as const)it(`refuses oversized ${part} before either provider is called`,async()=>{
  const primary=adapter("anthropic"),fallback=adapter("openai");
  const gateway=createModelGateway({adapters:{anthropic:primary.implementation,openai:fallback.implementation},budgetReservation:"conservative_text_v1",budget:{maxCostUsd:.05,maxCalls:26}});
  await expect(gateway.complete({...request,...(part==="system"?{system:"x".repeat(100000)}:{schema:z.object({ok:z.boolean().describe("x".repeat(100000))})})})).rejects.toMatchObject({code:"budget_exceeded"});
  expect(primary.calls).toHaveLength(0);expect(fallback.calls).toHaveLength(0);expect(gateway.spent().calls).toBe(0);
 });
 it("counts multilingual UTF-8 bytes and serializes prompted instructions",()=>{
  const ascii=conservativeTextReservationUsd("anthropic",{...adapterRequest,input:[{type:"text",text:"a".repeat(100)}]},listPrices);
  const multibyte=conservativeTextReservationUsd("anthropic",{...adapterRequest,input:[{type:"text",text:"界".repeat(100)}]},listPrices);
  expect(multibyte).toBeGreaterThan(ascii);
  expect(conservativeTextReservationUsd("anthropic",{...adapterRequest,outputMode:"prompted_json"},listPrices)).toBeGreaterThan(0);
 });
 it("fails closed for non-text, missing prices and invalid prices",async()=>{
  const sonnet=listPrices["claude-sonnet-5"]!;
  for(const [input,prices] of [[[{type:"pdf",base64:"AA=="}],listPrices],[request.input,{}],[request.input,{...listPrices,"claude-sonnet-5":{...sonnet,input:NaN}}],
   [request.input,{...listPrices,"claude-sonnet-5":{...sonnet,cacheWrite:sonnet.input/2}}],[request.input,{...listPrices,"claude-sonnet-5":{...sonnet,longContext:{aboveInputTokens:272_000,inputMultiplier:0.5,outputMultiplier:1}}}]] as const){
   const primary=adapter("anthropic");const gateway=createModelGateway({adapters:{anthropic:primary.implementation},prices,budgetReservation:"conservative_text_v1",budget:{maxCostUsd:3,maxCalls:26}});
   await expect(gateway.complete({...request,input:[...input]})).rejects.toMatchObject({code:"budget_exceeded"});expect(primary.calls).toHaveLength(0);
  }
 });
 it("retains an unknown-cost reservation and refuses unaffordable fallback",async()=>{
  const primary=adapter("anthropic",[new Error("provider unavailable")]),fallback=adapter("openai");
  const reserved=conservativeTextReservationUsd("anthropic",adapterRequest,listPrices);
  const gateway=createModelGateway({adapters:{anthropic:primary.implementation,openai:fallback.implementation},budgetReservation:"conservative_text_v1",budget:{maxCostUsd:reserved+.000001,maxCalls:26}});
  await expect(gateway.complete(request)).rejects.toMatchObject({code:"budget_exceeded"});expect(primary.calls).toHaveLength(1);expect(fallback.calls).toHaveLength(0);
  expect(gateway.spent().budgetExposureUsd).toBeCloseTo(reserved,8);expect(gateway.spent().unknownCostCalls).toBe(1);
 });
 it("reserves the repair payload again and counts repairs against the shared ceiling",async()=>{
  const primary=adapter("anthropic",[{ok:"invalid"},{ok:true}]);
  const gateway=createModelGateway({adapters:{anthropic:primary.implementation},budgetReservation:"conservative_text_v1",budget:{maxCostUsd:3,maxCalls:2}});
  await gateway.complete({...request,outputMode:"prompted_json",allowFallback:false});
  expect(primary.calls).toHaveLength(2);expect(primary.calls[1]!.system.length).toBeGreaterThan(primary.calls[0]!.system.length);
  expect(conservativeTextReservationUsd("anthropic",primary.calls[1]!,listPrices)).toBeGreaterThan(conservativeTextReservationUsd("anthropic",primary.calls[0]!,listPrices));
  await expect(gateway.complete(request)).rejects.toMatchObject({code:"budget_exceeded"});expect(primary.calls).toHaveLength(2);
 });
 it("allows an affordable fallback but charges both attempts to one ceiling",async()=>{
  const primary=adapter("anthropic",[new Error("unknown provider outcome")]),fallback=adapter("openai");
  const gateway=createModelGateway({adapters:{anthropic:primary.implementation,openai:fallback.implementation},budgetReservation:"conservative_text_v1",budget:{maxCostUsd:3,maxCalls:2}});
  await gateway.complete(request);expect(primary.calls).toHaveLength(1);expect(fallback.calls).toHaveLength(1);
  expect(gateway.spent().calls).toBe(2);expect(gateway.spent().unknownCostCalls).toBe(1);
  await expect(gateway.complete(request)).rejects.toMatchObject({code:"budget_exceeded"});
  expect(primary.calls).toHaveLength(1);expect(fallback.calls).toHaveLength(1);
 });
 it("reserves the same calibrated bound without the opt-in field, so production counts the system too",async()=>{
  // The former default read only the text parts at four characters per token: this request, a
  // 100,000-character system and a seven-character input, reserved under one cent and was sent.
  const primary=adapter("anthropic");const gateway=createModelGateway({adapters:{anthropic:primary.implementation},budget:{maxCostUsd:.05,maxCalls:1}});
  await expect(gateway.complete({...request,system:"x".repeat(100000)})).rejects.toMatchObject({code:"budget_exceeded"});
  expect(primary.calls).toHaveLength(0);expect(gateway.spent()).toMatchObject({calls:0,budgetExposureUsd:0});
  const charged:number[]=[];
  const probe=createModelGateway({adapters:{anthropic:adapter("anthropic").implementation},processingEligibility:async({attempt})=>{charged.push(attempt.reservationUsd);
   return {allowed:false,policyVersion:retentionMatrixVersion,assuranceId:null,reasons:["probe"]};}});
  await expect(probe.complete({...request,allowFallback:false})).rejects.toMatchObject({code:"data_policy_violation"});
  expect(charged).toEqual([conservativeTextReservationUsd("anthropic",adapterRequest,listPrices)]);
 });
});
