import {describe, expect, it} from "vitest";

import {capitalProjectPlanSnapshot} from "./capital-jobs";
import {
  executionBriefPlanningContextSchema,
  type ExecutionBriefPlanningContext,
  compileCapitalExecutionBrief,
  compileExecutionBrief,
  diffVisibleExecutionBrief,
  evaluateExecutionBriefInput,
  executionBriefNarrativeSchema,
  executionBriefProgressSchema,
  visibleExecutionBriefSchema,
  visibleExecutionBrief,
  type ExecutionBriefCompilerInput,
  type ExecutionBriefSource,
} from "./execution-brief";

const sources: readonly ExecutionBriefSource[] = [
  {key: "project", label: "Contexto confirmado da reunião", role: "project_context", status: "available", informationClass: "private", authorized: true},
  {key: "documents", label: "Documentos enviados ao projeto", role: "provided_documents", status: "available", informationClass: "private", authorized: true},
  {key: "company-public", label: "RI, CVM e divulgações públicas", role: "public_company", status: "to_research", informationClass: "public", authorized: true},
  {key: "market-public", label: "Dados setoriais e transações comparáveis", role: "public_market", status: "to_research", informationClass: "public", authorized: true},
  {key: "method", label: "Métodos homologados de crédito", role: "house_method", status: "available", informationClass: "restricted", authorized: true},
  {key: "network", label: "Mandatos de financiadores com data de validade", role: "capital_network", status: "to_request", informationClass: "restricted", authorized: true},
];

const authority = {
  evidenceRegime: "mixed" as const,
  executionAuthority: "analysis_only" as const,
  establishedBy: "system_policy" as const,
};

