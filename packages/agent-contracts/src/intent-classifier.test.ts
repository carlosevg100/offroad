import {describe, expect, it} from "vitest";

import {
  canonicalizeIntentClassifierOutput,
  intentClassifierOutputSchema,
} from "./intent-classifier";

const field = <T>(value: T) => ({value, state: "unknown" as const, confidence: null, basis: null});

describe("intent classifier boundary", () => {
  it("represents an honest empty abstention and converts it to a fail-closed envelope shape", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field([]),
        object: field([]),
        desiredOutcome: field(""),
        decision: field(null),
        audience: field([]),
        depth: field("point"),
        continuity: field("new"),
        workResponsibility: field([]),
      },
      inferableContext: {
        jurisdiction: field([]),
        asOfDate: field(null),
        currency: field(null),
        deadline: field(null),
        sponsorInstruction: field(null),
        constraints: field([]),
        urgency: field(null),
        availableInputs: field([]),
      },
      primaryWorks: [],
      composition: null,
      firstQuestion: null,
      abstain: true,
      abstainReason: null,
    });

    const canonical = canonicalizeIntentClassifierOutput(parsed, "pt-BR");

    expect(canonical.abstain).toBe(true);
    expect(canonical.composition).toBeNull();
    expect(canonical.routingCore.action.value).toEqual(["esclarecer pedido"]);
    expect(canonical.routingCore.object.value).toEqual([{kind: "document", reference: null}]);
    expect(canonical.routingCore.audience.value).toEqual(["solicitante"]);
    expect(canonical.routingCore.desiredOutcome.value).toContain("resultado esperado");
    expect(canonical.routingCore.workResponsibility.value).toEqual(["producer"]);
    expect(canonical.primaryWorks).toEqual([{work: "understand", confidence: 0}]);
    expect(canonical.firstQuestion).toContain("qual resultado você espera");
  });

  it("fails closed when a non-abstaining answer omits a routing field", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field([]),
        object: field([{kind: "company", reference: "Camil"}]),
        desiredOutcome: field("Preparar uma reunião."),
        decision: field(null),
        audience: field(["CFO"]),
        depth: field("preliminary"),
        continuity: field("new"),
        workResponsibility: field(["producer"]),
      },
      inferableContext: {
        jurisdiction: field(["BR"]),
        asOfDate: field(null),
        currency: field("BRL"),
        deadline: field(null),
        sponsorInstruction: field(null),
        constraints: field([]),
        urgency: field(null),
        availableInputs: field([]),
      },
      primaryWorks: [{work: "capital_strategy", confidence: 0.8}],
      composition: "prepare_meeting",
      firstQuestion: null,
      abstain: false,
      abstainReason: null,
    });

    const canonical = canonicalizeIntentClassifierOutput(parsed, "pt-BR");
    expect(canonical.abstain).toBe(true);
    expect(canonical.composition).toBeNull();
  });
});
