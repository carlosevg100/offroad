import {describe,it,expect} from "vitest";
import {summarizeDocumentWorkAttempts as score} from "./document-work-product-attempts";
const run={passed:true,completeCalls:1,firstResponseValid:true,providerCalls:1};
const runs=Array.from({length:6},()=>({...run}));
const spent={calls:6,costUsd:1,unknownCostCalls:0};
describe("live validation attempt accounting",()=>{
  it("preserves six first-pass requests",()=>{expect(score(runs,[true,true,true],spent)).toMatchObject({passed:true,firstPassSuccessCount:6,firstPassSuccessRate:1});});
  it("retains corrected requests and their first-pass failures",()=>{
    const corrected=runs.map(item=>({...item,completeCalls:2,providerCalls:2,firstResponseValid:false}));
    expect(score(corrected,[true,true,true],{...spent,calls:12,costUsd:3})).toMatchObject({passed:true,firstPassSuccessCount:0,firstPassSuccessRate:0});
  });
  it.each([{calls:5},{calls:13},{costUsd:3.01},{costUsd:NaN},{unknownCostCalls:1}])("rejects invalid global spend %j",change=>{expect(score(runs,[true,true,true],{...spent,...change}).passed).toBe(false);});
  it("counts gateway retries/fallback and refuses a third executor completion",()=>{
    const retry=[{...run,providerCalls:2},...runs.slice(1)];
    expect(score(retry,[true,true,true],{...spent,calls:7}).passed).toBe(true);
    expect(score([{...run,completeCalls:3,providerCalls:3},...runs.slice(1)],[true,true,true],{...spent,calls:8}).passed).toBe(false);
  });
  it("never accepts missing requests, failed scores, failed repeats or unaccounted calls",()=>{
    expect(score(runs.slice(1),[true,true,true],spent).passed).toBe(false);
    expect(score([{...run,passed:false},...runs.slice(1)],[true,true,true],spent).passed).toBe(false);
    expect(score(runs,[true,false,true],spent).passed).toBe(false);
    expect(score(runs,[true,true],spent).passed).toBe(false);
    expect(score(runs,[true,true,true],{...spent,calls:7}).passed).toBe(false);
  });
});
