import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {expect, it, test, vi} from "vitest";
import {readCapitalPreviewResultBytes,readCapitalDebtRevisionBodyBytes,readCapitalDebtRevisionSourceBytes,readCapitalDebtRevisionTaskBytes,readCapitalDebtBodyBytes,readCapitalDebtResultBytes,readCapitalDebtRecoveryBytes,readCapitalDebtRecoverySourceBytes,readCapitalDebtRecoveredTaskBytes,readCapitalM07RecoveryBytes, readCapitalM07RecoverySourceBytes, readCapitalM07RevisionBodyBytes, readCapitalM07RevisionSourceBytes, readCapitalS11RecoveryBytes, readCapitalS11RecoverySourceBytes, readCapitalS11TaskBytes, readCapitalS11RecoveredTaskBytes, readCapitalS11RevisionBodyBytes, readCapitalS11RevisionTaskBytes, readCapitalS11RevisionSourceBytes} from "./capital-body-read-client";

const org = "10000000-0000-4000-8000-000000000001", allocation = "20000000-0000-4000-8000-000000000001";
const recipe = "30000000-0000-4000-8000-000000000001", retained = "40000000-0000-4000-8000-000000000001";
const originalJob = "50000000-0000-4000-8000-000000000001", successorJob = "50000000-0000-4000-8000-000000000002";
const text = '{"synthetic":true}', digest = createHash("sha256").update(text).digest("hex");
const scope = {allocationId: allocation, path: `${org}/${allocation}/payload.json`, payloadFingerprint: digest,
  byteLength: Buffer.byteLength(text), storageObjectId: retained, storageVersion: "storage-v1"};
function fixture(overrides: Record<string, string> = {}, body = text) {
  const invoke = vi.fn().mockResolvedValue({error: null, data: new Blob([body]), response: new Response(null, {headers: {
    "content-type": "application/octet-stream", "cache-control": "private, no-store", "x-offroad-allocation-id": allocation,
    "x-offroad-object-id": retained, "x-offroad-storage-version": "storage-v1", "x-offroad-payload-sha256": digest,
    "x-offroad-byte-length": String(scope.byteLength), "x-offroad-recipe-id": recipe, "x-offroad-retained-payload-id": retained, ...overrides,
  }})});
  return {invoke, sdk: {functions: {invoke}} as unknown as SupabaseClient};
}
test("recovery client sends only the successor grant keys and never impersonates the original job", async () => {
  const f = fixture();
  const read = await readCapitalM07RecoveryBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope);
  expect(new TextDecoder().decode(read.bytes)).toBe(text);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", {method: "POST",
    body: {kind: "m07_recovery", recipeId: recipe, retainedPayloadId: retained}, headers: {
      "x-offroad-workspace": org, "x-offroad-job-id": successorJob, "x-offroad-capability": "synthetic-capability",
    }, timeout: 10000});
  expect(JSON.stringify(f.invoke.mock.calls)).not.toContain(originalJob);
});
test.each<Record<string, string>>([{"x-offroad-recipe-id": org}, {"x-offroad-retained-payload-id": org},
  {"x-offroad-storage-version": "storage-v2"}, {"x-offroad-object-id": org}, {"cache-control": "public, not-no-store"}])("recovery client refuses scope/header drift %j", async headers => {
  const f = fixture(headers);
  await expect(readCapitalM07RecoveryBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow(/capital capture server/);
});
test("recovery client rehashes retained bytes after accepted headers", async () => {
  const f = fixture({}, text.replace("true", "null"));
  await expect(readCapitalM07RecoveryBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow("capital capture server immutable bytes conflict");
});


test("source recovery client sends retained recipe identity and the current successor lease only", async () => {
  const f = fixture();
  const read = await readCapitalM07RecoverySourceBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope);
  expect(new TextDecoder().decode(read.bytes)).toBe(text);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", {method: "POST",
    body: {kind: "m07_recovery_source", recipeId: recipe, retainedPayloadId: retained}, headers: {
      "x-offroad-workspace": org, "x-offroad-job-id": successorJob, "x-offroad-capability": "synthetic-capability",
    }, timeout: 10000});
});
test("source recovery client refuses a retained source swap despite valid physical headers", async () => {
  const f = fixture({"x-offroad-retained-payload-id": org});
  await expect(readCapitalM07RecoverySourceBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow(/capital capture server/);
});

for (const [kind,read] of [["m07_revision_body",readCapitalM07RevisionBodyBytes],["m07_revision_source",readCapitalM07RevisionSourceBytes]] as const) {
  it(`${kind} passes only retained target and new lease, with physical verification`, async()=>{
    const f=fixture();const result=await read(f.sdk,{jobId:successorJob,capabilityToken:"new-lease"},{retainedPayloadId:retained},scope);
    expect(Buffer.from(result.bytes).toString()).toBe(text);
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read",expect.objectContaining({
      body:{kind,retainedPayloadId:retained},headers:expect.objectContaining({"x-offroad-job-id":successorJob,"x-offroad-capability":"new-lease"}),
    }));
  });
  it(`${kind} denies substitution of retained payload identity`,async()=>{
    const f=fixture({"x-offroad-retained-payload-id":recipe});
    await expect(read(f.sdk,{jobId:successorJob,capabilityToken:"new-lease"},{retainedPayloadId:retained},scope)).rejects.toThrow("scope mismatch");
  });
}

