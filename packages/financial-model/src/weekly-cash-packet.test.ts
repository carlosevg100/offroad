import {describe, expect, it} from "vitest";
import {prepareWeeklyCashPacket} from "./weekly-cash-packet";
import {auroraWeeklyCashBasis} from "./weekly-cash.test-support";
import {calculateWeeklyCashEvidence, fichaCalculationExecutorContracts} from "./ficha-executor-contracts";

const question = "Como fica o caixa até dezembro e o que vence?";
const packet = () => prepareWeeklyCashPacket({schemaVersion: "weekly-cash-packet-input.v1", question, analysis: auroraWeeklyCashBasis().seal()});
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
describe("weekly cash packet", () => {
  it("leads with the tightest week, its causes and the cheapest action that covers it", () => {
    const p = packet(), r = p.readings!;
    expect(p.status).toBe("prepared_for_human_review");
    expect([r.tightestWeek.weekStart, n(r.tightestWeek.closing), r.weeksBelowMinimum]).toEqual(["2026-12-21", "7.5", ["2026-12-14", "2026-12-21"]]);
    expect(r.closingHidesTheWeek).toBe(true);
    expect(r.cheapestCoveringAction).toMatchObject({id: "conta-garantida", openAtCovenantTest: true});
    expect(r.actionsByCost.map((a) => [a.id, n(a.cost, 2), a.covers])).toEqual([["conta-garantida", "0.12", true], ["antecipacao", "0.25", true], ["linha-25", "0.87", true]]);
    expect(r.sensitivities.map((s) => [s.caseId, n(s.minimum)])).toEqual([["sem-linha", "-9.5"], ["safra-30", "2.5"], ["safra-adiada", "12.0"]]);
  });
  it("is deterministic and registered", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
    expect(calculateWeeklyCashEvidence(auroraWeeklyCashBasis().seal()).status).toBe("partial_composition");
    expect(fichaCalculationExecutorContracts().map((c) => c.name)).toContain("weekly-cash-evidence");
  });
});
