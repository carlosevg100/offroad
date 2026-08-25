import {
  ParserError,
  parseDocument,
  type OcrEngine,
  type DocumentConverter,
  type ParseResult,
} from "@offroad/document-parsers";
import type {Classifier, DocumentProfile} from "@offroad/document-classification";
import {buildCaseChunks} from "@offroad/governed-retrieval";
import {ModelGatewayError, type GatewayCallLog} from "@offroad/model-gateway";
import {GateError, runGate, type ScanVerdict, type Scanner} from "./scan";
import type {DocumentJob, QueueClient} from "./queue";
import {prepareWorkerIntakeRequests} from "./intake-requests";
import {buildScopeSuggestionInputs, deterministicJobEventId} from "./intake-governance";

/**
 * What happens to one document, start to finish (P1 plan §5, stages E0–E1).
 *
 *   gate → parse → layer stored → profile → recorded
 *
 * Written against injected dependencies so the whole flow is testable without a network, a
 * container or an LLM. Every stage reports itself on the run timeline as it goes, because the
 * screen the user watches is that timeline: a document that takes ninety seconds must show
 * *why* it is taking ninety seconds, not a spinner.
 *
 * Failure is a first-class outcome here. A file that fails the gate is not an error to
 * swallow — it is a fact about the document that the sender has to see and act on, so it
 * ends up on the document and the run, not only in the worker's log.
 */
// The classifier and its contract live in `@offroad/document-classification` (stage E1), beside
// the extractor in `@offroad/document-extraction` (stage E3). Re-exported here because the
// worker's own modules refer to them and should not have to care where a stage lives.
export type {Classifier, DocumentProfile};

/** What the extractor gives back: candidates already checked against the document they cite. */
export type ExtractedCandidates = {
  candidates: Array<Record<string, unknown>>;
  absentFields: string[];
  malformed: number;
  chunks: {total: number; failed: number};
  usage?: Record<string, number>;
};

export type Extractor = (input: {
  parsed: ParseResult;
  profile: DocumentProfile;
  fileName: string;
  locale?: string;
}) => Promise<ExtractedCandidates>;

export type PipelineDependencies = {
  queue: QueueClient;
  download: (url: string) => Promise<Uint8Array>;
  uploadLayer: (url: string, body: Uint8Array) => Promise<void>;
  scanner: Scanner | null;
  converter?: DocumentConverter;
  ocr?: OcrEngine;
  classify: Classifier;
  /** Optional: without it the worker still reads and profiles, it just proposes nothing. */
  extract?: Extractor;
  now?: () => string;
  /**
   * What this job has spent so far, read at the moment the job is reported.
   *
   * Reported on failure as well as on success, and that is the point: a document that burns
   * four dollars and then fails is exactly the one worth seeing, and a ledger that only counts
   * successes would show the cheapest possible version of the truth.
   */
  spend?: () => {costUsd: number; calls: number};
  /** Content-free fingerprints for every model attempt made by this job. */
  lineage?: () => GatewayCallLog[];
  log?: (event: string, detail?: Record<string, unknown>) => void;
};

export type PipelineOutcome = {
  status: "succeeded" | "failed";
  stages: string[];
  layerBytes?: number;
  documentKind?: string;
};

