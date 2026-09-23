import {z} from "zod";
import {financingCostCategories} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry, type AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";
import {capitalProcedurePacketV2InputSchema} from "./capital-procedure-packet-v2";

const text = z.string().trim().min(1).max(2000);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const boundCapitalPacketInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text, objectives: z.array(text).min(1).max(30), asOf: z.iso.date(),
  entityId: z.uuid(), perimeter: z.string().trim().min(1).max(300), currency: z.string().regex(/^[A-Z]{3}$/),
  openingScenario: z.string().trim().min(1).max(160), scenario: z.string().trim().min(1).max(160),
  openingDate: z.iso.date(), endDate: z.iso.date(),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon");
export type BoundCapitalPacketInput = z.infer<typeof boundCapitalPacketInputSchema>;
export type BoundCapitalPacketV2Input = z.infer<typeof capitalProcedurePacketV2InputSchema>;
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];

const next = (value: string) => {const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);};
const yearLater = (value: string) => {const d = new Date(`${value}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); return d.toISOString().slice(0, 10);};
/** Most frequent value; ties resolve by sorted key so the choice never depends on entry order. */
function mode<T>(values: readonly T[], key: (value: T) => string): T | null {
  const counts = new Map<string, {value: T; count: number}>();
  for (const value of values) {const k = key(value); const prior = counts.get(k); if (prior) prior.count += 1; else counts.set(k, {value, count: 1});}
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))[0]?.[1].value ?? null;
}

/** Reads the projection scope from the basis itself: entity, perimeter and currency come from
 * the largest consistent group of contributions, the opening position is the latest adopted
 * stock date on or before the reference date, the horizon end is the period those flows cover,
 * and scenario labels are the ones the basis already carries. Nothing here is invented: when
 * the basis carries no flows after the opening, the horizon is one year, and that choice is
 * visible in every projection the packet returns. */
export function deriveBoundCapitalScope(basis: AdoptionBasisSnapshot, asOf: string) {
  z.iso.date().parse(asOf);
  const group = mode(basis.entries.map(e => ({entityId: e.dimensions.entityId!, perimeter: e.dimensions.perimeter!})), g => JSON.stringify([g.entityId, g.perimeter]))!;
  const inGroup = basis.entries.filter(e => e.dimensions.entityId === group.entityId && e.dimensions.perimeter === group.perimeter);
  const currency = mode(inGroup.flatMap(e => e.dimensions.currency ? [e.dimensions.currency] : []), c => c);
  if (!currency) throw new Error("capital_packet_scope_currency_missing");
  const monetary = inGroup.filter(e => e.dimensions.currency === currency);
  const stocks = monetary.filter(e => e.dimensions.periodStart === null); const flows = monetary.filter(e => e.dimensions.periodStart !== null);
  const openingDate = stocks.map(e => e.dimensions.periodEnd!).filter(d => d <= asOf).sort().at(-1) ?? asOf;
  const openingFlows = flows.filter(e => e.dimensions.periodStart === next(openingDate));
  const endDate = mode(openingFlows.map(e => e.dimensions.periodEnd!), d => d)
    ?? monetary.map(e => e.dimensions.periodEnd!).filter(d => d > openingDate).sort().at(-1) ?? yearLater(openingDate);
  const label = (candidates: AdoptionBasisEntry[][]) => candidates.map(c => mode(c.map(e => e.dimensions.scenario!), s => s)).find(s => s !== null) ?? null;
  const scenario = label([openingFlows, flows, basis.entries])!;
  const openingScenario = label([stocks.filter(e => e.dimensions.periodEnd === openingDate), stocks, [{dimensions: {scenario}} as AdoptionBasisEntry]])!;
  return {entityId: group.entityId, perimeter: group.perimeter, currency, openingDate, endDate, openingScenario, scenario};
}

/** Composes the capital packet input for one execution: exactly one maintain alternative whose
 * envelope is the working basis, every operand selected from that basis by field path and
 * dimensions, and every operand the basis does not carry declared missing with its reason. The
 * packet never proposes a change, a recommendation, a contract or an adoption link; contracts and
 * links stay empty until they are prepared and reviewed on their own. The packet schema requires a
 * definition reference on every selection, resolved or not: a missing operand borrows the
 * reference of the same metric elsewhere in the basis, or else of the basis's first contribution,
 * and its reason says so. The executor ignores that reference for a missing operand. */
export function composeBoundCapitalPacketV2(raw: unknown): BoundCapitalPacketV2Input {
  const input = boundCapitalPacketInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const consumedDecisions = new Set<string>(); const consumedObservations = new Set<string>();
  const firstDate = next(input.openingDate);
  const inScope = (e: AdoptionBasisEntry) => e.dimensions.entityId === input.entityId && e.dimensions.perimeter === input.perimeter && e.dimensions.currency === input.currency;
  const placeholder = (fieldPath: string) => entries.find(e => e.fieldPath === fieldPath) ?? null;
  const period = (opening: boolean) => opening ? `the opening position at ${input.openingDate} (${input.openingScenario})` : `the period ${firstDate} to ${input.endDate} (${input.scenario})`;
  function select(fieldPath: string, unit: string, type: ValueType, opening = false): Selection {
    const d = {periodStart: opening ? null : firstDate, periodEnd: opening ? input.openingDate : input.endDate, scenario: opening ? input.openingScenario : input.scenario};
    const matches = entries.filter(e => e.fieldPath === fieldPath && e.value.type === type && inScope(e) && e.dimensions.unit === unit
      && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd && e.dimensions.scenario === d.scenario
      && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !consumedDecisions.has(e.decisionId) && !(e.observationId && consumedObservations.has(e.observationId)));
    if (matches.length === 1) {
      const e = matches[0]!; consumedDecisions.add(e.decisionId); if (e.observationId) consumedObservations.add(e.observationId);
      return {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
    }
    const same = placeholder(fieldPath); const reference = same ?? entries[0]!;
    const reason = matches.length ? `${matches.length} contributions match ${fieldPath} for ${period(opening)}; keep one value per slot in the working basis`
      : `No contribution adopted for ${fieldPath} for ${period(opening)}`;
    const note = same ? "" : `; the definition reference ${reference.dimensions.definitionVersionId} is a placeholder the packet schema requires, not this operand's definition`;
    return {decisionId: null, definitionVersionId: reference.dimensions.definitionVersionId!, definitionKind: reference.definitionKind, missingReason: reason + note};
  }
  const present = (fieldPath: string) => entries.some(e => e.fieldPath === fieldPath && inScope(e));
  const list = (fieldPath: string, unit = "currency") => select(fieldPath, unit, "list");
  const scope = input.scope; const envelope = input.envelope;
  const numericInterpretations = discoverNumericInterpretations(entries, envelope, scope);
  const stock = (opening: boolean) => Object.fromEntries((["receivables", "inventory", "otherOperatingAssets", "payables", "otherOperatingLiabilities"] as const)
    .map(key => [key, opening ? select(`operating_projection.workingCapital.${key}`, "currency", "number", true) : list(`operating_projection.workingCapital.${key}`)])) as Record<"receivables" | "inventory" | "otherOperatingAssets" | "payables" | "otherOperatingLiabilities", Selection>;
  const convention = select("operating_projection.convention", "convention", "text");
  const openingWorkingCapital = stock(true); const periodEnds = select("operating_projection.periodEnds", "date", "list");
  const revenueMode = entries.find(e => e.fieldPath === "operating_projection.revenue.convention" && inScope(e) && e.dimensions.scenario === input.scenario && e.dimensions.periodStart === firstDate && e.dimensions.periodEnd === input.endDate)?.value.value;
  const revenueConvention = select("operating_projection.revenue.convention", "convention", "text");
  const revenue = revenueMode === "drivers"
    ? {mode: "drivers" as const, convention: revenueConvention, quantities: list("operating_projection.revenue.quantities", "quantity"), netUnitPrices: list("operating_projection.revenue.netUnitPrices")}
    : {mode: "amount" as const, convention: revenueConvention, amounts: list("operating_projection.revenue.amounts")};
  const closingWorkingCapital = stock(false);
  const expenses = Object.fromEntries((["variableOperatingExpense", "fixedOperatingExpense", "nonCashEbitdaAdjustment", "cashTaxesPaid", "cashTaxRefunds", "maintenanceCapexPaid", "growthCapexPaid"] as const)
    .map(key => [key, list(`operating_projection.${key}`)])) as Record<"variableOperatingExpense" | "fixedOperatingExpense" | "nonCashEbitdaAdjustment" | "cashTaxesPaid" | "cashTaxRefunds" | "maintenanceCapexPaid" | "growthCapexPaid", Selection>;
  const operating = {envelope, scope, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, openingScenario: input.openingScenario, scenario: input.scenario,
    openingDate: input.openingDate, endDate: input.endDate, numericInterpretations, convention, openingWorkingCapital, periodEnds, revenue, closingWorkingCapital, expenses};
  // Adopted instrument terms take precedence over a "no debt" declaration: ignoring adopted debt
  // would overstate liquidity, while an unused declaration simply stays in the basis.
  const instrumentIds = [...new Set(entries.filter(inScope).flatMap(e => {const m = /^debt\.([0-9a-f-]{36})\.[A-Za-z]+$/.exec(e.fieldPath); return m && uuid.test(m[1]!) ? [m[1]!] : [];}))].sort();
  const openingAvailable = select("liquidity.available_cash", "currency", "number", true); const openingRestricted = select("liquidity.restricted_cash", "currency", "number", true);
  const funding = instrumentIds.length ? {kind: "debt" as const, input: {envelope, scope, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    openingScenario: input.openingScenario, scenario: input.scenario, openingDate: input.openingDate, endDate: input.endDate, openingAvailable, openingRestricted,
    instruments: instrumentIds.map(id => ({id, terms: {
      timing: select(`debt.${id}.timing`, "convention", "text"), indexer: select(`debt.${id}.indexer`, "convention", "text"),
      indexationTreatment: select(`debt.${id}.indexationTreatment`, "convention", "text"), couponTreatment: select(`debt.${id}.couponTreatment`, "convention", "text"),
      couponBase: select(`debt.${id}.couponBase`, "convention", "text"), drawdownAccount: select(`debt.${id}.drawdownAccount`, "convention", "text"),
      paymentAccount: select(`debt.${id}.paymentAccount`, "convention", "text"), openingPrincipal: select(`debt.${id}.openingPrincipal`, "currency", "number", true),
      periodEnds: list(`debt.${id}.periodEnds`, "date"), indexationRates: list(`debt.${id}.indexationRates`, "ratio"), couponRates: list(`debt.${id}.couponRates`, "ratio"),
      drawdowns: list(`debt.${id}.drawdowns`), scheduledPrincipal: list(`debt.${id}.scheduledPrincipal`), prepayments: list(`debt.${id}.prepayments`), repayAll: list(`debt.${id}.repayAll`, "boolean")}})),
    operatingEvents: [], coverageReason: "Operating cash comes from the accrual-to-cash budget of this packet; no dated operating events are declared",
    numericInterpretations,
    financing: instrumentIds.map(id => ({instrumentId: id, drawConvention: select(`financing.${id}.drawConvention`, "convention", "text"),
      assessments: Object.fromEntries(financingCostCategories.map(category => [category, select(`financing.${id}.${category}.assessment`, "convention", "text")])) as Record<typeof financingCostCategories[number], Selection>,
      charges: present(`financing.${id}.chargeIds`) ? {chargeIds: list(`financing.${id}.chargeIds`, "identity"), economicIds: list(`financing.${id}.economicIds`, "identity"),
        categories: list(`financing.${id}.categories`, "convention"), periods: list(`financing.${id}.periods`, "date"), dates: list(`financing.${id}.dates`, "date"),
        amounts: list(`financing.${id}.amounts`), treatments: list(`financing.${id}.treatments`, "convention"), accounts: list(`financing.${id}.accounts`, "convention")} : null}))}}
    : {kind: "no_debt" as const, inventory: select("capital.financingInventory", "convention", "text"), openingAvailable, openingRestricted};
  const operatingCashAccount = select("capital.operatingCashAccount", "convention", "text");
  const capitalMovementInventory = select("capital.movementInventory", "convention", "text");
  const capitalMovements = present("capital.movements.ids") ? {ids: list("capital.movements.ids", "identity"), economicIds: list("capital.movements.economicIds", "identity"),
    dates: list("capital.movements.dates", "date"), amounts: list("capital.movements.amounts"), accounts: list("capital.movements.accounts", "convention"),
    kinds: list("capital.movements.kinds", "convention"), reasons: list("capital.movements.reasons", "explanation")} : null;
  const packet = {schemaVersion: "capital-procedure-packet-input.v2", decision: {review: {
    composition: {workId: scope.workId, purpose: scope.purpose, question: input.question, objectives: input.objectives,
      alternatives: [{id: "current", label: "Current structure as recorded in the working basis", kind: "maintain",
        projection: {operating, funding, operatingCashAccount, capitalMovementInventory, capitalMovements},
        rationale: "Reflects the contributions adopted in the working basis without proposing a change", conditions: [],
        disconfirmers: ["The working basis is revised or a contribution it relies on is withdrawn"]}],
      maintenanceExclusion: null, sensitivities: [], recommendation: null},
    asOf: input.asOf, ratios: [], alternativeConditions: [], marketReferences: [], reviewItems: []},
    material: {requested: false, audience: "authorized_work_participants"}}, contracts: [], adoptionLinks: []};
  return capitalProcedurePacketV2InputSchema.parse(packet);
}

