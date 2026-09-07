import type {ModelGateway} from "@offroad/model-gateway";
import {buildIntentClassifierInput, canonicalizeIntentClassifierOutput} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";
import {z} from "zod";

import {decideLiveTurn, liveRoutingOutputSchema, normalizePreviewTurn, premisesFromTurn, researchReplyLine, researchUnknownCompany, understandLiveTurn, type LiveRoutingOutput, type LiveTurnContext} from "./live-preview";
import {shadowRoutingOutputSchema, stampIntentEnvelope} from "./intent-shadow";
import type {PreviewStepOutput} from "./integration-preview";

const field = <T,>(value: T, state: "explicit" | "inferred" | "ambiguous" | "unknown" = "explicit") => ({
  value, state, confidence: state === "explicit" ? 1 : 0.7,
});

/** A classifier output the way the model returns it, with the preview-desk fields. */
function classifierOutput(overrides: Omit<Partial<LiveRoutingOutput>, "turn"> & {turn?: Partial<LiveRoutingOutput["turn"]>} = {}): LiveRoutingOutput {
  const base: LiveRoutingOutput = {
    routingCore: {
      action: field(["prepare_meeting" as const]),
      object: field([
        {id: "object-1", ordinal: 1, kind: "company" as const, slots: [{key: "entity" as const, value: "Camil"}]},
        {id: "object-2", ordinal: 2, kind: "material" as const, slots: []},
      ]),
      decisionType: field("material" as const),
      audienceType: field("internal_senior" as const),
      depth: field("preliminary" as const, "inferred"),
      continuity: field("new" as const),
      workResponsibility: field(["producer" as const]),
    },
    inferableContext: {
      jurisdiction: field(["BR"], "inferred"),
      asOfDate: field(null, "unknown"),
      currency: field("BRL", "inferred"),
      deadline: field("segunda", "inferred"),
      sponsorInstruction: field("Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera."),
      constraints: field([]),
      urgency: field("this_week" as const, "inferred"),
      availableInputs: field([]),
    },
    primaryWorks: [{work: "capital_strategy", confidence: 0.8}, {work: "understand", confidence: 0.6}],
    composition: "prepare_meeting",
    firstQuestion: "Leitura de refinanciamento ou alternativas mais amplas?",
    abstain: false,
    abstainReason: null,
    turn: {
      companies: [{mention: "Camil", role: "subject"}],
      premiseChanges: {newDebtAnnualRate: null, cdiSpreadBps: null, newDebtTermMonths: null, newDebtGraceMonths: null},
      numberQuestion: null,
      material: {requested: false, form: null, pages: null},
      answers: [],
      scopeChanges: {audience: null, depth: null, form: null},
    },
  };
  const {turn, ...rest} = overrides;
  const parsed = liveRoutingOutputSchema.parse({...base, ...rest, turn: {...base.turn, ...(turn ?? {})}});
  return {...parsed, turn: normalizePreviewTurn(parsed.turn)};
}

function fakeGateway(output: LiveRoutingOutput, costUsd = 0.0021): ModelGateway {
  let spent = 0;
  let calls = 0;
  return {
    complete: async (request: {task: string; schemaName: string; input: Array<{type: string; text: string}>}) => {
      spent += costUsd;
      calls += 1;
      let result: unknown;
      if (request.task === "extract_semantic_objects") {
        const source = JSON.parse(request.input[0]!.text) as {latestUserMessage: string};
        const mention = source.latestUserMessage.includes("Camil") ? "Camil" : source.latestUserMessage.split(/\s+/)[0]!;
        const start = source.latestUserMessage.indexOf(mention);
        result = {
          objects: [{candidateId: "candidate-1", kind: "company", head: {key: "entity", span: {source: "latest_user_message", messageIndex: null, start, end: start + mention.length, text: mention}}, modifiers: []}],
          activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
        };
      } else if (request.schemaName === "live_preview_turn_output") result = {turn: output.turn};
      else {
        const {turn: _turn, ...route} = output;
        result = route;
      }
      return {
        output: result, model: "claude-sonnet-5", provider: "anthropic", effort: "low",
        costUsd, latencyMs: 1, retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false,
        attempts: [{provider: "anthropic", model: "claude-sonnet-5", outcome: "ok"}],
      } as never;
    },
    spent: () => ({costUsd: spent, calls, unknownCostCalls: 0, budgetExposureUsd: spent}),
  } as unknown as ModelGateway;
}

