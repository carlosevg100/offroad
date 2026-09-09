import {describe,it,expect} from "vitest";
import {summarizeDocumentWorkAttempts as score} from "./document-work-product-attempts";
const run={passed:true,completeCalls:2,narrativeCalls:1,reviewCalls:1,firstResponseValid:true,providerCalls:2};
const runs=Array.from({length:6},()=>({...run}));
const spent={calls:12,costUsd:1,unknownCostCalls:0};
describe("live validation and source-review accounting",()=>{
  it("requires a source review for all six first-pass requests",()=>{expect(score(runs,[true,true,true],spent)).toMatchObject({passed:true,firstPassSuccessCount:6,firstPassSuccessRate:1});});
  it("retains corrected requests and their first-pass failures",()=>{
    const corrected=runs.map(item=>({...item,completeCalls:3,narrativeCalls:2,providerCalls:3,firstResponseValid:false}));
    expect(score(corrected,[true,true,true],{...spent,calls:18,costUsd:2.5})).toMatchObject({passed:true,firstPassSuccessCount:0,firstPassSuccessRate:0});
  });
  it.each([{calls:11},{calls:19},{costUsd:2.51},{costUsd:NaN},{unknownCostCalls:1}])("rejects invalid global spend %j",change=>{expect(score(runs,[true,true,true],{...spent,...change}).passed).toBe(false);});
  it("counts provider retries and refuses a fourth executor completion",()=>{
    expect(score([{...run,providerCalls:3},...runs.slice(1)],[true,true,true],{...spent,calls:13}).passed).toBe(true);
    expect(score([{...run,completeCalls:4,narrativeCalls:3,providerCalls:4},...runs.slice(1)],[true,true,true],{...spent,calls:14}).passed).toBe(false);
  });
  it("rejects absent or duplicated reviews and mismatched completion accounting",()=>{
    for(const change of [{reviewCalls:0},{reviewCalls:2},{narrativeCalls:0},{completeCalls:3}])
      expect(score([{...run,...change},...runs.slice(1)],[true,true,true],spent).passed).toBe(false);
  });
  it("never accepts missing requests, failed scores, failed repeats or unaccounted calls",()=>{
    expect(score(runs.slice(1),[true,true,true],spent).passed).toBe(false);
    expect(score([{...run,passed:false},...runs.slice(1)],[true,true,true],spent).passed).toBe(false);
    expect(score(runs,[true,false,true],spent).passed).toBe(false);
    expect(score(runs,[true,true],spent).passed).toBe(false);
    expect(score(runs,[true,true,true],{...spent,calls:13}).passed).toBe(false);
  });
});
