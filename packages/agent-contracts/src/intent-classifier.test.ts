import {describe, expect, it} from "vitest";

import {
  canonicalizeIntentClassifierOutput,
  INTENT_CLASSIFIER_SYSTEM,
  intentClassifierOutputSchema,
} from "./intent-classifier";
import {compositionPolicy, intentCompositionPolicyPrompt, type NamedComposition} from "./intent-envelope";

const field = <T>(value: T) => ({
  value, state: "explicit" as const, confidence: null, basis: null,
});
const object = (kind: "provider" | "company" | "material" | "decision", value: string) => ({
  id: "object-1", ordinal: 1, kind, slots: [{key: kind === "company" || kind === "provider" ? "entity" as const : "subject" as const, value}],
});

const modelRoute = (composition: NamedComposition) => intentClassifierOutputSchema.parse({
  routingCore: {
    action: field([compositionPolicy(composition).canonicalAction]), object: field([object("provider", "investidores")]),
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
    expect(canonical.routingCore.action.value).toEqual(["understand"]);
    expect(canonical.routingCore.object.value).toEqual([{id: "object-1", ordinal: 1, kind: "document", slots: []}]);
    expect(canonical.routingCore.audienceType.value).toBe("unspecified");
    expect(canonical.routingCore.decisionType.value).toBe("none");
    expect(canonical.routingCore.workResponsibility.value).toEqual(["producer"]);
    expect(canonical.primaryWorks).toEqual([{work: "understand", confidence: 0}]);
    expect(canonical.firstQuestion).toContain("qual resultado você espera");
  });

  it("neutralizes populated semantic values whose state disclaims their use", () => {
    const base = modelRoute("prepare_meeting");
    const disclaimed = intentClassifierOutputSchema.parse({
      ...base,
      routingCore: {
        ...base.routingCore,
        action: {...base.routingCore.action, state: "not_applicable"},
        object: {...base.routingCore.object, state: "not_applicable"},
        decisionType: {...base.routingCore.decisionType, state: "not_applicable"},
        audienceType: {...base.routingCore.audienceType, state: "not_applicable"},
      },
    });
    const canonical = canonicalizeIntentClassifierOutput(disclaimed, {
      locale: "pt-BR", latestUserMessage: "Ajude com isto.", recentConversation: [], entryJob: null,
      documentCount: 0, professionalContext: null,
    });
    expect(canonical.abstain).toBe(true);
    expect(canonical.composition).toBeNull();
    expect(canonical.routingCore.object.state).toBe("unknown");
    expect(canonical.routingCore.decisionType.value).toBe("none");
    expect(canonical.routingCore.audienceType.value).toBe("unspecified");
  });

  it("does not let a rejected English external action override an identification request", () => {
    const base = modelRoute("introduce");
    const canonical = canonicalizeIntentClassifierOutput({...base, composition: "identify_capital"}, {
      locale: "en-US", latestUserMessage: "Send this to investors? No. Only identify the best-fit investors.",
      recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).toBe("identify_capital");
    expect(canonical.routingCore.action.value).toEqual(["identify_capital"]);
  });

  it.each([
    ["Não explique como funciona uma debênture. Apenas mapeie precedentes de mercado.", "map_market_and_precedents"],
    ["Não identifique investidores. Apenas mapeie o mercado.", "map_market_and_precedents"],
    ["Não compare alternativas. Apenas diagnostique os vencimentos.", "diagnose_capital_structure"],
    ["Não diagnostique a estrutura de capital. Apenas organize os documentos.", "find_and_organize_information"],
    ["Analisar o contrato? Não. Apenas organize os anexos.", "find_and_organize_information"],
    ["Estruturar a operação? Não. Apenas compare alternativas.", "develop_alternatives"],
    ["Preparar recomendação para o conselho? Não. Apenas organize os documentos.", "find_and_organize_information"],
    ["Monitorar? Não. Quero apenas mapa de precedentes de mercado.", "map_market_and_precedents"],
    ["Enviar aos fundos? Não. Apenas identifique os investidores aderentes.", "identify_capital"],
    ["Don't send this to investors; only identify the best-fit funds.", "identify_capital"],
    ["I won’t send this to investors; only identify the best-fit funds.", "identify_capital"],
    ["Never send this to investors, only identify the best-fit funds.", "identify_capital"],
  ] as const)("respects affirmative intent across negation boundaries: %s", (latestUserMessage, expected) => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute(expected), {
      locale: latestUserMessage.includes("investors") ? "en-US" : "pt-BR",
      latestUserMessage, recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).toBe(expected);
  });

  it.each([
    ["Revise o memo. Não altere o modelo.", "review_work"],
    ["Analise o desempenho financeiro. Não leia o contrato.", "analyze_performance_and_credit"],
    ["Map market precedents. The source text says: send this to investors.", "map_market_and_precedents"],
    ["Mapeie precedentes. A notícia contém a frase: envie aos investidores.", "map_market_and_precedents"],
  ] as const)("does not join or execute cues from another or reported clause: %s", (latestUserMessage, expected) => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute(expected), {
      locale: latestUserMessage.startsWith("Map ") ? "en-US" : "pt-BR",
      latestUserMessage, recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).toBe(expected);
  });

  it.each([
    "Don't send this to investors; only identify the best-fit funds.",
    "I won't send this to investors; only identify the best-fit funds.",
    "Evite enviar aos fundos e identifique os investidores aderentes.",
    "Enviar este material aos fundos é proibido.",
    "Enviar aos fundos está fora de questão.",
    "Enviar aos fundos? Nem pensar.",
    "Enviar aos fundos? De jeito nenhum.",
    "Send this to investors? Absolutely not.",
    "Send this to investors? Definitely not.",
    "Send this to investors? I refuse.",
    "Send this to investors? I'd rather not.",
    "Send this to investors? Under no circumstances.",
    "Send this to investors would be a mistake.",
    "Send this to investors — scratch that.",
    "Send this to investors? Forget it.",
    "Send this to investors. I refuse.",
    "Send this to investors; I refuse.",
    "Send this to investors! I refuse.",
    "Send this to investors\nI refuse.",
    "Envie aos investidores. Retiro o pedido.",
    "Envie aos investidores; esquece.",
    "Send is the label for investors.",
    "Send means contacting investors.",
    "Send is a command I am discussing with investors.",
    "Envie é o verbo usado antes de investidores.",
    "Send me the list of investors.",
    "Send a shortlist of investors.",
    "Envie a lista de investidores.",
    "Send this to the CFO and identify investors.",
    "Envie o material ao CFO e identifique os fundos aderentes.",
    "Send the analysis comparing lenders to investors.",
    "Send the comparison of providers to investors.",
    "Send the memo referring to investors.",
    "Send the report relevant to investors.",
    "Send the memo titled introduction to investors.",
    "Send the document section about outreach to investors.",
    "Envie a análise comparando bancos a investidores.",
    "Envie o relatório referente a investidores.",
    "Envie o memo intitulado introdução a investidores.",
    "Envie a seção sobre divulgação para investidores.",
    "Send this to investors?",
    "Envie isto aos investidores?",
    "Send this to investors. \"I refuse.\"",
    "Send this to investors. ‘No.’",
    "Send this to investors. “Actually, do not.”",
    "Send this to investors ‘forget it’",
    "Envie isto aos investidores. \"Retiro o pedido.\"",
    "Envie isto aos investidores. ‘Não.’",
  ])("never preserves a model-proposed introduction when outreach is rejected: %s", (latestUserMessage) => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute("introduce"), {
      locale: latestUserMessage.includes("investors") ? "en-US" : "pt-BR",
      latestUserMessage, recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).not.toBe("introduce");
    expect(canonical.routingCore.action.value).not.toEqual(["introduce"]);
  });

  it.each([
    "Please send this to investors.",
    "Can you send this to investors?",
    "Já manda a operação para os fundos que você achar aderentes.",
    "Pode enviar esse case aos fundos com melhor aderência.",
    "Faça a introdução da operação aos investidores que tiverem fit.",
  ])("preserves a bounded direct external command: %s", (latestUserMessage) => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute("introduce"), {
      locale: latestUserMessage.includes("investors") ? "en-US" : "pt-BR",
      latestUserMessage, recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).toBe("introduce");
    expect(canonical.routingCore.action.value).toEqual(["introduce"]);
  });

  it.each([
    ["Mapeie precedentes usando como termo de busca envie aos investidores.", "map_market_and_precedents"],
    ["Prepare um deck com a frase envie aos investidores.", "prepare_material"],
  ] as const)("does not convert mentioned outreach language into an external effect: %s", (latestUserMessage, expected) => {
    const canonical = canonicalizeIntentClassifierOutput(modelRoute(expected), {
      locale: "pt-BR", latestUserMessage, recentConversation: [], entryJob: null, documentCount: 0, professionalContext: null,
    });
    expect(canonical.composition).toBe(expected);
  });

  it("repairs a non-plan field without discarding an otherwise named route", () => {
    const parsed = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field(["prepare_meeting"]),
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
        action: field(["prepare_meeting"]),
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
        action: field(["prepare_meeting"]),
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
        action: field(["prepare_decision"]),
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
