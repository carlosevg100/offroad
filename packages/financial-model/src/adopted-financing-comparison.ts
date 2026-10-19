import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {compareFinancingProposals, financialCoreVersion, financingCostCategories, type DatedDebtInstrument, type FinancingCharge,
  type FinancingProposalComparisonInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, analysisAmount, analysisReference, createAnalysisBinding, type AnalysisSelection} from "./adopted-analysis-binding";

export const adoptedFinancingComparisonVersion = "2026.10.19-v2";
const debtTermNames = ["timing", "indexer", "couponTreatment", "couponBase", "drawdownAccount", "paymentAccount",
  "openingPrincipal", "couponRates", "drawdowns", "scheduledPrincipal", "prepayments", "repayAll"] as const;
/** Without an indexer ("none") the principal is not corrected: the indexation treatment and rates follow
 * from that adopted fact and are not adopted again. With an indexer both are required. */
const debtTerms = z.strictObject({...Object.fromEntries(debtTermNames.map((k) => [k, selection])) as Record<typeof debtTermNames[number], typeof selection>,
  indexationTreatment: selection.optional(), indexationRates: selection.optional(), paysAccruedCoupon: selection.optional()});
/** `instrumentIds`, when adopted, names who each charge is paid to: "self" (the instrument itself) or an existing debt
 * (a consent fee paid to another lender's holders, for example). Without it every charge belongs to the instrument. */
const chargeSeries = z.strictObject({chargeIds: selection, categories: selection, dates: selection, amounts: selection, deductible: selection, instrumentIds: selection.optional()});
const laterChargeSeries = z.strictObject({chargeIds: selection, categories: selection, dates: selection, amounts: selection});
const companyMoneyNames = ["ebitda", "cashLeasePayments", "depreciationAndAmortization", "workingCapitalCashFlow", "maintenanceCapexPaid", "growthCapexPaid"] as const;
const lifetimeNames = ["periodEnds", "yearFractions", "annualIndex", "yearFractionConventions", "scheduledPrincipal", "paysAccruedInterest"] as const;

export const adoptedFinancingComparisonInputSchema = adoptedAnalysisContextSchema.safeExtend({
  comparisonId: analysisReference, scenario: z.string().trim().min(1).max(160), inheritedScenario: z.string().trim().min(1).max(160).optional(),
  periodEnds: selection,
  company: z.strictObject({openingAvailableCash: selection, money: z.strictObject(Object.fromEntries(companyMoneyNames.map((k) => [k, selection])) as Record<typeof companyMoneyNames[number], typeof selection>),
    cashTaxRate: selection, lossTaxTreatment: selection, freeReceivablesPool: selection,
    covenantHistoryPeriods: selection, covenantHistoryEbitda: selection, covenantHistoryLeasePayments: selection,
    /** Company policy, when adopted: minimum cash at period ends and maximum share of the receivables pool given as collateral. */
    minimumCashPolicy: selection.optional(), maximumCollateralShare: selection.optional()}),
  instruments: z.array(z.strictObject({id: z.uuid(), terms: debtTerms, charges: chargeSeries.nullable()})).max(15),
  /** Each proposal is described once, over its life; its place in the company is derived from it. */
  proposals: z.array(z.strictObject({id: z.uuid(), label: z.string().trim().min(1).max(160), charges: chargeSeries.nullable(),
    collateralConsumed: selection,
    covenant: z.strictObject({name: selection, leaseLiabilityInDebt: selection, leaseLiability: selection, ebitdaExcludesLeases: selection,
      trailingPeriods: selection, measurementPeriods: selection, limit: selection, comparator: selection}),
    lifetime: z.strictObject({grossAdvance: selection, upfrontWithheldCosts: selection, annualSpread: selection, unpaidInterestBase: selection,
      lowerSpread: selection, upperSpread: selection, ...Object.fromEntries(lifetimeNames.map((k) => [k, selection])) as Record<typeof lifetimeNames[number], typeof selection>,
      /** Draw date: the contractual date, or on a period grid the end of the period before the draw. */
      drawDate: selection,
      /** Business days of each period, required for the DU/252 convention; the fraction is then derived from them. */
      businessDays: selection.optional(),
      /** The lender's charges after the horizon (recurring fees), on lifetime period ends. */
      chargesAfterHorizon: laterChargeSeries.optional()}),
  })).min(1).max(8),
}).refine((i) => i.inheritedScenario !== i.scenario, "A scenario cannot inherit from itself").refine((i) => new Set([...i.instruments.map((x) => x.id), ...i.proposals.map((x) => x.id)]).size === i.instruments.length + i.proposals.length, "Duplicate instrument");
export type AdoptedFinancingComparisonInput = z.infer<typeof adoptedFinancingComparisonInputSchema>;

