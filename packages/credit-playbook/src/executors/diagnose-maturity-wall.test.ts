import {describe, expect, it} from "vitest";

import {diagnoseMaturityWall, type MaturityWallInput} from "./diagnose-maturity-wall";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const camil = (): MaturityWallInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  grossDebt: "5670186",
  periods: [
    {period: "2026/27", amount: "1229828", priorAmount: "1074636"},
    {period: "2027/28", amount: "776868", priorAmount: "712945"},
    {period: "2028/29", amount: "1228475", priorAmount: "886187"},
    {period: "2029/30", amount: "694497", priorAmount: "586660"},
    {period: "2030/31", amount: "994544", priorAmount: "989147"},
    {period: "after 2031", amount: "809198", priorAmount: "805151"},
  ],
  scheduleAnchor: itr(40, "15"),
  cash: {value: "1430714", definition: "accounting_equivalents_up_to_90_days", anchor: itr(20, "3")},
  operatingGeneration: null,
  claimedSources: [
    {label: "1ª emissão de notas comerciais, R$ 251 milhões, aprovada em 18/05/2026", amount: "251000", proven: false, anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 1}},
    {label: "operação estruturada com CPR, até R$ 535 milhões, aprovada em 18/05/2026", amount: "535000", proven: false, anchor: {document: "ca_operacao_estruturada_2026-05-27.pdf", page: 1}},
  ],
});

describe("diagnose-maturity-wall executor", () => {
  it("names the two walls of the case 01 answer key and the growth of the second", () => {
    const result = diagnoseMaturityWall(camil());
    const walls = result.walls.filter((wall) => wall.isWall).map((wall) => wall.period);
    expect(walls).toEqual(["2026/27", "2028/29"]);
    expect(result.walls[2]?.changeFromPrior).toBe("342288");
    expect(result.walls[0]?.shareOfGross.startsWith("0.2168")).toBe(true);
  });

  it("covers with the declared cash definition and says it is not day-zero liquidity", () => {
    const result = diagnoseMaturityWall(camil());
    expect(result.coverage.byPeriod[0]?.coverByCash?.startsWith("1.1633")).toBe(true);
    expect(result.coverage.byPeriod[0]?.coverByCashAndGeneration).toBeNull();
    expect(result.coverage.caveat).toMatch(/not day-zero liquidity/);
  });

  it("keeps board approvals out of the sources of payment until disbursement is proven", () => {
    const result = diagnoseMaturityWall(camil());
    expect(result.provenSources).toHaveLength(0);
    expect(result.unprovenSources.map((source) => source.amount)).toEqual(["251000", "535000"]);
  });

  it("is consistent across twenty runs", () => {
    const first = diagnoseMaturityWall(camil());
    for (let index = 0; index < 20; index += 1) expect(diagnoseMaturityWall(camil()).trace.outputFingerprint).toBe(first.trace.outputFingerprint);
  });
});
