import {describe, expect, it} from "vitest";
import {prepareCovenantHeadroomPacket} from "./covenant-headroom-packet";
import {auroraCovenantBasis} from "./covenant-headroom.test-support";
import {calculateCovenantHeadroomEvidence, fichaCalculationExecutorContracts} from "./ficha-executor-contracts";

const question = "Como estamos contra os covenants?";
const packet = (o: Parameters<typeof auroraCovenantBasis>[0] = {}) => prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question,
  headlineMeasurementId: "dez26-base", analysis: auroraCovenantBasis(o).seal()});
const n = (v: string | null | undefined, p = 2) => Number(v).toFixed(p);

describe("covenant headroom packet", () => {
  it("answers with the indenture test, the policy that binds first and the open question", () => {
    const p = packet();
    expect(p.status).toBe("partial");
    expect(n(p.readings!.headline.ratio)).toBe("2.20");
    expect(p.readings!.headline.byLimit.map((l) => [l.limitId, n(l.ebitdaHeadroom), n(l.unrealizedEbitdaLossToLimit, 3)])).toEqual([["aditamento", "13.76", "0.529"], ["politica", "6.22", "0.239"]]);
    expect(p.readings!.policyBindsFirst).toBe(true);
    expect(p.readings!.worst).toMatchObject({measurementId: "dez27-adverso", limitId: "politica"});
    expect(p.readings!.contrasts).toEqual(["dez26-sem-safra", "junho-gerencial", "dez26-escritura-original"]);
    expect(p.readings!.openQuestions).toEqual(["politica"]);
    expect(p.result.consequence.acceleration).toBe("non_automatic");
  });
  it("is complete once the policy definition is written, deterministic and registered", () => {
    const p = packet({policyDefinition: "EBITDA gerencial sem descontar arrendamentos"});
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.fingerprint).toBe(packet({policyDefinition: "EBITDA gerencial sem descontar arrendamentos"}).fingerprint);
    expect(calculateCovenantHeadroomEvidence(auroraCovenantBasis().seal()).status).toBe("partial_composition");
    expect(fichaCalculationExecutorContracts().map((c) => c.name)).toContain("covenant-headroom-evidence");
  });
  it("refuses a headline that is not a test", () => {
    expect(() => prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question, headlineMeasurementId: "junho-gerencial",
      analysis: auroraCovenantBasis().seal()})).toThrow("headline must be a test measurement");
  });
});
