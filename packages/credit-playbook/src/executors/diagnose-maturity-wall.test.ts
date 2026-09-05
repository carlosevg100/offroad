import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {diagnoseMaturityWall, type MaturityWallInput} from "./diagnose-maturity-wall";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const threshold = {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"};
const prior = (amount: string) => ({amount, asOf: "2026-02-28", unit: "BRL thousand" as const, perimeter: "consolidated" as const, anchor: itr(40, "15, coluna 28/02/2026")});
/** Camil at 31/05/2026: the note 15 schedule by safra year, cash of note 3, the two approved operations of the 18/05/2026 board minutes (approved, not contracted, not disbursed). R$ thousand. */
const camil = (): MaturityWallInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  perimeter: "consolidated",
  grossDebt: {value: "5670186", unit: "BRL thousand", anchor: itr(39, "15")},
  periods: [
    {period: "2026/27", amount: "1229828", prior: prior("1074636"), endsAt: "2027-05-31"},
    {period: "2027/28", amount: "776868", prior: prior("712945"), endsAt: "2028-05-31"},
    {period: "2028/29", amount: "1228475", prior: prior("886187"), endsAt: "2029-05-31"},
    {period: "2029/30", amount: "694497", prior: prior("586660"), endsAt: "2030-05-31"},
    {period: "2030/31", amount: "994544", prior: prior("989147"), endsAt: "2031-05-31"},
    {period: "after 2031", amount: "809198", prior: prior("805151"), endsAt: null},
    {period: "debenture costs", amount: "-63224", kind: "adjustment", prior: prior("-66343"), endsAt: null},
  ],
  scheduleAnchor: itr(40, "15"),
  cash: {value: "1430714", definition: "accounting_equivalents_up_to_90_days", anchor: itr(20, "3")},
  operatingGeneration: null,
  claimedSources: [
    {id: "notas-comerciais-2026", label: "1ª emissão de notas comerciais, R$ 251 milhões, aprovada em 18/05/2026", amount: "251000", claimedPeriod: "2026/27", evidence: {approval: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, contract: null, disbursement: null}},
    {id: "cpr-2026", label: "operação estruturada com CPR, até R$ 535 milhões, aprovada em 18/05/2026", amount: "535000", claimedPeriod: "2026/27", evidence: {approval: {document: "ca_operacao_estruturada_2026-05-27.pdf", page: 2}, contract: null, disbursement: null}},
  ],
  wallThreshold: threshold,
});

