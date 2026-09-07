import {describe, expect, it} from "vitest";

import {intentObjectKindSchema} from "./intent-envelope";
import {
  applySemanticObjectCompilation,
  compileSemanticObjects,
  SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
  SEMANTIC_OBJECT_KIND_DEFINITIONS,
  activeWorkContextSchema,
  semanticObjectExtractorOutputSchema,
  semanticObjectCompilationSchema,
  type SemanticObjectExtractorInput,
  type SemanticTextSpan,
} from "./semantic-object-extractor";
import {intentClassifierOutputSchema} from "./intent-classifier";

const input = (latestUserMessage: string, overrides: Partial<SemanticObjectExtractorInput> = {}): SemanticObjectExtractorInput => ({
  locale: "pt-BR",
  latestUserMessage,
  recentConversation: [],
  activeWorkContext: null,
  ...overrides,
});

function span(text: string, needle: string, source: "latest_user_message" | "recent_user_message" = "latest_user_message", messageIndex: number | null = null): SemanticTextSpan {
  const start = text.indexOf(needle);
  if (start < 0) throw new Error(`missing needle: ${needle}`);
  return {source, messageIndex, start, end: start + needle.length, text: needle};
}

describe("semantic object extractor contract", () => {
  it("defines all eighteen object kinds in the shared prompt", () => {
    expect(Object.keys(SEMANTIC_OBJECT_KIND_DEFINITIONS)).toEqual(intentObjectKindSchema.options);
    for (const kind of intentObjectKindSchema.options) expect(SEMANTIC_OBJECT_EXTRACTOR_SYSTEM).toContain(`- ${kind}:`);
    expect(SEMANTIC_OBJECT_EXTRACTOR_SYSTEM).toContain("Atomic reference rule");
    expect(SEMANTIC_OBJECT_EXTRACTOR_SYSTEM).toContain("activeWorkContext is control-plane-governed memory");
  });

  it("normalizes an atomic operation without merging its company or asset pool", () => {
    const message = "A Camil quer estruturar uma captação de R$ 50 milhões com recebíveis.";
    const result = compileSemanticObjects(input(message), {
      objects: [
        {candidateId: "candidate-1", kind: "company", head: {key: "entity", span: span(message, "Camil")}, modifiers: []},
        {candidateId: "candidate-2", kind: "operation", head: {key: "subject", span: span(message, "captação")}, modifiers: [
          {key: "amount", span: span(message, "R$ 50 milhões")},
          {key: "currency", span: span(message, "R$ 50 milhões")},
        ]},
        {candidateId: "candidate-3", kind: "asset_or_pool", head: {key: "subject", span: span(message, "recebíveis")}, modifiers: []},
      ],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });

    expect(result.status).toBe("complete");
    expect(result.objects.map(({kind}) => kind)).toEqual(["company", "operation", "asset_or_pool"]);
    expect(result.objects[1]?.slots).toEqual([
      {key: "subject", value: "captação"},
      {key: "amount", value: "50000000"},
      {key: "currency", value: "BRL"},
    ]);
    expect(result.coverage).toMatchObject({quantitativeMentions: 1, quantitativeMentionsCovered: 1});
    expect(result.usableObjects).toHaveLength(3);
  });

  it("keeps each named alternative independently referable", () => {
    const message = "Compare bilateral, debênture e private credit.";
    const result = compileSemanticObjects(input(message), {
      objects: ["bilateral", "debênture", "private credit"].map((value, index) => ({
        candidateId: `candidate-${index + 1}`,
        kind: "alternative" as const,
        head: {key: "subject" as const, span: span(message, value)},
        modifiers: [],
      })),
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("complete");
    expect(result.objects.map(({slots}) => slots[0]?.value)).toEqual(["bilateral", "debênture", "private credit"]);
  });

  it("orders current text first, recent user text newest first and governed context last", () => {
    const old = "O trabalho começou pela Companhia Alfa.";
    const recent = "O memo tem duas páginas.";
    const current = "Atualize isso para o conselho.";
    const active = activeWorkContextSchema.parse({
      schemaVersion: "active-work-context.v1", contextId: "work:capital", revision: 3, state: "active",
      objective: "Preparar decisão de capital", objects: [
        {id: "ctx-company", ordinal: 1, kind: "company", slots: [{key: "entity", value: "Companhia Alfa"}], label: "Companhia Alfa", governance: {state: "user_confirmed", sourceIds: ["source:brief"]}},
        {id: "ctx-model", ordinal: 2, kind: "model", slots: [{key: "subject", value: "modelo financeiro"}], label: "modelo financeiro", governance: {state: "system_resolved", sourceIds: ["source:model"]}},
      ],
    });
    const result = compileSemanticObjects(input(current, {
      recentConversation: [{role: "user", content: old}, {role: "assistant", content: "Vou ajudar."}, {role: "user", content: recent}],
      activeWorkContext: active,
    }), {
      objects: [
        {candidateId: "candidate-1", kind: "company", head: {key: "entity", span: span(old, "Companhia Alfa", "recent_user_message", 0)}, modifiers: []},
        {candidateId: "candidate-2", kind: "material", head: {key: "subject", span: span(recent, "memo", "recent_user_message", 2)}, modifiers: [
          {key: "page_count", span: span(recent, "duas páginas", "recent_user_message", 2)},
        ]},
        {candidateId: "candidate-3", kind: "decision", head: {key: "subject", span: span(current, "conselho")}, modifiers: []},
      ],
      activeContextReferences: [
        {contextObjectId: "ctx-model", trigger: span(current, "isso")},
      ],
      unresolvedReferences: [], excludedQuantitativeSpans: [],
    });

    expect(result.status).toBe("complete");
    expect(result.objects.map(({kind}) => kind)).toEqual(["decision", "material", "company", "model"]);
    expect(result.objects.at(-1)?.source).toMatchObject({type: "active_work_context", contextObjectId: "ctx-model"});
  });

  it("normalizes rates, ratios, basis points, tenor, counts, pages and cadence in code", () => {
    const message = "Cenário CDI a 12%, 4,7x, 50 bps, sete anos; deck de três páginas; monitore trimestralmente.";
    const scenarioHead = span(message, "Cenário");
    const result = compileSemanticObjects(input(message), {
      objects: [
        {candidateId: "candidate-1", kind: "scenario", head: {key: "subject", span: scenarioHead}, modifiers: [
          {key: "indexer", span: span(message, "CDI")}, {key: "percentage", span: span(message, "12%")},
          {key: "ratio", span: span(message, "4,7x")}, {key: "basis_points", span: span(message, "50 bps")},
          {key: "tenor_months", span: span(message, "sete anos")},
        ]},
        {candidateId: "candidate-2", kind: "material", head: {key: "subject", span: span(message, "deck")}, modifiers: [
          {key: "page_count", span: span(message, "três páginas")},
        ]},
        {candidateId: "candidate-3", kind: "process", head: {key: "subject", span: span(message, "monitore")}, modifiers: [
          {key: "cadence", span: span(message, "trimestralmente")},
        ]},
      ], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("complete");
    expect(result.objects[0]?.slots).toEqual([
      {key: "subject", value: "Cenário"}, {key: "percentage", value: "0.12"},
      {key: "basis_points", value: "50"}, {key: "ratio", value: "4.7"},
      {key: "indexer", value: "CDI"}, {key: "tenor_months", value: "84"},
    ]);
    expect(result.objects[1]?.slots).toContainEqual({key: "page_count", value: "3"});
    expect(result.objects[2]?.slots).toContainEqual({key: "cadence", value: "quarterly"});
    expect(result.coverage.quantitativeMentionsCovered).toBe(result.coverage.quantitativeMentions);
  });

  it("fails closed when a declared span cites assistant prose", () => {
    const prior = "Sugiro uma debênture.";
    const result = compileSemanticObjects(input("Continue.", {recentConversation: [{role: "assistant", content: prior}]}), {
      objects: [{candidateId: "candidate-1", kind: "instrument", head: {key: "subject", span: span(prior, "debênture", "recent_user_message", 0)}, modifiers: []}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("rejected");
    expect(result.usableObjects).toEqual([]);
    expect(result.coverage.issues).toContainEqual(expect.objectContaining({code: "assistant_text_is_not_evidence"}));
  });

  it("marks the extraction incomplete when a quantitative mention is silently omitted", () => {
    const message = "Analise uma captação de R$ 80 milhões.";
    const result = compileSemanticObjects(input(message), {
      objects: [{candidateId: "candidate-1", kind: "operation", head: {key: "subject", span: span(message, "captação")}, modifiers: []}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("incomplete");
    expect(result.usableObjects).toEqual([]);
    expect(result.coverage.issues).toContainEqual(expect.objectContaining({code: "uncovered_quantitative_mention"}));
  });

  it("allows an exact deadline span to be excluded without hiding a business quantity", () => {
    const message = "Preciso do memo em 3 páginas até 10/09/2026.";
    const result = compileSemanticObjects(input(message), {
      objects: [{candidateId: "candidate-1", kind: "material", head: {key: "subject", span: span(message, "memo")}, modifiers: [
        {key: "page_count", span: span(message, "3 páginas")},
      ]}],
      activeContextReferences: [], unresolvedReferences: [],
      excludedQuantitativeSpans: [{span: span(message, "10/09/2026"), reason: "deadline_or_date"}],
    });
    expect(result.status).toBe("complete");
    expect(result.coverage.quantitativeMentionsCovered).toBe(result.coverage.quantitativeMentions);
  });

  it("does not let the model hide a business amount as non-object metadata", () => {
    const message = "Analise R$ 80 milhões.";
    const result = compileSemanticObjects(input(message), {
      objects: [{candidateId: "candidate-1", kind: "operation", head: {key: "subject", span: span(message, "Analise")}, modifiers: []}],
      activeContextReferences: [], unresolvedReferences: [],
      excludedQuantitativeSpans: [{span: span(message, "R$ 80 milhões"), reason: "non_object_metadata"}],
    });
    expect(result.status).toBe("rejected");
    expect(result.usableObjects).toEqual([]);
    expect(result.coverage.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "invalid_exclusion_reason"}),
      expect.objectContaining({code: "uncovered_quantitative_mention"}),
    ]));
  });

  it("does not import unknown or paused context objects", () => {
    const message = "Ajuste isso.";
    const paused = activeWorkContextSchema.parse({
      schemaVersion: "active-work-context.v1", contextId: "work:model", revision: 1, state: "paused", objective: "Modelo",
      objects: [{id: "ctx-model", ordinal: 1, kind: "model", slots: [{key: "subject", value: "modelo"}], label: "modelo", governance: {state: "user_confirmed", sourceIds: ["source:user"]}}],
    });
    const result = compileSemanticObjects(input(message, {activeWorkContext: paused}), {
      objects: [], activeContextReferences: [{contextObjectId: "ctx-model", trigger: span(message, "isso")}],
      unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("rejected");
    expect(result.objects).toEqual([]);
    expect(result.coverage.issues).toContainEqual(expect.objectContaining({code: "context_not_active"}));
  });

  it("keeps unresolved references visible and blocks consumption", () => {
    const message = "Revise aquilo.";
    const result = compileSemanticObjects(input(message), {
      objects: [], activeContextReferences: [],
      unresolvedReferences: [{span: span(message, "aquilo"), reason: "no_governed_match"}],
      excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("incomplete");
    expect(result.usableObjects).toEqual([]);
    expect(result.coverage.issues).toContainEqual(expect.objectContaining({code: "unresolved_reference"}));
  });

  it("treats an empty extraction as incomplete instead of a successful no-op", () => {
    const result = compileSemanticObjects(input("Faça o trabalho habitual."), {
      objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("incomplete");
    expect(result.coverage.issues).toContainEqual(expect.objectContaining({code: "no_semantic_object"}));
  });

  it("rejects duplicate candidates instead of quietly deduplicating them", () => {
    const message = "Analise a dívida.";
    const debt = {candidateId: "candidate-1", kind: "instrument" as const, head: {key: "subject" as const, span: span(message, "dívida")}, modifiers: []};
    const result = compileSemanticObjects(input(message), {
      objects: [debt, {...debt, candidateId: "candidate-2"}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(result.status).toBe("rejected");
    expect(result.coverage.issues).toContainEqual(expect.objectContaining({code: "duplicate_atomic_object"}));
  });

  it("rejects duplicate candidate ids at the model boundary", () => {
    const message = "Compare dívida e caixa.";
    const candidate = {candidateId: "candidate-1", kind: "claim" as const, head: {key: "subject" as const, span: span(message, "dívida")}, modifiers: []};
    expect(semanticObjectExtractorOutputSchema.safeParse({
      objects: [candidate, {...candidate, head: {key: "subject", span: span(message, "caixa")}}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    }).success).toBe(false);
  });

  it("provides a fail-closed orchestration seam that replaces only the classifier object field", () => {
    const field = <T>(value: T) => ({value, state: "explicit" as const, confidence: null, basis: null});
    const route = intentClassifierOutputSchema.parse({
      routingCore: {
        action: field(["analyze"]), object: field([{id: "object-1", ordinal: 1, kind: "claim", slots: [{key: "subject", value: "bundled guess"}]}]),
        decisionType: field("credit"), audienceType: field("self"), depth: field("preliminary"), continuity: field("new"), workResponsibility: field(["producer"]),
      },
      inferableContext: {
        jurisdiction: field([]), asOfDate: field(null), currency: field(null), deadline: field(null), sponsorInstruction: field(null), constraints: field([]), urgency: field(null), availableInputs: field([]),
      },
      primaryWorks: [{work: "analyze", confidence: 0.9}], composition: "analyze_performance_and_credit", firstQuestion: null, abstain: false, abstainReason: null,
    });
    const message = "Analise a dívida.";
    const complete = compileSemanticObjects(input(message), {
      objects: [{candidateId: "candidate-1", kind: "instrument", head: {key: "subject", span: span(message, "dívida")}, modifiers: []}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    const applied = applySemanticObjectCompilation(route, complete);
    expect(applied.routingCore.object.value).toEqual([{id: "object-1", ordinal: 1, kind: "instrument", slots: [{key: "subject", value: "dívida"}]}]);
    expect(applied.routingCore.action).toEqual(route.routingCore.action);

    const incomplete = compileSemanticObjects(input("Analise uma dívida de R$ 10 milhões."), {
      objects: [{candidateId: "candidate-1", kind: "instrument", head: {key: "subject", span: span("Analise uma dívida de R$ 10 milhões.", "dívida")}, modifiers: []}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    const blocked = applySemanticObjectCompilation(route, incomplete);
    expect(blocked.routingCore.object).toMatchObject({value: [], state: "unknown"});
    expect(blocked.abstain).toBe(true);
  });

  it("rejects a forged compilation fingerprint and inconsistent usable objects", () => {
    const message = "Analise a dívida.";
    const complete = compileSemanticObjects(input(message), {
      objects: [{candidateId: "candidate-1", kind: "instrument", head: {key: "subject", span: span(message, "dívida")}, modifiers: []}],
      activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [],
    });
    expect(semanticObjectCompilationSchema.safeParse({...complete, fingerprint: "0".repeat(64)}).success).toBe(false);
    expect(semanticObjectCompilationSchema.safeParse({...complete, usableObjects: []}).success).toBe(false);
  });
});
