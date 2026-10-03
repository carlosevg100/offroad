import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import type {Database} from "@/types/database";

import {isCapitalDebtProjection, readCapitalDebtResult, loadCapitalDebtNativeResult} from "./debt-result-native";

const organizationId = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";
const recipeId = "30000000-0000-4000-8000-000000000001";
// Transport fixture only; the page still parses the complete financial product contract.
const sentence="A evidência disponível requer confirmação documental e não sustenta uma conclusão financeira completa.";
const content = {schemaVersion:"company-debt-diagnostic.v1",asOfDate:"2026-10-02",company:{name:"Synthetic",website:null},
 executiveRead:sentence,companySnapshot:sentence,evidenceCoverage:{publicDataQuality:"partial",whatCanBeAssessed:[],criticalMissingInputs:[sentence]},
 businessRiskProfile:{businessModel:sentence,cashFlowDrivers:[],sensitivities:[],sourceUrls:[]},financialSignals:[],debtAndLiquiditySignals:[],workingCapitalSignals:[],risks:[],
 capacityAssessment:{status:"not_computable",conclusion:sentence,bindingUnknowns:[sentence],requiredInputs:[sentence]},diagnosticHypotheses:[],informationRequests:[],
 questions:Array.from({length:3},()=>({question:sentence,whyItMatters:sentence,answerChanges:sentence})),unknowns:[sentence],sources:[],researchStatus:"partial",
 scopeBoundary:sentence,provenance:{provider:"anthropic",model:"claude-sonnet-5",executorVersion:"2026.10.02-v1"}};
const text = JSON.stringify(content);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const projection = {schemaVersion: "capital-debt-projection.v1", revisionId, recipeId,
  finalFingerprint: "a".repeat(64), physicalSha256: hash(text), byteLength: Buffer.byteLength(text)};
function fixture(options: {text?: string; headers?: Record<string, string>; error?: unknown; data?: unknown} = {}) {
  const headers = {"content-type": "application/octet-stream", "cache-control": "private, no-store",
    "x-offroad-revision-id": revisionId, "x-offroad-recipe-id": recipeId, "x-offroad-final-fingerprint": projection.finalFingerprint, "x-offroad-allocation-id": recipeId, "x-offroad-object-id": organizationId,
    "x-offroad-storage-version": "storage-version-1", "x-offroad-payload-sha256": projection.physicalSha256,
    "x-offroad-byte-length": String(projection.byteLength), ...options.headers};
  const invoke = vi.fn().mockResolvedValue({error: options.error ?? null,
    data: Object.hasOwn(options, "data") ? options.data : new Blob([options.text ?? text]),
    response: new Response(null, {headers})});
  return {invoke, supabase: {functions: {invoke}} as unknown as SupabaseClient<Database>};
}
const input = {organizationId, projection};
const denied = {ok: false, error: "capital_debt_result_withheld"};

