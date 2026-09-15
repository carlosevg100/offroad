import {describe, expect, it} from "vitest";

import {
  pipelineEnabledFor,
  readRunResult,
  preparePipelineDocuments,
  startProcessingRun,
  DEFAULT_RUN_BUDGET,
  PIPELINE_VERSION,
} from "./pipeline-run";

const ORG = "20000000-0000-4000-8000-000000000001";
const SESSION = "40000000-0000-4000-8000-000000000003";
const DOCUMENT = "50000000-0000-4000-8000-000000000003";

function storageDouble() {
  const calls: string[] = [];
  return {calls, supabase: {storage: {from() {
    calls.push("forbidden storage request");
    throw new Error("the web must not mint worker bearer access");
  }}}};
}

describe("pipeline resource references", () => {
  it("never forwards storage locations or bearer tokens to the job", () => {
    expect(preparePipelineDocuments([{id: DOCUMENT, object_path: "http://169.254.170.2/credentials"}])).toEqual([{source_document_id: DOCUMENT}]);
  });
});

describe("pipeline run switch", () => {
  it("is off for an organization that was not promoted, and for one that could not be read", () => {
    expect(pipelineEnabledFor({pipeline_enabled: false})).toBe(false);
    expect(pipelineEnabledFor({})).toBe(false);
    expect(pipelineEnabledFor({pipeline_enabled: null})).toBe(false);
    // A failed read must never be mistaken for permission: falling back to the fixture is the
    // safe answer, since a run with no worker behind it parks the session in `processing`.
    expect(pipelineEnabledFor(null)).toBe(false);
    expect(pipelineEnabledFor(undefined)).toBe(false);
  });

  it("is on only for an organization explicitly promoted", () => {
    expect(pipelineEnabledFor({pipeline_enabled: true})).toBe(true);
    expect(pipelineEnabledFor({pipeline_enabled: true, rollout_state: "shadow"})).toBe(true);
    expect(pipelineEnabledFor({pipeline_enabled: true, rollout_state: "canary"})).toBe(true);
    expect(pipelineEnabledFor({pipeline_enabled: true, rollout_state: "active"})).toBe(true);
    expect(pipelineEnabledFor({pipeline_enabled: true, rollout_state: "paused"})).toBe(false);
    expect(pipelineEnabledFor({pipeline_enabled: true, rollout_state: "off"})).toBe(false);
    expect(pipelineEnabledFor({pipeline_enabled: false, rollout_state: "active"})).toBe(false);
  });
});

describe("begin_processing_run result", () => {
  it("reads the ids it recognises and invents nothing for the rest", () => {
    expect(readRunResult({processing_run_id: "run-1", run_no: 2, job_ids: ["job-1", "job-2"]})).toEqual({
      processingRunId: "run-1",
      runNo: 2,
      jobIds: ["job-1", "job-2"],
    });
    expect(readRunResult({job_ids: [1, "job-1", null]})).toEqual({processingRunId: "", runNo: 0, jobIds: ["job-1"]});
    expect(readRunResult(null)).toEqual({processingRunId: "", runNo: 0, jobIds: []});
    expect(readRunResult("unexpected")).toEqual({processingRunId: "", runNo: 0, jobIds: []});
  });
});

function runDouble(input: {documents: Array<{id: string; object_path: string; processing_status: string}>; pipelineVersion: string | null}) {
  const {supabase: storage, calls: storageCalls} = storageDouble();
  const rpcCalls: Array<{name: string; args: Record<string, unknown>}> = [];
  const queryFor = (table: string) => {
    const result = table === "source_documents"
      ? {data: input.documents, error: null}
      : {data: {pipeline_version: input.pipelineVersion}, error: null};
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = async () => result;
    chain.maybeSingle = async () => result;
    return chain;
  };
  const supabase = {
    ...storage,
    from: queryFor,
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({name, args});
      return {data: {processing_run_id: "run-1", run_no: 7, job_ids: ["job-1"]}, error: null};
    },
  };
  return {supabase, rpcCalls, storageCalls};
}

describe("incremental processing", () => {
  it("does not schedule or repay ready immutable documents under the same pipeline contract", async () => {
    const runtime = runDouble({
      documents: [{id: DOCUMENT, object_path: `${ORG}/${SESSION}/ready.pdf`, processing_status: "ready"}],
      pipelineVersion: PIPELINE_VERSION,
    });
    const result = await startProcessingRun({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- focused Supabase double
      supabase: runtime.supabase as any,
      organizationId: ORG,
      sessionId: SESSION,
      trigger: "reprocess",
    });
    expect(result.ok).toBe(true);
    expect(runtime.storageCalls).toHaveLength(0);
    expect(runtime.rpcCalls[0]?.args).toMatchObject({p_documents: [], p_budget: DEFAULT_RUN_BUDGET});
  });

  it("schedules only failed or new documents, unless the pipeline contract changed", async () => {
    const ready = {id: DOCUMENT, object_path: `${ORG}/${SESSION}/ready.pdf`, processing_status: "ready"};
    const failed = {id: "50000000-0000-4000-8000-000000000004", object_path: `${ORG}/${SESSION}/failed.pdf`, processing_status: "failed"};
    const incremental = runDouble({documents: [ready, failed], pipelineVersion: PIPELINE_VERSION});
    await startProcessingRun({supabase: incremental.supabase as never, organizationId: ORG, sessionId: SESSION, trigger: "reprocess"});
    expect(incremental.storageCalls).toHaveLength(0);
    expect(incremental.rpcCalls[0]?.args.p_documents).toEqual([{source_document_id: failed.id}]);

    const rebuild = runDouble({documents: [ready, failed], pipelineVersion: "older-contract"});
    await startProcessingRun({supabase: rebuild.supabase as never, organizationId: ORG, sessionId: SESSION, trigger: "reprocess"});
    expect(rebuild.storageCalls).toHaveLength(0);
    expect(rebuild.rpcCalls[0]?.args.p_documents).toEqual([{source_document_id: ready.id}, {source_document_id: failed.id}]);
  });
});
