import {z} from "zod";
import type {ModelGateway} from "@offroad/model-gateway";
import {
  indexLayer,
  rawExtractionCandidateSchema,
  verifyCandidates,
  type DocumentLayer,
  type DocumentProfile,
  type RawExtractionCandidate,
  type RejectedCandidate,
  type VerifiedCandidate,
} from "@offroad/document-intelligence";

import {renderEvidence, type RenderOptions} from "./evidence";
import {EXTRACTOR_SYSTEM, buildExtractionPrompt, targetFields} from "./prompt";
import {tableRowPasses} from "./rows";

/**
 * One document in, verified candidates out (P1 plan §7, stage E3).
 *
 * The model reads and cites; this function decides what survives. Nothing the model returns is
 * trusted on its word: every candidate goes through the anchor verifier, which re-reads the
 * layer and checks that the quote is really there, that the value is really in the quote, and
 * that the digits are really in the anchor. Whatever fails keeps its flags and travels on as a
 * candidate a human has to look at — it is never silently dropped and never silently accepted.
 *
 * The normalized value is computed here, in code, from the raw string — never taken from the
 * model. That is the line between "the document says 1.234.567,89" and "the system believes
 * 1234567.89", and it is the only place that line can be drawn honestly.
 */

/**
 * The strict contract, made survivable.
 *
 * Validating the whole response against `extractorOutputSchema` was all-or-nothing: sixty
 * good candidates plus one with a malformed field meant zero candidates — which is exactly
 * what zeroed the CFO letter and the audited statements in the first real measurement. The
 * provider still receives the full candidate shape as guidance (the JSON schema keeps it,
 * inside an anyOf with null), but on the way back each candidate is judged alone: a bad one
 * becomes `null` and is counted, and the good ones live. Sub-perfect output costs precision
 * points, never whole documents.
 */
const salvageExtractorOutputSchema = z.object({
  candidates: z.array(rawExtractionCandidateSchema.nullable().catch(null)),
  absent_fields: z.array(z.string()).default([]),
  document_alerts: z.array(z.string()).default([]),
});

export type ExtractionProgress =
  | {stage: "chunk_started"; chunk: number; total: number}
  | {stage: "chunk_finished"; chunk: number; total: number; candidates: number; malformed: number; costUsd: number}
  | {stage: "chunk_failed"; chunk: number; total: number; message: string};

export type ExtractionResult = {
  /** Verified candidates, deduplicated; flags say what could not be confirmed. */
  candidates: VerifiedCandidate[];
  /** Candidates whose field path is not in the catalogue. Kept, so the gap is visible. */
  rejected: RejectedCandidate[];
  /** Target fields the model reported as absent from this document. */
  absentFields: string[];
  /** Anything the model flagged about the document as a whole. */
  alerts: string[];
  /** Chunks the evidence was split into, and how many of them failed. */
  chunks: {total: number; failed: number};
  /** Candidates the model emitted that did not match the contract. Counted, never repaired. */
  malformed: number;
  usage: {calls: number; costUsd: number; inputTokens: number; outputTokens: number};
};

export type ExtractionOptions = {
  layer: DocumentLayer;
  profile: DocumentProfile;
  fileName: string;
  gateway: ModelGateway;
  localeHint?: "pt-BR" | "en-US";
  render?: RenderOptions;
  maxOutputTokens?: number;
  /**
   * Model calls in flight at once. The passes are independent reads of one document; running
   * them four abreast cuts a 200-page filing from forty-five minutes to about twelve without
   * changing what any pass sees. Bounded, because the gateway's budget accounting and the
   * provider's rate limits are both per job.
   */
  concurrency?: number;
  onProgress?: (progress: ExtractionProgress) => void;
};

