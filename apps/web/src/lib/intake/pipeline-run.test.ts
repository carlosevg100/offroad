import {describe, expect, it} from "vitest";

import {
  layerObjectPath,
  pipelineEnabledFor,
  readRunResult,
  signPipelineDocuments,
  PIPELINE_LINK_TTL_SECONDS,
} from "./pipeline-run";

const ORG = "20000000-0000-4000-8000-000000000001";
const SESSION = "40000000-0000-4000-8000-000000000003";
const DOCUMENT = "50000000-0000-4000-8000-000000000003";

/**
 * A Storage double that records what was asked of it.
 *
 * The URLs it returns carry the real Storage shape (`/storage/v1/object/sign/<bucket>/<path>`)
 * rather than a convenient placeholder, because that shape is now load-bearing: the database
 * refuses a link whose Storage path does not contain the object it claims to carry. A double
 * that returned something tidier would let this suite pass while every real run was refused. The real client is not exercised here —
 * whether a signed URL is actually accepted is a question for the policy, and
 * `supabase/tests/rls_non_interference.sql` answers it against a real database.
 */
function storageDouble(options: {failDownload?: boolean; failUpload?: boolean} = {}) {
  const calls: {bucket: string; kind: "download" | "upload"; path: string; expiresIn?: number; upsert?: boolean}[] = [];
  const supabase = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            calls.push({bucket, kind: "download", path, expiresIn});
            if (options.failDownload) return {data: null, error: {message: "denied"}};
            return {data: {signedUrl: `https://storage.invalid/storage/v1/object/sign/${bucket}/${path}?token=download`}, error: null};
          },
          async createSignedUploadUrl(path: string, uploadOptions?: {upsert?: boolean}) {
            calls.push({bucket, kind: "upload", path, upsert: uploadOptions?.upsert});
            if (options.failUpload) return {data: null, error: {message: "denied"}};
            return {data: {signedUrl: `https://storage.invalid/storage/v1/object/upload/sign/${bucket}/${path}?token=upload`, token: "upload", path}, error: null};
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
    expect(calls.filter((call) => call.kind === "upload").every((call) => call.upsert === true)).toBe(true);
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

describe("the links satisfy the rule the database enforces", () => {
  /**
   * `begin_processing_run` refuses a link whose Storage path does not contain the object it
   * claims to carry, and refuses a layer path outside `<organization>/<session>/`. That check
   * is what stops a tenant pointing the worker at the ECS credential endpoint, and it means the
   * naming here is no longer a private convention: rename a bucket or reorder a path segment
   * and every real run is refused, with nothing in this suite noticing. So the rule is asserted
   * on this side too, in the same words.
   */
  const carriesObject = (url: string, objectPath: string) => {
    const storageAt = url.indexOf("/storage/v1/");
    return storageAt !== -1 && url.indexOf(objectPath) > storageAt;
  };

  it("names the document in the download link and the layer in the upload link", async () => {
    const {supabase} = storageDouble();
    const objectPath = `${ORG}/${SESSION}/one.pdf`;
    const result = await signPipelineDocuments({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow double of the Storage surface used here
      supabase: supabase as any,
      organizationId: ORG,
      sessionId: SESSION,
      documents: [{id: DOCUMENT, object_path: objectPath}],
      newAttemptId: () => "70000000-0000-4000-8000-000000000001",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [entry] = result.value;
    expect(entry).toBeDefined();
    expect(carriesObject(entry!.download_url, objectPath)).toBe(true);
    expect(carriesObject(entry!.layer_upload_url, entry!.layer_object_path)).toBe(true);
    expect(entry!.layer_object_path.startsWith(`${ORG}/${SESSION}/`)).toBe(true);
  });
});
