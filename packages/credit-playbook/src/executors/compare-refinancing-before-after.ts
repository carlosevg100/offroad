import {createHash} from "node:crypto";

import {buildDebtServiceSchedule, calculateAllInCost, calculateCovenantHeadroom, calculateProFormaPosition, maturityConcentration} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `compare-refinancing-before-after`. Every alternative is shown before
 * and after with the same objects: gross and net debt, leverage by the contractual definition,
 * headroom against the applicable limit, concentration by period and all-in cost including the
 * exit cost. An alternative that retires a series without a priced exit is blocked, and a
 * ranking without a declared discriminator is not produced.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const rate = z.string().regex(/^-?\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), page: z.number().int().positive().optional(), note: z.string().optional(), clause: z.string().optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;

export const alternativeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: z.string().min(1),
  newDebt: z.object({amount: money, annualRate: rate, termMonths: z.number().int().positive(), graceMonths: z.number().int().nonnegative(), format: z.enum(["sac", "price", "bullet", "balloon"]), upfrontFeeRate: rate, origin: z.string().min(1), anchor: anchorSchema}).strict().nullable(),
  /** Series retired, each with its priced exit; null price blocks the alternative. */
  retired: z.array(z.object({seriesId: z.string().min(1), principal: money, exitPremium: money.nullable(), maturityPeriod: z.string().min(1)}).strict()).default([]),
  feesPaidFromCash: money.default("0"),
}).strict();

export const beforeAfterInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  before: z.object({
    grossDebt: money, unrestrictedCash: money, derivativeLiabilities: money, derivativeAssets: money,
    ltmEbitda: z.object({value: money, basis: z.string().min(1)}).strict().nullable(),
    schedule: z.record(z.string(), money),
    weightedAverageRate: rate,
    anchor: anchorSchema,
  }).strict(),
  covenant: z.object({limit: rate, direction: z.enum(["maximum", "minimum"]), state: z.enum(["resolved", "insufficient_evidence"]), comparability: z.enum(["comparable", "conditional", "not_comparable"]), anchor: anchorSchema}).strict(),
  alternatives: z.array(alternativeSchema).min(1),
  /** The declared discriminator; without one there is no ranking. */
  /** peak_concentration ranks by the share of the peak in gross debt; peak_amount by the peak itself, in the unit. */
  ranking: z.object({discriminator: z.enum(["headroom", "all_in_cost", "peak_concentration", "peak_amount", "net_debt"]), rationale: z.string().min(1)}).strict().nullable().default(null),
  /** Concentration above this share of gross debt in one period is a wall. */
  wallThresholdShare: rate.default("0.20"),
}).strict();
export type BeforeAfterInput = z.input<typeof beforeAfterInputSchema>;

type Snapshot = {grossDebt: string; unrestrictedCash: string; netDebt: string; contractualNetDebt: string; leverage: string | null; headroom: {absolute: string; passes: boolean} | null; peak: {period: string; amount: string; share: string} | null; allInCost: string | null};

