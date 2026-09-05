import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {diagnoseMaturityWall, type MaturityWallInput} from "./diagnose-maturity-wall";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const threshold = {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"};
const prior = (amount: string) => ({amount, asOf: "2026-02-28", anchor: itr(40, "15, coluna 28/02/2026")});
/** Camil at 31/05/2026: the note 15 schedule by safra year, cash of note 3, the two approved operations of the 18/05/2026 board minutes (approved, not contracted, not disbursed). R$ thousand. */
const camil = (): MaturityWallInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  grossDebt: {value: "5670186", unit: "BRL thousand", anchor: itr(39, "15")},
  periods: [
    {period: "2026/27", amount: "1229828", prior: prior("1074636"), endsAt: "2027-05-31"},
    {period: "2027/28", amount: "776868", prior: prior("712945"), endsAt: "2028-05-31"},
    {period: "2028/29", amount: "1228475", prior: prior("886187"), endsAt: "2029-05-31"},
    {period: "2029/30", amount: "694497", prior: prior("586660"), endsAt: "2030-05-31"},
    {period: "2030/31", amount: "994544", prior: prior("989147"), endsAt: "2031-05-31"},
    {period: "after 2031", amount: "809198", prior: prior("805151"), endsAt: null},
    {period: "debenture costs", amount: "-63224", prior: prior("-66343"), endsAt: null},
  ],
  scheduleAnchor: itr(40, "15"),
  cash: {value: "1430714", definition: "accounting_equivalents_up_to_90_days", anchor: itr(20, "3")},
  operatingGeneration: null,
  claimedSources: [
    {id: "notas-comerciais-2026", label: "1ª emissão de notas comerciais, R$ 251 milhões, aprovada em 18/05/2026", amount: "251000", period: "2026/27", evidence: {approval: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, contract: null, disbursement: null}},
    {id: "cpr-2026", label: "operação estruturada com CPR, até R$ 535 milhões, aprovada em 18/05/2026", amount: "535000", period: "2026/27", evidence: {approval: {document: "ca_operacao_estruturada_2026-05-27.pdf", page: 2}, contract: null, disbursement: null}},
  ],
  wallThreshold: threshold,
});

describe("diagnose-maturity-wall executor (v3)", () => {
  it("gold: names the two walls of the case 01 answer key against the versioned threshold, the growth of the second, and the peak", () => {
    const result = diagnoseMaturityWall(camil());
    expect(result.walls.filter((wall) => wall.is_wall).map((wall) => wall.period)).toEqual(["2026/27", "2028/29"]);
    expect(result.walls.find((wall) => wall.period === "2028/29")?.change_from_prior).toEqual({amount: "342288", prior_as_of: "2026-02-28", anchor: itr(40, "15, coluna 28/02/2026")});
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
    expect(result.notes[0]).toMatch(/non-automatic acceleration/);
  });

  it("hypothetical: a source counts only with contract and disbursement, and generation enters only with a declared basis", () => {
    const base = camil();
    const contracted = diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: {kind: "disbursement_proof", anchor: {document: "hipotetico_extrato.pdf", page: 1}}}}]});
    expect(contracted.sources[0]?.state).toBe("proven");
    expect(contracted.coverage.by_period[0]?.contracted_sources).toBe("251000");
    expect(contracted.coverage.by_period[0]?.closing_cash).toBe("451886");
    const approvedFlaggedTrue = diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", anchor: {document: "hipotetico_contrato.pdf", page: 1}}, disbursement: null}}]});
    expect(approvedFlaggedTrue.sources[0]?.state).toBe("unproven");
    expect(approvedFlaggedTrue.sources[0]?.reason).toMatch(/approved and contracted only/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, evidence: {approval: base.claimedSources![0]!.evidence.approval, contract: {kind: "contract", anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}}, disbursement: {kind: "disbursement_proof", anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}}}}]})).toThrow(/same page of the same document|not a contract/);
    const withGeneration = diagnoseMaturityWall({...base, operatingGeneration: {value: "500000", basis: "cfads_declared_projection", periodMonths: 12, anchor: {document: "hipotetico_cfads.pdf", note: "hipótese sintética de geração de caixa para o serviço da dívida"}}});
    expect(withGeneration.state).toBe("complete");
    expect(withGeneration.coverage.by_period[0]?.cumulative_deficit).toBe("0");
    expect(withGeneration.coverage.by_period[1]?.incremental_deficit).toBe("0");
    expect(withGeneration.coverage.by_period[2]?.incremental_deficit).toBe("304457");
    expect(() => diagnoseMaturityWall({...base, operatingGeneration: {value: "895864", basis: "ltm" as unknown as "cfads_ltm", periodMonths: 12, anchor: itr(40)}})).toThrow();
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
    expect(() => diagnoseMaturityWall({...base, claimedSources: [{...base.claimedSources![0]!, period: "2099"}]})).toThrow(/not in the schedule/);
    expect(() => diagnoseMaturityWall({...base, claimedSources: [base.claimedSources![0]!, {...base.claimedSources![1]!, id: base.claimedSources![0]!.id}]})).toThrow(/duplicate source/);
    const empty = diagnoseMaturityWall({...base, periods: [], claimedSources: [], grossDebt: {value: "0", unit: "BRL thousand", anchor: itr(39)}});
    expect(empty.state).toBe("blocked");
  });

  it("is consistent under twenty permutations of periods, sources and object keys, with the trace in the fingerprint", () => {
    const twins = (): MaturityWallInput => ({...camil(), claimedSources: [...camil().claimedSources!, {...camil().claimedSources![0]!, id: "notas-comerciais-2026-b", period: "2027/28"}]});
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
});
