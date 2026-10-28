import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {ModelGateway} from "@offroad/model-gateway";
import {processDocumentFolderReadingJob} from "./document-folder-reading-job";
import type {DocumentFolderReadingJob, QueueClient} from "./queue";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const doc = "a0000000-0000-4000-8000-000000000001", version = "document-folder-reading.2026.10.27-v1", context = {registry: [{id: "aurora", label: "Aurora Alimentos", groupLabel: "Grupo Aurora"}]};
const pdf = (texts: string[]) => new TextEncoder().encode(JSON.stringify({kind: "pdf", documentId: doc, documentVersion: 1, scaleDeclarations: [], stats: {pageCount: texts.length},
  pages: texts.map((t, k) => t ? {n: k + 1, blocks: [{id: `p${k + 1}.b1`, kind: "text", text: t}], tables: [], scanned: false} : {n: k + 1, blocks: [], tables: [], scanned: true})}));
const job = (attempt = 1) => ({claimed: true, job_id: "b0000000-0000-4000-8000-000000000001", capability_token: "c".repeat(64), lease_expires_at: "2026-10-28T18:00:00.000Z", attempt,
  kind: "document_folder_reading", organization_id: "c0000000-0000-4000-8000-000000000001", intake_session_id: "d0000000-0000-4000-8000-000000000001",
  processing_run_id: "e0000000-0000-4000-8000-000000000001",
  payload: {source_document_id: doc, sha256: "1".repeat(64), reader_version: version, context_fingerprint: "2".repeat(64), context, model_budget: {max_calls: 2, max_cost_usd: 1.7}}}) as unknown as DocumentFolderReadingJob;
const extraction = {legible: true, kind: "trial_balance", description: "Balancete", entity: {registryId: "aurora", outsideRegistryName: null, label: "Individual"},
  period: {label: "mar/26", start: "2026-03-01", end: "2026-03-31"}, perimeter: "individual", version: {label: "Balancete", status: "management", ordinal: null, lastUpdated: null},
  referenceDate: null, instrument: null, asset: null, substitutesPages: null, expectedContent: [], units: [], figures: [], clauses: [], observations: [], debtTable: null};

function harness(bytes: Uint8Array, o: {answer?: () => unknown; layerSha?: string; inputSha?: string} = {}) {
  const recorded: unknown[] = [], completed: unknown[] = [], failed: {retryable?: boolean}[] = [], texts: string[] = [];
  const queue = {
    loadDocumentFolderReadingInput: async () => ({sourceDocumentId: doc, sha256: o.inputSha ?? "1".repeat(64), mimeType: "application/pdf", readerVersion: version,
      contextFingerprint: "2".repeat(64), context, layerObjectPath: "org/layers/a.json", layerSha256: o.layerSha ?? sha(bytes)}),
    downloadDocumentFolderLayer: async () => bytes,
    recordDocumentFolderReading: async (_j: unknown, outcome: unknown) => {recorded.push(outcome); return {recorded: true, resumed: 0};},
    complete: async (_j: unknown, r: unknown) => {completed.push(r);}, fail: async (_j: unknown, _e: unknown, opts: {retryable?: boolean}) => {failed.push(opts);},
  } as unknown as QueueClient;
  const gateway = {complete: async (request: {input: {text: string}[]}) => {texts.push(request.input[0]!.text); return {output: (o.answer ?? (() => extraction))()};},
    spent: () => ({costUsd: 0, calls: texts.length, unknownCostCalls: 0, budgetExposureUsd: 0})} as unknown as ModelGateway;
  return {queue, gateway, recorded, completed, failed, texts, log: () => {}};
}

describe("folder reading job (ficha C09)", () => {
  it("reads the stored layer of its file by text, never its name, and records the reading once with the pages without text", async () => {
    const h = harness(pdf(["Balancete de março", ""]));
    expect((await processDocumentFolderReadingJob(job(), h)).status).toBe("succeeded");
    expect(h.texts).toHaveLength(1);
    expect(h.texts[0]).toContain("Balancete de março");
    expect(JSON.parse(h.texts[0]!).registry).toEqual(context.registry);
    expect(h.recorded).toEqual([{status: "ready", reading: {extraction, pageCount: 2, pagesWithoutText: [2]}}]);
    expect(h.completed).toHaveLength(1);
  });
  it("refuses by name a file without text and one the extraction does not read, without leaving it pending", async () => {
    const blank = harness(pdf(["", ""]));
    await processDocumentFolderReadingJob(job(), blank);
    expect([blank.texts, blank.recorded]).toEqual([[], [{status: "refused", refusalCode: "unreadable"}]]);
    const bad = harness(pdf(["Texto"]), {answer: () => ({nonsense: true})});
    await processDocumentFolderReadingJob(job(), bad);
    expect(bad.recorded).toEqual([{status: "refused", refusalCode: "reading"}]);
  });
  it("reads only the bytes the database recorded, retries a provider failure once and then names the refusal", async () => {
    const changed = harness(pdf(["Texto"]), {layerSha: "9".repeat(64)});
    await processDocumentFolderReadingJob(job(), changed);
    expect([changed.recorded, changed.texts, changed.failed]).toEqual([[], [], [{retryable: false}]]);
    const other = harness(pdf(["Texto"]), {inputSha: "8".repeat(64)});
    await processDocumentFolderReadingJob(job(), other);
    expect([other.recorded, other.failed]).toEqual([[], [{retryable: false}]]);
    const down = () => {throw new Error("provider down");};
    const first = harness(pdf(["Texto"]), {answer: down});
    await processDocumentFolderReadingJob(job(1), first);
    expect([first.recorded, first.failed]).toEqual([[], [{retryable: true}]]);
    const last = harness(pdf(["Texto"]), {answer: down});
    await processDocumentFolderReadingJob(job(2), last);
    expect([last.recorded, last.failed]).toEqual([[{status: "refused", refusalCode: "reading"}], []]);
  });
});
