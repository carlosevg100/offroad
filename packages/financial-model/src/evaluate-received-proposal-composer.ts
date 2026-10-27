import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {receivedProposalPacketInputSchema, type ReceivedProposalPacketInput} from "./evaluate-received-proposal-packet";

const text = z.string().trim().min(1).max(2000);
export const boundReceivedProposalInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const analysisPath = new RegExp(`^received_proposal\\.(${uuid})\\.`);
const groupPath = (group: string) => new RegExp(`^${group}\\.(${k})\\.[A-Za-z]+$`);

/** Composes the received proposal packet input from the working basis alone. The basis carries one
 * analysis (`received_proposal.<analysis>.`); its uses, buckets, variants and alternatives are every id
 * the adopted order lists and every `use.<key>`, `bucket.<key>`, `variant.<key>` or `alternative.<key>` a
 * field path names, listed ones first. The lender's covenant, the board policy, the market reference and
 * the company's last operation are composed when any of their terms is adopted, and then every term is
 * selected. Every operand is selected by field path, scenario, unit and type in the analysis's own
 * dimensions; an absent operand, or one adopted twice for the same slot, is declared missing with its
 * reason. Optional operands absent stay null. */
export function composeBoundReceivedProposal(raw: unknown): ReceivedProposalPacketInput {
  const input = boundReceivedProposalInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("received_proposal_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("received_proposal_analysis_ambiguous");
  // The adopted proposal amount anchors the dimensions when present.
  const analysisId = roles[0]!.analysisId, anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".proposal.amount")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!;
  const prefix = `received_proposal.${analysisId}.`;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.scenario === sc && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, unit: string, type: ValueType): Selection {
    const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit
      && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
    if (matches.length === 1) {
      const e = matches[0]!; used.add(e.decisionId);
      const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(selection); return selection;
    }
    const selection = {decisionId: null, definitionVersionId: anchor.dimensions.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${sc}; keep one value per slot in the working basis`
        : `No contribution adopted for ${p} in scenario ${sc}`};
    missing.push(selection); return selection;
  }
  const has = (p: string) => own.some((e) => e.fieldPath === prefix + p);
  const optional = (p: string, unit: string, type: ValueType) => has(p) ? select(p, unit, type) : null;
  const anyOf = (paths: string[]) => paths.some(has);
  const order = (p: string) => {
    const found = own.filter((e) => e.fieldPath === prefix + p && e.value.type === "list");
    if (found.length > 1) throw new Error("received_proposal_order_ambiguous");
    const list = z.array(z.string().regex(new RegExp(`^${k}$`))).parse(found[0]?.value.value ?? []);
    if (new Set(list).size !== list.length) throw new Error("received_proposal_order_ambiguous");
    return list;
  };
  // Every id the adopted order lists or any field path names is composed; none disappears silently.
  const keys = (group: string, orderPath: string) => {
    const listed = order(orderPath), pattern = groupPath(group);
    const seen = [...new Set(own.flatMap((e) => {const m = pattern.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !listed.includes(x)).sort();
    return [...listed, ...seen];
  };
  const n = (p: string, unit: string) => select(p, unit, "number"), t = (p: string, unit: string) => select(p, unit, "text");
  const dt = (p: string) => select(p, "date", "date"), b = (p: string) => select(p, "convention", "boolean"), l = (p: string, unit: string) => select(p, unit, "list");
  const proposal = {lender: t("proposal.lender", "text"), indexer: t("proposal.indexer", "convention"), firmness: t("proposal.firmness", "convention"), termSheetDate: dt("proposal.termSheetDate"),
    validityDays: n("proposal.validityDays", "days"), amount: n("proposal.amount", "currency"), annualSpread: n("proposal.annualSpread", "ratio"), feeRate: n("proposal.feeRate", "ratio"),
    drawDate: dt("proposal.drawDate"), paymentDay: n("proposal.paymentDay", "count"), graceMonths: n("proposal.graceMonths", "count"), installments: n("proposal.installments", "count"),
    installmentEveryMonths: n("proposal.installmentEveryMonths", "count"), interestEveryMonths: n("proposal.interestEveryMonths", "count"), amortization: t("proposal.amortization", "convention"),
    collateralKind: t("proposal.collateralKind", "convention"), coverage: n("proposal.coverage", "ratio"), restrictedAccount: b("proposal.restrictedAccount"),
    ...(anyOf(["proposal.covenantLimit", "proposal.covenantTestDates", "proposal.covenantDefinition"])
      ? {covenantLimit: n("proposal.covenantLimit", "ratio"), covenantTestDates: l("proposal.covenantTestDates", "date"), covenantDefinition: t("proposal.covenantDefinition", "convention")}
      : {covenantLimit: null, covenantTestDates: null, covenantDefinition: null}),
    prepaymentPenaltyRate: n("proposal.prepaymentPenaltyRate", "ratio"), prepaymentPenaltyMonths: n("proposal.prepaymentPenaltyMonths", "count"),
    reciprocity: t("proposal.reciprocity", "convention"), bankSawIndenture: b("proposal.bankSawIndenture")};
  const policy = anyOf(["covenant.policyLimit", "covenant.policyTestDates", "covenant.policySource"])
    ? {policyLimit: n("covenant.policyLimit", "ratio"), policyTestDates: l("covenant.policyTestDates", "date"), policySource: t("covenant.policySource", "text")}
    : {policyLimit: null, policyTestDates: null, policySource: null};
  const marketFields = ["comparable", "low", "median", "high", "sample", "confidence", "observedOn"].map((x) => `market.${x}`);
  const historyFields = ["label", "spread", "date", "adjustmentIds", "adjustmentFamilies", "adjustmentBps", "adjustmentAnchors"].map((x) => `history.${x}`);
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate: d.periodStart!, endDate: d.periodEnd!,
    numericInterpretations: [], analysisId, scenario: sc, readingDate: dt("readingDate"), needDate: dt("needDate"), proposal,
    creditTax: {fixedRate: n("creditTax.fixedRate", "ratio"), dailyRate: n("creditTax.dailyRate", "ratio"), maxDays: n("creditTax.maxDays", "days")},
    curve: {years: l("curve.years", "identity"), rates: l("curve.rates", "ratio")}, tax: {regime: t("tax.regime", "convention"), rate: n("tax.rate", "ratio"), taxableAfterCalendar: optional("tax.taxableAfterCalendar", "convention", "boolean")},
    uses: keys("use", "order.uses").map((id) => {const q = `use.${id}.`; return {id, label: t(q + "label", "text"), amount: n(q + "amount", "currency"), kind: t(q + "kind", "convention"),
      tenorMinYears: n(q + "tenorMinYears", "years"), tenorMaxYears: n(q + "tenorMaxYears", "years")};}),
    seasonalPeak: optional("seasonalPeak", "currency", "number"),
    calendar: {periodEnds: l("calendar.periodEnds", "date"), existingService: l("calendar.existingService", "currency"), availableForService: l("calendar.availableForService", "currency"),
      closingCash: l("calendar.closingCash", "currency"), taxable: l("calendar.taxable", "boolean"), minimumCash: optional("calendar.minimumCash", "currency", "number")},
    covenant: {indentureLimit: n("covenant.indentureLimit", "ratio"), indentureTestDates: l("covenant.indentureTestDates", "date"), indentureSource: t("covenant.indentureSource", "text"), requiredScenarios: l("covenant.requiredScenarios", "identity"),
      ...policy, dates: l("covenant.dates", "date"), scenarios: l("covenant.scenarios", "identity"), debt: l("covenant.debt", "currency"), cash: l("covenant.cash", "currency"),
      reportedEbitda: l("covenant.reportedEbitda", "currency"), definitionAdjustment: l("covenant.definitionAdjustment", "currency")},
    portfolio: keys("bucket", "order.buckets").map((id) => {const q = `bucket.${id}.`; return {id, label: t(q + "label", "text"), amount: n(q + "amount", "currency"),
      contract: t(q + "contract", "convention"), encumbrance: t(q + "encumbrance", "convention"), holder: optional(q + "holder", "text", "text"), pastDue: b(q + "pastDue"),
      countsAgainstBasket: b(q + "countsAgainstBasket")};}),
    basket: {limit: n("basket.limit", "currency"), basis: t("basket.basis", "convention"), occupied: n("basket.occupied", "currency"),
      consentLeadDaysMin: n("basket.consentLeadDaysMin", "days"), consentLeadDaysMax: n("basket.consentLeadDaysMax", "days")},
    collateralReference: {coverageLow: n("collateralReference.coverageLow", "ratio"), coverageHigh: n("collateralReference.coverageHigh", "ratio")},
    market: anyOf(marketFields) ? {comparable: b("market.comparable"), low: n("market.low", "ratio"), median: n("market.median", "ratio"), high: n("market.high", "ratio"),
      sample: n("market.sample", "count"), confidence: t("market.confidence", "convention"), observedOn: dt("market.observedOn")} : null,
    history: anyOf(historyFields) ? {label: t("history.label", "text"), spread: n("history.spread", "ratio"), date: dt("history.date"), adjustmentIds: l("history.adjustmentIds", "identity"),
      adjustmentFamilies: l("history.adjustmentFamilies", "convention"), adjustmentBps: l("history.adjustmentBps", "ratio"), adjustmentAnchors: l("history.adjustmentAnchors", "text")} : null,
    variants: keys("variant", "order.variants").map((id) => {const q = `variant.${id}.`; return {id, label: t(q + "label", "text"), graceMonths: n(q + "graceMonths", "count"),
      installments: n(q + "installments", "count"), coverage: n(q + "coverage", "ratio"), restrictedAccount: b(q + "restrictedAccount")};}),
    alternatives: keys("alternative", "order.alternatives").map((id) => {const q = `alternative.${id}.`; return {id, label: t(q + "label", "text"),
      allInSpread: optional(q + "allInSpread", "ratio", "number"), collateral: n(q + "collateral", "currency"), usesCovered: l(q + "usesCovered", "identity"),
      monthsToMoneyMin: n(q + "monthsToMoneyMin", "months"), monthsToMoneyMax: n(q + "monthsToMoneyMax", "months")};}),
  };
  // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  return receivedProposalPacketInputSchema.parse({schemaVersion: "received-proposal-packet-input.v1", question: input.question, analysis});
}
