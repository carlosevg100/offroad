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
import {buildExtractionPrompt, extractionSystem, targetFields} from "./prompt";
import {tableBatchPasses} from "./rows";

/**
 * One document in, verified candidates out (P1 plan §7, stage E3).
 *
 * The model reads and cites; this function decides what survives. Nothing the model returns is
 * trusted on its word: every candidate goes through the anchor verifier, which re-reads the
 * layer and checks that the quote is really there, that the value is really in the quote, and
 * that the digits are really in the anchor. Whatever fails keeps its flags and travels on as a
 * candidate a human has to look at, it is never silently dropped and never silently accepted.
 *
 * The normalized value is computed here, in code, from the raw string, never taken from the
 * model. That is the line between "the document says 1.234.567,89" and "the system believes
 * 1234567.89", and it is the only place that line can be drawn honestly.
 */

/**
 * The strict contract, made survivable.
 *
 * Validating the whole response against `extractorOutputSchema` was all-or-nothing: sixty
 * good candidates plus one with a malformed field meant zero candidates, which is exactly
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
  /**
   * What the model returned, before renumbering, verification or normalisation.
   *
   * This is the expensive part of a run and the only part that needs a provider. Keeping it
   * turns every later change to the verifier, the reconciliation or the scoring into something
   * that can be re-measured offline in seconds instead of two hours and seven dollars.
   */
  raw: RawExtractionCandidate[];
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
  /**
   * Overrides the task policy's model. Only the evals sweep sets it: production picks the model
   * from the policy, so a cheaper tier reaches production by changing the policy after a
   * measurement, never by a caller deciding on its own.
   */
  model?: {provider?: "anthropic" | "openai"; model?: string; effort?: "low" | "medium" | "high" | "xhigh" | "max"};
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

const indexedCandidatePath = /^(.*)\.(\d{1,3})\.([a-z0-9_]+)$/;

/**
 * One number per row of one document, whichever table the row sits in.
 *
 * The row passes already count across tables; the whole-document pass does not, because the
 * model numbers each table from one. Nimbus measured the result: the deck's management table
 * and its cap table both produced `company.controllers.4`, and the reconciliation reported the
 * CEO against a venture fund as a contradiction. Tuples are grouped by the table their anchor
 * cites and renumbered in document order, so the same index means the same row.
 */
export function renumberByTable(candidates: RawExtractionCandidate[]): RawExtractionCandidate[] {
  // A table row cites `<table>.r<n>` and a spreadsheet cell cites `s<sheet>!<col><row>`; both
  // reduce to the container the row sits in. Aurora's debt map measured the cell case: with
  // the cell left in the key, every cell was its own table and the seven instruments came out
  // as fifty-one one-field tuples.
  const tableOf = (anchorId: string) => anchorId.replace(/\.r\d+(\..*)?$/, "").replace(/![A-Z]{1,3}\d+$/, "");
  const next = new Map<string, number>();
  const assigned = new Map<string, number>();
  return candidates.map((candidate) => {
    const match = indexedCandidatePath.exec(candidate.field_path);
    if (!match) return candidate;
    const [, group, index, key] = match as unknown as [string, string, string, string];
    const tupleKey = `${group}|${tableOf(candidate.anchor.id)}|${index}`;
    let number = assigned.get(tupleKey);
    if (number === undefined) {
      number = (next.get(group) ?? 0) + 1;
      next.set(group, number);
      assigned.set(tupleKey, number);
    }
    return number === Number(index) ? candidate : {...candidate, field_path: `${group}.${number}.${key}`};
  });
}

