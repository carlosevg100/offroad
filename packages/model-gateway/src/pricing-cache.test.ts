import {describe,it,expect} from "vitest";
import {effectivePrice,estimateCostUsd,listPrices,reservationForTokensUsd} from "./pricing";
import {modelLimits} from "./model-limits";
import {allowedModels,sweepCandidateModels} from "./policy";
describe("five-minute cache creation accounting",()=>{
 it("separates cache writes, reads and ordinary input without double counting",()=>{
  expect(estimateCostUsd("claude-sonnet-5",{inputTokens:1000,cachedInputTokens:200,cacheCreationInputTokens:300,outputTokens:100})).toBe(.00279);
 });
 it("retains ordinary and read-cache pricing when no cache write is reported",()=>{
  expect(estimateCostUsd("claude-sonnet-5",{inputTokens:1000,cachedInputTokens:200,outputTokens:100})).toBe(.00264);
 });
 it("charges a fully cached write at the five-minute premium",()=>{
  expect(estimateCostUsd("claude-sonnet-5",{inputTokens:1000,cachedInputTokens:0,cacheCreationInputTokens:1000,outputTokens:0})).toBe(.0025);
 });
});
describe("OpenAI GPT-5.6 cache writes and long-context tariff",()=>{
 it("charges cache writes at 1.25x the input rate, as reported inside input_tokens",()=>{
  // 12,000 input tokens of which 12,000 were written to the cache: 12,000 x 2.50 / 1M.
  expect(estimateCostUsd("gpt-5.6-terra",{inputTokens:12_000,cachedInputTokens:0,cacheCreationInputTokens:12_000,outputTokens:0})).toBe(.03);
  expect(estimateCostUsd("gpt-5.6-terra",{inputTokens:15_000,cachedInputTokens:12_000,cacheCreationInputTokens:3_000,outputTokens:1_000})).toBe(.0219);
 });
 it("prices the whole request at 2x input and 1.5x output above 272K input tokens, and at the standard rates at 272K",()=>{
  expect(estimateCostUsd("gpt-5.6-sol",{inputTokens:272_000,cachedInputTokens:0,outputTokens:10_000})).toBe(1.288);
  // 172,000 uncached x 8 + 1 write x 10 + 100,000 cached x 0.8 + 10,000 output x 30.
  expect(estimateCostUsd("gpt-5.6-sol",{inputTokens:272_001,cachedInputTokens:100_000,cacheCreationInputTokens:1,outputTokens:10_000})).toBe(1.75601);
  const luna=effectivePrice(listPrices["gpt-5.6-luna"]!,300_000);
  expect([luna.input,luna.cachedInput,luna.cacheWrite,luna.output].map((rate)=>Math.round(rate*1e6)/1e6)).toEqual([.4,.04,.5,1.8]);
 });
 it("keeps the Anthropic 1M window at the standard rates",()=>{
  expect(estimateCostUsd("claude-opus-5",{inputTokens:900_000,cachedInputTokens:0,outputTokens:10_000})).toBe(4.75);
 });
 it("reserves cache-writable input at the write rate and never below the input rate",()=>{
  expect(reservationForTokensUsd({model:"claude-opus-5",inputTokens:10_000,cacheWritableInputTokens:2_000,maxOutputTokens:1_000})).toBeCloseTo((8_000*5+2_000*6.25+1_000*25)/1e6*1.1,12);
  expect(reservationForTokensUsd({model:"gpt-4o",inputTokens:10_000,cacheWritableInputTokens:10_000,maxOutputTokens:1_000})).toBeCloseTo((10_000*2.5+1_000*10)/1e6*1.1,12);
  expect(reservationForTokensUsd({model:"unknown",inputTokens:1,maxOutputTokens:1})).toBe(0);
 });
});
describe("price and limit tables",()=>{
 it("price and bound every model a gateway may route to, with a source and a date",()=>{
  const models=[...Object.values(allowedModels).flat(),...Object.values(sweepCandidateModels).flat()];
  expect(Object.keys(listPrices).sort()).toEqual([...models].sort());
  expect(Object.keys(modelLimits).sort()).toEqual([...models].sort());
  for(const model of models){
   const price=listPrices[model]!,limits=modelLimits[model]!;
   expect(price.source).toMatch(/^https:\/\/(platform\.claude\.com|developers\.openai\.com)\//);
   expect(price.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(price.cacheWrite).toBeGreaterThanOrEqual(price.input);
   expect(price.cachedInput).toBeLessThan(price.input);
   expect(limits.source).toMatch(/^https:\/\/(platform\.claude\.com|developers\.openai\.com)\//);
   expect(limits.maxInputTokens).toBeLessThanOrEqual(limits.contextWindowTokens);
   expect(limits.maxOutputTokens).toBeLessThan(limits.contextWindowTokens);
  }
 });
});
