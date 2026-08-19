import {describe, expect, it} from "vitest";

import {
  layerObjectPath,
  pipelineRunsEnabled,
  readRunResult,
  signPipelineDocuments,
  PIPELINE_LINK_TTL_SECONDS,
} from "./pipeline-run";

const ORG = "20000000-0000-4000-8000-000000000001";
const SESSION = "40000000-0000-4000-8000-000000000003";
const DOCUMENT = "50000000-0000-4000-8000-000000000003";

/**
 * A Storage double that records what was asked of it. The real client is not exercised here —
 * whether a signed URL is actually accepted is a question for the policy, and
 * `supabase/tests/rls_non_interference.sql` answers it against a real database.
 */
function storageDouble(options: {failDownload?: boolean; failUpload?: boolean} = {}) {
  const calls: {bucket: string; kind: "download" | "upload"; path: string; expiresIn?: number}[] = [];
  const supabase = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            calls.push({bucket, kind: "download", path, expiresIn});
            if (options.failDownload) return {data: null, error: {message: "denied"}};
            return {data: {signedUrl: `https://storage.invalid/${bucket}/${path}?token=download`}, error: null};
          },
          async createSignedUploadUrl(path: string) {
            calls.push({bucket, kind: "upload", path});
            if (options.failUpload) return {data: null, error: {message: "denied"}};
            return {data: {signedUrl: `https://storage.invalid/${bucket}/${path}?token=upload`, token: "upload", path}, error: null};
          },
        };
      },
    },
  };
  return {supabase, calls};
}

describe("pipeline run links", () => {
  it("keeps the tenant and the session as the first two path segments", () => {
    const path = layerObjectPath({organizationId: ORG, sessionId: SESSION, sourceDocumentId: DOCUMENT, attemptId: "attempt-1"});
    expect(path).toBe(`${ORG}/${SESSION}/${DOCUMENT}/attempt-1.json`);
    // The storage policies read folder 1 as the organization and folder 2 as the scope; if
    // this order ever changes, one tenant can mint an upload link into another's prefix.
    expect(path.split("/")[0]).toBe(ORG);
    expect(path.split("/")[1]).toBe(SESSION);
  });

  it("gives every attempt its own object, so the bucket never needs update rights", () => {
    const first = layerObjectPath({organizationId: ORG, sessionId: SESSION, sourceDocumentId: DOCUMENT, attemptId: "a"});
    const second = layerObjectPath({organizationId: ORG, sessionId: SESSION, sourceDocumentId: DOCUMENT, attemptId: "b"});
    expect(first).not.toBe(second);
  });

  it("signs a download and an upload link per document, in the right buckets", async () => {
    const {supabase, calls} = storageDouble();
    let attempt = 0;
    const result = await signPipelineDocuments({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow double of the Storage surface used here
      supabase: supabase as any,
      organizationId: ORG,
      sessionId: SESSION,
      documents: [
        {id: DOCUMENT, object_path: `${ORG}/${SESSION}/one.pdf`},
        {id: "50000000-0000-4000-8000-000000000004", object_path: `${ORG}/${SESSION}/two.xlsx`},
      ],
      newAttemptId: () => `attempt-${++attempt}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.layer_object_path).toBe(`${ORG}/${SESSION}/${DOCUMENT}/attempt-1.json`);
    expect(result.value[0]?.download_url).toContain("opportunity-documents");
    expect(result.value[0]?.layer_upload_url).toContain("document-layers");

    expect(calls.filter((call) => call.kind === "download").every((call) => call.bucket === "opportunity-documents")).toBe(true);
    expect(calls.filter((call) => call.kind === "upload").every((call) => call.bucket === "document-layers")).toBe(true);
    expect(calls.find((call) => call.kind === "download")?.expiresIn).toBe(PIPELINE_LINK_TTL_SECONDS);
  });

  it("refuses the whole run when a single link cannot be signed", async () => {
    for (const failure of [{failDownload: true}, {failUpload: true}]) {
      const {supabase} = storageDouble(failure);
      const result = await signPipelineDocuments({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow double of the Storage surface used here
        supabase: supabase as any,
        organizationId: ORG,
        sessionId: SESSION,
        documents: [{id: DOCUMENT, object_path: `${ORG}/${SESSION}/one.pdf`}],
      });
      expect(result).toEqual({ok: false, error: "processing"});
    }
  });
});

describe("pipeline run switch", () => {
  it("stays off unless the deployment turns it on", () => {
    expect(pipelineRunsEnabled({})).toBe(false);
    expect(pipelineRunsEnabled({PIPELINE_RUNS_ENABLED: ""})).toBe(false);
    expect(pipelineRunsEnabled({PIPELINE_RUNS_ENABLED: "false"})).toBe(false);
    expect(pipelineRunsEnabled({PIPELINE_RUNS_ENABLED: "1"})).toBe(false);
    expect(pipelineRunsEnabled({PIPELINE_RUNS_ENABLED: "true"})).toBe(true);
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