export async function extractDocument(options: ExtractionOptions): Promise<ExtractionResult> {
  const {layer, profile, gateway} = options;

  const index = indexLayer(layer);
  // A workbook with several sheets is read one sheet per window; a PDF or a single sheet keeps
  // the packing that lets a statement's pages share one view.
  const multiSheet = (layer.sheets?.length ?? 0) > 1;
  const chunks = renderEvidence(index, {...(multiSheet ? {oneContainerPerChunk: true} : {}), ...(options.render ?? {})});
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

  // Byte-identical across every call of this document kind, so the provider caches it.
  const wholeSystem = extractionSystem({fields});

  const chunkOutcomes = await mapWithConcurrency(chunks, concurrency, async (chunk): Promise<PassOutcome> => {
    options.onProgress?.({stage: "chunk_started", chunk: chunk.index, total: chunk.total});
    try {
      const result = await gateway.complete({
        task: "extract_fields",
        system: wholeSystem,
        input: [{type: "text", text: buildExtractionPrompt({profile, fileName: options.fileName, fields, evidence: chunk})}],
        schema: salvageExtractorOutputSchema,
        schemaName: "extractor_output",
        ...(options.maxOutputTokens ? {maxOutputTokens: options.maxOutputTokens} : {}),
        cacheKey: `extract:${profile.kind}`,
        ...(options.model ? {model: options.model} : {}),
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

  // ---- table passes: the orchestration enumerates, the model reads once -------------------
  //
  // Wide tables need a focused pass, but a paid call per row made cost proportional to row
  // count. One pass per table keeps the focus while the cited row anchor, not the model, decides
  // the tuple index. A 500-row tape therefore costs one mapping call rather than 500 calls.
  const indexedFields = fields.filter((field) => field.pattern.includes("{i}"));
  const tablePasses = indexedFields.length > 0 ? tableBatchPasses(index, {fields: indexedFields}) : [];
  const rowFieldPaths = new Set<string>();
  // `{i}` stays unbound in the prompt. The cited row anchor binds it below, which also stops a
  // model from numbering two rows the same or inventing a row number.
  const rowSystem = extractionSystem({fields: indexedFields, row: true});
  const bindIndex = (path: string, instance: number) => path.replace(/\.(?:i|\d{1,3})\./, `.${instance}.`);

  const rowOutcomes = await mapWithConcurrency(tablePasses, concurrency, async (pass, position): Promise<PassOutcome> => {
    const passNumber = chunks.length + position + 1;
    options.onProgress?.({stage: "chunk_started", chunk: passNumber, total: chunks.length + tablePasses.length});
    try {
      const result = await gateway.complete({
        task: "extract_fields",
        system: rowSystem,
        input: [{type: "text", text: buildExtractionPrompt({
          profile,
          fileName: options.fileName,
          fields: indexedFields,
          evidence: {text: pass.evidenceText, index: position + 1, total: tablePasses.length},
          rowBatch: {tableId: pass.tableId, rows: pass.rows.length},
        })}],
        schema: salvageExtractorOutputSchema,
        schemaName: "extractor_output",
        maxOutputTokens: options.maxOutputTokens ?? 4_000,
        cacheKey: `extract-table:${profile.kind}`,
        ...(options.model ? {model: options.model} : {}),
        // A row pass reads cells; there is nothing to reason about, and reasoning bills as output.
        thinking: "off",
        metadata: {document: profile.documentId, chunk: `table:${pass.tableId}`},
      });

      const instanceForAnchor = (anchorId: string): number | null => {
        const row = pass.rows.find((candidateRow) => anchorId === candidateRow.rowAnchorId || anchorId.startsWith(`${candidateRow.rowAnchorId}.`));
        return row?.instance ?? null;
      };
      const kept = result.output.candidates
        .filter((candidate): candidate is RawExtractionCandidate => candidate !== null)
        .flatMap((candidate) => {
          const instance = instanceForAnchor(candidate.anchor.id);
          return instance === null ? [] : [{...candidate, field_path: bindIndex(candidate.field_path, instance)}];
        });
      options.onProgress?.({
        stage: "chunk_finished",
        chunk: passNumber,
        total: chunks.length + tablePasses.length,
        candidates: kept.length,
        malformed: 0,
        costUsd: result.costUsd,
      });
      // A row not carrying a grace period says nothing about the document lacking one, so
      // absences from row passes are ignored on purpose.
      return {ok: true, kept, dropped: result.output.candidates.length - kept.length, absent: [], alerts: [], costUsd: result.costUsd, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens};
    } catch (error) {
      options.onProgress?.({stage: "chunk_failed", chunk: passNumber, total: chunks.length + tablePasses.length, message: (error as Error).message});
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
        const fromRowPass = tablePasses.some((pass) => pass.rows.some((row) => candidate.anchor.id === row.rowAnchorId || candidate.anchor.id.startsWith(`${row.rowAnchorId}.`)));
        if (fromRowPass) return true;
        void position;
        return !rowFieldPaths.has(candidate.field_path);
      })
    : raw;

  const report = verifyCandidates(renumberByTable(deduped), {
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
    raw: deduped,
    rejected: report.rejected,
    absentFields: [...absentFields],
    alerts,
    chunks: {total: chunks.length + tablePasses.length, failed},
    malformed,
    usage,
  };
}
