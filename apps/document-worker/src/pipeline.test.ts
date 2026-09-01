import {describe, expect, it, vi} from "vitest";
import {processDocumentJob, type PipelineDependencies} from "./pipeline";
import {createClamdScanner, runGate, sha256Of, verifyIntegrity, GateError, type Scanner} from "./scan";
import {parseTesseractTsv} from "./tools";
import type {DocumentJob} from "./queue";
import {ModelGatewayError} from "@offroad/model-gateway";

const bytes = new TextEncoder().encode(
  "Rede Horizonte Ltda\nDemonstracao do resultado\nValores em R$ milhoes\nReceita liquida 185,4\n",
);

function job(overrides: Partial<DocumentJob["payload"]> = {}): DocumentJob {
  return {
    claimed: true,
    job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    capability_token: "c".repeat(64),
    lease_expires_at: new Date(Date.now() + 600_000).toISOString(),
    attempt: 1,
    kind: "document_pipeline",
    organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    intake_session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    processing_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    payload: {
      source_document_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      document_version: 1,
      original_name: "dre.csv",
      mime_type: "text/csv",
      byte_size: bytes.byteLength,
      sha256: sha256Of(bytes),
      object_path: "org/session/dre.csv",
      download_url: "https://storage.example/signed/dre.csv",
      layer_object_path: "org/session/dre.layer.json",
      layer_upload_url: "https://storage.example/signed/upload",
      locale: "pt-BR",
      ...overrides,
    },
  };
}

function fakes(overrides: Partial<PipelineDependencies> = {}) {
  const calls = {
    stages: [] as {stage: string; status: string}[],
    documents: [] as unknown[],
    completed: [] as unknown[],
    failed: [] as {error: {reason?: string}; options?: {retryable?: boolean}}[],
    uploaded: [] as number[],
    candidates: [] as unknown[][],
    retrievalChunks: [] as unknown[][],
    receivablesEvidence: [] as unknown[],
  };

  const deps: PipelineDependencies = {
    queue: {
      claim: async () => null,
      heartbeat: async () => {},
      writeStage: async (_job, stage, status) => {
        calls.stages.push({stage, status});
      },
      startCapitalTask: async () => "11111111-1111-4111-8111-111111111111",
      recordCapitalProjectArtifact: async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        artifactFingerprint: "a".repeat(64),
        artifactVersion: 1,
        replayed: false,
      }),
      finishCapitalTask: async (_job, input) => input.taskRunId,
      recordDocument: async (_job, input) => {
        calls.documents.push(input);
      },
      recordCandidates: async (_job, candidates) => {
        calls.candidates.push(candidates);
        return {written: candidates.length, replaced: 0};
      },
      recordRetrievalChunks: async (_job, chunks) => {
        calls.retrievalChunks.push(chunks);
        return {written: chunks.length, sourceDocumentId: job().payload.source_document_id};
      },
      recordReceivablesEvidence: async (_job, input) => {
        calls.receivablesEvidence.push(input);
        return {
          written: true,
          replayed: false,
          source_document_id: job().payload.source_document_id,
          content_sha256: input.contentSha256,
        };
      },
      loadIntakeEvents: async () => [],
      recordIntakeRequestLadders: async () => {},
      recordAnalysisScopeSuggestions: async () => ({}),
      documentAdvisorAuthorization: async () => ({}),
      loadPreliminaryInput: async () => ({}),
      loadCaseInput: async () => ({}),
      loadRetrievalContext: async () => ({playbook_version: null, results: [], abstained: true}),
      recordPublicResearch: async () => "ffffffff-ffff-4fff-8fff-ffffffffffff",
      recordPreliminaryUnderstanding: async () => "f2000000-0000-4000-8000-000000000001",
      recordDealStateObject: async () => "f1000000-0000-4000-8000-000000000001",
      recordCaseSnapshot: async () => "manifest-id",
      recordControlledExecution: async () => "execution-id",
      loadAgentContext: async () => ({}),
      loadCapitalProjectContext: async () => ({}),
      recordAgentResponse: async () => ({}),
      recordAgentFailure: async () => {},
      complete: async (_job, result) => {
        calls.completed.push(result);
      },
      fail: async (_job, error, options) => {
        calls.failed.push({error: error as {reason?: string}, options: options ?? {}});
      },
    },
    download: async () => bytes,
    uploadLayer: async (_url, body) => {
      calls.uploaded.push(body.byteLength);
    },
    scanner: {name: "fake", scan: async () => ({clean: true})},
    classify: async () => ({
      profile: {
        document_kind: "management_accounts",
        information_class: "management",
        evidence_rank: 4,
        confidence: 0.91,
      },
      usage: {classifyCostUsd: 0.002},
    }),
    now: () => "2026-08-18T12:00:00.000Z",
    ...overrides,
  };

  return {deps, calls};
}