const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,16})?$/);
const flag = z.enum(["true", "false"]);
const nextDate = (value: string) => {const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);};

/** Reads every operand of the comparison from the adopted basis, then recomputes. Nothing is
 * injected by the caller: periods, debt terms, charges, collateral, covenant definitions, tax rule
 * and lifetime terms are adopted with origin. Missing operands become named gaps; no default. */
export function calculateAdoptedFinancingComparison(raw: unknown) {
  const input = adoptedFinancingComparisonInputSchema.parse(raw);
  const termMoney = (t: z.infer<typeof debtTerms>) => [t.openingPrincipal, t.drawdowns, t.scheduledPrincipal, t.prepayments];
  const money: AnalysisSelection[] = [input.company.openingAvailableCash, ...Object.values(input.company.money), input.company.freeReceivablesPool, ...(input.company.minimumCashPolicy ? [input.company.minimumCashPolicy] : []),
    input.company.covenantHistoryEbitda, input.company.covenantHistoryLeasePayments,
    ...input.instruments.flatMap((i) => [...termMoney(i.terms), ...(i.charges ? [i.charges.amounts] : [])]),
    ...input.proposals.flatMap((p) => [...(p.charges ? [p.charges.amounts] : []), ...(p.lifetime.chargesAfterHorizon ? [p.lifetime.chargesAfterHorizon.amounts] : []), p.collateralConsumed, p.covenant.leaseLiability,
      p.lifetime.grossAdvance, p.lifetime.upfrontWithheldCosts, p.lifetime.scheduledPrincipal])];
  const b = createAnalysisBinding(input, money, {inheritedScenario: input.inheritedScenario});
  const prefix = `comparison.${input.comparisonId}.`;
  const scalar = <T>(s: AnalysisSelection, path: string, unit: string, type: "number" | "text" | "date", schema: z.ZodType<T>) => b.read(s, prefix + path, input.scenario, unit, type, schema);
  const column = <T>(s: AnalysisSelection, path: string, unit: string, schema: z.ZodType<T>) => b.read(s, prefix + path, input.scenario, unit, "list", z.array(schema).min(1).max(2000));
  const ends = column(input.periodEnds, "periodEnds", "date", z.iso.date());
  const c = input.company;
  const companyCols = Object.fromEntries(companyMoneyNames.map((k) => [k, column(c.money[k], "company." + k, "currency", analysisAmount)])) as Record<typeof companyMoneyNames[number], string[] | null>;
  const opening = scalar(c.openingAvailableCash, "company.openingAvailableCash", "currency", "number", analysisAmount);
  const taxRate = scalar(c.cashTaxRate, "company.cashTaxRate", "ratio", "number", ratio);
  const loss = scalar(c.lossTaxTreatment, "company.lossTaxTreatment", "convention", "text", z.literal("no_cash_benefit"));
  const pool = scalar(c.freeReceivablesPool, "company.freeReceivablesPool", "currency", "number", analysisAmount);
  const histPeriods = column(c.covenantHistoryPeriods, "company.covenantHistory.periods", "identity", analysisReference);
  const histEbitda = column(c.covenantHistoryEbitda, "company.covenantHistory.ebitda", "currency", analysisAmount);
  const histLease = column(c.covenantHistoryLeasePayments, "company.covenantHistory.leasePayments", "currency", analysisAmount);
  const minimumCashPolicy = c.minimumCashPolicy ? scalar(c.minimumCashPolicy, "company.minimumCashPolicy", "currency", "number", analysisAmount) : null;
  const maximumCollateralShare = c.maximumCollateralShare ? scalar(c.maximumCollateralShare, "company.maximumCollateralShare", "ratio", "number", ratio) : null;
  // Economic domains: a receivables pool and collateral are not negative; a share of the pool lies in [0, 1].
  if (pool !== null && new Exact(pool).lt(0)) throw new Error("comparison_negative_receivables_pool");
  if (maximumCollateralShare !== null && (new Exact(maximumCollateralShare).lt(0) || new Exact(maximumCollateralShare).gt(1))) throw new Error("comparison_collateral_share_domain");

  const instrument = (id: string, t: z.infer<typeof debtTerms>, path: string): DatedDebtInstrument | null => {
    const tx = <T>(k: string, unit: string, schema: z.ZodType<T>) => scalar((t as Record<string, AnalysisSelection>)[k]!, `${path}.${k}`, unit, "text", schema);
    const col = <T>(k: string, unit: string, schema: z.ZodType<T>) => column((t as Record<string, AnalysisSelection>)[k]!, `${path}.${k}`, unit, schema);
    const indexer = tx("indexer", "convention", z.enum(["none", "IPCA", "CDI", "SOFR", "fixed", "other"]));
    const implied = indexer === "none" && !t.indexationTreatment && !t.indexationRates;
    if (indexer !== null && !implied && (!t.indexationTreatment || !t.indexationRates)) throw new Error("comparison_indexation_terms_required");
    const v = {timing: tx("timing", "convention", z.literal("draw_at_period_start_pay_at_period_end")), indexer,
      indexationTreatment: implied ? "not_applicable" as const : t.indexationTreatment ? tx("indexationTreatment", "convention", z.enum(["not_applicable", "cash_paid", "capitalized_principal"])) : null,
      couponTreatment: tx("couponTreatment", "convention", z.enum(["cash_paid", "capitalized_principal", "accrued_until_paid"])),
      couponBase: tx("couponBase", "convention", z.enum(["opening_principal", "indexed_principal", "average_principal"])),
      drawdownAccount: tx("drawdownAccount", "convention", z.enum(["available", "restricted"])),
      paymentAccount: tx("paymentAccount", "convention", z.enum(["available", "restricted"])),
      openingPrincipal: scalar(t.openingPrincipal, `${path}.openingPrincipal`, "currency", "number", analysisAmount),
      indexationRates: implied ? ends?.map(() => "0") ?? null : t.indexationRates ? col("indexationRates", "ratio", ratio) : null, couponRates: col("couponRates", "ratio", ratio),
      drawdowns: col("drawdowns", "currency", analysisAmount), scheduledPrincipal: col("scheduledPrincipal", "currency", analysisAmount),
      prepayments: col("prepayments", "currency", analysisAmount), repayAll: col("repayAll", "boolean", flag),
      paysAccrued: t.paysAccruedCoupon ? column(t.paysAccruedCoupon, `${path}.paysAccruedCoupon`, "boolean", flag) : undefined};
    if (v.couponTreatment !== null && (v.couponTreatment === "accrued_until_paid") !== (t.paysAccruedCoupon !== undefined)) throw new Error("comparison_accrued_coupon_schedule_mismatch");
    if (!ends || Object.values(v).some((x) => x === null)) return null;
    const lists = [v.indexationRates!, v.couponRates!, v.drawdowns!, v.scheduledPrincipal!, v.prepayments!, v.repayAll!, ...(v.paysAccrued ? [v.paysAccrued] : [])];
    if (lists.some((l) => l.length !== ends.length)) throw new Error("comparison_series_length_mismatch");
    return {instrumentId: id, currency: input.currency, openingPrincipal: v.openingPrincipal!, indexer: v.indexer!, indexationTreatment: v.indexationTreatment!,
      couponTreatment: v.couponTreatment!, couponBase: v.couponBase!, drawdownAccount: v.drawdownAccount!, paymentAccount: v.paymentAccount!,
      periods: ends.map((endDate, i) => ({period: endDate, startDate: nextDate(i ? ends[i - 1]! : input.openingDate), endDate,
        indexationRate: v.indexationRates![i]!, couponRate: v.couponRates![i]!, drawdown: v.drawdowns![i]!, scheduledPrincipal: v.scheduledPrincipal![i]!,
        prepayment: v.prepayments![i]!, repayAll: v.repayAll![i] === "true", ...(v.paysAccrued ? {paysAccruedCoupon: v.paysAccrued[i] === "true"} : {})}))};
  };
  const charges = (instrumentId: string, s: z.infer<typeof chargeSeries> | null, path: string) => {
    if (!s) return {list: [] as FinancingCharge[], nonDeductible: [] as string[]};
    const ids = column(s.chargeIds, `${path}.chargeIds`, "identity", analysisReference);
    const cats = column(s.categories, `${path}.categories`, "convention", z.enum(financingCostCategories));
    const dates = column(s.dates, `${path}.dates`, "date", z.iso.date());
    const amounts = column(s.amounts, `${path}.amounts`, "currency", analysisAmount);
    const deductible = column(s.deductible, `${path}.deductible`, "boolean", flag);
    const payees = s.instrumentIds ? column(s.instrumentIds, `${path}.instrumentIds`, "identity", z.union([z.literal("self"), z.uuid()])) : null;
    if (!ids || !cats || !dates || !amounts || !deductible || !ends || (s.instrumentIds && !payees)) return {list: [], nonDeductible: []};
    if ([cats, dates, amounts, deductible, ...(payees ? [payees] : [])].some((l) => l.length !== ids.length)) throw new Error("comparison_series_length_mismatch");
    if (payees?.some((x) => x !== "self" && !input.instruments.some((i) => i.id === x))) throw new Error("comparison_charge_payee_unknown");
    const list = ids.map((id, n): FinancingCharge => {
      const at = ends.findIndex((e) => dates[n]! <= e);
      if (at < 0 || dates[n]! <= input.openingDate) throw new Error("comparison_charge_outside_horizon");
      return {id, economicId: id, instrumentId: payees && payees[n] !== "self" ? payees[n]! : instrumentId, category: cats[n]!, period: ends[at]!, date: dates[n]!, amount: amounts[n]!, treatment: "cash_paid", account: "available"};
    });
    return {list, nonDeductible: ids.filter((_, n) => deductible[n] === "false")};
  };

  const common = input.instruments.map((i) => ({instrument: instrument(i.id, i.terms, `debt.${i.id}`), charges: charges(i.id, i.charges, `debt.${i.id}.charges`)}));
  const companyGaps = b.gaps.length;
  const proposals = input.proposals.map((p) => {
    const before = b.gaps.length;
    const path = `proposal.${p.id}`;
    const l = p.lifetime;
    const ls = <T>(k: typeof lifetimeNames[number], unit: string, schema: z.ZodType<T>) => column(l[k], `${path}.lifetime.${k}`, unit, schema);
    const life = {grossAdvance: scalar(l.grossAdvance, `${path}.lifetime.grossAdvance`, "currency", "number", analysisAmount),
      upfront: scalar(l.upfrontWithheldCosts, `${path}.lifetime.upfrontWithheldCosts`, "currency", "number", analysisAmount),
      spread: scalar(l.annualSpread, `${path}.lifetime.annualSpread`, "ratio", "number", ratio),
      unpaid: scalar(l.unpaidInterestBase, `${path}.lifetime.unpaidInterestBase`, "convention", "text", z.enum(["principal_plus_accrued", "principal_only"])),
      lower: scalar(l.lowerSpread, `${path}.lifetime.lowerSpread`, "ratio", "number", ratio), upper: scalar(l.upperSpread, `${path}.lifetime.upperSpread`, "ratio", "number", ratio),
      ends: ls("periodEnds", "date", z.iso.date()), fractions: ls("yearFractions", "ratio", ratio), index: ls("annualIndex", "ratio", ratio),
      conventions: ls("yearFractionConventions", "convention", z.enum(["business_days_252", "actual_365_fixed", "adopted_year_fraction"])),
      amort: ls("scheduledPrincipal", "currency", analysisAmount), pays: ls("paysAccruedInterest", "boolean", flag),
      businessDays: l.businessDays ? column(l.businessDays, `${path}.lifetime.businessDays`, "count", z.string().regex(/^\d{1,3}$/)) : undefined,
      drawDate: scalar(l.drawDate, `${path}.lifetime.drawDate`, "date", "date", z.iso.date())};
    const lc = l.chargesAfterHorizon;
    const later = lc ? {ids: column(lc.chargeIds, `${path}.lifetime.chargesAfterHorizon.chargeIds`, "identity", analysisReference),
      categories: column(lc.categories, `${path}.lifetime.chargesAfterHorizon.categories`, "convention", z.enum(financingCostCategories)),
      dates: column(lc.dates, `${path}.lifetime.chargesAfterHorizon.dates`, "date", z.iso.date()),
      amounts: column(lc.amounts, `${path}.lifetime.chargesAfterHorizon.amounts`, "currency", analysisAmount)} : null;
    const cv = p.covenant;
    const cov = {name: scalar(cv.name, `${path}.covenant.name`, "identity", "text", analysisReference),
      inDebt: scalar(cv.leaseLiabilityInDebt, `${path}.covenant.leaseLiabilityInDebt`, "boolean", "text", flag),
      lease: scalar(cv.leaseLiability, `${path}.covenant.leaseLiability`, "currency", "number", analysisAmount),
      excludes: scalar(cv.ebitdaExcludesLeases, `${path}.covenant.ebitdaExcludesLeases`, "boolean", "text", flag),
      window: scalar(cv.trailingPeriods, `${path}.covenant.trailingPeriods`, "count", "number", z.string().regex(/^\d{1,2}$/)),
      dates: column(cv.measurementPeriods, `${path}.covenant.measurementPeriods`, "date", z.iso.date()),
      limit: scalar(cv.limit, `${path}.covenant.limit`, "ratio", "number", ratio),
      comparator: scalar(cv.comparator, `${path}.covenant.comparator`, "convention", "text", z.enum(["lte", "lt"]))};
    const collateral = scalar(p.collateralConsumed, `${path}.collateralConsumed`, "currency", "number", analysisAmount);
    if (collateral !== null && new Exact(collateral).lt(0)) throw new Error("comparison_negative_collateral");
    const built = {p, life, cov, collateral, later, charges: charges(p.id, p.charges, `${path}.charges`)};
    return {...built, complete: b.gaps.length === before && collateral !== null
      && Object.entries(life).every(([k, v]) => v !== null || k === "businessDays") && Object.values(cov).every((v) => v !== null)
      && (!later || Object.values(later).every((v) => v !== null))};
  });
  const ready = proposals.filter((x) => x.complete);

  let comparison: ReturnType<typeof compareFinancingProposals> | null = null;
  // A proposal with a missing premise leaves the comparison with its gaps named; the others are still compared.
  const complete = companyGaps === 0 && ends && opening !== null && taxRate !== null && loss !== null && pool !== null
    && histPeriods && histEbitda && histLease && Object.values(companyCols).every((x) => x !== null)
    && common.every((x) => x.instrument) && ready.length > 0;
  if (complete) {
    if (Object.values(companyCols).some((col) => col!.length !== ends!.length) || histEbitda!.length !== histPeriods!.length || histLease!.length !== histPeriods!.length) throw new Error("comparison_series_length_mismatch");
    const comparisonInput: FinancingProposalComparisonInput = {currency: input.currency, openingDate: input.openingDate, endDate: input.endDate, openingAvailable: opening!,
      periods: ends!.map((endDate, i) => ({id: endDate, startDate: nextDate(i ? ends![i - 1]! : input.openingDate), endDate,
        ebitda: companyCols.ebitda![i]!, leasePayments: companyCols.cashLeasePayments![i]!, depreciationAndAmortization: companyCols.depreciationAndAmortization![i]!,
        workingCapitalCashFlow: companyCols.workingCapitalCashFlow![i]!, maintenanceCapexPaid: companyCols.maintenanceCapexPaid![i]!, growthCapexPaid: companyCols.growthCapexPaid![i]!})),
      commonInstruments: common.map((x) => x.instrument!), commonCharges: common.flatMap((x) => x.charges.list), commonNonDeductibleChargeIds: common.flatMap((x) => x.charges.nonDeductible),
      covenantHistory: histPeriods!.map((period, i) => ({period, ebitda: histEbitda![i]!, leasePayments: histLease![i]!})),
      tax: {rate: taxRate!, lossTreatment: loss!}, freeReceivablesPool: pool!,
      proposals: ready.map((x) => {
        const l = x.life;
        if ([l.fractions!, l.index!, l.conventions!, l.amort!, l.pays!, ...(l.businessDays ? [l.businessDays] : [])].some((s) => s.length !== l.ends!.length)) throw new Error("comparison_series_length_mismatch");
        const base = l.drawDate!;
        const fraction = (i: number) => {
          const convention = l.conventions![i]!, start = i ? l.ends![i - 1]! : base;
          if (convention === "adopted_year_fraction") {if (l.businessDays) throw new Error("comparison_unused_business_days"); return l.fractions![i]!;}
          // Derived exactly from the adopted count or the dates; the adopted fraction must agree with it.
          const derived = convention === "business_days_252"
            ? (l.businessDays ? new Exact(l.businessDays[i]!).div(252) : (() => {throw new Error("comparison_business_days_required");})())
            : new Exact((Date.parse(`${l.ends![i]!}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000).div(365);
          if (derived.minus(l.fractions![i]!).abs().gt("0.0000000000000001")) throw new Error("comparison_year_fraction_mismatch");
          return derived.toDecimalPlaces(20).toFixed();
        };
        if (x.later && [x.later.categories!, x.later.dates!, x.later.amounts!].some((s) => s.length !== x.later!.ids!.length)) throw new Error("comparison_series_length_mismatch");
        return {id: x.p.id, label: x.p.label, collateralConsumed: x.collateral!, charges: x.charges.list, nonDeductibleChargeIds: x.charges.nonDeductible,
          cost: {schedule: {baseDate: base,
            currency: input.currency, moneyUnit: "currency units", grossAdvance: l.grossAdvance!, upfrontWithheldCosts: l.upfront!, annualSpread: l.spread!, unpaidInterestBase: l.unpaid!,
            periods: l.ends!.map((endDate, i) => ({id: `${x.p.id}:${i}`, startDate: i ? l.ends![i - 1]! : base, endDate,
              yearFraction: fraction(i), annualIndex: l.index![i]!, yearFractionConvention: l.conventions![i]!,
              ...(l.conventions![i] === "business_days_252" ? {businessDays: Number(l.businessDays![i])} : {}), sourceAnchor: `adoption:${x.p.lifetime.periodEnds.decisionId}`,
              scheduledPrincipal: l.amort![i]!, paysAccruedInterest: l.pays![i] === "true"}))},
            lowerSpread: l.lower!, upperSpread: l.upper!,
            ...(x.later ? {chargesAfterHorizon: x.later.ids!.map((id, n) => ({id, category: x.later!.categories![n]!, date: x.later!.dates![n]!, amount: x.later!.amounts![n]!}))} : {})},
          covenant: {name: x.cov.name!, leaseLiabilityInDebt: x.cov.inDebt === "true", leaseLiability: x.cov.lease!, ebitdaExcludesLeases: x.cov.excludes === "true",
            trailingPeriods: Number(x.cov.window), measurementPeriods: x.cov.dates!, limit: x.cov.limit!, comparator: x.cov.comparator!}};
      })};
    comparison = compareFinancingProposals(comparisonInput);
  }
  const payload = {schemaVersion: "adopted-financing-comparison.v1" as const, adapterVersion: adoptedFinancingComparisonVersion, financialCoreVersion,
    scope: input.scope, comparisonId: input.comparisonId, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    scenario: input.scenario, inheritedScenario: input.inheritedScenario ?? null,
    openingDate: input.openingDate, endDate: input.endDate, basisFingerprint: input.envelope.fingerprint,
    status: comparison ? "partial_composition" as const : "missing_inputs" as const, comparison,
    policies: {minimumCash: minimumCashPolicy, maximumCollateralShare}, incompleteProposalIds: proposals.filter((x) => !x.complete).map((x) => x.p.id), gaps: b.gaps, bindings: b.bindings, normalization: b.normalization,
    contributions: [...b.used.values()], derivedDependencies: [{result: "financing_proposal_comparison", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some((e) => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["firmness_and_validity", "prepayment_terms", "reciprocity", "restricted_accounts", "choice_of_counterparty", "intraperiod_liquidity", "tax_law_inference"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
