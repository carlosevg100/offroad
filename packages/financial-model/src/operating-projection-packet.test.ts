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
  it("is deterministic and publishes its contracts", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
    expect(operatingProjectionPacketExecutorContracts().executor.exportName).toBe("prepareOperatingProjectionPacket");
  });
});
