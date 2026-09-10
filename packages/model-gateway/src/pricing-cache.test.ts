import {describe,it,expect} from "vitest";
import {estimateCostUsd} from "./pricing";
describe("five-minute cache creation accounting",()=>{
 it("separates cache writes, reads and ordinary input without double counting",()=>{
  expect(estimateCostUsd("claude-sonnet-5",{inputTokens:1000,cachedInputTokens:200,cacheCreationInputTokens:300,outputTokens:100})).toBe(.004185);
 });
 it("retains ordinary and read-cache pricing when no cache write is reported",()=>{
  expect(estimateCostUsd("claude-sonnet-5",{inputTokens:1000,cachedInputTokens:200,outputTokens:100})).toBe(.00396);
 });
 it("charges a fully cached write at the five-minute premium",()=>{
  expect(estimateCostUsd("claude-sonnet-5",{inputTokens:1000,cachedInputTokens:0,cacheCreationInputTokens:1000,outputTokens:0})).toBe(.00375);
 });
});
