import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {evaluateReceivedProposal, receivedProposalNetConvention, type ReceivedProposalInput} from "./evaluate-received-proposal";
import {auroraReceivedProposal} from "./evaluate-received-proposal.fixture";

// Property tests over generated combinations with a fixed seed (review r2): fiscal coverage per structure,
// tax rate domain and covenant coverage by limit. The oracles below are written apart from the kernel.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}
const rand = mulberry32(20261027);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
const quarterEnds = (n: number) => Array.from({length: n}, (_, i) => new Date(Date.UTC(2026, 9 + 3 * i, 0)).toISOString().slice(0, 10));
const addDays = (d: string, n: number) => {const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);};

/** Independent oracle: quarters indexed from the one containing the draw to the one containing the final payment. */
function expectedConvention(tax: ReceivedProposalInput["tax"], ends: readonly string[], taxable: readonly boolean[], draw: string, final: string) {
  if (tax.regime === "unknown") return "regime_unknown";
  if (tax.regime === "lucro_presumido") return "no_deduction_presumido";
  const first = ends.findIndex(e => e >= draw), last = ends.findIndex(e => e >= final);
  const until = last < 0 ? ends.length - 1 : last;
  for (let i = first; i <= until; i++) if (!taxable[i]) return "not_all_periods_taxable";
  if (last >= 0) return "full_deductibility_simplified";
  return tax.taxableAfterCalendar === true ? "full_deductibility_simplified" : tax.taxableAfterCalendar === false ? "not_all_periods_taxable" : "life_beyond_fiscal_calendar";
}
/** The fixture with its calendar cut to n quarters, measurements kept only on the remaining dates. */
function cut(n: number, taxable: boolean[], o: {variants?: boolean} = {}) {
  const i = auroraReceivedProposal(), c = i.calendar;
  i.calendar = {...c, periodEnds: c.periodEnds.slice(0, n), existingService: c.existingService.slice(0, n), availableForService: c.availableForService.slice(0, n),
    closingCash: c.closingCash.slice(0, n), taxable};
  i.covenant.measurements = i.covenant.measurements.filter(m => i.calendar.periodEnds.includes(m.date));
  if (!o.variants) i.variants = [];
  return i;
}