/** Runs `work` over `items` with at most `limit` in flight, results in input order. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({length: Math.max(1, Math.min(limit, items.length))}, async () => {
    while (next < items.length) {
      const current = next;
      next += 1;
      results[current] = await work(items[current]!, current);
    }
  });
  await Promise.all(lanes);
  return results;
}

export async function extractDocument(options: ExtractionOptions): Promise<ExtractionResult> {
  const {layer, profile, gateway} = options;

  const index = indexLayer(layer);
  const chunks = renderEvidence(index, options.render ?? {});
  const fields = targetFields(profile.kind);

  const raw: RawExtractionCandidate[] = [];
  const absentFields = new Set<string>();
  const alerts: string[] = [];
  const usage = {calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0};
  let failed = 0;
  let malformed = 0;

  const concurrency = options.concurrency ?? 4;

  type PassOutcome =
    | {ok: true; kept: RawExtractionCandidate[]; dropped: number; absent: string[]; alerts: string[]; costUsd: number; inputTokens: number; outputTokens: number}
    | {ok: false; message: string};

  const chunkOutcomes = await mapWithConcurrency(chunks, concurrency, async (chunk): Promise<PassOutcome> => {
    options.onProgress?.({stage: "chunk_started", chunk: chunk.index, total: chunk.total});
    try {
      const result = await gateway.complete({
        task: "extract_fields",
        system: EXTRACTOR_SYSTEM,
        input: [{type: "text", text: buildExtractionPrompt({profile, fileName: options.fileName, fields, evidence: chunk})}],
        schema: salvageExtractorOutputSchema,
        schemaName: "extractor_output",
        ...(options.maxOutputTokens ? {maxOutputTokens: options.maxOutputTokens} : {}),
        metadata: {document: profile.documentId, chunk: String(chunk.index)},
      });

      const kept = result.output.candidates.filter((candidate): candidate is RawExtractionCandidate => candidate !== null);
      const dropped = result.output.candidates.length - kept.length;
      options.onProgress?.({
        stage: "chunk_finished",
        chunk: chunk.index,
        total: chunk.total,
        candidates: kept.length,
        malformed: dropped,
        costUsd: result.costUsd,
      });
      return {ok: true, kept, dropped, absent: result.output.absent_fields, alerts: result.output.document_alerts, costUsd: result.costUsd, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens};
    } catch (error) {
      // A chunk that fails is a hole in the reading, and it is reported as one. Carrying on
      // matters, one unreadable page should not discard the other forty, but the count has
      // to reach the caller, or a partial extraction looks like a complete one.
      options.onProgress?.({stage: "chunk_failed", chunk: chunk.index, total: chunk.total, message: (error as Error).message});
      return {ok: false, message: (error as Error).message};
    }
  });

  // Merged in chunk order, so the candidate list is the same whatever the lanes did.
  for (const outcome of chunkOutcomes) {
    if (!outcome.ok) {
      failed += 1;
      continue;
    }
    malformed += outcome.dropped;
    raw.push(...outcome.kept);
    for (const field of outcome.absent) absentFields.add(field);
    alerts.push(...outcome.alerts);
    usage.calls += 1;
    usage.costUsd += outcome.costUsd;
    usage.inputTokens += outcome.inputTokens;
    usage.outputTokens += outcome.outputTokens;
  }

  // ---- row passes: the orchestration enumerates, the model reads --------------------------
  //
  // Wide tables measured this in: a seven-line debt schedule asked for as one task returned one
  // candidate and zero absences. Each detected data row now runs as its own pass, with the
  // indexed patterns bound to that row's number, and a row-pass candidate outranks a whole-doc
  // candidate for the same field, because it carries the sharper anchor.
  const indexedFields = fields.filter((field) => field.pattern.includes("{i}"));
  const rowPasses = indexedFields.length > 0 ? tableRowPasses(index) : [];
  const rowFieldPaths = new Set<string>();

  const rowOutcomes = await mapWithConcurrency(rowPasses, concurrency, async (pass, position): Promise<PassOutcome> => {
    const bound = indexedFields.map((field) => ({...field, pattern: field.pattern.replace("{i}", String(pass.instance))}));
    const passNumber = chunks.length + position + 1;
    options.onProgress?.({stage: "chunk_started", chunk: passNumber, total: chunks.length + rowPasses.length});
    try {
      const result = await gateway.complete({
        task: "extract_fields",
        system: EXTRACTOR_SYSTEM,
        input: [{type: "text", text: buildExtractionPrompt({
          profile,
          fileName: options.fileName,
          fields: bound,
          evidence: {text: pass.evidenceText, index: pass.instance, total: rowPasses.length},
          row: {instance: pass.instance, tableId: pass.tableId},
        })}],
        schema: salvageExtractorOutputSchema,
        schemaName: "extractor_output",
        maxOutputTokens: options.maxOutputTokens ?? 2_000,
        metadata: {document: profile.documentId, chunk: `row:${pass.rowAnchorId}`},
      });

      const kept = result.output.candidates.filter((candidate): candidate is RawExtractionCandidate => candidate !== null);
      options.onProgress?.({
        stage: "chunk_finished",
        chunk: passNumber,
        total: chunks.length + rowPasses.length,
        candidates: kept.length,
        malformed: 0,
        costUsd: result.costUsd,
      });
      // A row not carrying a grace period says nothing about the document lacking one, so
      // absences from row passes are ignored on purpose.
      return {ok: true, kept, dropped: result.output.candidates.length - kept.length, absent: [], alerts: [], costUsd: result.costUsd, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens};
    } catch (error) {
      options.onProgress?.({stage: "chunk_failed", chunk: passNumber, total: chunks.length + rowPasses.length, message: (error as Error).message});
      return {ok: false, message: (error as Error).message};
    }
  });

  for (const outcome of rowOutcomes) {
    if (!outcome.ok) {
      failed += 1;
      continue;
    }
    malformed += outcome.dropped;
    for (const candidate of outcome.kept) rowFieldPaths.add(candidate.field_path);
    raw.push(...outcome.kept);
    usage.calls += 1;
    usage.costUsd += outcome.costUsd;
    usage.inputTokens += outcome.inputTokens;
    usage.outputTokens += outcome.outputTokens;
  }

  // The dedup: for a field a row pass produced, the whole-document candidate is the blurrier of
  // the two readings of the same cell, and two candidates for one field would each dilute the
  // other's confidence downstream.
  const deduped = rowFieldPaths.size > 0
    ? raw.filter((candidate, position) => {
        const fromRowPass = rowPasses.some((pass) => candidate.anchor.id === pass.rowAnchorId || candidate.anchor.id.startsWith(`${pass.rowAnchorId}.`));
        if (fromRowPass) return true;
        void position;
        return !rowFieldPaths.has(candidate.field_path);
      })
    : raw;

  const report = verifyCandidates(deduped, {
    index,
    layer,
    profile,
    documentVersion: layer.documentVersion,
    ...(options.localeHint ? {localeHint: options.localeHint} : {}),
  });

  // A field the model reported absent but then cited is not absent.
  for (const candidate of report.verified) absentFields.delete(candidate.field_path);

  return {
    candidates: report.verified,
    rejected: report.rejected,
    absentFields: [...absentFields],
    alerts,
    chunks: {total: chunks.length + rowPasses.length, failed},
    malformed,
    usage,
  };
}