describe("the gate runs before anything reads the file", () => {
  it("refuses content that does not match the hash recorded at upload", () => {
    expect(() => verifyIntegrity(bytes, {sha256: "0".repeat(64)})).toThrow(GateError);
    expect(() => verifyIntegrity(bytes, {byteSize: 999})).toThrow(/999 were recorded/);
    expect(verifyIntegrity(bytes, {sha256: sha256Of(bytes), byteSize: bytes.byteLength})).toBe(sha256Of(bytes));
  });

  it("stops an infected document permanently instead of retrying it", async () => {
    const infected: Scanner = {name: "fake", scan: async () => ({clean: false, signature: "Eicar-Test-Signature"})};
    const {deps, calls} = fakes({scanner: infected});

    const outcome = await processDocumentJob(job(), deps);

    expect(outcome.status).toBe("failed");
    expect(calls.failed[0]?.error.reason).toBe("infected");
    // retrying a scan of the same bytes can only reach the same verdict
    expect(calls.failed[0]?.options?.retryable).toBe(false);
    // the verdict reaches the document, so the sender sees why it was rejected
    expect(calls.documents[0]).toMatchObject({scanResult: {verdict: "infected", signature: "Eicar-Test-Signature"}});
    // and nothing was parsed or stored
    expect(calls.uploaded).toEqual([]);
  });

  it("retries when the scanner is unreachable rather than assuming the file is clean", async () => {
    const broken: Scanner = {
      name: "fake",
      scan: async () => {
        throw new GateError("connection refused", "scanner_unavailable", true);
      },
    };
    const {deps, calls} = fakes({scanner: broken});

    const outcome = await processDocumentJob(job(), deps);

    expect(outcome.status).toBe("failed");
    expect(calls.failed[0]?.options?.retryable).toBe(true);
    expect(calls.uploaded).toEqual([]);
  });

  it("records that no scanner ran when an operator disabled it", async () => {
    const verdict = await runGate(bytes, {}, null, () => "2026-08-18T12:00:00.000Z");
    expect(verdict).toMatchObject({verdict: "error", scanner: "none", signature: "scanner_disabled"});
  });
});

