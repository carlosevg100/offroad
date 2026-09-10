import {describe,expect,it} from "vitest";
import {documentWorkControlCallBudget as allocate,summarizeDocumentWorkControls as score,documentWorkControlFailure as failure} from "./document-work-control-budget";
const spend=(calls:number,costUsd=.2)=>({calls,costUsd,unknownCostCalls:0});
function controls(retry=false){let cursor=0;return Array.from({length:8},(_,i)=>{const start=cursor;cursor+=retry&&i===2?2:1;return {caseId:`control-${i}`,passed:true,providerCallRange:{start,end:cursor}};});}
describe("documentary controls share the original aggregate attempt ceiling",()=>{
 it("allows gold17 and controls9, including one already-accounted fallback",()=>{
  expect(allocate(17)).toBe(9);expect(score(controls(true),spend(17,.67),spend(9,.3))).toMatchObject({passed:true,totalCalls:26,executedControls:8,maxCalls:9});
 });
 it("retains gold18 and controls8 without raising either dollar partition",()=>{
  expect(allocate(18)).toBe(8);expect(score(controls(),spend(18,2.5),spend(8,.5)).passed).toBe(true);
  expect(score(controls(true),spend(18),spend(9)).passed).toBe(false);
 });
 it("never permits27 attempts or invalid gold accounting",()=>{
  for(const calls of [-1,18.5,19,26,NaN,Infinity])expect(()=>allocate(calls)).toThrow();
  expect(score(controls(true),spend(18),spend(9))).toMatchObject({passed:false,totalCalls:27});
  expect(score(controls(),spend(19),spend(8)).passed).toBe(false);
 });
 it("rejects a not-called eighth control even when all previous controls passed",()=>{
  const rows=controls(true);rows[7]={...rows[7]!,passed:false,providerCallRange:{start:8,end:8}};
  expect(score(rows,spend(17),spend(8))).toMatchObject({passed:false,executedControls:7,notCalledControls:["control-7"]});
  rows[7]!.passed=true;expect(score(rows,spend(17),spend(8)).passed).toBe(false);
 });
 it("rejects gaps, duplicate controls, unaccounted calls, unknown cost and overspend",()=>{
  const rows=controls();
  for(const change of [{calls:9},{costUsd:.50001},{costUsd:-1},{costUsd:NaN},{unknownCostCalls:1}])expect(score(rows,spend(17),{...spend(8),...change}).passed).toBe(false);
  expect(score(rows,spend(17,2.50001),spend(8)).passed).toBe(false);
  expect(score([{...rows[0]!,caseId:rows[1]!.caseId},...rows.slice(1)],spend(17),spend(8)).passed).toBe(false);
  expect(score([{...rows[0]!,providerCallRange:{start:1,end:2}},...rows.slice(1)],spend(17),spend(8)).passed).toBe(false);
  expect(score([{...rows[0]!,passed:false},...rows.slice(1)],spend(17),spend(8)).passed).toBe(false);
 });
 it("distinguishes the observed zero-call budget failure from a rejected provider response",()=>{
  expect(failure({code:"budget_exceeded"},8,8)).toBe("not_called_budget");
  expect(failure({code:"budget_exceeded"},2,3)).toBe("attempted_budget_exhausted");
  expect(failure({code:"all_attempts_failed",message:"private provider body"},2,3)).toBe("provider_response_rejected");
  expect(failure(new Error("arbitrary response content"),2,3)).toBe("executor_or_provider_rejected");
 });
});
