import {BalanceSourceProposals} from "./balance-source-proposals";
import {z} from "zod";
import {balanceSourceAssessmentSchema, receivablesEvidenceSourceManifestSchema, receivablesEvidenceScopeContextSchema} from "@offroad/receivables-analysis";
import {ReceivablesSupportPeriods} from "./receivables-support-periods";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const anchor = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("file"), fileId: z.string(), fileHash: hash, sheet: z.string().optional(), row: z.number().int().optional(), column: z.string().optional(), cell: z.string().optional()}),
  z.object({kind: z.literal("document"), documentId: z.string(), documentHash: hash.optional(), page: z.number().int().optional(), clause: z.string().optional(), paragraph: z.string().optional()}),
  z.object({kind: z.literal("event"), eventId: z.string(), sourceSystem: z.string(), occurredAt: z.string()}),
]);
const assessmentSchema = z.object({
  schemaVersion: z.literal("receivables-support-periods.v1"), reportingDate: z.iso.date(), dateComparisonPolicy: z.literal("source_local_calendar_date"),
  entries: z.array(z.object({id: z.string(), detectorId: z.string(), sourceId: z.string(), sourceLabel: z.string(), sourceHash: hash, anchor,
    dateKind: z.enum(["stock_as_of", "flow_interval", "event_timestamp", "event_date"]), rawDate: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(),
    qualification: z.enum(["included", "subsequent", "missing", "invalid", "overlaps_cutoff"]), amountStatus: z.enum(["provided", "missing", "invalid"]).optional(), scopeAmbiguous: z.literal(true).optional(), requiresSourceReview: z.literal(true).optional(),
  })),
});
export function isReceivablesReportCurrent(context: unknown, snapshotCreatedAt: string, isProcessing: boolean): boolean {
  const parsed = receivablesEvidenceScopeContextSchema.safeParse(context);
  if (isProcessing || !parsed.success || parsed.data.state !== "current" || !parsed.data.scope) return false;
  const snapshotTime = Date.parse(snapshotCreatedAt);
  const confirmationTime = Date.parse(parsed.data.scope.confirmedAt);
  return Number.isFinite(snapshotTime) && Number.isFinite(confirmationTime) && snapshotTime >= confirmationTime;
}

/** Read the persisted public diagnostic projection; never infer a temporal result from scope confirmation. */
export async function ReceivablesProjectSupportPeriods({understanding, locale, current}: {understanding: unknown; locale: string; current: boolean}) {
  const value = z.object({receivablesVertical: z.object({balanceSourceAssessment: z.unknown().optional(), supportPeriodAssessment: z.unknown().optional(), sourceManifest: z.unknown().optional(), pipeline: z.unknown().optional()}).passthrough().nullable().optional()}).safeParse(understanding);
  const vertical = value.success ? value.data.receivablesVertical : null;
  if (!vertical || (!vertical.pipeline && vertical.supportPeriodAssessment === undefined && vertical.balanceSourceAssessment === undefined)) return null;
  const assessment = assessmentSchema.safeParse(vertical.supportPeriodAssessment);
  const sources = receivablesEvidenceSourceManifestSchema.safeParse(vertical.sourceManifest);
  const balances = balanceSourceAssessmentSchema.safeParse(vertical.balanceSourceAssessment);
  const periods = await ReceivablesSupportPeriods({locale, assessment: current && assessment.success ? assessment.data : undefined, sources: sources.success ? sources.data : undefined});
  return <>{periods}{current && balances.success ? await BalanceSourceProposals({assessment: balances.data, locale}) : null}</>;
}