describe("a healthy document goes through every stage", () => {
  it("gates, parses, stores the layer, profiles and completes", async () => {
    const {deps, calls} = fakes();

    const outcome = await processDocumentJob(job(), deps);

    expect(outcome.status).toBe("succeeded");
    expect(calls.stages.filter((entry) => entry.status === "succeeded").map((entry) => entry.stage)).toEqual([
      "download",
      "gate",
      "parse",
      "store_receivables_evidence",
      "store_layer",
      "profile",
      "usage",
      "index_retrieval",
      "prepare_requests",
    ]);

    // the layer really was uploaded, and its size is what got recorded
    expect(calls.uploaded[0]).toBeGreaterThan(50);
    expect(calls.completed[0]).toMatchObject({document_kind: "management_accounts"});

    const recorded = calls.documents.at(-1) as {layer?: {object_path: string; parser_versions: Record<string, string>}};
    expect(recorded.layer?.object_path).toBe("org/session/dre.layer.json");
    expect(Object.keys(recorded.layer?.parser_versions ?? {}).length).toBeGreaterThan(0);
    expect(calls.retrievalChunks).toHaveLength(1);
    expect(calls.receivablesEvidence).toHaveLength(1);
    expect(calls.receivablesEvidence[0]).toMatchObject({
      contentKind: "document_layer",
      sourceSha256: sha256Of(bytes),
      schemaVersion: "2026.08.28-v1",
    });
    expect(calls.retrievalChunks[0]?.[0]).toMatchObject({
      chunk_key: expect.stringContaining("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:v1"),
      locale: "pt-BR",
      source_anchor: {kind: "sheet"},
    });
  });

  it("reports the run timeline stage by stage, so the screen can show progress", async () => {
    const {deps, calls} = fakes();
    await processDocumentJob(job(), deps);

    const started = calls.stages.filter((entry) => entry.status === "started").map((entry) => entry.stage);
    expect(started).toContain("download");
    expect(started).toContain("gate");
    expect(started).toContain("parse");
  });

  it("does not send a large operational tape cell by cell to the model", async () => {
    const rows = Array.from(
      {length: 900},
      (_, index) => `${index + 1},Sacado ${index + 1},100,2026-08-31,aberto,BRL`,
    );
    const largeTape = new TextEncoder().encode([
      "titulo,sacado,valor,vencimento,status,moeda",
      ...rows,
    ].join("\n"));
    const extract = vi.fn(async () => ({
      candidates: [],
      absentFields: [],
      malformed: 0,
      chunks: {total: 1, failed: 0},
    }));
    const {deps, calls} = fakes({
      download: async () => largeTape,
      extract,
      classify: async () => ({
        profile: {
          document_kind: "receivables_aging",
          information_class: "accounting",
          evidence_rank: 3,
          confidence: 0.96,
        },
      }),
    });

    const outcome = await processDocumentJob(job({
      original_name: "titulos.csv",
      byte_size: largeTape.byteLength,
      sha256: sha256Of(largeTape),
    }), deps);

    expect(outcome.status).toBe("succeeded");
    expect(extract).not.toHaveBeenCalled();
    expect(calls.candidates).toEqual([]);
    expect(calls.retrievalChunks).toHaveLength(1);
    expect(calls.retrievalChunks[0]).toHaveLength(1);
    expect(calls.retrievalChunks[0]?.[0]).toMatchObject({
      source_anchor: {representation: "schema_digest"},
      tags: expect.arrayContaining(["operational_tape", "schema_digest", "full_evidence_preserved"]),
    });
    expect(calls.completed[0]).toMatchObject({
      extraction: {
        mode: "deterministic_only",
        reason: "high_volume_tabular_dataset",
      },
    });
    expect(calls.stages).toContainEqual({stage: "extract", status: "succeeded"});
  });
});

describe("failures are classified by whether retrying could ever help", () => {
  it("does not retry a document that cannot be read", async () => {
    const {deps, calls} = fakes({download: async () => new Uint8Array(0)});
    // an empty file makes the parser refuse; a retry would deliver the same empty file
    const outcome = await processDocumentJob(job({sha256: sha256Of(new Uint8Array(0)), byte_size: 0}), deps);

    expect(outcome.status).toBe("failed");
    expect(calls.failed[0]?.options?.retryable).toBe(false);
    expect(calls.failed[0]?.error.reason).toBe("unreadable_document");
  });

  it("retries a transient network failure", async () => {
    const {deps, calls} = fakes({
      download: async () => {
        throw new Error("fetch failed: ETIMEDOUT");
      },
    });

    await processDocumentJob(job(), deps);
    expect(calls.failed[0]?.options?.retryable).toBe(true);
    expect(calls.failed[0]?.error.reason).toBe("transient_error");
  });

  it("treats an expired signed URL as retryable, because the next run mints a new one", async () => {
    const {deps, calls} = fakes();
    await processDocumentJob(job({download_url: undefined}), deps);
    expect(calls.failed[0]?.options?.retryable).toBe(true);
  });

  it("never lets a classifier failure lose the work already done", async () => {
    const {deps, calls} = fakes({
      classify: async () => {
        throw new Error("provider 503");
      },
    });

    await processDocumentJob(job(), deps);

    // the layer was stored before the model was called, and the scan verdict was recorded
    expect(calls.uploaded.length).toBe(1);
    expect(calls.documents[0]).toMatchObject({scanResult: {verdict: "clean"}});
    expect(calls.failed[0]?.options?.retryable).toBe(true);
  });
});

