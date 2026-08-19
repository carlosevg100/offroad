import type {ModelGateway} from "@offroad/model-gateway";
import {
  extractorOutputSchema,
  indexLayer,
  verifyCandidates,
  type DocumentLayer,
  type DocumentProfile,
  type RawExtractionCandidate,
  type RejectedCandidate,
  type VerifiedCandidate,
} from "@offroad/document-intelligence";

import {renderEvidence, type RenderOptions} from "./evidence";
import {EXTRACTOR_SYSTEM, buildExtractionPrompt, targetFields} from "./prompt";

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

export type ExtractionProgress =
  | {stage: "chunk_started"; chunk: number; total: number}
  | {stage: "chunk_finished"; chunk: number; total: number; candidates: number; costUsd: number}
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
  onProgress?: (progress: ExtractionProgress) => void;
};

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

  for (const chunk of chunks) {
    options.onProgress?.({stage: "chunk_started", chunk: chunk.index, total: chunk.total});
    try {
      const result = await gateway.complete({
        task: "extract_fields",
        system: EXTRACTOR_SYSTEM,
        input: [{type: "text", text: buildExtractionPrompt({profile, fileName: options.fileName, fields, evidence: chunk})}],
        schema: extractorOutputSchema,
        schemaName: "extractor_output",
        ...(options.maxOutputTokens ? {maxOutputTokens: options.maxOutputTokens} : {}),
        metadata: {document: profile.documentId, chunk: String(chunk.index)},
      });

      raw.push(...result.output.candidates);
      for (const field of result.output.absent_fields) absentFields.add(field);
      alerts.push(...result.output.document_alerts);

      usage.calls += 1;
      usage.costUsd += result.costUsd;
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;

      options.onProgress?.({
        stage: "chunk_finished",
        chunk: chunk.index,
        total: chunk.total,
        candidates: result.output.candidates.length,
        costUsd: result.costUsd,
      });
    } catch (error) {
      // A chunk that fails is a hole in the reading, and it is reported as one. Carrying on
      // matters — one unreadable page should not discard the other forty — but the count has
      // to reach the caller, or a partial extraction looks like a complete one.
      failed += 1;
      options.onProgress?.({stage: "chunk_failed", chunk: chunk.index, total: chunk.total, message: (error as Error).message});
    }
  }

  const report = verifyCandidates(raw, {
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
    chunks: {total: chunks.length, failed},
    usage,
  };
}
