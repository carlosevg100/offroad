import {hasUnitScale} from "./adopted-input-scale";
import {createHash} from "node:crypto";
import {z} from "zod";
import {buildLiquidityCalendar, financialCoreVersion} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";

const selection = z.strictObject({decisionId: z.uuid().nullable(), definitionVersionId: z.uuid(), definitionKind: z.enum(["reported", "managerial", "contractual"]), missingReason: z.string().trim().min(1).max(2000).nullable()})
  .refine(s => (s.decisionId === null) === (s.missingReason !== null), "Select a contribution or explain its absence");
export const adoptedLiquidityCalendarInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  entityId: z.uuid(), perimeter: z.string().trim().min(1).max(300), currency: z.string().regex(/^[A-Z]{3}$/),
  openingScenario: z.string().trim().min(1).max(160), scenario: z.string().trim().min(1).max(160),
  openingDate: z.iso.date(), endDate: z.iso.date(), convention: z.literal("end_of_day_netting"),
  coverage: z.strictObject({status: z.enum(["complete", "partial"]), reason: z.string().trim().min(1).max(2000)}),
  openingAvailable: selection, openingRestricted: selection,
  events: z.array(z.strictObject({id: z.string().trim().min(1).max(160), date: z.iso.date(), account: z.enum(["available", "restricted"]), direction: z.enum(["inflow", "outflow"]), selection})).max(10000),
});
/** Integrity/scope adapter only. Use an authorized SQL basis reader; this digest is not permission.
 * Cash entries use dedicated field paths: an annual EBITDA or debt-service aggregate cannot
 * be relabeled as a dated cash event. Event adoption covers exactly its effective cash date.
 */
export function calculateAdoptedLiquidityCalendar(raw: unknown) {
  const input = adoptedLiquidityCalendarInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(entry => [entry.decisionId, entry]));
  const used = new Map<string, AdoptionBasisEntry>();
  const bindings: {operand: string; decisionId: string | null; missingReason: string | null}[] = [];
  const read = (selected: z.infer<typeof selection>, operand: string, fieldPath: string, date: string, scenario: string, flow: boolean) => {
    bindings.push({operand, decisionId: selected.decisionId, missingReason: selected.missingReason});
    if (selected.decisionId === null) return null;
    const entry = entries.get(selected.decisionId);
    if (!entry || used.has(entry.decisionId)) throw new Error("liquidity_contribution_missing_or_reused");
    const d = entry.dimensions;
    if (entry.value.type !== "number" || entry.fieldPath !== fieldPath || entry.definitionKind !== selected.definitionKind
      || d.definitionVersionId !== selected.definitionVersionId || d.entityId !== input.entityId || d.perimeter !== input.perimeter
      || d.currency !== input.currency || d.unit !== "currency" || !hasUnitScale(d.scale) || d.periodEnd !== date || d.periodStart !== (flow ? date : null)
      || d.scenario !== scenario) throw new Error("liquidity_adoption_context_mismatch");
    used.set(entry.decisionId, entry);
    return entry.value.value;
  };
  const openingAvailable = read(input.openingAvailable, "opening.available", "liquidity.available_cash", input.openingDate, input.openingScenario, false);
  const openingRestricted = read(input.openingRestricted, "opening.restricted", "liquidity.restricted_cash", input.openingDate, input.openingScenario, false);
  const events = input.events.map(event => ({id: event.id, date: event.date, account: event.account, direction: event.direction, amount: read(event.selection, `event.${event.id}`, `liquidity.cash_${event.direction}`, event.date, input.scenario, true), missingReason: event.selection.missingReason}));
  const calculation = buildLiquidityCalendar({...input, openingAvailable, openingRestricted, events});
  const payload = {
    schemaVersion: "adopted-liquidity-calendar.v1" as const,
    financialCoreVersion, calculationId: "financial.dated_liquidity" as const,
    scope: input.scope, entityId: input.entityId, perimeter: input.perimeter,
    openingScenario: input.openingScenario, scenario: input.scenario,
    basisFingerprint: input.envelope.fingerprint,
    classification: [...used.values()].some(entry => entry.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    calculation, bindings, contributions: [...used.values()], grantsExecution: false as const,
  };
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