const context: LiveTurnContext = {
  locale: "pt-BR",
  message: "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda.",
  recentMessages: [],
  organizationId: "20000000-0000-4000-8000-000000000001",
  projectId: "30000000-0000-4000-8000-000000000001",
  entryJob: "origination_thesis",
  accessBasis: "public_information",
  authorityGrants: ["read"],
  documentIds: [],
  professionalContext: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["investment_banking", "dcm"], primaryObjectives: ["prepare_meetings"]},
  openQuestions: [],
  priorObjectKinds: [],
  requestKind: "message",
};

async function decide(output: LiveRoutingOutput, overrides: Partial<Parameters<typeof decideLiveTurn>[0]> = {}) {
  const {turn: _turn, ...route} = output;
  const compatible = shadowRoutingOutputSchema.parse({...route, composition: output.composition === "deepen" ? "understand_company_sector_asset" : output.composition});
  const message = overrides.message ?? context.message;
  const canonical = canonicalizeIntentClassifierOutput(compatible, buildIntentClassifierInput({
    locale: context.locale, latestUserMessage: message, recentConversation: [], entryJob: context.entryJob,
    documentCount: context.documentIds.length, professionalContext: context.professionalContext,
  }));
  const understanding = {
    envelope: stampIntentEnvelope(canonical, context), output, modelRoute: "governed_model_route" as const,
    costUsd: 0.0063, latencyMs: 3, calls: 3,
    routingAttempt: {provider: "anthropic", model: "claude-sonnet-5", effort: "low", retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, attemptCount: 1, costUsd: 0.0021, latencyMs: 1},
    semanticObjectAttempt: {provider: "anthropic", model: "claude-sonnet-5", effort: "low", retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, attemptCount: 1, costUsd: 0.0021, latencyMs: 1},
    previewTurnAttempt: {provider: "anthropic", model: "claude-sonnet-5", effort: "low", retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, attemptCount: 1, costUsd: 0.0021, latencyMs: 1},
  };
  return decideLiveTurn({
    locale: "pt-BR", message: context.message, recentMessages: [], understanding, priorCaseId: null, priorRequest: null, priorAnswers: [], openQuestions: [], artifactTypes: [], runActive: false,
    priorOutputs: new Map<string, PreviewStepOutput>(), entryJob: "origination_thesis", messageId: "10000000-0000-4000-8000-000000000077",
    ...overrides,
  });
}

