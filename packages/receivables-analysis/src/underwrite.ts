import {createHash} from "node:crypto";

import {z} from "zod";

import {analyzeReceivables, type ReceivablesAnalysis} from "./analyze";
import {receivablesCaseSchema} from "./schema";

export const receivablesPoolUnderwritingVersion = "2026.09.06-v1" as const;

const currencySchema = z.enum(["BRL", "USD"]);

export const receivablesPoolUnderwritingInputSchema = z.object({
  currency: currencySchema,
  case: receivablesCaseSchema,
}).strict();
export type ReceivablesPoolUnderwritingInput = z.input<typeof receivablesPoolUnderwritingInputSchema>;

export type ReceivablesPoolUnderwriting = {
  schema_version: "method.underwrite-receivables-pool.v1";
  state: ReceivablesAnalysis["decision"]["status"];
  case_id: string;
  reference_date: string;
  currency: z.infer<typeof currencySchema>;
  portfolio_summary: ReceivablesAnalysis["metrics"]["portfolio"];
  eligibility: ReceivablesAnalysis["analyzedReceivables"];
  aging: ReceivablesAnalysis["metrics"]["aging"];
  performance: ReceivablesAnalysis["metrics"]["performance"];
  evidence_coverage: ReceivablesAnalysis["metrics"]["evidence"];
  reconciliation: ReceivablesAnalysis["reconciliation"];
  borrowing_base: Omit<ReceivablesAnalysis["structure"], "waterfall" | "residualCash">;
  waterfall: ReceivablesAnalysis["structure"]["waterfall"];
  triggers: ReceivablesAnalysis["triggers"];
  gaps: ReceivablesAnalysis["gaps"];
  decision_boundary: ReceivablesAnalysis["decision"];
  trace: {
    method_version: typeof receivablesPoolUnderwritingVersion;
    engine_version: ReceivablesAnalysis["version"];
    input_fingerprint: string;
    output_fingerprint: string;
    policy: ReceivablesPoolUnderwritingInput["case"]["policy"];
    source_rows: Array<{receivable_id: string; document_id: string; anchor: string}>;
    cash_rows: Array<{receipt_id: string; document_id: string; anchor: string}>;
  };
};

/**
 * Produces the governed method result for a receivables pool. The model never calculates an
 * eligibility amount, concentration cap, borrowing base, trigger or waterfall. It supplies no
 * missing policy either: every threshold is part of the validated input and is echoed in trace.
 */
export function underwriteReceivablesPool(raw: ReceivablesPoolUnderwritingInput): ReceivablesPoolUnderwriting {
  const input = receivablesPoolUnderwritingInputSchema.parse(raw);
  const analysis = analyzeReceivables(input.case);
  const sourceRows = input.case.portfolio
    .map((row) => ({receivable_id: row.id, document_id: row.sourceDocumentId, anchor: row.sourceAnchor}))
    .sort((left, right) => left.receivable_id.localeCompare(right.receivable_id));
  const cashRows = input.case.cashReceipts
    .map((row) => ({receipt_id: row.id, document_id: row.sourceDocumentId, anchor: row.sourceAnchor}))
    .sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
  const canonicalInput = {
    currency: input.currency,
    case: {
      ...input.case,
      portfolio: [...input.case.portfolio].sort((left, right) => left.id.localeCompare(right.id)),
      cashReceipts: [...input.case.cashReceipts].sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
  const resultWithoutTrace = {
    schema_version: "method.underwrite-receivables-pool.v1" as const,
    state: analysis.decision.status,
    case_id: analysis.caseId,
    reference_date: input.case.referenceDate,
    currency: input.currency,
    portfolio_summary: analysis.metrics.portfolio,
    eligibility: [...analysis.analyzedReceivables].sort((left, right) => left.receivableId.localeCompare(right.receivableId)),
    aging: analysis.metrics.aging,
    performance: analysis.metrics.performance,
    evidence_coverage: analysis.metrics.evidence,
    reconciliation: analysis.reconciliation,
    borrowing_base: {
      requestedFacility: analysis.structure.requestedFacility,
      maximumByAdvanceRate: analysis.structure.maximumByAdvanceRate,
      maximumByOvercollateralization: analysis.structure.maximumByOvercollateralization,
      supportedFacility: analysis.structure.supportedFacility,
      overcollateralizationAtRequest: analysis.structure.overcollateralizationAtRequest,
      requiredOvercollateralization: analysis.structure.requiredOvercollateralization,
      actualSubordinationRate: analysis.structure.actualSubordinationRate,
      requiredSubordinationRate: analysis.structure.requiredSubordinationRate,
      reserveTarget: analysis.structure.reserveTarget,
    },
    waterfall: [...analysis.structure.waterfall].sort((left, right) => left.priority - right.priority),
    triggers: [...analysis.triggers].sort((left, right) => left.id.localeCompare(right.id)),
    gaps: [...analysis.gaps].sort((left, right) => left.code.localeCompare(right.code)),
    decision_boundary: analysis.decision,
  };
  const inputFingerprint = hash(canonicalInput);
  const outputFingerprint = hash({
    ...resultWithoutTrace,
    method_version: receivablesPoolUnderwritingVersion,
    engine_version: analysis.version,
    input_fingerprint: inputFingerprint,
    policy: input.case.policy,
    source_rows: sourceRows,
    cash_rows: cashRows,
  });
  return {
    ...resultWithoutTrace,
    trace: {
      method_version: receivablesPoolUnderwritingVersion,
      engine_version: analysis.version,
      input_fingerprint: inputFingerprint,
      output_fingerprint: outputFingerprint,
      policy: input.case.policy,
      source_rows: sourceRows,
      cash_rows: cashRows,
    },
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
