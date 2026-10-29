import {describe, expect, it, vi} from "vitest";
import type {UploadResult} from "@/lib/intake/upload-client";
import {finishAdvisorDocumentUpload} from "./upload-continuation";

const uploaded = [{}] as UploadResult["uploaded"];
const partial: UploadResult = {uploaded, duplicateCount: 0, failed: [{original_name: "faltou.pdf", reason: "upload"}], failure: "upload"};

describe("new-work upload continuation", () => {
  it("starts the registered siblings before returning the failed filename", async () => {
    const start = vi.fn(async () => ({ok: true as const}));
    expect(await finishAdvisorDocumentUpload(partial, start)).toEqual({failedFiles: ["faltou.pdf"], error: "upload"});
    expect(start).toHaveBeenCalledOnce();
  });
  it("allows a duplicate-only selection to recover interrupted processing", async () => {
    const start = vi.fn(async () => ({ok: true as const}));
    expect(await finishAdvisorDocumentUpload({uploaded: [], duplicateCount: 2, failed: [], failure: null}, start)).toEqual({failedFiles: [], error: null});
    expect(start).toHaveBeenCalledOnce();
  });
  it("does not request processing when no file was registered or already present", async () => {
    const start = vi.fn(async () => ({ok: true as const}));
    expect(await finishAdvisorDocumentUpload({...partial, uploaded: []}, start)).toEqual({failedFiles: ["faltou.pdf"], error: "upload"});
    expect(start).not.toHaveBeenCalled();
  });
  it("preserves named failures and the stable processing refusal", async () => {
    expect(await finishAdvisorDocumentUpload(partial, async () => ({ok: false, error: "denied"}))).toEqual({failedFiles: ["faltou.pdf"], error: "denied"});
    expect(await finishAdvisorDocumentUpload(partial, async () => {throw new Error("private transport detail");})).toEqual({failedFiles: ["faltou.pdf"], error: "processing"});
  });
});
