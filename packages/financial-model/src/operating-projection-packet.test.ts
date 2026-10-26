import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {operatingProjectionPacketExecutorContracts} from "./operating-projection-contracts";
import {prepareOperatingProjectionPacket} from "./operating-projection-packet";
import {auroraProjectionBasis, type AuroraOptions} from "./operating-projection.test-support";

const question = "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.";
const packet = (o: AuroraOptions = {}) => prepareOperatingProjectionPacket({schemaVersion: "operating-projection-packet-input.v1", question, analysis: auroraProjectionBasis(o).seal()});
const n = (v: string | null | undefined, p = 1) => new Decimal(v!).toDecimalPlaces(p, Decimal.ROUND_HALF_UP).toNumber();

describe("operating projection packet", () => {
  it("delivers a first version by driver that reproduces the last year, with the budget side by side and three questions", () => {
    const p = packet(), r = p.readings!;
    expect(p.status).toBe("prepared_for_human_review");
    expect([n(r.calibration.modeledRevenue), n(r.calibration.modeledEbitda), r.calibration.reproduces]).toEqual([420, 52, true]);
    expect(r.projected!.base.map((x) => n(x.ebitda))).toEqual([54.5, 56.6, 58.8]);
    expect(r.projected!.base.map((x) => n(x.cashAvailableForDebt))).toEqual([33.1, 33.4, 34.9]);
    expect(r.projected!.comparisons.map((c) => [c.versionId, c.companyValue, n(c.difference, 2), !!c.cause])).toEqual([["orcamento", "58", 3.49, true], ["revisao-julho", "55.5", 0.99, true]]);
    expect(r.projected!.sensitivities.map((s) => n(s.ebitdaPerOnePercentPrice, 2))).toEqual([4.41, 4.64, 4.86]);
    expect(r.questions).toEqual(["volume", "pass_through", "receivable_days"]);
    expect(r.ledger.filter((l) => l.nature === "data").every((l) => l.periodId === "2025-12-31")).toBe(true);
    expect(r.ledger.filter((l) => l.driver === "volume" && l.periodId !== "2025-12-31").every((l) => l.nature === "assumption" && l.origin === "estimate")).toBe(true);
  });
  it("incorporates the CFO's answers and leaves no question open", () => {
    const r = packet({informed: true}).readings!;
    const informed = r.projected!.scenarios.find((s) => s.id === "informado")!;
    expect(informed.rows.map((x) => n(x.ebitda))).toEqual([55.3, 58.4, 61.7]);
    expect([n(informed.rows[0]!.cashAvailableForDebt), n(informed.rows[0]!.effects.changeInWorkingCapital)]).toEqual([21, 12.7]);
    expect(n(r.projected!.scenarios.find((s) => s.id === "informado-trigo-4m")!.rows[1]!.ebitda)).toBe(52.6);
    expect(r.projected!.largestCashReduction).toMatchObject({scenarioId: "prazo-60", periodId: "2026-12-31"});
    expect(r.questions).toEqual([]);
  });
  it("leaves an unexplained difference as an open question and withholds a projection that does not reproduce the last year", () => {
    const p = packet({cause: false});
    expect(p.status).toBe("partial"); expect(p.readings!.openQuestions).toEqual(["orcamento", "revisao-julho"]);
    const w = packet({fixedCosts2025: "70"});
    expect(w.status).toBe("framed"); expect(w.readings!.calibration.reproduces).toBe(false); expect(w.readings!.projected).toBeNull();
  });
  it("never presents estimated, informed or house history as data or as documented history", () => {
    for (const history of [{drivers: "estimate"}, {revenue: "informed"}, {ebitda: "house"}, {drivers: "estimate", revenue: "informed", ebitda: "house"}] as NonNullable<AuroraOptions["history"]>[]) {
      const r = packet({history}).readings!;
      expect(r.calibration.reproduces).toBe(true);
      expect(r.calibration.documented).toBe(false);
      const actual = r.ledger.filter((l) => l.periodId === "2025-12-31");
      expect(actual).toHaveLength(10);
      for (const l of actual) expect(l.nature).toBe(l.origin === "document" ? "data" : "assumption");
      expect(actual.filter((l) => l.nature === "data").every((l) => l.origin === "document")).toBe(true);
    }
    const all = packet({history: {drivers: "estimate", revenue: "informed", ebitda: "house"}}).readings!;
    expect(all.ledger.some((l) => l.nature === "data")).toBe(false);
    expect([all.calibration.reportedRevenueOrigin, all.calibration.reportedEbitdaOrigin]).toEqual(["informed", "house"]);
    const documented = packet().readings!;
    expect(documented.calibration.documented).toBe(true);
    expect(documented.ledger.filter((l) => l.nature === "data").map((l) => l.origin)).toEqual(Array(10).fill("document"));
  });
  it("states the origin of each scenario change", () => {
    const r = packet({informed: true}).readings!.projected!;
    expect(r.scenarios.find((s) => s.id === "informado")!.changes).toEqual([{item: "volumeGrowthRate", origin: "informed", nature: "assumption"},
      {item: "receivableDays", origin: "informed", nature: "assumption"}]);
    expect(r.scenarios.find((s) => s.id === "trigo-repasse-6m")!.changes).toEqual([{item: "inputCostShock", origin: "house", nature: "assumption"}]);
    // The oracle's saved file shows 4.3 for the informed 2027 working capital change; re-running it gives 4.35213625.
    expect(packet({informed: true}).result.projection!.projection!.scenarios.find((s) => s.id === "informado")!.rows[1]!.changeInWorkingCapital).toBe("4.35213625");
  });
  it("is deterministic and publishes its contracts", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
    expect(operatingProjectionPacketExecutorContracts().executor.exportName).toBe("prepareOperatingProjectionPacket");
  });
});