export async function processDocumentJob(job: DocumentJob, deps: PipelineDependencies): Promise<PipelineOutcome> {
  const {queue} = deps;
  const payload = job.payload;
  const stages: string[] = [];
  const log = deps.log ?? (() => {});

  const stage = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    stages.push(name);
    await queue.writeStage(job, name, "started");
    try {
      const value = await run();
      await queue.writeStage(job, name, "succeeded");
      return value;
    } catch (error) {
      await queue.writeStage(job, name, "failed", {message: (error as Error).message});
      throw error;
    }
  };

  try {
    if (!payload.download_url) {
      throw new GateError("the job carries no download URL; the signed link expired", "scanner_unavailable", true);
    }

    // ---- E0 gate ---------------------------------------------------------------------
    const bytes = await stage("download", () => deps.download(payload.download_url!));

    const verdict: ScanVerdict = await stage("gate", () =>
      runGate(
        bytes,
        {
          ...(payload.sha256 ? {sha256: payload.sha256} : {}),
          ...(payload.byte_size !== undefined ? {byteSize: payload.byte_size} : {}),
        },
        deps.scanner,
        deps.now,
      ),
    );

    if (verdict.verdict === "infected") {
      // Recorded on the document (it becomes `rejected`) and reported as a permanent failure:
      // retrying an infected file would only scan it again.
      await queue.recordDocument(job, {scanResult: verdict});
      await queue.fail(
        job,
        {
          reason: "infected",
          signature: verdict.signature,
          document: payload.original_name,
          ...(deps.spend ? {spend: deps.spend()} : {}),
          ...(deps.lineage ? {model_lineage: deps.lineage()} : {}),
        },
        {retryable: false},
      );
      log("document.infected", {job: job.job_id, signature: verdict.signature});
      return {status: "failed", stages};
    }

    await queue.recordDocument(job, {scanResult: verdict});

    // ---- E2 layer --------------------------------------------------------------------
    const parsed = await stage("parse", () =>
      parseDocument(
        {
          bytes,
          documentId: payload.source_document_id,
          documentVersion: payload.document_version,
          fileName: payload.original_name,
          ...(payload.mime_type ? {mimeType: payload.mime_type} : {}),
          ...(payload.locale === "en-US" || payload.locale === "pt-BR" ? {localeHint: payload.locale} : {}),
        },
        {
          ...(deps.converter ? {converter: deps.converter} : {}),
          ...(deps.ocr ? {ocr: deps.ocr} : {}),
        },
      ),
    );

    const layerBody = new TextEncoder().encode(JSON.stringify(parsed.layer));

    if (payload.layer_upload_url && payload.layer_object_path) {
      await stage("store_layer", () => deps.uploadLayer(payload.layer_upload_url!, layerBody));
    }

    // ---- E1 profile ------------------------------------------------------------------
    const classified = await stage("profile", () =>
      deps.classify({parsed, fileName: payload.original_name, ...(payload.locale ? {locale: payload.locale} : {})}),
    );

    await queue.writeStage(
      job,
      "usage",
      "succeeded",
      {parserVersions: parsed.parserVersions, warnings: parsed.warnings.length},
      classified.usage ?? {},
    );

    await queue.recordDocument(job, {
      profile: classified.profile,
      ...(payload.layer_object_path
        ? {
            layer: {
              layer_kind: parsed.layer.kind,
              object_path: payload.layer_object_path,
              byte_size: layerBody.byteLength,
              parser_versions: parsed.parserVersions,
              stats: {
                ...parsed.layer.stats,
                warnings: parsed.warnings.map((warning) => warning.code),
                ...(parsed.conversion ? {conversion: parsed.conversion} : {}),
                scaleDeclarations: parsed.layer.scaleDeclarations.length,
              },
              status: "ready",
            },
          }
        : {}),
    });

    // ---- Governed case retrieval ------------------------------------------------------
    // Searchable context is derived only from the deterministic document layer. Each chunk
    // keeps the page, sheet, section or slide anchor that produced it, and the database
    // re-checks its SHA-256 before accepting it. No model-generated summary enters this index.
    const retrievalChunks = buildCaseChunks({
      organizationId: job.organization_id,
      intakeSessionId: job.intake_session_id,
      sourceDocumentId: payload.source_document_id,
      documentVersion: payload.document_version,
      sourceLabel: payload.original_name,
      layer: parsed.layer,
      ...(payload.locale === "pt-BR" || payload.locale === "en-US" ? {locale: payload.locale} : {}),
    });
    const indexed = await stage("index_retrieval", () => queue.recordRetrievalChunks(
      job,
      retrievalChunks.map((chunk) => ({
        chunk_key: chunk.citation.key,
        content: chunk.content,
        content_hash: chunk.contentHash,
        locale: chunk.locale,
        source_anchor: chunk.citation.anchor,
        tags: chunk.tags,
      })),
    ));

    // ---- E3 extraction ---------------------------------------------------------------
    // The profile says what the document is; this says what it states. Every candidate has
    // already been checked against the document it cites before it reaches the database —
    // one whose anchor did not confirm still travels, carrying its flags, because a fact a
    // human has to look at is information and a fact quietly dropped is not.
    let extracted: ExtractedCandidates | null = null;
    let written = 0;
    if (deps.extract) {
      extracted = await stage("extract", () =>
        deps.extract!({parsed, profile: classified.profile, fileName: payload.original_name, ...(payload.locale ? {locale: payload.locale} : {})}),
      );
      const result = await stage("record_candidates", () => queue.recordCandidates(job, extracted!.candidates));
      written = result.written;
      await queue.writeStage(
        job,
        "extract_usage",
        "succeeded",
        {
          candidates: extracted.candidates.length,
          written,
          unverified: extracted.candidates.filter((candidate) => candidate.anchor_verified === false).length,
          malformed: extracted.malformed,
          absent: extracted.absentFields.length,
          chunks: extracted.chunks,
        },
        extracted.usage ?? {},
      );

      const suggestions = buildScopeSuggestionInputs(extracted.candidates);
      if (suggestions.length > 0) {
        await stage("suggest_scope", () => queue.recordAnalysisScopeSuggestions(
          job,
          deterministicJobEventId(job.job_id, "scope-suggestions"),
          suggestions,
        ));
      }
    }

    if (classified.profile.document_kind === "advisor_authority_evidence") {
      await stage("document_advisor_authority", () => queue.documentAdvisorAuthorization(
        job,
        deterministicJobEventId(job.job_id, "advisor-authorization"),
      ));
    }

    // Classification, extracted facts and governance events all change the evidence basis. The
    // client batch is rebuilt only after those writes, so it never ships a ladder that was stale
    // before the job itself completed.
    const preparedRequests = await stage("prepare_requests", () => prepareWorkerIntakeRequests(job, queue));

    await queue.complete(job, {
      document_kind: classified.profile.document_kind,
      layer_bytes: layerBody.byteLength,
      warnings: parsed.warnings,
      detected: parsed.detected,
      ...(extracted ? {candidates: written, chunks_failed: extracted.chunks.failed} : {}),
      retrieval_chunks: indexed.written,
      prepared_requests: preparedRequests,
      ...(deps.spend ? {spend: deps.spend()} : {}),
      ...(deps.lineage ? {model_lineage: deps.lineage()} : {}),
    });

    log("document.done", {job: job.job_id, kind: classified.profile.document_kind, candidates: written});
    return {status: "succeeded", stages, layerBytes: layerBody.byteLength, documentKind: classified.profile.document_kind};
  } catch (error) {
    const failure = describeFailure(error);
    await queue.fail(
      job,
      {...failure.detail, ...(deps.spend ? {spend: deps.spend()} : {}), ...(deps.lineage ? {model_lineage: deps.lineage()} : {})},
      {retryable: failure.retryable, retryInSeconds: failure.retryInSeconds},
    );
    log("document.failed", {job: job.job_id, reason: failure.detail.reason});
    return {status: "failed", stages};
  }
}

