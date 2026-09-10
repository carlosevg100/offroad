import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {describe, expect, it} from "vitest";
import {z} from "zod";
import {createAnthropicAdapter} from "./anthropic";
import {createOpenAIAdapter} from "./openai";
import type {AdapterRequest} from "../types";

const request:AdapterRequest={model:"claude-sonnet-5",effort:"medium",system:"Synthetic transport test",input:[{type:"text",text:"No external provider is contacted."}],schema:z.object({ok:z.boolean()}),schemaName:"test",maxOutputTokens:100,timeoutMs:1000};
describe("SDK transport budget boundary",()=>{
 it("preserves Anthropic cache-write tokens for the 5-minute write tariff",async()=>{
  const fetch=async()=>new Response(JSON.stringify({id:"synthetic",type:"message",role:"assistant",model:"claude-sonnet-5",content:[{type:"text",text:'{"ok":true}'}],stop_reason:"end_turn",usage:{input_tokens:100,output_tokens:10,cache_read_input_tokens:20,cache_creation_input_tokens:40}}),{headers:{"content-type":"application/json"}});
  const response=await createAnthropicAdapter({client:new Anthropic({apiKey:"synthetic-only",fetch}),disableSdkRetries:true}).complete(request);
  expect(response.usageKnown).toBe(true);
  expect(response.usage).toEqual({inputTokens:160,outputTokens:10,cachedInputTokens:20,cacheCreationInputTokens:40});
 });
 for(const provider of ["anthropic","openai"] as const){
  it(`${provider} opt-in sends exactly one HTTP attempt on a retryable response`,async()=>{
   let attempts=0;
   const fetch=async()=>{attempts++;return new Response(JSON.stringify({error:{message:"synthetic retryable failure",type:"server_error"}}),{status:503,headers:{"content-type":"application/json","retry-after-ms":"1"}});};
   const adapter=provider==="anthropic"
    ?createAnthropicAdapter({client:new Anthropic({apiKey:"synthetic-only",fetch}),disableSdkRetries:true})
    :createOpenAIAdapter({client:new OpenAI({apiKey:"synthetic-only",fetch}),disableSdkRetries:true});
   await expect(adapter.complete({...request,model:provider==="anthropic"?"claude-sonnet-5":"gpt-5.6-terra"})).rejects.toThrow();
   expect(attempts).toBe(1);
  });
  it(`${provider} preserves default SDK retries when opt-in is absent`,async()=>{
   let attempts=0;
   const fetch=async()=>{attempts++;return new Response(JSON.stringify({error:{message:"synthetic retryable failure",type:"server_error"}}),{status:503,headers:{"content-type":"application/json","retry-after-ms":"1"}});};
   const adapter=provider==="anthropic"
    ?createAnthropicAdapter({client:new Anthropic({apiKey:"synthetic-only",fetch})})
    :createOpenAIAdapter({client:new OpenAI({apiKey:"synthetic-only",fetch})});
   await expect(adapter.complete(request)).rejects.toThrow();expect(attempts).toBe(3);
  });
  for(const [label,usage,known] of [
   ["missing",undefined,false],
   ["negative",{input_tokens:-1,output_tokens:10},false],
   ["invalid",{input_tokens:"100",output_tokens:10},false],
   ["valid",{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}},true],
   ["explicit zero",{input_tokens:0,output_tokens:0},true],
  ] as const)it(`${provider} marks ${label} usage explicitly`,async()=>{
   const body=provider==="anthropic"
    ?{id:"synthetic",type:"message",role:"assistant",model:"claude-sonnet-5",content:[{type:"text",text:'{"ok":true}'}],stop_reason:"end_turn",usage}
    :{id:"synthetic",object:"response",status:"completed",model:"gpt-5.6-terra",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:'{"ok":true}',annotations:[]}]}],usage};
   const fetch=async()=>new Response(JSON.stringify(body),{headers:{"content-type":"application/json"}});
   const adapter=provider==="anthropic"
    ?createAnthropicAdapter({client:new Anthropic({apiKey:"synthetic-only",fetch}),disableSdkRetries:true})
    :createOpenAIAdapter({client:new OpenAI({apiKey:"synthetic-only",fetch}),disableSdkRetries:true});
   const response=await adapter.complete(request);
   expect(response.usageKnown).toBe(known);expect(response.output).toEqual({ok:true});
   if(!known)expect(response.usage).toEqual({inputTokens:0,outputTokens:0,cachedInputTokens:0});
  });
 }
});
