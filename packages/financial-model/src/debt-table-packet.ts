import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedDebtTableInputSchema, calculateAdoptedDebtTable} from "./adopted-debt-table";
import {adoptedDebtTableOutputSchema} from "./ficha-calculation-results";

export const debtTablePacketVersion = "2026.10.23-v1";
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

/** One request for the company's debt: the adopted contract terms, statements and definitions of
 * one basis. The packet adds no number; it orders what the table establishes for the answer. */
export const debtTablePacketInputSchema = z.strictObject({
  schemaVersion: z.literal("debt-table-packet-input.v1"),
  question: text,
  analysis: adoptedDebtTableInputSchema,
});
export type DebtTablePacketInput = z.infer<typeof debtTablePacketInputSchema>;

export const debtTablePacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("debt-table-packet.v1"), executorVersion: z.literal(debtTablePacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedDebtTableInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  referenceDate: z.iso.date(),
  result: adoptedDebtTableOutputSchema,
  /** What the answer must say, in order: the debt is not one number. */
  readings: z.strictObject({
    reconciled: z.boolean().nullable(),
    viewCount: z.number().int().min(0).max(8),
    limitsKeptOutOfDebt: z.boolean(),
    outsideEveryView: z.array(key).max(64),
    basketsExceeded: z.array(key).max(32),
    lowestCrossDefault: z.strictObject({instrumentId: key, threshold: z.string()}).nullable(),
    leverageDefinitions: z.number().int().min(0).max(8),
    completenessRequest: z.boolean(),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1088),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(["contract_extraction", "covenant_measurement", "structure_opinion", "credit_approval"])).length(4)
    .refine((v) => v.join("|") === "contract_extraction|covenant_measurement|structure_opinion|credit_approval", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type DebtTablePacket = z.infer<typeof debtTablePacketOutputSchema>;

/** How much the company owes and to whom, described once: principal reconciled to the statements,
 * credit lines kept as limits, the debt by each adopted definition with the bridge, what stays
 * outside every balance, the maturity profile, the security and basket in use, the cross-default
 * chain and leverage under each definition, and what proves completeness. Deterministic; it
 * measures no covenant and gives no opinion on the structure. */
export function prepareDebtTablePacket(raw: unknown): DebtTablePacket {
  const input = debtTablePacketInputSchema.parse(raw);
  const result = adoptedDebtTableOutputSchema.parse(calculateAdoptedDebtTable(input.analysis));
  const t = result.table;
  const readings = t ? {
    reconciled: t.reconciliation.status === "not_reported" ? null : t.reconciliation.status === "exact",
    viewCount: t.views.length,
    limitsKeptOutOfDebt: t.creditLines.every((l) => l.drawn === "0") || t.views.every((v) => v.components.includes("drawn_credit_lines")),
    outsideEveryView: t.outsideEveryView.map((o) => o.id),
    basketsExceeded: t.negativePledgeBaskets.filter((b) => b.exceeded).map((b) => b.holderId),
    lowestCrossDefault: t.crossDefault.lowestThreshold,
    leverageDefinitions: t.leverage.filter((l) => l.ratio !== null).length,
    completenessRequest: t.completeness.request !== null,
  } : null;
  const gaps = [...result.gaps, ...(t?.gaps ?? []).map((g) => ({operand: `debt_table.${input.analysis.analysisId}.${g.item}`, reason: g.reason}))];
  const status = !t ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "debt-table-packet.v1" as const, executorVersion: debtTablePacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    referenceDate: result.referenceDate, result, readings, gaps, status,
    exclusions: ["contract_extraction", "covenant_measurement", "structure_opinion", "credit_approval"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return debtTablePacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