export type BeforeAfterOutput = {
  schemaVersion: "method.compare-refinancing-before-after.v2";
  referenceDate: string;
  unit: string;
  before: Snapshot;
  alternatives: Array<{id: string; label: string; state: "compared" | "blocked"; blockReasons: string[]; after: Snapshot | null; exitCost: string | null; concentration: Array<{period: string; existing: string; proposed: string; consolidated: string; share: string}> | null; newDebtService: {peakDebtService: string; totalInterest: string; weightedAverageLifeMonths: string} | null}>;
  ranking: {discriminator: string; rationale: string; order: Array<{id: string; value: string; reason: string}>} | null;
  unsupported: string[];
  trace: {calculations: Array<{id: string; alternative: string; operands: Record<string, string>; result: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function canonical(input: z.infer<typeof beforeAfterInputSchema>) {
  return {...input, alternatives: [...input.alternatives].sort((a, b) => a.id.localeCompare(b.id)).map((alternative) => ({...alternative, retired: [...alternative.retired].sort((a, b) => a.seriesId.localeCompare(b.seriesId))}))};
}

export function compareRefinancingBeforeAfter(raw: BeforeAfterInput): BeforeAfterOutput {
  const input = canonical(beforeAfterInputSchema.parse(raw));
  const calculations: BeforeAfterOutput["trace"]["calculations"] = [];
  const unsupported: string[] = [];
  const canMeasureHeadroom = input.covenant.state === "resolved" && input.covenant.comparability === "comparable";
  if (!canMeasureHeadroom) unsupported.push(`headroom is not measured: covenant limit ${input.covenant.state}, comparability ${input.covenant.comparability}`);
  if (!input.before.ltmEbitda) unsupported.push("leverage is not measured: no LTM EBITDA in the base");

  const snapshot = (label: string, grossDebt: Decimal, cash: Decimal, allIn: Decimal | null, schedule: Record<string, Decimal.Value>): Snapshot => {
    const contractual = grossDebt.plus(input.before.derivativeLiabilities).minus(input.before.derivativeAssets).minus(cash);
    const leverage = input.before.ltmEbitda && d(input.before.ltmEbitda.value).gt(0) ? contractual.div(input.before.ltmEbitda.value) : null;
    if (leverage) calculations.push({id: "financial.net_leverage", alternative: label, operands: {contractualNetDebt: out(contractual), ltmEbitda: input.before.ltmEbitda!.value}, result: out(leverage)});
    let headroom: Snapshot["headroom"] = null;
    if (leverage && canMeasureHeadroom) {
      const result = calculateCovenantHeadroom({actual: out(leverage), limit: input.covenant.limit, direction: input.covenant.direction});
      calculations.push({id: "structure.covenant_headroom", alternative: label, operands: {actual: out(leverage), limit: input.covenant.limit}, result: result.absolute});
      headroom = {absolute: result.absolute, passes: result.passes};
    }
    const concentration = maturityConcentration({existing: schedule, proposed: {}});
    const peak = concentration.peak ? {period: concentration.peak.period, amount: concentration.peak.consolidated, share: concentration.rows.find((row) => row.period === concentration.peak!.period)?.share ?? "0"} : null;
    return {grossDebt: out(grossDebt), unrestrictedCash: out(cash), netDebt: out(grossDebt.minus(cash)), contractualNetDebt: out(contractual), leverage: leverage ? out(leverage) : null, headroom, peak, allInCost: allIn ? out(allIn) : null};
  };

  const before = snapshot("before", d(input.before.grossDebt), d(input.before.unrestrictedCash), d(input.before.weightedAverageRate), input.before.schedule);

  const alternatives = input.alternatives.map((alternative) => {
    const blockReasons: string[] = [];
    const unpriced = alternative.retired.filter((series) => series.exitPremium === null);
    if (unpriced.length > 0) blockReasons.push(`exit cost is not priced for ${unpriced.map((series) => series.seriesId).join(", ")}; the alternative cannot be compared`);
    if (blockReasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked" as const, blockReasons, after: null, exitCost: null, concentration: null, newDebtService: null};

    const retiredPrincipal = alternative.retired.reduce((sum, series) => sum.plus(series.principal), d(0));
    const exitCost = alternative.retired.reduce((sum, series) => sum.plus(series.exitPremium ?? 0), d(0));
    const newAmount = alternative.newDebt ? d(alternative.newDebt.amount) : d(0);
    const upfrontFees = alternative.newDebt ? newAmount.mul(alternative.newDebt.upfrontFeeRate) : d(0);
    const proForma = calculateProFormaPosition({
      grossDebt: input.before.grossDebt, unrestrictedCash: input.before.unrestrictedCash, newDebt: out(newAmount), refinancedDebt: out(retiredPrincipal),
      feesPaidFromCash: out(d(alternative.feesPaidFromCash).plus(exitCost).plus(upfrontFees)), cashContribution: "0",
      ...(input.before.ltmEbitda ? {adjustedEbitda: input.before.ltmEbitda.value} : {}),
    });
    calculations.push({id: "operation.pro_forma_position", alternative: alternative.id, operands: {newDebt: out(newAmount), refinancedDebt: out(retiredPrincipal), exitCost: out(exitCost), upfrontFees: out(upfrontFees)}, result: proForma.netDebt});

    // Schedule after: retired series leave their periods; the new debt's principal lands by its format.
    const proposed: Record<string, Decimal.Value> = {};
    const existing: Record<string, Decimal.Value> = {...input.before.schedule};
    for (const series of alternative.retired) existing[series.maturityPeriod] = out(d(existing[series.maturityPeriod] ?? 0).minus(series.principal));
    let newDebtService: BeforeAfterOutput["alternatives"][number]["newDebtService"] = null;
    let allIn: Decimal | null = null;
    if (alternative.newDebt) {
      const schedule = buildDebtServiceSchedule({amount: alternative.newDebt.amount, annualRate: alternative.newDebt.annualRate, rateConvention: "effective_annual", termMonths: alternative.newDebt.termMonths, graceMonths: alternative.newDebt.graceMonths, graceInterest: "paid", format: alternative.newDebt.format});
      calculations.push({id: "structure.debt_service_schedule", alternative: alternative.id, operands: {amount: alternative.newDebt.amount, annualRate: alternative.newDebt.annualRate, termMonths: String(alternative.newDebt.termMonths)}, result: schedule.totalDebtService});
      newDebtService = {peakDebtService: schedule.peakDebtService, totalInterest: schedule.totalInterest, weightedAverageLifeMonths: schedule.weightedAverageLifeMonths};
      const yearsFromReference = (period: number) => `${Number(input.referenceDate.slice(0, 4)) + Math.floor((Number(input.referenceDate.slice(5, 7)) - 1 + period) / 12)}`;
      // A year at or beyond the schedule's open-ended bucket ("2032+") lands in that bucket, never in a key of its own.
      const openEnded = Object.keys(existing).find((key) => key.endsWith("+"));
      const openEndedFrom = openEnded ? Number(openEnded.slice(0, -1)) : null;
      for (const row of schedule.rows) {
        if (d(row.principal).isZero()) continue; // grace months add no period of their own
        const year = yearsFromReference(row.period);
        const key = openEnded && openEndedFrom !== null && Number(year) >= openEndedFrom ? openEnded : year;
        proposed[key] = out(d(proposed[key] ?? 0).plus(row.principal));
      }
      const termYears = d(alternative.newDebt.termMonths).div(12);
      const cost = calculateAllInCost(alternative.newDebt.annualRate, d(alternative.newDebt.upfrontFeeRate).plus(newAmount.gt(0) ? exitCost.div(newAmount) : 0).toFixed(), termYears.toFixed());
      calculations.push({id: "financial.all_in_cost", alternative: alternative.id, operands: {annualRate: alternative.newDebt.annualRate, upfrontFeeRate: alternative.newDebt.upfrontFeeRate, exitCostOverAmount: newAmount.gt(0) ? out(exitCost.div(newAmount)) : "0", termYears: termYears.toFixed()}, result: cost.value});
      allIn = d(cost.value);
    }
    const concentration = maturityConcentration({existing, proposed});
    const after = snapshot(alternative.id, d(proForma.grossDebt), d(proForma.unrestrictedCash), allIn, Object.fromEntries(concentration.rows.map((row) => [row.period, row.consolidated])));
    return {
      id: alternative.id, label: alternative.label, state: "compared" as const, blockReasons: [], after, exitCost: out(exitCost),
      concentration: concentration.rows.map((row) => ({period: row.period, existing: row.existing, proposed: row.proposed, consolidated: row.consolidated, share: row.share})),
      newDebtService,
    };
  });

  let ranking: BeforeAfterOutput["ranking"] = null;
  if (input.ranking) {
    const compared = alternatives.filter((alternative) => alternative.state === "compared" && alternative.after);
    const value = (alternative: (typeof compared)[number]): Decimal | null => {
      const after = alternative.after!;
      switch (input.ranking!.discriminator) {
        case "headroom": return after.headroom ? d(after.headroom.absolute) : null;
        case "all_in_cost": return after.allInCost ? d(after.allInCost).negated() : null;
        case "peak_concentration": return after.peak ? d(after.peak.share).negated() : null;
        case "peak_amount": return after.peak ? d(after.peak.amount).negated() : null;
        case "net_debt": return d(after.contractualNetDebt).negated();
      }
    };
    const scored = compared.map((alternative) => ({alternative, score: value(alternative)}));
    if (scored.some((entry) => entry.score === null)) unsupported.push(`ranking by ${input.ranking.discriminator} needs a value every compared alternative lacks`);
    else {
      ranking = {
        discriminator: input.ranking.discriminator, rationale: input.ranking.rationale,
        order: (() => {
          const sorted = scored.sort((a, b) => b.score!.comparedTo(a.score!) || a.alternative.id.localeCompare(b.alternative.id));
          return sorted.map((entry, index) => {
            const tiedWithBest = index > 0 && entry.score!.eq(sorted[0]!.score!);
            const reason = index === 0 ? `best ${input.ranking!.discriminator}` : tiedWithBest ? `tied with the best on ${input.ranking!.discriminator}; ordered by id, not by merit` : `ranks below by ${input.ranking!.discriminator}`;
            return {id: entry.alternative.id, value: out(entry.score!), reason};
          });
        })(),
      };
    }
  } else {
    unsupported.push("no ranking: the discriminator was not declared");
  }
  for (const alternative of alternatives) if (alternative.state === "blocked") unsupported.push(`${alternative.id}: ${alternative.blockReasons.join("; ")}`);

  const body = {schemaVersion: "method.compare-refinancing-before-after.v2" as const, referenceDate: input.referenceDate, unit: input.unit, before, alternatives, ranking, unsupported: [...unsupported].sort()};
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