describe("received proposal properties", {timeout: 600_000}, () => {
  it("states full deduction exactly when every period of the structure's own life is taxable (500 generated cases)", () => {
    for (let k = 0; k < 500; k++) {
      const n = int(1, 12), ends = quarterEnds(n), opening = "2026-06-30", taxable = ends.map(() => rand() < 0.8);
      const draw = addDays(opening, int(1, Math.max(1, (Date.parse(ends.at(-1)!) - Date.parse(opening)) / 86400000)));
      const final = addDays(draw, int(1, 2200));
      const tax = {regime: pick(["lucro_real", "lucro_real", "lucro_real", "lucro_presumido", "unknown"] as const), rate: "0.34", taxableAfterCalendar: pick([true, false, null])};
      const periods = ends.map((e, i) => ({startDate: addDays(i ? ends[i - 1]! : opening, 1), endDate: e, taxable: taxable[i]!}));
      expect(receivedProposalNetConvention(tax, periods, draw, final)).toBe(expectedConvention(tax, ends, taxable, draw, final));
    }
  });
  it("evaluates the proposal and each variant on its own life against generated fiscal calendars", () => {
    for (let k = 0; k < 6; k++) {
      const n = int(2, 10), taxable = Array.from({length: n}, () => rand() < 0.75);
      const i = cut(n, taxable, {variants: true});
      i.proposal.graceMonths = int(0, 6); i.proposal.installments = int(1, 30);
      i.variants = [{id: "v", label: "Variante gerada", graceMonths: int(0, 12), installments: int(1, 48), coverage: "1.3", restrictedAccount: true}];
      i.tax.taxableAfterCalendar = pick([true, false, null]);
      const r = evaluateReceivedProposal(i), ends = i.calendar.periodEnds;
      expect(r.cost.netConvention).toBe(expectedConvention(i.tax, ends, taxable, i.proposal.drawDate, r.proposal.finalPaymentDate));
      const v = r.variants[0]!;
      expect(v.netConvention).toBe(expectedConvention(i.tax, ends, taxable, i.proposal.drawDate, v.finalPaymentDate));
      expect(r.cost.equivalentSpreadNet === null).toBe(r.cost.netConvention !== "full_deductibility_simplified");
      expect(v.equivalentSpreadNet === null).toBe(v.netConvention !== "full_deductibility_simplified");
    }
  });
  it("reproduces the review: a short calendar does not lend its taxable periods to later years; a period after payoff never counts", () => {
    const short = cut(2, [true, true]); short.tax.taxableAfterCalendar = null;
    const a = evaluateReceivedProposal(short);
    expect([a.cost.netConvention, a.cost.equivalentSpreadNet]).toEqual(["life_beyond_fiscal_calendar", null]);
    const quick = cut(10, [true, true, true, true, true, true, true, true, true, false]);
    quick.proposal.graceMonths = 0; quick.proposal.installments = 3;
    const b = evaluateReceivedProposal(quick);
    expect([b.proposal.finalPaymentDate, b.cost.netConvention]).toEqual(["2027-01-01", "full_deductibility_simplified"]);
  });
  it("refuses a tax rate outside [0, 1] before any calculation and applies one inside it (generated rates)", () => {
    let inside = 0;
    for (let k = 0; k < 200; k++) {
      const rate = new Decimal(int(-10000, 20000)).div(10000).toFixed();
      const i = auroraReceivedProposal(); i.tax.rate = rate;
      if (new Decimal(rate).lt(0) || new Decimal(rate).gt(1)) expect(() => evaluateReceivedProposal(i)).toThrow("received_proposal_tax_rate_out_of_domain");
      else if (inside++ < 2) {
        i.variants = [];
        const r = evaluateReceivedProposal(i);
        expect(new Decimal(r.cost.equivalentSpreadNet!).minus(new Decimal(r.cost.equivalentSpread).mul(new Decimal(1).minus(rate))).abs().lt("1e-18")).toBe(true);
      }
    }
    expect(inside).toBeGreaterThan(1);
  });
  it("never takes a lender test from a date before the draw (generated draws and test dates)", () => {
    for (let k = 0; k < 5; k++) {
      const i = auroraReceivedProposal(); i.variants = []; i.covenant.policy = null;
      i.proposal.drawDate = addDays("2026-08-15", int(0, 300));
      const ends = i.calendar.periodEnds;
      i.proposal.covenant = {...i.proposal.covenant!, testDates: ends.filter(() => rand() < 0.6)};
      // A heavily levered reading on every period end, the pre-draw ones included, would breach any test it fed.
      i.covenant.measurements = ends.filter(e => e <= "2027-06-30").map(date => ({date, scenario: "base", debt: "130", cash: "35", reportedEbitda: "30", definitionAdjustment: "-3"}));
      i.covenant.requiredScenarios = ["base"];
      const r = evaluateReceivedProposal(i);
      expect(r.covenant.lenderDatesBeforeDraw).toEqual(i.proposal.covenant.testDates.filter(d => d < i.proposal.drawDate));
      for (const row of r.covenant.rows) if (row.date < i.proposal.drawDate) expect(row.limits.find(l => l.limitId === "proposal")!.testedOnDate).toBe(false);
      expect(r.covenant.required.every(q => q.date >= i.proposal.drawDate || i.covenant.indenture.testDates.includes(q.date))).toBe(true);
    }
  });
  it("derives every lender field from the effective dates only, whatever the order received (generated, permuted)", () => {
    for (let k = 0; k < 5; k++) {
      const i = auroraReceivedProposal(); i.variants = [];
      i.proposal.drawDate = addDays("2026-08-15", int(0, 300));
      const pool = [...i.calendar.periodEnds, "2026-07-31", "2026-08-31", "2026-10-31", "2027-02-28", "2027-08-31"];
      const chosen = pool.filter(() => rand() < 0.5);
      if (!chosen.length) chosen.push(pool[int(0, pool.length - 1)]!);
      // Fisher-Yates with the seeded generator: the order received must not matter.
      for (let a = chosen.length - 1; a > 0; a--) {const b = int(0, a); [chosen[a], chosen[b]] = [chosen[b]!, chosen[a]!];}
      i.proposal.covenant = {...i.proposal.covenant!, testDates: chosen};
      const r = evaluateReceivedProposal(i), draw = i.proposal.drawDate, end = i.calendar.periodEnds.at(-1)!;
      // Oracle, written here: effective = on or after the draw, sorted; before = the rest, sorted.
      const effective = [...chosen].filter(d => d >= draw).sort(), before = [...chosen].filter(d => d < draw).sort();
      const perYear = Math.max(0, ...Object.values(effective.reduce<Record<string, number>>((m, d) => ({...m, [d.slice(0, 4)]: (m[d.slice(0, 4)] ?? 0) + 1}), {})));
      expect(r.proposal.firstLenderTestDate).toBe(effective[0] ?? null);
      expect(r.covenant.testsPerYear.lender).toBe(perYear);
      expect(r.covenant.lenderDatesBeforeDraw).toEqual(before);
      const otherDates = new Set([...i.covenant.indenture.testDates, ...i.covenant.policy!.testDates]);
      const lenderRequired = effective.filter(d => d <= end && d > i.calendar.openingDate);
      expect([...new Set(r.covenant.required.map(q => q.date))].filter(d => !otherDates.has(d))).toEqual(lenderRequired.filter(d => !otherDates.has(d)));
      expect(r.covenant.untestedLimits.includes("proposal")).toBe(!i.covenant.measurements.some(m => effective.includes(m.date)));
      for (const row of r.covenant.rows) expect(row.limits.find(l => l.limitId === "proposal")!.testedOnDate).toBe(effective.includes(row.date) && !r.covenant.untestedLimits.includes("proposal"));
    }
  });
  it("reproduces the review: a lender test dated before the draw creates no breach", () => {
    const i = auroraReceivedProposal(); i.variants = []; i.covenant.policy = null;
    i.proposal.covenant = {...i.proposal.covenant!, testDates: ["2026-09-30", ...i.proposal.covenant!.testDates]};
    i.covenant.measurements = [...i.covenant.measurements, {date: "2026-09-30", scenario: "base", debt: "130", cash: "35", reportedEbitda: "30", definitionAdjustment: "-3"}];
    const r = evaluateReceivedProposal(i);
    expect([r.covenant.anyBreachWith, r.covenant.lenderDatesBeforeDraw, r.covenant.missingTests]).toEqual([false, ["2026-09-30"], []]);
  });
  it("turns the total absence of covenant tests into gaps without an error", () => {
    const i = auroraReceivedProposal(); i.variants = []; i.covenant.measurements = [];
    const r = evaluateReceivedProposal(i);
    expect([r.covenant.rows, r.covenant.anyBreachWith, r.covenant.untestedLimits, r.covenant.missingTests.length, r.covenant.worst]).toEqual([[], null, ["indenture", "proposal", "board-policy"], 10, null]);
  });
  it("forms gaps instead of an error when tests of a limit are removed, and never concludes compliance with one missing", () => {
    const limits = ["indenture", "proposal", "board-policy"] as const;
    const datesOf = (i: ReceivedProposalInput, l: (typeof limits)[number]) => l === "indenture" ? i.covenant.indenture.testDates : l === "proposal" ? i.proposal.covenant!.testDates : i.covenant.policy!.testDates;
    const cases = [...limits.map(l => [l]), [...limits], ...Array.from({length: 4}, () => limits.filter(() => rand() < 0.5))];
    for (const stripped of cases) {
      const i = auroraReceivedProposal(); i.variants = [];
      const gone = new Set(stripped.flatMap(l => datesOf(i, l)));
      i.covenant.measurements = i.covenant.measurements.filter(m => !gone.has(m.date) && rand() < 0.85);
      const r = evaluateReceivedProposal(i), end = i.calendar.periodEnds.at(-1)!;
      const required = [...new Set(limits.flatMap(l => datesOf(i, l).filter(d => d <= end && (l !== "proposal" || d >= i.proposal.drawDate))))].sort()
        .flatMap(date => i.covenant.requiredScenarios.map(scenario => ({date, scenario})));
      const missing = required.filter(q => !i.covenant.measurements.some(m => m.date === q.date && m.scenario === q.scenario));
      expect(r.covenant.missingTests).toEqual(missing);
      expect(r.covenant.untestedLimits).toEqual(limits.filter(l => !i.covenant.measurements.some(m => datesOf(i, l).includes(m.date))));
      for (const l of stripped) expect(r.covenant.untestedLimits).toContain(l);
      if (missing.length) expect(r.covenant.anyBreachWith).not.toBe(false);
      const breachFound = r.covenant.rows.some(row => row.limits.some(x => x.testedOnDate && x.breachedWith));
      expect(r.covenant.anyBreachWith).toBe(breachFound ? true : missing.length ? null : false);
    }
  });
});
