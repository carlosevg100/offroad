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

  it("repairs a non-plan field without discarding an otherwise named route", () => {
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
    expect(canonical.abstain).toBe(false);
    expect(canonical.composition).toBe("prepare_meeting");
    expect(canonical.routingCore.action.value).toEqual(["prepare_meeting"]);
    expect(canonical.primaryWorks.map(({work}) => work)).toEqual(["understand", "capital_strategy", "model"]);
    expect(canonical.routingCore.workResponsibility.value).toEqual(["producer", "coordinator"]);
  });

  it("derives a material transition deterministically from the conversational state", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field(["prepare meeting material"]),
        object: field([{kind: "material", reference: "material para reunião"}]),
        desiredOutcome: field("Preparar o material da alternativa escolhida."),
        decision: field(null),
        audience: field([]),
        depth: field("preliminary"),
        continuity: field("new"),
        workResponsibility: field([]),
      },
      inferableContext: {
        jurisdiction: field(["BR"]), asOfDate: field(null), currency: field("BRL"), deadline: field(null),
        sponsorInstruction: field(null), constraints: field([]), urgency: field(null), availableInputs: field([]),
      },
      primaryWorks: [{work: "understand", confidence: 0.6}],
      composition: "prepare_meeting",
      firstQuestion: null,
      abstain: false,
      abstainReason: null,
    });

    const canonical = canonicalizeIntentClassifierOutput(parsed, {
      locale: "pt-BR",
      latestUserMessage: "Gostei da alternativa. Vamos preparar o material para a reunião.",
      recentConversation: [{role: "user", content: "Estamos avaliando alternativas para a Camil."}],
      entryJob: null,
      documentCount: 0,
      professionalContext: null,
    });

    expect(canonical.composition).toBe("prepare_material");
    expect(canonical.routingCore.depth.value).toBe("institutional");
    expect(canonical.routingCore.continuity.value).toBe("resume");
    expect(canonical.firstQuestion).toContain("revisão interna");
  });

  it("rescues a clear meeting assignment while retaining its workflow-changing question", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field(["preparar material para reunião"]),
        object: field([{kind: "company", reference: "Camil"}]),
        desiredOutcome: field("Preparar a reunião sobre refinanciamento."),
        decision: field(null),
        audience: field(["VP"]),
        depth: field("point"),
        continuity: field("new"),
        workResponsibility: field(["producer"]),
      },
      inferableContext: {
        jurisdiction: field(["BR"]), asOfDate: field(null), currency: field("BRL"), deadline: field(null),
        sponsorInstruction: field(null), constraints: field([]), urgency: field(null), availableInputs: field([]),
      },
      primaryWorks: [{work: "understand", confidence: 0.7}],
      composition: null,
      firstQuestion: "Qual tese e formato o VP espera?",
      abstain: true,
      abstainReason: "Faltam tese e formato.",
    });

    const canonical = canonicalizeIntentClassifierOutput(parsed, {
      locale: "pt-BR",
      latestUserMessage: "Meu VP pediu material para uma reunião com a Camil, mas não disse qual tese ou formato espera.",
      recentConversation: [],
      entryJob: null,
      documentCount: 0,
      professionalContext: null,
    });

    expect(canonical.abstain).toBe(false);
    expect(canonical.composition).toBe("prepare_meeting");
    expect(canonical.firstQuestion).toBe("Qual tese e formato o VP espera?");
  });
});