describe("human C11 retained result read", () => {
  it("uses only the exact revision and current workspace without a job lease or capability", async () => {
    const f = fixture();
    expect(await readCapitalDebtResult(f.supabase, input)).toEqual({ok: true, content, revisionId, recipeId,
      finalFingerprint: projection.finalFingerprint});
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", {method: "POST",
      body: {kind: "debt_result", revisionId}, headers: {"x-offroad-workspace": organizationId}, timeout: 10000});
  });
  it.each([null, {...projection, path: "caller/path"}, {...projection, byteLength: 1048577}, {...projection, revisionId: "other"},
    {...projection, physicalSha256: "x".repeat(64)}])("rejects malformed or expanded permanent metadata before transport (%j)", async value => {
    const f = fixture(); expect(await readCapitalDebtResult(f.supabase, {...input, projection: value})).toEqual(denied);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    {"x-offroad-recipe-id": revisionId}, {"x-offroad-final-fingerprint": "b".repeat(64)},
    {"x-offroad-revision-id": recipeId}, {"x-offroad-payload-sha256": "b".repeat(64)},
    {"x-offroad-byte-length": "1"}, {"x-offroad-object-id": "not-uuid"}, {"x-offroad-allocation-id": "not-uuid"},
    {"x-offroad-storage-version": ""}, {"cache-control": "public, max-age=3600"}, {"content-type": "application/json"},
  ])("rejects a mismatched or cacheable physical response (%j)", async headers => {
    const f = fixture({headers}); expect(await readCapitalDebtResult(f.supabase, input)).toEqual(denied);
  });
  it("rehashes actual bytes even when transport headers claim the expected hash", async () => {
    const f = fixture({text: text.replace("Synthetic", "Synthetix")});
    expect(await readCapitalDebtResult(f.supabase, input)).toEqual(denied);
  });
  it.each(["{not-json}", "null", "[]", '{"schemaVersion":"company-debt-diagnostic.v0"}'])("rejects invalid final JSON (%s)", async badText => {
    const pin = {...projection, physicalSha256: hash(badText), byteLength: Buffer.byteLength(badText)};
    const f = fixture({text: badText, headers: {"x-offroad-payload-sha256": pin.physicalSha256, "x-offroad-byte-length": String(pin.byteLength)}});
    expect(await readCapitalDebtResult(f.supabase, {...input, projection: pin})).toEqual(denied);
  });
  it("never renders an inline legacy body after current authority denies the retained body", async () => {
    const f = fixture({error: {message: "denied"}, data: content});
    expect(await readCapitalDebtResult(f.supabase, input)).toEqual(denied);
  });
  it("does not expose transport errors, paths or secrets", async () => {
    const f = fixture(); f.invoke.mockRejectedValue(new Error("secret object path"));
    expect(await readCapitalDebtResult(f.supabase, input)).toEqual(denied);
  });
  it("keeps a malformed native projection on the native refusal path", () => {
    expect(isCapitalDebtProjection({...projection, path: "forbidden"})).toBe(true);
    expect(isCapitalDebtProjection(content)).toBe(false);
  });
});

const artifactId="40000000-0000-4000-8000-000000000001";
const workId="50000000-0000-4000-8000-000000000001";
const artifactFingerprint="c".repeat(64);
const basis={projectId:workId,artifactId,revisionId,manifestFingerprint:"d".repeat(64),artifactFingerprint,
 preparedBy:organizationId,viewerId:organizationId,workAccess:true,sourceCount:1,status:"pending_confirmation",approvalActive:false,
 artifactType:"company_debt_diagnostic",policy:{assignmentRequired:false,selfApprovalAllowed:false,roles:[]}};
describe("C11 human result and exact v2 review target",()=>{
 const bound={organizationId,workId,artifact:{id:artifactId,artifact_fingerprint:artifactFingerprint,content:projection}};
 function withReview(value:unknown=basis,error:unknown=null){
  const f=fixture();const rpc=vi.fn().mockResolvedValue({data:value,error});
  return{...f,rpc,supabase:{functions:{invoke:f.invoke},rpc} as unknown as SupabaseClient<Database>};
 }
 it("binds displayed product to the actual exact v2 human review receipt",async()=>{
  const f=withReview();expect(await loadCapitalDebtNativeResult(f.supabase,bound)).toEqual({ok:true,content,review:basis});
  expect(f.rpc).toHaveBeenCalledExactlyOnceWith("read_capital_project_artifact_review_v2",{p_project_id:workId,p_artifact_id:artifactId,p_revision_id:revisionId});
 });
 it.each([null,{...basis,artifactFingerprint:"e".repeat(64)},{...basis,revisionId:artifactId},{...basis,artifactType:"meeting_brief"},
  {...basis,status:"superseded"},{...basis,status:"stale"}])("withholds stale, denied or substituted human review binding (%j)",async value=>{
  const f=withReview(value);expect(await loadCapitalDebtNativeResult(f.supabase,bound)).toEqual(denied);
 });
 it("withholds review transport failure without rendering a legacy body",async()=>{
  const f=withReview();f.rpc.mockRejectedValue(new Error("private transport path"));
  expect(await loadCapitalDebtNativeResult(f.supabase,bound)).toEqual(denied);
 });
 it("withholds a revoked viewer even after bytes have arrived",async()=>{
  const f=withReview(basis,{code:"42501"});expect(await loadCapitalDebtNativeResult(f.supabase,bound)).toEqual(denied);
 });
});