/** Interpretation groups the basis already carries, kept only when the numeric reader accepts
 * them together; a malformed group is left out rather than turned into a calculation failure. */
function discoverNumericInterpretations(entries: AdoptionBasisEntry[], envelope: BoundCapitalPacketInput["envelope"], scope: BoundCapitalPacketInput["scope"]) {
  const ids = [...new Set(entries.flatMap(e => {const m = /^numeric_representation\.([0-9a-f-]{36})\.(mode|members)$/.exec(e.fieldPath); return m && uuid.test(m[1]!) ? [m[1]!] : [];}))].sort();
  const accepted: {id: string; mode: Omit<Selection, "missingReason">; members: Omit<Selection, "missingReason">}[] = [];
  for (const id of ids) {
    const mode = entries.find(e => e.fieldPath === `numeric_representation.${id}.mode`); const members = entries.find(e => e.fieldPath === `numeric_representation.${id}.members`);
    if (!mode || !members || members.value.type !== "list") continue;
    const pick = (e: AdoptionBasisEntry) => ({decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind});
    const candidate = {id, mode: pick(mode), members: pick(members)};
    try {
      resolveAdoptedCurrencyValues({envelope, scope, decisionIds: [...new Set(members.value.value)], groups: [...accepted, candidate]});
      accepted.push(candidate);
    } catch {/* the group is not usable as adopted; the operands it covers report a representation gap instead */}
  }
  return accepted;
}
