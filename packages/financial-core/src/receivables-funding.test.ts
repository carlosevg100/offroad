import {describe, expect, it} from "vitest";
import {assessReceivablesFunding, type ReceivablesFundingInput} from "./receivables-funding";
import {auroraReceivablesFunding as base} from "./receivables-funding.fixture";

const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
const withItem = (id: string, patch: object): ReceivablesFundingInput => ({...base, items: base.items.map(i => i.id === id ? {...i, ...patch} : i)});
const withOption = (id: string, patch: object): ReceivablesFundingInput => ({...base, options: base.options.map(o => o.id === id ? {...o, ...patch} : o)});
const programA = (): ReceivablesFundingInput => ({...withItem("rede-a", {anchorProgram: "active"}), options: [...base.options,
  {...base.options[0]!, id: "risco-sacado-a", label: "Risco sacado da rede A", eligibility: {...base.options[0]!.eligibility!, anchorItemIds: ["rede-a"]},
    rate: {basis: "di_plus" as const, rate: "0.015"}, leadDaysMin: null, leadDaysMax: null}]});

describe("receivables funding", () => {
  const r = assessReceivablesFunding(base);
  const o = (id: string) => r.options.find(x => x.id === id)!;
  it("separates the assignable portfolio from the gross, with the reason for every exclusion", () => {
    expect([r.portfolio.gross, r.portfolio.assignable, r.portfolio.excluded]).toEqual(["62", "25", "37"]);
    expect(r.portfolio.items.filter(i => i.excluded !== "0").map(i => [i.itemId, i.excluded, i.reasons])).toEqual([
      ["rede-a", "19.8", ["not_assignable"]], ["redes-c-d", "12", ["encumbered"]], ["rede-e", "1.5", ["debtor_sublimit"]],
      ["rede-f", "1.5", ["debtor_sublimit"]], ["vencidos", "2.2", ["past_due"]]]);
    expect(r.portfolio.releases).toEqual([{itemId: "redes-c-d", amount: "12", holder: "Bradesco", releaseEvent: "pré-pagamento da CCB do Bradesco", assignableAfterRelease: "6", verified: false}]);
  });
  it("sizes each option by its eligibility and sublimit, as the oracle", () => {
    expect(["risco-sacado-b", "fidc-com-coobrigacao", "fidc-sem-coobrigacao"].map(id => o(id).volume)).toEqual(["3.7", "21.3", "10"]);
    expect(o("linha-giro").volume).toBeNull();
    // The varejo buckets have no largest debtor: the FIDC volume is an upper bound, and says so.
    expect([o("fidc-com-coobrigacao").volumeVerified, r.gaps.map(g => g.item)]).toEqual([false, ["item.varejo-selecionado.largestDebtorAmount", "item.varejo-demais.largestDebtorAmount"]]);
  });
  it("costs every option for the same amount and time in use, IOF where it applies", () => {
    expect(r.ranking.map(x => [x.id, n(x.total, 2)])).toEqual([["risco-sacado-b", "1.33"], ["fidc-com-coobrigacao", "1.75"], ["linha-giro", "1.82"],
      ["desconto-bancario", "1.99"], ["fidc-sem-coobrigacao", "2.08"]]);
    expect(r.options.map(x => [x.id, x.iofApplies])).toEqual([["risco-sacado-b", false], ["fidc-com-coobrigacao", false], ["fidc-sem-coobrigacao", false],
      ["desconto-bancario", true], ["linha-giro", true]]);
    // Whole draws: 180 days rolled every 50 are four draws (50, 50, 50, 30); the oracle's 3.6 understates the additional IOF.
    expect([o("desconto-bancario").cost.draws, o("desconto-bancario").cost.iofDays, n(o("desconto-bancario").cost.iof, 5)]).toEqual([4, 180, "0.50932"]);
    expect([o("linha-giro").cost.draws, o("linha-giro").cost.iofDays]).toEqual([1, 180]);
  });
  it("converts monthly rates to annual effective before comparing with the DI", () => {
    expect([n(String(Number(o("fidc-com-coobrigacao").rates.annualEffective) * 100)), n(String(Number(o("fidc-com-coobrigacao").rates.spreadOverDi) * 100))]).toEqual(["21.0", "5.3"]);
    expect([n(String(Number(o("fidc-sem-coobrigacao").rates.annualEffective) * 100)), n(String(Number(o("fidc-sem-coobrigacao").rates.spreadOverDi) * 100))]).toEqual(["25.3", "9.1"]);
    expect(n(o("risco-sacado-b").rates.spreadOverDi, 4)).toBe("0.0120");
  });
  it("states the balance sheet and negative pledge effect of each", () => {
    expect(r.options.map(x => [x.id, x.balanceSheet, x.measuredDebtAdded, x.lien, x.fitsLienBasket])).toEqual([
      ["risco-sacado-b", "derecognized", "0", "not_a_guarantee_confirm_with_counsel", null],
      ["fidc-com-coobrigacao", "tends_to_remain_as_liability", "17", "not_a_guarantee_confirm_with_counsel", null],
      ["fidc-sem-coobrigacao", "derecognized", "0", "not_a_guarantee_confirm_with_counsel", null],
      ["desconto-bancario", "liability", "17", "uses_basket", false],
      ["linha-giro", "liability", "17", "uses_basket_if_collateralized", false]]);
  });
  it("fills the peak from the cheapest option, keeps the line as reserve and dates the start", () => {
    expect(r.plan).toEqual({steps: [{optionId: "risco-sacado-b", capacity: "3.7", amount: "3.7", cumulative: "3.7"}, {optionId: "fidc-com-coobrigacao", capacity: "21.3", amount: "21.3", cumulative: "25"}],
      covered: "25", coversPeak: true, reserve: "linha-giro"});
    expect(r.timing).toEqual({startBy: "2026-09-16", slackDays: 1, leadDaysMax: 30, conditionsPrecedent: [{code: "duplicata_registration", amount: "21.3"}]});
    expect(r.questions.map(q => [q.code, q.itemId])).toEqual([["anchor_program_of_restricted_debtor", "rede-a"], ["duplicata_registration_capability", null]]);
  });
  it("does not read a dedicated vehicle into a seasonal need", () => {
    expect([n(r.dedicatedVehicle.monthlyAssignable), r.dedicatedVehicle.reading]).toEqual(["12.8", "not_for_seasonal_need"]);
    expect(assessReceivablesFunding({...base, needProfile: "structural"}).dedicatedVehicle.reading).toBe("worth_studying");
  });
  it("reorders the plan when the restricted debtor's own program is confirmed", () => {
    const a = assessReceivablesFunding(programA());
    // The last option is allocated only what covers the peak; its capacity stays visible.
    expect(a.plan.steps.map(s => [s.optionId, s.capacity, s.amount, s.cumulative])).toEqual([["risco-sacado-b", "3.7", "3.7", "3.7"], ["risco-sacado-a", "19.8", "19.8", "23.5"],
      ["fidc-com-coobrigacao", "21.3", "1.5", "25"]]);
    expect(a.questions.map(q => q.code)).toEqual(["duplicata_registration_capability"]);
    // The program's terms are still to be asked: without its lead time the start date is a gap, not a guess.
    expect([a.timing.startBy, a.gaps.at(-1)]).toEqual([null, {item: "option.risco-sacado-a.leadDays", reason: "lead_time_not_informed"}]);
  });
  it("never assigns a prohibited, encumbered or overdue bucket", () => {
    const named = {...withItem("redes-c-d", {anchorProgram: "active"}), options: base.options.map(x => x.id === "risco-sacado-b"
      ? {...x, eligibility: {...x.eligibility!, anchorItemIds: ["rede-b", "redes-c-d"]}} : x)};
    expect(assessReceivablesFunding(named).options[0]!.byItem.find(b => b.itemId === "redes-c-d")).toMatchObject({retained: "0", reasons: ["encumbered"]});
    expect(() => assessReceivablesFunding(withOption("risco-sacado-b", {eligibility: {...base.options[0]!.eligibility!, anchorItemIds: ["rede-a"]}}))).toThrow("receivables_funding_anchor_program_not_active");
    expect(() => assessReceivablesFunding(withOption("fidc-com-coobrigacao", {collateral: "receivables_assignment"}))).toThrow("receivables_funding_sale_with_collateral");
    expect(() => assessReceivablesFunding(withOption("desconto-bancario", {recourse: "without_recourse"}))).toThrow("receivables_funding_option_recourse");
  });
  it("refuses malformed portfolios", () => {
    expect(() => assessReceivablesFunding(withItem("redes-c-d", {encumbranceHolder: null}))).toThrow("receivables_funding_encumbrance_holder");
    expect(() => assessReceivablesFunding(withItem("rede-e", {largestDebtorAmount: "1"}))).toThrow("receivables_funding_largest_debtor");
    expect(() => assessReceivablesFunding({...base, needPeak: "10"})).toThrow("receivables_funding_need");
    expect(() => assessReceivablesFunding(withOption("linha-giro", {eligibility: base.options[1]!.eligibility}))).toThrow("receivables_funding_option_eligibility");
    expect(() => assessReceivablesFunding(withItem("rede-a", {amount: "-1"}))).toThrow("receivables_funding_invalid_amount");
  });
  it("proves the sublimit for several debtors only by the largest one", () => {
    const known = assessReceivablesFunding(withItem("varejo-demais", {debtorCount: 280, largestDebtorAmount: "0.4"}));
    expect(known.options[1]!.byItem.find(b => b.itemId === "varejo-demais")).toMatchObject({retained: "11.3", sublimitVerified: true});
    const over = assessReceivablesFunding(withItem("varejo-demais", {debtorCount: 280, largestDebtorAmount: "5"}));
    expect(over.options[1]!.byItem.find(b => b.itemId === "varejo-demais")).toMatchObject({retained: "9.3", sublimitVerified: false});
  });
  it("charges the additional IOF on each actual draw", () => {
    const short = assessReceivablesFunding({...base, calendarDays: 51, businessDays: 36});
    const d = short.options.find(x => x.id === "desconto-bancario")!.cost;
    expect([d.draws, d.iofDays, n(d.iof, 6)]).toEqual([2, 51, "0.200294"]);
  });
  it("refuses a largest debtor that cannot hold the bucket", () => {
    expect(() => assessReceivablesFunding(withItem("varejo-demais", {debtorCount: 2, largestDebtorAmount: "1"}))).toThrow("receivables_funding_largest_debtor");
    // Coherent data still meets the count times sublimit ceiling.
    const two = assessReceivablesFunding(withItem("varejo-demais", {debtorCount: 4, largestDebtorAmount: "2.9"}));
    expect(two.options[1]!.byItem.find(b => b.itemId === "varejo-demais")).toMatchObject({retained: "11.3", sublimitVerified: true});
  });
  it("keeps what one buyer leaves for the next one", () => {
    const one = {...base.items[3]!, id: "unico", label: "Sacado único", amount: "5", creditTier: "standard" as const};
    const fund = (id: string, rate: string, cap: string) => ({...base.options[1]!, id, label: id, rate: {basis: "monthly" as const, rate}, eligibility: {...base.options[1]!.eligibility!, sublimitPerDebtor: cap, sublimitGroup: null}});
    const r = assessReceivablesFunding({...base, items: [one], options: [fund("barato", "0.01", "2"), fund("caro", "0.02", "3"), base.options[4]!], needAverage: "3", needPeak: "3"});
    expect(r.plan.steps.map(s => [s.optionId, s.capacity, s.amount, s.cumulative])).toEqual([["barato", "2", "2", "2"], ["caro", "3", "1", "3"]]);
    expect(r.plan.coversPeak).toBe(true);
  });
  it("sums one debtor's lots before the sublimit", () => {
    const e = base.items.find(i => i.id === "rede-e")!;
    const split = {...base, items: [...base.items.filter(i => i.id !== "rede-e"), {...e, id: "rede-e-lote-1", amount: "2.5"}, {...e, id: "rede-e-lote-2", amount: "2"}]};
    const r = assessReceivablesFunding(split), fidc = r.options.find(o => o.id === "fidc-com-coobrigacao")!;
    expect(fidc.byItem.filter(b => b.itemId.startsWith("rede-e")).map(b => [b.itemId, b.retained, b.sublimitExcess, b.sublimitVerified]))
      .toEqual([["rede-e-lote-1", "2.5", "0", true], ["rede-e-lote-2", "0.5", "1.5", true]]);
    expect([fidc.volume, r.portfolio.assignable, r.portfolio.excluded]).toEqual(["21.3", "25", "37"]);
  });
  it("refuses a basis that cannot prove separation between debtors", () => {
    expect(() => assessReceivablesFunding(withItem("varejo-demais", {debtorKey: "rede-e"}))).toThrow("receivables_funding_debtor_key_conflict");
    expect(() => assessReceivablesFunding(withItem("rede-f", {debtorKey: "rede-e", creditTier: "selected", contract: "prohibited_without_consent"}))).toThrow("receivables_funding_debtor_lots_inconsistent");
    const b = base.items.find(i => i.id === "rede-b")!;
    expect(() => assessReceivablesFunding({...base, items: [...base.items, {...b, id: "rede-b-lote-2"}]})).toThrow("receivables_funding_debtor_lots_inconsistent");
    expect(() => assessReceivablesFunding(withItem("rede-e", {debtorSetDisjoint: true}))).toThrow("receivables_funding_debtor_set");
    // A bucket not declared disjoint keeps its volume as a ceiling and names the gap.
    const open = assessReceivablesFunding(withItem("varejo-demais", {debtorSetDisjoint: false}));
    expect(open.gaps.map(g => g.item)).toContain("item.varejo-demais.debtorSetDisjoint");
    expect(open.options[1]!.byItem.find(x => x.itemId === "varejo-demais")!.unverifiedBy).toEqual(["largest_debtor", "debtor_set_overlap"]);
  });
  it("keeps the same headroom for a debtor in one lot or several after a partial purchase", () => {
    const one = {...base.items[3]!, id: "unico", label: "Sacado único", amount: "5", creditTier: "standard" as const, debtorKey: "sacado-unico"};
    const fund = (id: string, rate: string, cap: string) => ({...base.options[1]!, id, label: id, rate: {basis: "monthly" as const, rate}, eligibility: {...base.options[1]!.eligibility!, sublimitPerDebtor: cap, sublimitGroup: null}});
    const whole = {...base, items: [one], options: [fund("barato", "0.01", "2"), fund("caro", "0.02", "3"), base.options[4]!], needAverage: "4", needPeak: "4"};
    const lots = {...whole, items: [{...one, id: "lote-1", amount: "2.5"}, {...one, id: "lote-2", amount: "2.5"}]};
    for (const x of [whole, lots]) {
      const r = assessReceivablesFunding(x);
      expect(r.plan.steps.map(s => [s.optionId, s.capacity, s.amount, s.cumulative])).toEqual([["barato", "2", "2", "2"], ["caro", "3", "2", "4"]]);
      expect(r.plan.coversPeak).toBe(true);
    }
  });
  it("records the sublimit as the reason when the cut leaves a lot fully excluded", () => {
    const e = base.items.find(i => i.id === "rede-e")!;
    const r = assessReceivablesFunding({...base, items: [...base.items.filter(i => i.id !== "rede-e"), {...e, id: "lote-1", amount: "3"}, {...e, id: "lote-2", amount: "1.5"}]});
    expect(r.portfolio.items.filter(i => i.itemId.startsWith("lote")).map(i => [i.itemId, i.assignable, i.excluded, i.reasons]))
      .toEqual([["lote-1", "3", "0", []], ["lote-2", "0", "1.5", ["debtor_sublimit"]]]);
    expect(r.portfolio.items.every(i => i.excluded === "0" || i.reasons.length > 0)).toBe(true);
  });
  it("allows a rollover term longer, equal or shorter than the time in use", () => {
    const at = (calendarDays: number) => assessReceivablesFunding({...base, calendarDays, businessDays: Math.round(calendarDays * 0.7)}).options.find(x => x.id === "desconto-bancario")!.cost;
    expect([30, 50, 51].map(d => {const c = at(d); return [c.draws, c.iofDays, n(c.iof, 6)];})).toEqual([[1, 30, "0.106420"], [1, 50, "0.134300"], [2, 51, "0.200294"]]);
  });
  it("allocates lots of different maturities by exact flow, whatever their order or subdivision", () => {
    const one = {...base.items[3]!, id: "curto", label: "Sacado, lote curto", amount: "3", dueDate: "2026-10-15", creditTier: "standard" as const, registration: "registered" as const, debtorKey: "sacado-unico"};
    const long = {...one, id: "longo", label: "Sacado, lote longo", amount: "2", dueDate: "2027-01-15"};
    const fund = (id: string, rate: string, cap: string, term: number) => ({...base.options[1]!, id, label: id, rate: {basis: "monthly" as const, rate},
      eligibility: {...base.options[1]!.eligibility!, sublimitPerDebtor: cap, sublimitGroup: null, maxRemainingTermDays: term}});
    const options = [fund("barato", "0.01", "2", 180), fund("restrito", "0.02", "3", 60), base.options[4]!];
    const cases = [[one, long], [long, one], [{...one, id: "curto-1", amount: "1"}, long, {...one, id: "curto-2", amount: "2"}],
      [{...long, id: "longo-b", amount: "0.5"}, {...one, id: "curto-z"}, {...long, id: "longo-a", amount: "1.5"}]];
    for (const items of cases) {
      const r = assessReceivablesFunding({...base, items, options, needAverage: "5", needPeak: "5"});
      expect([r.portfolio.assignable, r.portfolio.excluded]).toEqual(["5", "0"]);
      expect(r.plan.steps.map(s => [s.optionId, s.capacity, s.amount, s.cumulative])).toEqual([["barato", "2", "2", "2"], ["restrito", "3", "3", "5"]]);
      expect(r.plan.coversPeak).toBe(true);
      // The cheap fund takes the long lot it alone accepts; the restrictive one the short lot.
      expect(r.portfolio.items.filter(i => i.itemId.startsWith("longo")).reduce((v, i) => v + Number(i.assignable), 0)).toBe(2);
    }
  });
  it("shares the sublimit only within a declared group, and the group states one sublimit", () => {
    expect(() => assessReceivablesFunding({...base, options: base.options.map(o => o.id === "fidc-sem-coobrigacao" ? {...o, eligibility: {...o.eligibility!, sublimitPerDebtor: "4"}} : o)}))
      .toThrow("receivables_funding_sublimit_group");
    // Two independent funds each give their own sublimit: retailer E is sold in full across them.
    const apart = assessReceivablesFunding({...base, options: base.options.map(o => o.kind === "fidc" ? {...o, eligibility: {...o.eligibility!, sublimitGroup: null}} : o)});
    expect([apart.portfolio.assignable, apart.portfolio.items.find(i => i.itemId === "rede-e")!.assignable]).toEqual(["28", "4.5"]);
  });
  it("shows each step's capacity on what earlier steps left, per debtor and sublimit scope", () => {
    const a = {...base.items[3]!, id: "sacado-a", label: "Sacado A", amount: "5", creditTier: "selected" as const, registration: "registered" as const, debtorKey: "sacado-a"};
    const b = {...a, id: "sacado-b", label: "Sacado B", creditTier: "standard" as const, debtorKey: "sacado-b"};
    const fund = (id: string, rate: string, tier: "selected" | "standard", group: string | null) => ({...base.options[1]!, id, label: id, rate: {basis: "monthly" as const, rate},
      eligibility: {...base.options[1]!.eligibility!, sublimitPerDebtor: "3", sublimitGroup: group, minCreditTier: tier}});
    const arrangements = [[a, b], [b, a], [{...a, id: "sacado-a-2", amount: "2"}, b, {...a, id: "sacado-a-1", amount: "3"}]];
    for (const [group, expected] of [[null, [["barato", "3", "3", "3"], ["caro", "5", "5", "8"]]], ["mesmos-fundos", [["barato", "3", "3", "3"], ["caro", "3", "3", "6"]]]] as const) {
      for (const items of arrangements) {
        const r = assessReceivablesFunding({...base, items, options: [fund("barato", "0.01", "selected", group), fund("caro", "0.02", "standard", group), base.options[4]!], needAverage: "8", needPeak: "8"});
        expect(r.plan.steps.map(s => [s.optionId, s.capacity, s.amount, s.cumulative])).toEqual(expected);
      }
    }
  });
});