describe("OCR output from tesseract", () => {
  it("groups words into blocks and averages their confidence", () => {
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t10\t20\t50\t12\t96\tReceita",
      "5\t1\t1\t1\t1\t2\t65\t20\t40\t12\t92\tliquida",
      "5\t1\t2\t1\t1\t1\t10\t60\t80\t12\t41\t1B5.4OO",
    ].join("\n");

    const result = parseTesseractTsv(tsv);

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]?.text).toBe("Receita liquida");
    expect(result.blocks[0]?.confidence).toBeCloseTo(0.94, 2);
    expect(result.blocks[0]?.bbox).toEqual([10, 20, 105, 32]);
    // the garbled block keeps its low confidence, which is what excludes it downstream
    expect(result.blocks[1]?.confidence).toBeCloseTo(0.41, 2);
  });

  it("survives an empty or headerless answer", () => {
    expect(parseTesseractTsv("")).toEqual({blocks: [], confidence: 0});
  });
});

describe("clamd client", () => {
  it("reports the scanner as unavailable instead of guessing clean", async () => {
    const scanner = createClamdScanner({host: "127.0.0.1", port: 1, timeoutMs: 500});
    await expect(scanner.scan(bytes)).rejects.toMatchObject({code: "scanner_unavailable", retryable: true});
  });
});

describe("logging", () => {
  it("never receives document text", async () => {
    const log = vi.fn();
    const {deps} = fakes({log});
    await processDocumentJob(job(), deps);

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("Receita");
    expect(logged).not.toContain("185");
  });
});

describe("what a document cost travels with its outcome", () => {
  it("reports the spend when the job succeeds", async () => {
    const {deps, calls} = fakes({spend: () => ({costUsd: 1.234, calls: 7})});
    await processDocumentJob(job(), deps);
    expect(calls.completed[0]).toMatchObject({spend: {costUsd: 1.234, calls: 7}});
  });

  it("reports the spend when the job fails, which is the case that matters", async () => {
    // A document that burns four dollars and then fails is exactly the one worth seeing, and a
    // ledger that counted only successes would show the cheapest possible version of the truth.
    const {deps, calls} = fakes({
      spend: () => ({costUsd: 4.1, calls: 22}),
      scanner: {name: "fake", scan: async () => ({clean: false, signature: "Eicar-Test-Signature"})},
    });
    await processDocumentJob(job(), deps);
    expect(calls.failed[0]?.error).toMatchObject({spend: {costUsd: 4.1, calls: 22}});
  });

  it("stops a document that exhausts its allowance, and does not retry it", async () => {
    // A fresh gateway per attempt means the allowance resets, so retrying a document that
    // already spent its ceiling simply spends it again. This one needs a person.
    const {deps, calls} = fakes({
      spend: () => ({costUsd: 5, calls: 31}),
      classify: async () => {
        throw new ModelGatewayError("cost budget exhausted (5.0000/5)", "budget_exceeded", {costUsd: 5});
      },
    });

    const outcome = await processDocumentJob(job(), deps);

    expect(outcome.status).toBe("failed");
    expect(calls.failed[0]?.error).toMatchObject({reason: "model_budget_exceeded"});
    expect(calls.failed[0]?.options).toMatchObject({retryable: false});
  });

  it("says nothing about spend when nothing is measuring it", async () => {
    const {deps, calls} = fakes();
    await processDocumentJob(job(), deps);
    expect(calls.completed[0]).not.toHaveProperty("spend");
  });

  it("persists content-free model lineage with the job result", async () => {
    const call = {
      invocationId: "11111111-1111-4111-8111-111111111111",
      task: "extract_fields" as const,
      provider: "openai" as const,
      model: "gpt-5.6-terra",
      effort: "medium" as const,
      outcome: "ok" as const,
      promptFingerprint: "1".repeat(64),
      inputFingerprint: "2".repeat(64),
      outputFingerprint: "3".repeat(64),
      usage: {inputTokens: 10, outputTokens: 2, cachedInputTokens: 0},
      costUsd: 0.01,
      costStatus: "measured" as const,
      latencyMs: 12,
      stopReason: "end" as const,
      usedFallback: false,
      fromCassette: false,
      schemaName: "facts",
    };
    const {deps, calls} = fakes({lineage: () => [call]});
    await processDocumentJob(job(), deps);
    expect(calls.completed[0]).toMatchObject({model_lineage: [call]});
  });
});