describe("execution brief compiler", () => {
  it("projects a meeting-specific, prospective plan from the complete compiled graph", () => {
    const brief = compileCapitalExecutionBrief({
      plan: capitalProjectPlanSnapshot("origination_thesis"),
      locale: "pt-BR",
      objective: "Preparar uma conversa com a Camil sobre alternativas de refinanciamento",
      companyLabel: "Camil",
      audienceLabel: "VP de Investment Banking",
      proposedDeliverable: "Brief de reunião, análise financeira prospectiva e alternativas priorizadas",
      sources,
      assumptions: [{label: "Data da reunião", value: "segunda-feira", basis: "Informada pelo usuário", editable: true}],
      authority,
      expensiveWork: true,
    });

    expect(brief.workstreams.map((workstream) => workstream.label)).toEqual([
      "Definir o que a conversa com Camil precisa provocar",
      "Conferir o que sustenta a conversa sobre Camil",
      "Construir uma visão própria e prospectiva de Camil",
      "Selecionar ideias que merecem entrar na conversa",
      "Testar a tese contra setor e mercado de crédito",
    ]);
    expect(brief.workstreams.flatMap((workstream) => workstream.sourceTaskIds)).toHaveLength(brief.workstreams.flatMap((workstream) => workstream.sourceTaskIds).length);
    expect(new Set(brief.workstreams.flatMap((workstream) => workstream.sourceTaskIds))).toHaveLength(brief.workstreams.flatMap((workstream) => workstream.sourceTaskIds).length);
    expect(brief.workstreams.flatMap((workstream) => workstream.sourceTaskIds)).toEqual(expect.arrayContaining(["C05", "C07", "C08", "S11", "K04"]));
    expect(brief.executionMode).toBe("confirm_before_expensive_work");
    expect(brief.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("makes a transaction and covenant review materially different from a meeting plan", () => {
    const brief = compileCapitalExecutionBrief({
      plan: capitalProjectPlanSnapshot("review_existing_operation"),
      locale: "pt-BR",
      objective: "Revisar a minuta e recalcular o covenant de alavancagem",
      companyLabel: "Projeto Serra",
      audienceLabel: "comitê de crédito",
      proposedDeliverable: "Revisão citada, cálculo reproduzível e proposta de ajustes",
      sources,
      authority,
    });

    expect(brief.workstreams.map((workstream) => workstream.label)).toEqual([
      "Delimitar a operação e as questões que precisam ser testadas",
      "Resolver documentos vigentes, emendas e referências cruzadas",
      "Recalcular economics, cobertura, covenants e downside",
      "Comparar a proposta atual com ajustes possíveis",
    ]);
    expect(brief.workstreams[1]?.analyses.join(" ")).toContain("referências cruzadas");
    expect(brief.workstreams[2]?.analyses.join(" ")).toContain("Juros, amortização, indexação");
    expect(brief.executionMode).toBe("start_after_display");
  });

  it("removes internal graph identifiers and authority metadata from the visible projection", () => {
    const compiled = compileCapitalExecutionBrief({
      plan: capitalProjectPlanSnapshot("company_debt_view"),
      locale: "pt-BR",
      objective: "Avaliar a estrutura de capital da Camil",
      companyLabel: "Camil",
      audienceLabel: "conselho",
      proposedDeliverable: "Diagnóstico prospectivo para discussão",
      sources,
      authority,
    });
    const visible = visibleExecutionBrief(compiled);
    const serialized = JSON.stringify(visible);

    expect(visibleExecutionBriefSchema.parse(visible)).toEqual(visible);

    expect(serialized).not.toContain("sourceTaskIds");
    expect(serialized).not.toContain("planVersion");
    expect(serialized).not.toContain("executionAuthority");
    expect(serialized).not.toContain('"M01"');
    expect(visible.currentContext.map((entry) => entry.label)).toEqual([
      "Contexto confirmado da reunião",
      "Documentos enviados ao projeto",
      "Métodos homologados de crédito",
    ]);
  });

  it("requires exact approval when the compiled graph can create an external effect", () => {
    const input = minimalInput();
    const withExternalEffect: ExecutionBriefCompilerInput = {
      ...input,
      authority: {evidenceRegime: "private", executionAuthority: "external_effect", establishedBy: "user"},
      tasks: input.tasks.map((task, index) => index === 2 ? {...task, effect: "external" as const} : task),
    };
    expect(compileExecutionBrief(withExternalEffect).executionMode).toBe("approve_external_effect");
  });

  it("accepts only safe workstream-level progress without internal task identifiers", () => {
    const progress = executionBriefProgressSchema.parse({
      briefId: "10000000-0000-4000-8000-000000000001",
      version: 2,
      workstreams: [
        {position: 0, label: "Fixar a decisão", status: "completed", completed: 2, total: 2},
        {position: 1, label: "Testar capacidade", status: "running", completed: 1, total: 4},
        {position: 2, label: "Comparar alternativas", status: "waiting_user", completed: 0, total: 3},
      ],
    });

    expect(JSON.stringify(progress)).not.toContain("taskId");
    expect(() => executionBriefProgressSchema.parse({...progress, workstreams: [
      {...progress.workstreams[0], sourceTaskIds: ["M01"]},
      progress.workstreams[1],
      progress.workstreams[2],
    ]})).toThrow();
  });

  it("accepts a persisted customer narrative without worker internals", () => {
    const narrative = executionBriefNarrativeSchema.parse({
      briefId: "10000000-0000-4000-8000-000000000001",
      version: 2,
      events: [
        {
          eventKey: "a".repeat(64),
          position: 0,
          label: "Entender a companhia e o contexto",
          purpose: "Ler as fontes públicas e separar fatos, premissas e lacunas.",
          output: "Contexto confirmado para as análises seguintes",
          kind: "completed",
          occurredAt: "2026-09-06T15:30:00.000Z",
          carriedForward: false,
        },
      ],
    });

    expect(JSON.stringify(narrative)).not.toMatch(/TaskSpec|taskId|executor|provider|error/);
    expect(() => executionBriefNarrativeSchema.parse({...narrative, events: [{
      ...narrative.events[0],
      taskId: "M01",
    }]})).toThrow();
  });

  it("describes a replan as a bounded visible diff without internal task language", () => {
    const base = visibleExecutionBrief(compileExecutionBrief(minimalInput()));
    const changed = {
      ...base,
      proposedDeliverable: "Memorando e sensibilidade de prazo",
      assumptions: [{label: "Prazo", value: "72 meses", basis: "Informado pelo usuário", editable: true as const}],
    };
    const diff = diffVisibleExecutionBrief(base, changed);

    expect(diff).toEqual([
      {kind: "deliverable_changed", label: "Produto esperado", from: "Memorando citado", to: "Memorando e sensibilidade de prazo"},
      {kind: "assumption_added", label: "Prazo", to: "72 meses"},
    ]);
    expect(JSON.stringify(diff)).not.toMatch(/TaskSpec|sourceTaskIds|executionAuthority|\bM0[1-3]\b/);
  });

  it("blocks generic copy, tasks outside the graph, hidden tasks and unavailable authority", () => {
    const input = minimalInput();
    const invalid: ExecutionBriefCompilerInput = {
      ...input,
      sources: input.sources.map((source) => ({...source, authorized: false})),
      workstreams: [
        {...input.workstreams[0]!, label: "Organizar contexto", taskIds: ["M01", "NOT_IN_GRAPH"]},
        {...input.workstreams[1]!, taskIds: []},
        input.workstreams[2]!,
      ],
    };
    const blockers = evaluateExecutionBriefInput(invalid).blockers;
    expect(blockers).toEqual(expect.arrayContaining([
      "available_source_not_authorized:project",
      "generic_workstream_label:scope",
      "task_outside_graph:NOT_IN_GRAPH",
      "task_hidden_from_brief:M02",
    ]));
    expect(() => compileExecutionBrief(invalid)).toThrow("invalid execution brief");
  });
});

function minimalInput(): ExecutionBriefCompilerInput {
  return {
    planVersion: "test.v1",
    locale: "pt-BR",
    objective: "Testar uma decisão material",
    proposedDeliverable: "Memorando citado",
    tasks: [
      {id: "M01", dependencies: [], effect: "none"},
      {id: "M02", dependencies: ["M01"], effect: "propose_state"},
      {id: "M03", dependencies: ["M02"], effect: "propose_state"},
    ],
    workstreams: [
      {key: "scope", label: "Fixar a decisão e os limites do caso", purpose: "Evitar uma análise com perímetro errado.", taskIds: ["M01"], sourceRoles: ["project_context"], analyses: ["Objetivo e restrições"], output: "Escopo", inclusionReasons: ["prevents_material_error"]},
      {key: "analysis", label: "Testar a hipótese econômica declarada", purpose: "Verificar a hipótese com os dados autorizados.", taskIds: ["M02"], sourceRoles: ["project_context"], analyses: ["Hipótese e evidência"], output: "Teste", inclusionReasons: ["tests_hypothesis"]},
      {key: "deliver", label: "Consolidar o memorando para decisão", purpose: "Preparar a entrega solicitada.", taskIds: ["M03"], sourceRoles: ["project_context"], analyses: ["Síntese e ressalvas"], output: "Memorando", inclusionReasons: ["produces_deliverable"]},
    ],
    sources: [{key: "project", label: "Contexto do projeto", role: "project_context", status: "available", informationClass: "private", authorized: true}],
    assumptions: [],
    checkpoints: [{label: "Revisar", afterWorkstreamKey: "deliver", kind: "review"}],
    authority,
    expensiveWork: false,
  };
}

it("keeps a bounded one-task plan proportional without padding or hidden tasks", () => {
  const canonical = capitalProjectPlanSnapshot("origination_thesis");
  const task = canonical.taskSpecs.find((item) => item.id === "M01")!;
  const plan = {...canonical, taskSpecs: [{...task, dependencies: []}]};
  const brief = compileCapitalExecutionBrief({plan, locale: "en-US", objective: "Confirm the company context", companyLabel: "Company", audienceLabel: "Decision owner", proposedDeliverable: "Confirmed context and open questions", sources, authority, expensiveWork: true});
  expect(brief.workstreams).toHaveLength(1);
  expect(brief.workstreams.flatMap((stream) => stream.sourceTaskIds)).toEqual(["M01"]);
  expect(visibleExecutionBriefSchema.safeParse(visibleExecutionBrief(brief)).success).toBe(true);
  expect(() => compileCapitalExecutionBrief({plan: {...plan, taskSpecs: []}, locale: "en-US", objective: "Confirm company context", companyLabel: "Company", audienceLabel: "Decision owner", proposedDeliverable: "Context", sources, authority})).toThrow("workstream_count_outside_1_to_7");
});

function planningContext(): ExecutionBriefPlanningContext {
  return {schemaVersion: "sector-planning-context.v1", contextFingerprint: "a".repeat(64), planFingerprint: "b".repeat(64), mode: "planning_only", objects: [{id: "company", label: "Companhia", attributes: [{dimension: "sector", label: "Setor", value: "energy", status: "confirmed", sources: [{label: "Documento", version: "1", anchor: "p. 3", basis: "reviewed_document"}]}], requirements: [{id: "r1", label: "Contrato", evidenceNeeded: ["Contrato vigente"], status: "not_examined", methodStatus: "specified"}], gaps: []}]};
}
describe("execution brief planning context", () => {
  it("preserves legacy identity when omitted and projects context without execution authority", () => {
    const base = compileExecutionBrief(minimalInput());
    expect(visibleExecutionBriefSchema.parse(visibleExecutionBrief(base)).planningContext).toBeUndefined();
    expect(compileExecutionBrief({...minimalInput()}).fingerprint).toBe(base.fingerprint);
    const next = compileExecutionBrief({...minimalInput(), planningContext: planningContext()});
    expect(next.fingerprint).not.toBe(base.fingerprint);
    expect(visibleExecutionBriefSchema.parse(visibleExecutionBrief(next)).planningContext).toEqual(planningContext());
    expect(next.executionMode).toBe(base.executionMode);
    expect(next.workstreams).toEqual(base.workstreams);
    expect(diffVisibleExecutionBrief(visibleExecutionBrief(base), visibleExecutionBrief(next))).toEqual([{kind: "planning_context_changed", label: "Contexto econômico e requisitos"}]);
  });
  it.each(["source", "status", "requirement"])("includes %s change in brief identity and diff", (kind) => {
    const initial = compileExecutionBrief({...minimalInput(), planningContext: planningContext()});
    const context = planningContext();
    if (kind === "source") context.objects[0]!.attributes[0]!.sources[0]!.version = "2";
    if (kind === "status") context.objects[0]!.attributes[0]!.status = "conflicting";
    if (kind === "requirement") context.objects[0]!.requirements[0]!.label = "Contrato e aditivos";
    const next = compileExecutionBrief({...minimalInput(), planningContext: context});
    expect(next.fingerprint).not.toBe(initial.fingerprint);
    expect(diffVisibleExecutionBrief(visibleExecutionBrief(initial), visibleExecutionBrief(next)).map((change) => change.kind)).toContain("planning_context_changed");
  });
  it("rejects promoted method states and aggregate requirement overflow", () => {
    const context = planningContext();
    expect(executionBriefPlanningContextSchema.safeParse({...context, mode: "execute"}).success).toBe(false);
    context.objects = Array.from({length: 2}, (_, index) => ({...context.objects[0]!, id: `object-${index}`, requirements: Array.from({length: 51}, (_, requirement) => ({...context.objects[0]!.requirements[0]!, id: `r-${requirement}`}))}));
    expect(executionBriefPlanningContextSchema.safeParse(context).success).toBe(false);
  });
});

it("keeps the complete approved objective while providing a bounded display excerpt only for new briefs", () => {
  const objective = "Preparar alternativas de refinanciamento para a companhia.\n\nA reunião será com CFO e tesouraria, sem exposição atual.\n\nPreservar as informações fornecidas e detalhar as alternativas.";
  const compiled = compileExecutionBrief({...minimalInput(), objective});
  const visible = visibleExecutionBriefSchema.parse(visibleExecutionBrief(compiled));
  expect(compiled.objective).toBe(objective);
  expect(visible.objective).toBe(objective);
  expect(visible.objectiveSummary).toBe("Preparar alternativas de refinanciamento para a companhia.…");
  const historical = {...compiled}; delete historical.objectiveSummary;
  expect(visibleExecutionBrief(historical)).not.toHaveProperty("objectiveSummary");
  expect(visibleExecutionBrief(historical).fingerprint).toBe(compiled.fingerprint);
  const revised = compileExecutionBrief({...minimalInput(), objective: objective + "\n\nNão considerar garantias do controlador."});
  expect(revised.fingerprint).not.toBe(compiled.fingerprint);
  expect(revised.objectiveSummary).toBe(compiled.objectiveSummary);
});