/**
 * Turns an exception into something a person can act on. The distinction that matters is
 * whether retrying could ever help: a corrupt file will never parse, an expired signed URL
 * will work on the next run.
 */
function describeFailure(error: unknown): {
  retryable: boolean;
  retryInSeconds: number;
  detail: {reason: string; message: string; code?: string};
} {
  if (error instanceof GateError) {
    return {
      retryable: error.retryable,
      retryInSeconds: 120,
      detail: {reason: error.code, message: error.message, code: error.code},
    };
  }

  if (error instanceof ModelGatewayError && error.code === "budget_exceeded") {
    // Not retryable: every attempt starts with a fresh allowance, so retrying a document that
    // already spent its ceiling spends it again. This needs a person to look at the file.
    return {
      retryable: false,
      retryInSeconds: 0,
      detail: {reason: "model_budget_exceeded", message: error.message, code: error.code},
    };
  }

  if (error instanceof ParserError) {
    // A file that cannot be read will not read better in five minutes; it needs a human or a
    // different file from the sender.
    return {
      retryable: false,
      retryInSeconds: 60,
      detail: {reason: "unreadable_document", message: error.message, code: error.code},
    };
  }

  const message = (error as Error)?.message ?? String(error);
  const transient = /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|expired|rate.?limit|429|5\d\d/i.test(message);
  return {
    retryable: transient,
    retryInSeconds: transient ? 60 : 300,
    detail: {reason: transient ? "transient_error" : "worker_error", message},
  };
}
