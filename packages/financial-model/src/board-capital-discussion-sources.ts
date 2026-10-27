import {createHash} from "node:crypto";
import {z} from "zod";
import {investmentDecisionPacketOutputSchema} from "./investment-decision-packet";
import {debtTablePacketOutputSchema} from "./debt-table-packet";
import {covenantHeadroomPacketOutputSchema} from "./covenant-headroom-packet";
import {weeklyCashPacketOutputSchema} from "./weekly-cash-packet";
import {operatingProjectionPacketOutputSchema} from "./operating-projection-packet";
import {projectionChallengePacketOutputSchema} from "./projection-challenge-packet";
import {receivablesFundingPacketOutputSchema} from "./receivables-funding-packet";
import {relativeDebtCostPacketOutputSchema} from "./relative-debt-cost-packet";
import {financingComparisonPacketOutputSchema} from "./financing-comparison-packet";
import {debtCapacityPacketOutputSchema} from "./debt-capacity-packet";
import {quarterUpdatePacketOutputSchema} from "./quarter-update-packet";
import {capitalPathsPacketOutputSchema} from "./capital-structure-paths-packet";
import type {BoardSourceReading} from "./board-capital-discussion";

/** The released methods whose reviewed results a board material may read, each pinned to the released
 * method version, executor version and packet schema. A result of any other method or version is refused. */
export const boardReleasedSources = {
  "analyze-investment-project": {methodVersion: "2026.10.09-v2", executorVersion: "2026.10.09-v1", packet: "investment-decision-packet.v1", schema: investmentDecisionPacketOutputSchema},
  "build-company-debt-table": {methodVersion: "2026.10.23-v1", executorVersion: "2026.10.23-v1", packet: "debt-table-packet.v1", schema: debtTablePacketOutputSchema},
  "measure-covenant-headroom": {methodVersion: "2026.10.23-v1", executorVersion: "2026.10.23-v1", packet: "covenant-headroom-packet.v1", schema: covenantHeadroomPacketOutputSchema},
  "project-weekly-cash": {methodVersion: "2026.10.23-v1", executorVersion: "2026.10.23-v1", packet: "weekly-cash-packet.v1", schema: weeklyCashPacketOutputSchema},
  "build-operating-projection": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "operating-projection-packet.v1", schema: operatingProjectionPacketOutputSchema},
  "challenge-financial-projection": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "projection-challenge-packet.v1", schema: projectionChallengePacketOutputSchema},
  "monetize-receivables-for-working-capital": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "receivables-funding-packet.v1", schema: receivablesFundingPacketOutputSchema},
  "analyze-relative-debt-cost": {methodVersion: "2026.10.19-v2", executorVersion: "2026.10.19-v1", packet: "relative-debt-cost-packet.v1", schema: relativeDebtCostPacketOutputSchema},
  "compare-financing-proposals": {methodVersion: "2026.10.19-v2", executorVersion: "2026.10.19-v1", packet: "financing-comparison-packet.v1", schema: financingComparisonPacketOutputSchema},
  "assess-debt-capacity": {methodVersion: "2026.10.19-v2", executorVersion: "2026.10.19-v1", packet: "debt-capacity-packet.v1", schema: debtCapacityPacketOutputSchema},
  "evaluate-financing-paths": {methodVersion: "2026.10.27-v1", executorVersion: "2026.10.27-v1", packet: "capital-structure-paths-packet.v1", schema: capitalPathsPacketOutputSchema},
  "update-after-quarter-close": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "quarter-update-packet.v1", schema: quarterUpdatePacketOutputSchema},
} as const;
export type BoardSourceMethodId = keyof typeof boardReleasedSources;
export const boardSourceMethodIds = Object.keys(boardReleasedSources) as [BoardSourceMethodId, ...BoardSourceMethodId[]];

/** A reviewed result as the conversation brings it: the packet of a completed execution, verbatim, as its JSON text. */
export const boardSourcePacketSchema = z.strictObject({id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), packet: z.string().min(2).max(8388608)});

/** The stored text of one result, as an object; anything else is refused by name. */
export function parseBoardSourceText(id: string, text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(`board_capital_source_invalid:${id}`); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`board_capital_source_invalid:${id}`);
  return value as Record<string, unknown>;
}

/** Checks one reviewed result against the method and fingerprint the basis names: parsed by the released
 * packet schema (which also restores the key order the fingerprint was taken on), fingerprint recomputed,
 * same company and currency as the discussion. Nothing in it is recalculated. */
export function verifyBoardSource(named: {id: string; methodId: string; packetFingerprint: string}, raw: Record<string, unknown>, context: {entityId: string; currency: string}): BoardSourceReading {
  const released = boardReleasedSources[named.methodId as BoardSourceMethodId];
  if (!released) throw new Error(`board_capital_source_method_not_released:${named.id}`);
  if (raw.schemaVersion !== released.packet || raw.executorVersion !== released.executorVersion) throw new Error(`board_capital_source_version_mismatch:${named.id}`);
  const parsed = (released.schema as unknown as {safeParse: (v: unknown) => {success: boolean; data?: Record<string, unknown>}}).safeParse(raw);
  if (!parsed.success || !parsed.data) throw new Error(`board_capital_source_invalid:${named.id}`);
  const {fingerprint, ...payload} = parsed.data;
  if (createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== fingerprint) throw new Error(`board_capital_source_fingerprint_mismatch:${named.id}`);
  if (fingerprint !== named.packetFingerprint) throw new Error(`board_capital_source_not_named:${named.id}`);
  if (payload.entityId !== context.entityId || payload.currency !== context.currency) throw new Error(`board_capital_source_context_mismatch:${named.id}`);
  const gaps = Array.isArray(payload.gaps) ? (payload.gaps as {operand: string; reason: string}[]).map((g) => ({operand: g.operand, reason: g.reason})) : [];
  return {id: named.id, methodId: named.methodId, methodVersion: released.methodVersion, executorVersion: released.executorVersion, packetSchemaVersion: released.packet,
    packetFingerprint: fingerprint as string, status: String(payload.status), gaps, packet: parsed.data};
}