describe("live_intelligence_preview router", () => {
  it("stamps the envelope only after the three governed contracts and reports their lineage", async () => {
    const understanding = await understandLiveTurn({gateway: fakeGateway(classifierOutput()), context});
    expect(understanding.envelope.executionContext.organizationId).toEqual({value: context.organizationId, state: "system"});
    expect(understanding.envelope.routingCore.audience.value).toEqual(["internal senior"]);
    expect(understanding.modelRoute).toBe("governed_model_route");
    expect(understanding.costUsd).toBeCloseTo(0.0063, 6);
    expect(understanding.calls).toBe(3);
    expect(understanding).toMatchObject({
      routingAttempt: {provider: "anthropic", model: "claude-sonnet-5"},
      semanticObjectAttempt: {provider: "anthropic", model: "claude-sonnet-5"},
      previewTurnAttempt: {provider: "anthropic", model: "claude-sonnet-5"},
    });
  });

  it("fails closed when semantic coverage is incomplete even if preview controls name a company", async () => {
    let calls = 0;
    const routed = classifierOutput();
    const gateway = {
      complete: async (request: {task: string; schemaName: string}) => {
        calls += 1;
        let output: unknown;
        if (request.task === "extract_semantic_objects") {
          output = {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: []};
        } else if (request.schemaName === "live_preview_turn_output") {
          output = {turn: {...routed.turn, companies: [{mention: "Magazine Luiza", role: "subject"}]}};
        } else {
          const {turn: _turn, ...route} = routed;
          output = route;
        }
        return {
          output, provider: "anthropic", model: "claude-sonnet-5", effort: "low", costUsd: 0.001, latencyMs: 1,
          retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false,
          attempts: [{provider: "anthropic", model: "claude-sonnet-5", outcome: "ok"}],
        };
      },
      spent: () => ({costUsd: calls * 0.001, calls, unknownCostCalls: 0, budgetExposureUsd: calls * 0.001}),
    } as unknown as ModelGateway;

    const understanding = await understandLiveTurn({gateway, context});
    const decision = decideLiveTurn({
      locale: "pt-BR", message: context.message, recentMessages: [], understanding, priorCaseId: null,
      priorRequest: null, priorAnswers: [], openQuestions: [], artifactTypes: [], runActive: false,
      priorOutputs: new Map<string, PreviewStepOutput>(), entryJob: "origination_thesis",
      messageId: "10000000-0000-4000-8000-000000000077",
    });

    expect(understanding.output).toMatchObject({abstain: true, composition: null});
    expect(understanding.output.routingCore.object).toMatchObject({value: [{kind: "document"}], state: "unknown"});
    expect(JSON.stringify(understanding.envelope.routingCore.object)).not.toMatch(/Camil|Magazine Luiza/);
    expect(understanding.envelope).toMatchObject({composition: null, effect: "none"});
    expect(decision).toMatchObject({kind: "abstain", activation: null, record: {abstainReason: "semantic_object_coverage_incomplete"}});
  });

  it("does not let supplemental company, audience, depth or material flags replace canonical routing", async () => {
    const decision = await decide(classifierOutput({
      turn: {
        companies: [{mention: "Magazine Luiza", role: "subject"}],
        scopeChanges: {audience: "investor", depth: "institutional", form: "board_deck"},
        material: {requested: true, form: "board_deck", pages: null},
      },
    }), {artifactTypes: ["preview_alternatives"]});

    expect(decision).toMatchObject({
      kind: "activate",
      composition: "deepen",
      record: {
        corpus: {caseId: "gc01-analista-ib-camil", company: "Camil Alimentos S.A."},
        companiesMentioned: ["Camil"],
        audience: "vp",
        depth: "preliminary",
      },
    });
    expect(decision.reply).not.toContain("Magazine Luiza");
  });

  it("routes paraphrases of the analyst's request to the same composition and the same frozen corpus", async () => {
    const paraphrases: Array<Partial<LiveRoutingOutput>> = [
      {},
      {composition: "understand_company_sector_asset", primaryWorks: [{work: "understand", confidence: 0.7}, {work: "capital_strategy", confidence: 0.6}]},
      {composition: null, primaryWorks: [{work: "capital_strategy", confidence: 0.9}]},
      {composition: "diagnose_capital_structure"},
      {composition: "develop_alternatives", primaryWorks: [{work: "capital_strategy", confidence: 0.8}]},
    ];
    for (const overrides of paraphrases) {
      const decision = await decide(classifierOutput(overrides));
      expect(decision.kind).toBe("activate");
      expect(decision.composition).toBe("prepare_meeting");
      expect(decision.record.corpus?.caseId).toBe("gc01-analista-ib-camil");
      expect(decision.reply).toMatch(/^\[Validação interna, live_intelligence_preview\] composição=prepare_meeting · companhia=Camil Alimentos S\.A\. · corpus=gc01-analista-ib-camil/);
      expect(decision.reply).toContain("rota=governed_model_route");
      expect(decision.reply).toContain("chamadas=3");
      expect(decision.activation?.caseId).toBe("gc01-analista-ib-camil");
      expect(decision.activation?.plan.turn).toEqual({messageId: "10000000-0000-4000-8000-000000000077"});
    }
  });

  it("abstains for a company without a frozen corpus and never lends it the Camil objects", async () => {
    const decision = await decide(classifierOutput({
      routingCore: {...classifierOutput().routingCore, object: field([{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: "Magazine Luiza"}]}])},
      turn: {companies: [{mention: "Magazine Luiza", role: "subject"}]},
    }), {message: "Preciso preparar uma reunião com a Magazine Luiza sobre refinanciamento."});
    expect(decision.kind).toBe("abstain");
    expect(decision.activation).toBeNull();
    expect(decision.record.abstainReason).toBe("company_without_corpus");
    expect(decision.reply).toContain("corpus=nenhum");
    expect(decision.reply).toContain("Magazine Luiza");
    expect(decision.reply).not.toMatch(/4,72x|5\.670\.186/);
  });

  it("routes a CFO preparing a board discussion to prepare_decision with the board as audience", async () => {
    const output = classifierOutput({
      routingCore: {...classifierOutput().routingCore, audienceType: field("board_or_committee"), workResponsibility: field(["producer", "decision_maker"])},
      composition: "prepare_decision",
    });
    const decision = await decide(output, {message: "Sou CFO da Camil e preciso levar ao conselho a decisão sobre refinanciar as debêntures."});
    expect(decision.kind).toBe("activate");
    expect(decision.composition).toBe("prepare_decision");
    expect(decision.record.audience).toBe("board");
    expect(decision.activation?.brief.request.form).toBe("board_deck");
    expect(decision.reply).toContain("audiência=board");
  });

  it("recognises a premise change once the analysis exists, converting a CDI spread into a rate", async () => {
    const output = classifierOutput({composition: null, turn: {companies: [], premiseChanges: {newDebtAnnualRate: null, cdiSpreadBps: 150, newDebtTermMonths: 84, newDebtGraceMonths: 24}}});
    expect(premisesFromTurn(output.turn)).toEqual({newDebtAnnualRate: "0.1475", newDebtTermMonths: 84, newDebtGraceMonths: 24});
    const decision = await decide(output, {priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_debt_ledger", "preview_alternatives"], message: "Considere CDI + 1,50%, 7 anos com 2 de carência."});
    expect(decision.kind).toBe("activate");
    expect(decision.composition).toBe("change_premise");
    expect(decision.activation?.brief.premises).toEqual({newDebtAnnualRate: "0.1475", newDebtTermMonths: 84, newDebtGraceMonths: 24});
  });

  it("answers a question about a number from the signed objects, without another call", async () => {
    const covenants = {
      state: "conditioned",
      covenants: [{id: "deb-11", ratio: "4.72", definitionText: "dívida líquida pela escritura sobre EBITDA", asOfDate: "2026-05-31"}],
    } as unknown as PreviewStepOutput;
    const output = classifierOutput({composition: "answer_a_question", turn: {companies: [], numberQuestion: {mentioned: "4,7x", objects: ["covenants"]}}});
    const decision = await decide(output, {priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives", "preview_covenants"], priorOutputs: new Map([["C09", covenants]]), message: "De onde saiu essa alavancagem de 4,7x?"});
    expect(decision.kind).toBe("answer");
    expect(decision.activation).toBeNull();
    expect(decision.record.calls).toBe(3);
  });

  it("plans the material from the objects when the person asks for a deliverable", async () => {
    const output = classifierOutput({composition: "prepare_material", turn: {companies: [], material: {requested: true, form: "pitch_pages", pages: 3}}});
    const decision = await decide(output, {priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], message: "Vamos preparar o material: três páginas de pitch."});
    expect(decision.kind).toBe("activate");
    expect(decision.composition).toBe("prepare_material");
    expect(decision.activation?.brief.request.pages).toBe(3);
    expect(decision.activation?.brief.request.form).toBe("pitch_pages");
  });

  it("uses the governed question binding even when the classifier abstains", async () => {
    const output = classifierOutput({abstain: true, abstainReason: "answer alone is ambiguous", composition: null, turn: {companies: [], answers: []}});
    const decision = await decide(output, {
      priorCaseId: "gc01-analista-ib-camil",
      artifactTypes: ["preview_alternatives"],
      message: "Mais ampla, com refinanciamento como primeira hipótese.",
      openQuestions: [{id: "70000000-0000-4000-8000-000000000393", text: "Qual tese deve orientar o material?"}],
      answeredQuestion: {id: "70000000-0000-4000-8000-000000000393", text: "Qual tese deve orientar o material?"},
    });
    expect(decision.kind).toBe("activate");
    expect(decision.composition).toBe("deepen");
    expect(decision.activation?.brief.answers).toEqual([{questionId: "70000000-0000-4000-8000-000000000393", answer: "Mais ampla, com refinanciamento como primeira hipótese."}]);
  });

  it("abstains when the classifier abstains, and redirects a request outside the desk", async () => {
    const abstained = await decide(classifierOutput({abstain: true, abstainReason: "two readings remain", composition: null, firstQuestion: "É para a Camil ou para outra companhia?"}), {message: "Olha isso para mim."});
    expect(abstained.kind).toBe("abstain");
    expect(abstained.reply).toContain("É para a Camil ou para outra companhia?");
    const outside = await decide(classifierOutput({composition: "introduce", primaryWorks: [{work: "capital_match", confidence: 0.9}]}), {message: "Apresente a Camil para três fundos de crédito."});
    expect(outside.kind).toBe("abstain");
    expect(outside.record.abstainReason).toBe("out_of_scope:introduce");
    expect(outside.activation).toBeNull();
  });

  it("applies an answer to an open question: scope, audience and depth change, the plan recompiles as deepen", async () => {
    const output = classifierOutput({
      composition: null,
      routingCore: {...classifierOutput().routingCore, audienceType: field("board_or_committee"), depth: field("institutional")},
      turn: {companies: [], answers: [{questionId: "q-angle", answer: "Alternativas mais amplas, para o conselho, análise institucional", effect: {audience: "conselho", depth: "institutional", scope: "alternativas amplas"}}]},
    });
    const decision = await decide(output, {
      priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], openQuestions: [{id: "q-angle", text: "Leitura de refinanciamento ou alternativas mais amplas?"}],
      priorRequest: {form: "first_deliverable", undefinedAspects: ["thesis", "format", "depth"], pages: null}, priorAnswers: [],
      message: "Alternativas mais amplas; é para o conselho e precisa ser institucional.",
    });
    expect(decision.kind).toBe("activate");
    expect(decision.composition).toBe("deepen");
    expect(decision.record.audience).toBe("board");
    expect(decision.record.depth).toBe("institutional");
    expect(decision.activation?.brief.answers).toEqual([{questionId: "q-angle", answer: "Alternativas mais amplas, para o conselho, análise institucional"}]);
    expect(decision.activation?.brief.request.undefinedAspects).toEqual(["format"]);
    expect(decision.reply).toContain("Respostas aplicadas");
  });

  it("reads an answer that quotes the desk's question when the classifier returns no id, and does not mistake the board for a deck request", async () => {
    const output = classifierOutput({
      composition: null,
      routingCore: {...classifierOutput().routingCore, audienceType: field("board_or_committee"), depth: field("institutional")},
      turn: {companies: [], answers: [], material: {requested: true, form: "board_deck", pages: null}, scopeChanges: {audience: "conselho", depth: "institutional", form: null}},
    });
    const decision = await decide(output, {
      priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"],
      openQuestions: [{id: "q-tese-refinanciamento", text: "Qual tese de refinanciamento o VP quer levar à Camil, e em que formato ele espera o material?"}],
      priorRequest: {form: "first_deliverable", undefinedAspects: ["thesis", "format", "depth"], pages: null}, priorAnswers: [],
      message: 'Sobre a sua pergunta "Qual tese de refinanciamento o VP quer levar à Camil, e em que formato ele espera o material?": leitura ampla de alternativas, é para o conselho e precisa ser institucional.',
    });
    expect(decision.kind).toBe("activate");
    expect(decision.composition).toBe("deepen");
    expect(decision.record.audience).toBe("board");
    expect(decision.activation?.brief.answers).toEqual([{questionId: "q-tese-refinanciamento", answer: "leitura ampla de alternativas, é para o conselho e precisa ser institucional."}]);
    expect(decision.reply).toContain("Respostas aplicadas");
  });

  it("prepares the material when the person asks for pages, even when the classifier files the request as an answer to the format question", async () => {
    const output = classifierOutput({composition: "prepare_material", turn: {companies: [], material: {requested: true, form: "pitch_pages", pages: 3}, answers: [{questionId: "q-format", answer: "três páginas de pitch", effect: {audience: null, depth: null, scope: null}}]}});
    const decision = await decide(output, {
      priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], openQuestions: [{id: "q-format", text: "Briefing interno, páginas de pitch ou análise com cenários?"}], priorAnswers: [],
      message: "Vamos preparar o material: meu VP quer três páginas de pitch, situação atual, alternativas e impacto nos indicadores.",
    });
    expect(decision.composition).toBe("prepare_material");
    expect(decision.activation?.brief.request.pages).toBe(3);
    expect(decision.activation?.brief.answers).toEqual([{questionId: "q-format", answer: "três páginas de pitch"}]);
    expect(decision.reply).toContain("Respostas aplicadas");
  });

  it("reads the page count from the words when the classifier drops the deliverable, and keeps a deliverable out of a message that names none", async () => {
    const missed = await decide(classifierOutput({composition: "deepen", turn: {companies: [], material: {requested: false, form: null, pages: null}}}), {
      priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], message: "Monte o material: cinco páginas para o VP.",
    });
    expect(missed.composition).toBe("prepare_material");
    expect(missed.activation?.brief.request.pages).toBe(5);
    const invented = await decide(classifierOutput({composition: "deepen", turn: {companies: [], material: {requested: true, form: "board_deck", pages: null}}}), {
      priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], message: "Aprofunde a leitura das alternativas para o conselho.",
    });
    expect(invented.composition).not.toBe("prepare_material");
  });

  it("does not carry a premise from an earlier turn into a message that states no number", async () => {
    const output = classifierOutput({composition: "prepare_meeting", turn: {companies: [], premiseChanges: {newDebtAnnualRate: 0.155, cdiSpreadBps: null, newDebtTermMonths: null, newDebtGraceMonths: null}}});
    const decision = await decide(output, {priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], message: "Aprofunde a leitura das alternativas com o mesmo estado."});
    expect(decision.composition).not.toBe("change_premise");
  });

  it("names a known role as the audience when the classifier lists the requester's own description first", async () => {
    const output = classifierOutput({routingCore: {...classifierOutput().routingCore, audienceType: field("internal_senior")}});
    const decision = await decide(output);
    expect(decision.record.audience).toBe("vp");
    expect(decision.reply).toContain("audiência=vp");
  });

  it("ignores an answer to a question the desk never asked", async () => {
    const output = classifierOutput({composition: "answer_a_question", turn: {companies: [], answers: [{questionId: "q-unknown", answer: "x", effect: {audience: null, depth: null, scope: null}}]}});
    const decision = await decide(output, {priorCaseId: "gc01-analista-ib-camil", artifactTypes: ["preview_alternatives"], openQuestions: [{id: "q-angle", text: "?"}]});
    expect(decision.kind).toBe("converse");
    expect(decision.activation).toBeNull();
  });

  it("researches a company without a corpus through the providers it holds, bounded, and says when none is available", async () => {
    const source = {
      provider: "perplexity" as const, topic: "company_overview" as const, title: "Magazine Luiza: resultados do trimestre", url: "https://ri.magazineluiza.com.br/resultados",
      snippet: "…", publishedAt: null, retrievedAt: new Date().toISOString(), contentHash: "a".repeat(64),
    };
    const calls: string[] = [];
    const provider = {id: "perplexity" as const, maxCostUsdPerCall: 0.01, search: async (query: {query: string; topic: string}) => { calls.push(query.query); return [{...source, topic: query.topic}]; }};
    const research = await researchUnknownCompany({providers: [provider as never], company: "Magazine Luiza"});
    expect(["succeeded", "partial"]).toContain(research.status);
    expect(research.queries).toBeLessThanOrEqual(3);
    expect(research.sources.length).toBeGreaterThanOrEqual(1);
    expect(research.sources[0]!.url).toBe(source.url);
    expect(researchReplyLine("pt-BR", research)).toContain("Pesquisa pública feita para Magazine Luiza");
    const none = await researchUnknownCompany({providers: [], company: "Magazine Luiza"});
    expect(none.status).toBe("unavailable");
    expect(researchReplyLine("pt-BR", none)).toContain("Pesquisa pública indisponível");
  });

  it("resolves the company from the message text when the classifier leaves it out", async () => {
    const output = classifierOutput({
      routingCore: {...classifierOutput().routingCore, object: field([{id: "object-1", ordinal: 1, kind: "material", slots: []}])},
      turn: {companies: []},
    });
    const decision = await decide(output, {message: "Reunião com a Camil segunda-feira: o VP quer algo sobre refinanciamento das debêntures, mas não fechou o ângulo nem o entregável."});
    expect(decision.kind).toBe("activate");
    expect(decision.record.corpus?.caseId).toBe("gc01-analista-ib-camil");
    expect(decision.record.companiesMentioned).toEqual([]);
  });

  it("accepts the looser shapes a prompted model writes: null objects, null lists, a null basis, a missing confidence", () => {
    const raw = classifierOutput() as unknown as Record<string, unknown>;
    const loose = {
      ...raw,
      routingCore: {...(raw.routingCore as Record<string, unknown>), depth: {value: "preliminary", state: "inferred", basis: null}},
      turn: {companies: null, premiseChanges: null, numberQuestion: null, material: null, answers: null, scopeChanges: null},
    };
    const parsed = liveRoutingOutputSchema.parse(loose);
    const turn = normalizePreviewTurn(parsed.turn);
    expect(turn.scopeChanges).toEqual({audience: null, depth: null, form: null});
    expect(turn.material).toEqual({requested: false, form: null, pages: null});
    expect(turn.companies).toEqual([]);
    expect(turn.answers).toEqual([]);
    expect(parsed.routingCore.depth.confidence ?? null).toBeNull();
    // The schema the gateway fingerprints and sends in the prompt must stay representable.
    expect(() => z.toJSONSchema(liveRoutingOutputSchema)).not.toThrow();
  });

  it("routes a decision body written in the message to prepare_decision even when the classifier names another composition", async () => {
    const output = classifierOutput({composition: "develop_alternatives", routingCore: {...classifierOutput().routingCore, audienceType: field("company_management")}});
    const decision = await decide(output, {message: "Sou CFO da Camil e preciso levar ao conselho a decisão de refinanciar as debêntures."});
    expect(decision.composition).toBe("prepare_decision");
    expect(decision.record.audience).toBe("board");
  });

  it("rejects an overlong canonical object slot at the model boundary", () => {
    const long = "a".repeat(300);
    expect(() => classifierOutput({routingCore: {...classifierOutput().routingCore, object: field([{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: long}]}])}})).toThrow();
  });
});