for (const [kind, read] of [["s11_recovery", readCapitalS11RecoveryBytes], ["s11_recovery_source", readCapitalS11RecoverySourceBytes]] as const) {
  test(`${kind} binds recipe and physical retained identity to the current lease`, async () => {
    const f = fixture(); const result = await read(f.sdk, {jobId: successorJob, capabilityToken: "current-lease"}, {recipeId: recipe, retainedPayloadId: retained}, scope);
    expect(Buffer.from(result.bytes).toString()).toBe(text);
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", expect.objectContaining({body: {kind, recipeId: recipe, retainedPayloadId: retained}}));
  });
  test.each(["x-offroad-recipe-id", "x-offroad-retained-payload-id", "x-offroad-object-id", "x-offroad-storage-version"])(`${kind} rejects changed %s`, async key => {
    const f = fixture({[key]: org});
    await expect(read(f.sdk, {jobId: successorJob, capabilityToken: "current-lease"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow("scope mismatch");
  });
}
for (const [kind, read] of [["s11_task", readCapitalS11TaskBytes], ["s11_recovered_task", readCapitalS11RecoveredTaskBytes]] as const) {
  test(`${kind} binds the real TaskRun instead of a caller-selected allocation`, async () => {
    const f = fixture({"x-offroad-task-run-id": retained}); const result = await read(f.sdk, {jobId: successorJob, capabilityToken: "current-lease"}, {recipeId: recipe, taskRunId: retained}, scope);
    expect(Buffer.from(result.bytes).toString()).toBe(text);
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", expect.objectContaining({body: {kind, recipeId: recipe, taskRunId: retained}}));
  });
  test.each(["x-offroad-recipe-id", "x-offroad-task-run-id", "x-offroad-object-id", "x-offroad-storage-version"])(`${kind} rejects changed %s`, async key => {
    const f = fixture({"x-offroad-task-run-id": retained, [key]: org});
    await expect(read(f.sdk, {jobId: successorJob, capabilityToken: "current-lease"}, {recipeId: recipe, taskRunId: retained}, scope)).rejects.toThrow("scope mismatch");
  });
}

for (const [kind, read] of [["s11_revision_body", readCapitalS11RevisionBodyBytes], ["s11_revision_source", readCapitalS11RevisionSourceBytes]] as const) {
  it(`${kind} sends only exact retained target and current revision lease`, async () => {
    const f = fixture(); await read(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {retainedPayloadId: retained}, scope);
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", expect.objectContaining({body: {kind, retainedPayloadId: retained}}));
  });
  it(`${kind} rejects a substituted retained header`, async () => {
    const f = fixture({"x-offroad-retained-payload-id": org});
    await expect(read(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {retainedPayloadId: retained}, scope)).rejects.toThrow(/capital capture server/);
  });
}
it("S11 revision task uses the exact original run, with no invented recipe", async () => {
  const f = fixture({"x-offroad-task-run-id": retained});
  await readCapitalS11RevisionTaskBytes(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {taskRunId: retained}, scope);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", expect.objectContaining({body: {kind: "s11_revision_task", taskRunId: retained}}));
});
it("S11 revision task rejects another original run despite valid body headers", async () => {
  const f = fixture({"x-offroad-task-run-id": org});
  await expect(readCapitalS11RevisionTaskBytes(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {taskRunId: retained}, scope)).rejects.toThrow(/capital capture server/);
});

for (const [kind, read] of [["debt_revision_body", readCapitalDebtRevisionBodyBytes], ["debt_revision_source", readCapitalDebtRevisionSourceBytes]] as const) {
  it(`${kind} sends only exact retained target and current revision lease`, async () => {
    const f = fixture(); await read(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {retainedPayloadId: retained}, scope);
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", expect.objectContaining({body: {kind, retainedPayloadId: retained}}));
  });
  it(`${kind} rejects a substituted retained header`, async () => {
    const f = fixture({"x-offroad-retained-payload-id": org});
    await expect(read(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {retainedPayloadId: retained}, scope)).rejects.toThrow(/capital capture server/);
  });
}
it("C11 revision task uses the exact original run, with no invented recipe", async () => {
  const f = fixture({"x-offroad-task-run-id": retained});
  await readCapitalDebtRevisionTaskBytes(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {taskRunId: retained}, scope);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", expect.objectContaining({body: {kind: "debt_revision_task", taskRunId: retained}}));
});
it("C11 revision task rejects another original run despite valid body headers", async () => {
  const f = fixture({"x-offroad-task-run-id": org});
  await expect(readCapitalDebtRevisionTaskBytes(f.sdk, {jobId: successorJob, capabilityToken: "current-revision-lease"}, {taskRunId: retained}, scope)).rejects.toThrow(/capital capture server/);
});

for(const[kind,read]of[["debt_recovery",readCapitalDebtRecoveryBytes],["debt_recovery_source",readCapitalDebtRecoverySourceBytes]]as const){
 test(`C11 ${kind} sends exact retained identity with successor lease`,async()=>{const f=fixture();await read(f.sdk,{jobId:successorJob,capabilityToken:"current"},{recipeId:recipe,retainedPayloadId:retained},scope);expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read",expect.objectContaining({body:{kind,recipeId:recipe,retainedPayloadId:retained},headers:expect.objectContaining({"x-offroad-job-id":successorJob})}));});
 test.each(["x-offroad-recipe-id","x-offroad-retained-payload-id","x-offroad-object-id","x-offroad-storage-version"])(`C11 ${kind} rejects changed %s`,async key=>{const f=fixture({[key]:org});await expect(read(f.sdk,{jobId:successorJob,capabilityToken:"current"},{recipeId:recipe,retainedPayloadId:retained},scope)).rejects.toThrow("scope mismatch");});
}
test("C11 allocation client binds server recipe to exact allocation",async()=>{const f=fixture();await readCapitalDebtBodyBytes(f.sdk,{jobId:successorJob,capabilityToken:"current"},{recipeId:recipe},scope);expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read",expect.objectContaining({body:{kind:"debt_body",allocationId:allocation}}));});
test("C11 recovered task client binds original task run without impersonation",async()=>{const f=fixture({"x-offroad-task-run-id":retained});await readCapitalDebtRecoveredTaskBytes(f.sdk,{jobId:successorJob,capabilityToken:"current"},{recipeId:recipe,taskRunId:retained},scope);expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read",expect.objectContaining({body:{kind:"debt_recovered_task",recipeId:recipe,taskRunId:retained}}));});
test("C11 human result uses JWT WORK with no job/cap headers and rehashes bytes",async()=>{const f=fixture({"x-offroad-revision-id":retained,"x-offroad-final-fingerprint":digest});await readCapitalDebtResultBytes(f.sdk,{revisionId:retained,recipeId:recipe,finalFingerprint:digest},scope);expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read",{method:"POST",body:{kind:"debt_result",revisionId:retained},headers:{"x-offroad-workspace":org},timeout:10000});});
test.each(["x-offroad-revision-id","x-offroad-recipe-id","x-offroad-final-fingerprint","x-offroad-object-id","x-offroad-storage-version"])("C11 human refuses changed %s",async key=>{const f=fixture({"x-offroad-revision-id":retained,"x-offroad-final-fingerprint":digest,[key]:org});await expect(readCapitalDebtResultBytes(f.sdk,{revisionId:retained,recipeId:recipe,finalFingerprint:digest},scope)).rejects.toThrow("scope mismatch");});
test("C11 human rejects a malformed revision before invoking SDK",async()=>{const f=fixture();await expect(readCapitalDebtResultBytes(f.sdk,{revisionId:"arbitrary",recipeId:recipe,finalFingerprint:digest},scope)).rejects.toThrow("read denied");expect(f.invoke).not.toHaveBeenCalled();});


const previewIdentity={revisionId:retained,recipeId:recipe,workId:org,artifactId:allocation,finalFingerprint:"a".repeat(64)};
const previewHeaders={"x-offroad-revision-id":retained,"x-offroad-work-id":org,"x-offroad-artifact-id":allocation,"x-offroad-final-fingerprint":"a".repeat(64)};
it("human preview client binds exact current revision/run/work/artifact without worker headers",async()=>{
 const f=fixture(previewHeaders);expect(Buffer.from((await readCapitalPreviewResultBytes(f.sdk,previewIdentity,scope)).bytes).toString()).toBe(text);
 expect(f.invoke).toHaveBeenCalledWith("capital-body-read",{method:"POST",body:{kind:"preview_result",revisionId:retained},headers:{"x-offroad-workspace":org},timeout:10000});
});
for(const k of Object.keys(previewHeaders))it(`human preview client denies identity drift ${k}`,async()=>{
 const f=fixture({...previewHeaders,[k]:"wrong"});await expect(readCapitalPreviewResultBytes(f.sdk,previewIdentity,scope)).rejects.toThrow("scope mismatch");
});
