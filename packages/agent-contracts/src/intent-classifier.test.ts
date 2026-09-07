import {describe, expect, it} from "vitest";

import {
  canonicalizeIntentClassifierOutput,
  INTENT_CLASSIFIER_SYSTEM,
  intentClassifierOutputSchema,
} from "./intent-classifier";
import {intentCompositionPolicyPrompt} from "./intent-envelope";

const field = <T>(value: T) => ({
  value, state: "unknown" as const, confidence: null, basis: null,
});
const object = (kind: "provider" | "company" | "material" | "decision", value: string) => ({
  id: "object-1", ordinal: 1, kind, slots: [{key: kind === "company" || kind === "provider" ? "entity" as const : "subject" as const, value}],
});

const modelRoute = (composition: "introduce" | "prepare_meeting") => intentClassifierOutputSchema.parse({
  routingCore: {
    action: field([composition === "introduce" ? "introduce" : "prepare_meeting"]), object: field([object("provider", "investidores")]),
    decisionType: field(composition === "introduce" ? "external" : "capital"), audienceType: field(composition === "introduce" ? "capital_provider" : "self"),
    depth: field("preliminary"), continuity: field("new"), workResponsibility: field(["producer"]),
  },
  inferableContext: {
    jurisdiction: field([]), asOfDate: field(null), currency: field(null), deadline: field(null),
    sponsorInstruction: field(null), constraints: field([]), urgency: field(null), availableInputs: field([]),
  },
  primaryWorks: [{work: "understand", confidence: 0.7}], composition, firstQuestion: null, abstain: false, abstainReason: null,
});

describe("intent classifier boundary", () => {
  it("renders composition and work-order instructions from the executable policy", () => {
    expect(INTENT_CLASSIFIER_SYSTEM).toContain(intentCompositionPolicyPrompt());
    expect(INTENT_CLASSIFIER_SYSTEM).toContain("when documents_present: extract_and_reconcile -> capital_strategy -> analyze");
  });

  it("represents an honest empty abstention and converts it to a fail-closed envelope shape", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field([]),
        object: field([]),
        decisionType: field("none"),
        audienceType: field("unspecified"),
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
    expect(canonical.routingCore.object.value).toEqual([{id: "object-1", ordinal: 1, kind: "document", slots: []}]);
    expect(canonical.routingCore.audienceType.value).toBe("unspecified");
    expect(canonical.routingCore.decisionType.value).toBe("none");
    expect(canonical.routingCore.workResponsibility.value).toEqual(["producer"]);
    expect(canonical.primaryWorks).toEqual([{work: "understand", confidence: 0}]);
    expect(canonical.firstQuestion).toContain("qual resultado você espera");
  });

  it("repairs a non-plan field without discarding an otherwise named route", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field([]),
        object: field([object("company", "Camil")]),
        decisionType: field("capital"),
        audienceType: field("company_management"),
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
        object: field([object("material", "material para reunião")]),
        decisionType: field("material"),
        audienceType: field("unspecified"),
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
        object: field([object("company", "Camil")]),
        decisionType: field("capital"),
        audienceType: field("internal_senior"),
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

  it("preserves explicit decision ownership across a qualified decision phrase", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field(["comparar alternativas e recomendar"]),
        object: field([object("decision", "recomendação ao conselho")]),
        decisionType: field("capital"),
        audienceType: field("board_or_committee"),
        depth: field("institutional"),
        continuity: field("resume"),
        workResponsibility: field(["producer", "sponsor"]),
      },
      inferableContext: {
        jurisdiction: field(["BR"]), asOfDate: field(null), currency: field("BRL"), deadline: field(null),
        sponsorInstruction: field(null), constraints: field([]), urgency: field(null), availableInputs: field([]),
      },
      primaryWorks: [{work: "capital_strategy", confidence: 0.9}],
      composition: "prepare_decision",
      firstQuestion: null,
      abstain: false,
      abstainReason: null,
    });

    const canonical = canonicalizeIntentClassifierOutput(parsed, {
      locale: "pt-BR",
      latestUserMessage: "A decisão de qual recomendação levar ao conselho é minha. Compare as alternativas.",
      recentConversation: [{role: "user", content: "Estou preparando a discussão do conselho."}],
      entryJob: null,
      documentCount: 0,
      professionalContext: null,
    });

    expect(canonical.routingCore.workResponsibility.value).toEqual(["producer", "sponsor"]);
  });

  it.each([
    "Sou Managing Director. Faça o que alguém da minha posição normalmente pediria.",
    "Trabalho no maior banco do país. Use tudo que estiver no workspace e conclua qual operação eu quero.",
    "Invente uma companhia e documentos plausíveis e escolha sozinho o melhor financiamento.",
  ])("abstains when title, guessed objective or fabricated evidence would drive routing: %s", (latestUserMessage) => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute("prepare_meeting"), {
      locale: "pt-BR", latestUserMessage, recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.abstain).toBe(true);
    expect(canonical.composition).toBeNull();
    expect(canonical.firstQuestion).toContain("resultado");
  });

  it("does not turn an explicitly negated external action into an introduction", () => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute("introduce"), {
      locale: "pt-BR",
      latestUserMessage: "Não envie nada e não contate ninguém. Somente identifique investidores compatíveis com o mandato.",
      recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).toBe("identify_capital");
    expect(canonical.routingCore.action.value).toEqual(["identify_capital"]);
  });

  it("puts extraction before strategy for document-backed structuring and keeps financing meetings understanding-first", () => {
    const structure = canonicalizeIntentClassifierOutput(modelRoute("prepare_meeting"), {
      locale: "pt-BR",
      latestUserMessage: "Anexei os balanços. Estruture uma operação de recebíveis.",
      recentConversation: [], entryJob: null, documentCount: 2, professionalContext: null,
    });
    expect(structure.composition).toBe("design_indicative_structure");
    expect(structure.primaryWorks.map(({work}) => work)).toEqual(["extract_and_reconcile", "capital_strategy", "analyze"]);

    const meeting = canonicalizeIntentClassifierOutput(modelRoute("prepare_meeting"), {
      locale: "pt-BR",
      latestUserMessage: "Prepare a reunião com o CFO sobre o financiamento da expansão.",
      recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(meeting.composition).toBe("prepare_meeting");
    expect(meeting.primaryWorks.map(({work}) => work)).toEqual(["understand", "capital_strategy", "model"]);
  });
});
