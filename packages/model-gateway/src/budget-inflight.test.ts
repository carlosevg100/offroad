import {describe,it,expect} from "vitest";
import {z} from "zod";
import {createModelGateway} from "./gateway";
import type {AdapterResponse,GatewayCallLog,GatewayRequest} from "./types";
const schema=z.object({ok:z.boolean()});
const request:GatewayRequest<typeof schema>={task:"preliminary_understanding",system:"Review",input:[{type:"text",text:"Bounded input"}],schema,schemaName:"bounded",maxOutputTokens:100,allowFallback:false};
const response:AdapterResponse={output:{ok:true},rawText:'{"ok":true}',usage:{inputTokens:10,outputTokens:10,cachedInputTokens:0},model:"claude-sonnet-5",stopReason:"end"};
describe("in-flight and unknown usage budgets",()=>{
 it("reserves a call before asynchronous provider execution",async()=>{
  let release!:(value:AdapterResponse)=>void;let calls=0;
  const held=new Promise<AdapterResponse>(resolve=>{release=resolve;});
  const gateway=createModelGateway({budget:{maxCalls:1,maxCostUsd:3},budgetReservation:"conservative_text_v1",adapters:{anthropic:{provider:"anthropic",complete:()=>{calls++;return held;}}}});
  const first=gateway.complete(request);
  await expect(gateway.complete(request)).rejects.toMatchObject({code:"budget_exceeded"});
  expect(calls).toBe(1);release(response);await first;expect(gateway.spent().calls).toBe(1);
 });
 it("keeps exposure for unknown usage and labels telemetry honestly",async()=>{
  const logs:GatewayCallLog[]=[];
  const gateway=createModelGateway({budget:{maxCalls:2,maxCostUsd:3},budgetReservation:"conservative_text_v1",onCall:log=>logs.push(log),adapters:{anthropic:{provider:"anthropic",async complete(){return {...response,usageKnown:false};}}}});
  await gateway.complete(request);
  expect(gateway.spent().unknownCostCalls).toBe(1);expect(gateway.spent().costUsd).toBe(0);expect(gateway.spent().budgetExposureUsd).toBeGreaterThan(0);expect(logs[0]?.costStatus).toBe("unknown");
 });
 it("counts failed attempts after releasing their in-flight slot",async()=>{
  const gateway=createModelGateway({budget:{maxCalls:1,maxCostUsd:3},budgetReservation:"conservative_text_v1",adapters:{anthropic:{provider:"anthropic",async complete(){throw new Error("network result unknown");}}}});
  await expect(gateway.complete(request)).rejects.toBeDefined();
  expect(gateway.spent().calls).toBe(1);expect(gateway.spent().unknownCostCalls).toBe(1);expect(gateway.spent().budgetExposureUsd).toBeGreaterThan(0);
  await expect(gateway.complete(request)).rejects.toMatchObject({code:"budget_exceeded"});
 });
});
