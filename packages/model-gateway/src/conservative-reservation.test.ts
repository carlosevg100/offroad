import {describe, expect, it} from "vitest";
import {z} from "zod";
import {conservativeTextReservationUsd} from "./conservative-reservation";
import {createModelGateway} from "./gateway";
import {listPrices} from "./pricing";
import {buildAnthropicParams} from "./adapters/anthropic";
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
describe("opt-in conservative textual reservation",()=>{
 it("reserves every Anthropic input byte at the 5-minute cache-write tariff",()=>{
  const bytes=Buffer.byteLength(JSON.stringify(buildAnthropicParams(adapterRequest)),"utf8")+Buffer.byteLength(JSON.stringify(z.toJSONSchema(schema)),"utf8")+2048;
  const expected=Math.round((bytes*3*1.25+100*15))/1_000_000*1.1;
  expect(conservativeTextReservationUsd("anthropic",adapterRequest,listPrices)).toBeCloseTo(expected,8);
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
  for(const [input,prices] of [[[{type:"pdf",base64:"AA=="}],listPrices],[request.input,{}],[request.input,{...listPrices,"claude-sonnet-5":{...listPrices["claude-sonnet-5"]!,input:NaN}}]] as const){
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
 it("preserves the existing default reservation behavior without opt-in",async()=>{
  const primary=adapter("anthropic");const gateway=createModelGateway({adapters:{anthropic:primary.implementation},budget:{maxCostUsd:.05,maxCalls:1}});
  await gateway.complete({...request,system:"x".repeat(100000)});expect(primary.calls).toHaveLength(1);
 });
});