describe("diagnose-maturity-wall executor (v6)", () => {
  it("gold: names the two walls of the case 01 answer key against the versioned threshold, the growth of the second, and the peak", () => {
    const result = diagnoseMaturityWall(camil());
    expect(result.walls.filter((wall) => wall.is_wall).map((wall) => wall.period)).toEqual(["2026/27", "2028/29"]);
    expect(result.walls.find((wall) => wall.period === "2028/29")?.change_from_prior).toEqual({amount: "342288", prior_as_of: "2026-02-28", anchor: itr(40, "15, coluna 28/02/2026")});
    expect(result.walls[0]?.prior_comparability).toBe("earlier date, same unit and perimeter");
    expect(result.schema_version).toBe("method.diagnose-maturity-wall.v6");
    expect(result.schedule_adjustments).toEqual([{id: "debenture costs", amount: "-63224"}]);
    expect(result.walls.map((wall) => wall.period)).not.toContain("debenture costs");
    expect(result.walls[0]?.share_of_gross.startsWith("0.2168")).toBe(true);
    expect(result.walls[0]?.anchor).toEqual(itr(40, "15"));
    expect(result.peak).toEqual({period: "2026/27", amount: "1229828", share_of_gross: result.walls[0]!.share_of_gross});
    expect(result.wall_threshold).toEqual(threshold);
    expect(result.state).toBe("incomplete");
  });

  it("gold: covers the periods sequentially with the accounting cash only, says what depends on rollover, and keeps the approvals unproven", () => {
    const result = diagnoseMaturityWall(camil());
    const first = result.coverage.by_period[0]!;
    expect(first.coverage?.startsWith("1.1633")).toBe(true);
    expect(first.cumulative_deficit).toBe("0");
    expect(first.closing_cash).toBe("200886");
    const second = result.coverage.by_period[1]!;
    expect(second.opening_cash).toBe("200886");
    expect(second.incremental_deficit).toBe("575982");
    expect(second.cumulative_deficit).toBe("575982");
    expect(second.rollover_dependency).toMatch(/575982 of this period's principal depends on rollover/);
    const third = result.coverage.by_period[2]!;
    expect(third.incremental_deficit).toBe("1228475");
    expect(third.cumulative_deficit).toBe("1804457");
    expect(result.coverage.by_period.find((row) => row.period === "after 2031")?.state).toBe("not_assessed");
    expect(result.coverage.cumulative_deficit).toBe("3493498");
    expect(result.coverage.caveat).toMatch(/not day-zero liquidity/);
    expect(result.sources.every((source) => source.state === "unproven")).toBe(true);
    expect(result.sources[0]?.reason).toMatch(/approved only/);
    expect(result.uncovered_terms.map((term) => term.id)).toEqual(expect.arrayContaining(["operating_generation", "cash_availability", "source:notas-comerciais-2026"]));
    expect(result.notes[0]?.text).toMatch(/nothing is asserted about what a covenant breach triggers|non-automatic acceleration/);
  });

  it("hypothetical: a source counts only with contract and disbursement, and generation enters only with a declared basis", () => {
    const base = camil();
    const contracted = diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-06-10", amount: "251000", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: {kind: "disbursement_proof", date: "2026-06-20", amount: "200000", anchor: {document: "hipotetico_extrato.pdf", page: 1}}}}]});
    expect(contracted.sources[0]?.state).toBe("proven");
    // The cover uses what the proof says (200.000 on 20/06/2026, in 2026/27), not the claimed 251.000.
    expect(contracted.sources[0]?.amount).toBe("200000");
    expect(contracted.sources[0]?.claimed_amount).toBe("251000");
    expect(contracted.sources[0]?.period).toBe("2026/27");
    expect(contracted.sources[0]?.reason).toMatch(/the file claimed 251000, the proof says 200000, the proof is used/);
    expect(contracted.coverage.by_period[0]?.contracted_sources).toBe("200000");
    // A disbursement dated inside another window lands there whatever the file assigns.
    const later = diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-06-10", amount: "251000", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: {kind: "disbursement_proof", date: "2027-08-20", amount: "251000", anchor: {document: "hipotetico_extrato.pdf", page: 1}}}}]});
    expect(later.sources[0]?.period).toBe("2027/28");
    expect(later.sources[0]?.reason).toMatch(/the file assigned 2026\/27, the date says 2027\/28/);
    expect(later.coverage.by_period[1]?.contracted_sources).toBe("251000");
    expect(contracted.coverage.by_period[0]?.closing_cash).toBe("400886");
    const approvedFlaggedTrue = diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-06-10", amount: "251000", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: null}}]});
    expect(approvedFlaggedTrue.sources[0]?.state).toBe("unproven");
    expect(approvedFlaggedTrue.sources[0]?.amount).toBeNull();
    expect(approvedFlaggedTrue.sources[0]?.reason).toMatch(/approved and contracted only/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-06-10", amount: "251000", anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}}, disbursement: {kind: "disbursement_proof", date: "2026-06-20", amount: "251000", anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}}}}]})).toThrow(/must be two documents of the base|not a contract/);
    // A disbursement on or before the reference date already sits inside the cash: counting it again is double counting.
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-05-10", amount: "251000", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: {kind: "disbursement_proof", date: "2026-05-20", amount: "251000", anchor: {document: "hipotetico_extrato.pdf", page: 1}}}}]})).toThrow(/counting it again is double counting/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-07-10", amount: "251000", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: {kind: "disbursement_proof", date: "2026-06-20", amount: "251000", anchor: {document: "hipotetico_extrato.pdf", page: 1}}}}]})).toThrow(/disbursed before it was contracted/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", date: "2026-06-10", amount: "100000", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: {kind: "disbursement_proof", date: "2026-06-20", amount: "251000", anchor: {document: "hipotetico_extrato.pdf", page: 1}}}}]})).toThrow(/more than the 100000 contracted/);
    // Adjustment rows are never periods for interest, generation or sources.
    expect(() => diagnoseMaturityWall({...base, interestByPeriod: {"debenture costs": {value: "1", anchor: itr(40)}}})).toThrow(/not a maturity bucket/);
    expect(() => diagnoseMaturityWall({...base, operatingGeneration: {basis: "cfads_ltm", byPeriod: {"debenture costs": "1"}, anchor: itr(40)}})).toThrow(/not a maturity bucket/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, claimedPeriod: "debenture costs"}]})).toThrow(/not a maturity bucket/);
    const declared = Object.fromEntries(["2026/27", "2027/28", "2028/29", "2029/30", "2030/31"].map((period) => [period, "500000"]));
    const interest = Object.fromEntries(["2026/27", "2027/28", "2028/29", "2029/30", "2030/31"].map((period) => [period, {value: "100000", anchor: {document: "hipotetico_juros.pdf", note: "juros por período, hipótese sintética"}}]));
    const withGeneration = diagnoseMaturityWall({...base, operatingGeneration: {basis: "cfads_declared_projection", byPeriod: declared, anchor: {document: "hipotetico_cfads.pdf", note: "hipótese sintética de geração de caixa para o serviço da dívida, por período"}}, interestByPeriod: interest});
    expect(withGeneration.state).toBe("complete");
    expect(withGeneration.coverage.coverage_basis).toBe("full_debt_service");
    expect(withGeneration.coverage.by_period[0]?.debt_service).toBe("1329828");
    expect(withGeneration.coverage.by_period[0]?.cumulative_deficit).toBe("0");
    expect(withGeneration.coverage.by_period[1]?.incremental_deficit).toBe("0");
    // 2026/27: 1.430.714 + 500.000 against 1.329.828 leaves 600.886; 2027/28: 1.100.886 against 876.868 leaves 224.018; 2028/29: 724.018 against 1.328.475 leaves 604.457 uncovered.
    expect(withGeneration.coverage.by_period[1]?.closing_cash).toBe("224018");
    expect(withGeneration.coverage.by_period[2]?.incremental_deficit).toBe("604457");
    // Generation declared for one period only never repeats: the other periods are cash-only and the state stays incomplete.
    const partial = diagnoseMaturityWall({...base, operatingGeneration: {basis: "cfads_declared_projection", byPeriod: {"2026/27": "500000"}, anchor: {document: "hipotetico_cfads.pdf", note: "hipótese sintética"}}});
    expect(partial.state).toBe("incomplete");
    expect(partial.coverage.by_period[0]?.generation).toBe("500000");
    expect(partial.coverage.by_period[1]?.generation).toBeNull();
    expect(partial.coverage.by_period[1]?.generation_declared).toBe(false);
    expect(partial.incomplete_reasons.some((reason) => /no generation declared for 2027\/28, 2028\/29, 2029\/30, 2030\/31/.test(reason))).toBe(true);
    expect(partial.coverage.coverage_basis).toBe("principal_only");
    expect(partial.uncovered_terms.map((term) => term.id)).toContain("interest");
    expect(() => diagnoseMaturityWall({...base, operatingGeneration: {value: "895864", basis: "ltm" as unknown as "cfads_ltm", periodMonths: 12, anchor: itr(40)} as unknown as MaturityWallInput["operatingGeneration"]})).toThrow();
  });

  it("mutation: exactly the threshold is not a wall; a scale or unit mutation is refused or blocked; an unreconciled schedule blocks; a past period is refused", () => {
    const base = camil();
    const exact = diagnoseMaturityWall({...base, wallThreshold: {...threshold, share: base.periods[0]!.amount === "1229828" ? "0.21689377" : "0.2"}});
    expect(exact.walls[0]?.share_of_gross).toBe("0.21689377");
    expect(exact.walls[0]?.is_wall).toBe(false);
    expect(() => diagnoseMaturityWall({...base, unit: "R$ mil" as unknown as "BRL"})).toThrow();
    const scaled = diagnoseMaturityWall({...base, periods: base.periods.map((period, index) => index === 0 ? {...period, amount: "1229828000"} : period)});
    expect(scaled.state).toBe("blocked");
    expect(scaled.block_reasons[0]).toMatch(/did not reconcile/);
    expect(scaled.walls).toHaveLength(0);
    expect(scaled.coverage.by_period).toHaveLength(0);
    expect(() => diagnoseMaturityWall({...base, unit: "BRL", periods: base.periods.map((period) => ({...period, amount: new Decimal(period.amount).times(1000).toFixed()})), grossDebt: {...base.grossDebt, value: "5670186000"}, cash: {...base.cash, value: "1430714000"}})).toThrow(/reports the gross debt in BRL thousand/);
    expect(() => diagnoseMaturityWall({...base, periods: [...base.periods, {period: "2025/26", amount: "0", prior: null, endsAt: "2026-05-31"}]})).toThrow(/ends on or before the reference date/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, claimedPeriod: "2099"}]})).toThrow(/not a maturity bucket|not in the schedule/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [base.claimedSources![0]!, {...base.claimedSources![1]!, id: base.claimedSources![0]!.id}]})).toThrow(/duplicate source/);
    const empty = diagnoseMaturityWall({...base, periods: [], claimedSources: [], grossDebt: {value: "0", unit: "BRL thousand", anchor: itr(39)}});
    expect(empty.state).toBe("blocked");
  });

  it("is consistent under twenty permutations of periods, sources and object keys, with the trace in the fingerprint", () => {
    const twins = (): MaturityWallInput => ({...camil(), claimedSources: [...camil().claimedSources!, {...camil().claimedSources![0]!, id: "notas-comerciais-2026-b", claimedPeriod: "2027/28"}]});
    const first = diagnoseMaturityWall(twins());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = twins();
      const shuffled: MaturityWallInput = {...base, periods: permute(base.periods, seed).map(reorderKeys), claimedSources: permute(base.claimedSources!, seed + 1)};
      const again = diagnoseMaturityWall(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(diagnoseMaturityWall(camil()) as unknown as Record<string, unknown>, "refinance/diagnose-maturity-wall.md")).toEqual([]);
  });

  it("mutation: a coherent rescale under another label, a prior figure not earlier, a prior in another unit or perimeter, and an unproven source placed in a period", () => {
    const base = camil();
    const relabelled = {...base, unit: "BRL million" as const, grossDebt: {...base.grossDebt, unit: "BRL million" as const}};
    expect(() => diagnoseMaturityWall(relabelled)).toThrow(/does not name the unit BRL million/);
    const late = {...base, periods: base.periods.map((period, index) => index === 0 ? {...period, prior: {...period.prior!, asOf: "2026-05-31"}} : period)};
    expect(() => diagnoseMaturityWall(late)).toThrow(/not before the reference date/);
    const otherUnit = diagnoseMaturityWall({...base, periods: base.periods.map((period, index) => index === 0 ? {...period, prior: {...period.prior!, unit: "BRL" as const}} : period)});
    expect(otherUnit.walls[0]?.change_from_prior).toBeNull();
    expect(otherUnit.walls[0]?.prior_comparability).toMatch(/prior figure is in BRL, the schedule in BRL thousand; not compared/);
    const otherPerimeter = diagnoseMaturityWall({...base, periods: base.periods.map((period, index) => index === 0 ? {...period, prior: {...period.prior!, perimeter: "parent" as const}} : period)});
    expect(otherPerimeter.walls[0]?.prior_comparability).toMatch(/parent, the schedule consolidated/);
    const result = diagnoseMaturityWall(base);
    expect(result.sources[0]?.period).toBeNull();
    expect(result.sources[0]?.claimed_period).toBe("2026/27");
    expect(result.sources[0]?.reason).toMatch(/the period the file assigns \(2026\/27\) is not used/);
    expect(result.coverage.by_period[0]?.contracted_sources).toBe("0");
  });

  it("never lets cash go below zero: an exhausted cash opens the next period at zero and the shortfall is carried apart; interest declared for part of the periods gives a per-period basis", () => {
    const result = diagnoseMaturityWall(camil());
    const rows = result.coverage.by_period.filter((row) => row.state === "assessed");
    expect(rows.every((row) => Number(row.opening_cash) >= 0 && Number(row.closing_cash) >= 0)).toBe(true);
    expect(rows.every((row) => row.coverage === null || Number(row.coverage) >= 0)).toBe(true);
    expect(rows[1]?.closing_cash).toBe("0");
    expect(rows[2]?.opening_cash).toBe("0");
    expect(rows[2]?.coverage).toBe("0");
    expect(rows[2]?.incremental_deficit).toBe("1228475");
    expect(rows[2]?.cumulative_deficit).toBe("1804457");
    expect(result.coverage.cumulative_deficit).toBe(rows.reduce((sum, row) => sum.plus(row.incremental_deficit), new Decimal(0)).toFixed());
    const partial = diagnoseMaturityWall({...camil(), interestByPeriod: {"2026/27": {value: "100000", anchor: {document: "hipotetico_juros.pdf", note: "juros do primeiro período, hipótese"}}}});
    expect(partial.coverage.coverage_basis).toBe("principal_only");
    expect(partial.coverage.by_period[0]?.basis).toBe("full_debt_service");
    expect(partial.coverage.by_period[0]?.interest_anchor).toEqual({document: "hipotetico_juros.pdf", note: "juros do primeiro período, hipótese"});
    expect(partial.coverage.by_period[1]?.basis).toBe("principal_only");
    expect(partial.uncovered_terms.map((term) => term.id)).toContain("interest:2027/28");
  });

  it("records the acceleration mechanics only from the indenture clause in the base, apart from the contractual schedule, and refuses negative maturity buckets and a threshold above one", () => {
    const base = camil();
    const silent = diagnoseMaturityWall(base);
    expect(silent.acceleration_scenario.state).toBe("not_asserted");
    expect(silent.notes[0]?.anchor).toBeNull();
    expect(silent.notes[0]?.text).toMatch(/nothing is asserted about what a covenant breach triggers/);
    expect(silent.notes[0]?.text).not.toMatch(/non-automatic/);
    const clause = {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII) e 7.24.5", page: 55, note: "covenant como evento não automático; a aceleração é declarada salvo deliberação da assembleia em contrário"};
    const recorded = diagnoseMaturityWall({...base, acceleration: {clause: {text: "assembleia geral de debenturistas poderá deliberar pela não declaração do vencimento antecipado", anchor: clause}, defaultOutcome: "declared_unless_assembly_waives", accelerableBalance: {value: "306038", anchor: itr(39, "15, 13ª emissão 1ª série")}}});
    expect(recorded.acceleration_scenario.state).toBe("recorded");
    expect(recorded.acceleration_scenario.accelerable_balance?.value).toBe("306038");
    expect(recorded.acceleration_scenario.note).toMatch(/recorded apart from the contractual schedule, never added to it/);
    expect(recorded.notes[0]?.anchor).toEqual(clause);
    expect(recorded.notes[0]?.text).toMatch(/declared unless the assembly of holders, duly installed with quorum, resolves not to declare it/);
    expect(recorded.walls.map((wall) => wall.amount)).toEqual(silent.walls.map((wall) => wall.amount));
    expect(() => diagnoseMaturityWall({...base, periods: base.periods.map((period, index) => (index === 0 ? {...period, amount: "-100"} : period))})).toThrow(/only a typed adjustment row may/);
    expect(() => diagnoseMaturityWall({...base, periods: base.periods.map((period) => (period.period === "debenture costs" ? {...period, endsAt: "2027-05-31"} : period))})).toThrow(/cannot end on a date/);
    expect(() => diagnoseMaturityWall({...base, wallThreshold: {...threshold, share: "1.5"}})).toThrow(/between 0 and 1/);
  });
});
