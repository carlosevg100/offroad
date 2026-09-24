import {describe, expect, it, vi} from "vitest";

import {
  BASELINE_SYSTEM_PROMPT,
  baselineGeneralistResultSchema,
  baselineGeneralistSnapshotSchema,
  baselineSnapshotContentHashes,
  informationBaseHash,
  renderInformationBase,
  renderTurnMessage,
  runBaselineGeneralist,
  sha256Hex,
  type BaselineGateway,
  type BaselineGeneralistSnapshot,
  type BaselineTurnRequest,
} from "./gold-baseline";

/** Synthetic case: two turns, one document and two sources, one of them not retained. */
const snapshot = (): BaselineGeneralistSnapshot => baselineGeneralistSnapshotSchema.parse({
  schemaVersion: "gold-baseline-snapshot.v1",
  informationBase: {
    caseId: "gc01-synthetic", caseVersion: "1.0", language: "pt-BR", asOfDate: "2026-09-04",
    turns: [
      {id: "gc01-t01", text: "Pedido sintético do primeiro turno para o analista."},
      {id: "gc01-t02", text: "Pedido sintético do segundo turno para o analista."},
    ],
    documents: [{id: "doc-a", title: "Documento sintético", fileName: "a.pdf", sha256: "a".repeat(64), pages: 2, text: "texto sintético"}],
    sources: [
      {id: "src-1", title: "Fonte sintética", url: "https://example.invalid/1", asOfDate: "2026-09-01", version: "v1", licencePolicy: "public_reusable", contentType: "text/plain", sha256: "c".repeat(64), text: "fonte", rendering: "full_text"},
      {id: "src-2", title: "Fonte retida", url: "https://example.invalid/2", asOfDate: "2026-09-01", version: "manual", licencePolicy: "manual_only", contentType: "manual", sha256: null, text: null, rendering: "not_retained"},
    ],
  },
  model: {primary: {provider: "anthropic", model: "claude-opus-5", effort: "high"}, fallback: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}, maxOutputTokens: 4000},
  caveats: ["Caveat sintético."],
});

function gateway() {
  const requests: BaselineTurnRequest[] = [];
  let calls = 0;
  const complete = vi.fn(async (request: BaselineTurnRequest) => {
    requests.push(structuredClone({...request, schema: undefined}) as unknown as BaselineTurnRequest);
    calls += 1;
    return {output: {deliverable: `Entrega sintética ${calls}`}, provider: "anthropic", model: "claude-opus-5", effort: "high",
      usage: {inputTokens: 100 * calls, outputTokens: 10 * calls, cachedInputTokens: 0}, costUsd: 0.01 * calls, stopReason: "end"};
  });
  const port: BaselineGateway = {complete, spent: () => ({costUsd: 0.05})};
  return {port, requests, complete};
}

describe("gold baseline loop", () => {
  it("sends the whole base first and every earlier deliverable with each turn", async () => {
    const s = snapshot(), g = gateway();
    let tick = Date.parse("2026-09-24T10:00:00.000Z");
    const run = await runBaselineGeneralist(s, g.port, () => new Date(tick += 1000));
    const rendered = renderInformationBase(s.informationBase);
    expect(g.requests.map((request) => request.input.map((part) => part.text))).toEqual([
      [rendered, renderTurnMessage(s.informationBase.turns[0]!, 0)],
      [rendered, renderTurnMessage(s.informationBase.turns[0]!, 0), "## Resposta ao turno 1 (sua entrega anterior)\n\nEntrega sintética 1", renderTurnMessage(s.informationBase.turns[1]!, 1)],
    ]);
    for (const request of g.requests) {
      expect(request).toMatchObject({task: "baseline_generalist", system: BASELINE_SYSTEM_PROMPT, schemaName: "baseline_deliverable",
        model: s.model.primary, allowFallback: true, maxOutputTokens: 4000});
    }
    expect(g.requests.map((request) => request.metadata)).toEqual([
      {surface: "gold_baseline", caseId: "gc01-synthetic", turn: "gc01-t01"}, {surface: "gold_baseline", caseId: "gc01-synthetic", turn: "gc01-t02"}]);
    expect(run.outputs).toEqual([
      {turnId: "gc01-t01", file: "gc01-t01.output.md", deliverable: "Entrega sintética 1"},
      {turnId: "gc01-t02", file: "gc01-t02.output.md", deliverable: "Entrega sintética 2"}]);
    expect(run.record).toMatchObject({
      schemaVersion: "gold-baseline-run.v1", caseId: "gc01-synthetic", caseVersion: "1.0", asOfDate: "2026-09-04",
      startedAt: "2026-09-24T10:00:01.000Z", finishedAt: "2026-09-24T10:00:06.000Z", provider: "anthropic", model: "claude-opus-5", effort: "high",
      systemPromptSha256: sha256Hex(BASELINE_SYSTEM_PROMPT), informationBaseSha256: informationBaseHash(s.informationBase), informationBaseChars: rendered.length,
      totalCostUsd: 0.05, caveats: ["Caveat sintético."],
      inputs: {documents: [{id: "doc-a", sha256: "a".repeat(64), pages: 2, chars: 15}],
        sources: [{id: "src-1", sha256: "c".repeat(64), rendering: "full_text", chars: 5}, {id: "src-2", sha256: null, rendering: "not_retained", chars: 0}]},
    });
    expect(run.record.turns).toEqual([
      {id: "gc01-t01", messageSha256: sha256Hex(renderTurnMessage(s.informationBase.turns[0]!, 0)), outputSha256: sha256Hex("Entrega sintética 1"), outputFile: "gc01-t01.output.md",
        inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, costUsd: 0.01, latencyMs: 1000, stopReason: "end"},
      {id: "gc01-t02", messageSha256: sha256Hex(renderTurnMessage(s.informationBase.turns[1]!, 1)), outputSha256: sha256Hex("Entrega sintética 2"), outputFile: "gc01-t02.output.md",
        inputTokens: 200, outputTokens: 20, cachedInputTokens: 0, costUsd: 0.02, latencyMs: 1000, stopReason: "end"},
    ]);
  });

  it("disables provider fallback when the settings name none", async () => {
    const s = snapshot(), g = gateway();
    await runBaselineGeneralist({...s, model: {...s.model, fallback: null}}, g.port);
    expect(g.requests.every((request) => request.allowFallback === false)).toBe(true);
  });

  it("stops at the first failed turn and returns no record", async () => {
    const s = snapshot(), g = gateway();
    g.complete.mockRejectedValueOnce(new Error("synthetic provider failure"));
    await expect(runBaselineGeneralist(s, g.port)).rejects.toThrow("synthetic provider failure");
    expect(g.complete).toHaveBeenCalledOnce();
  });

  it("publishes a result the family schema reads, and refuses one a reader could write outside its run", async () => {
    const run = await runBaselineGeneralist(snapshot(), gateway().port);
    const result = {schemaVersion: "gold-baseline-result.v1", ...run};
    expect(baselineGeneralistResultSchema.parse(result)).toEqual(result);
    for (const change of [
      (value: Record<string, unknown>) => { value.schemaVersion = "gold-baseline-result.v2"; },
      (value: Record<string, unknown>) => { value.extra = true; },
      (value: Record<string, unknown>) => { (value.outputs as Array<Record<string, unknown>>)[0]!.file = "../gc01-t01.output.md"; },
      (value: Record<string, unknown>) => { (value.outputs as Array<Record<string, unknown>>)[0]!.deliverable = ""; },
      (value: Record<string, unknown>) => { value.outputs = []; },
    ]) {
      const altered = structuredClone(result) as unknown as Record<string, unknown>;
      change(altered);
      expect(baselineGeneralistResultSchema.safeParse(altered).success).toBe(false);
    }
  });

  it("renders a source left out by the request budget as a reference the model is told it did not read", () => {
    const s = snapshot();
    expect(renderInformationBase(s.informationBase)).not.toContain("Por limite de tamanho");
    const omitted = baselineGeneralistSnapshotSchema.parse({...s, informationBase: {...s.informationBase, sources: [
      {...s.informationBase.sources[0]!, text: null, rendering: "omitted_for_budget", note: "Cerca de 5 tokens estimados; não coube no limite de 10 tokens estimados por pedido."},
      s.informationBase.sources[1]!,
    ]}});
    const rendered = renderInformationBase(omitted.informationBase);
    expect(rendered).toContain("## Fontes públicas coletadas antes do trabalho (2)\nPor limite de tamanho do pedido ao modelo, 1 destas fontes aparecem só com a referência, sem o conteúdo.");
    expect(rendered).toContain("### Fonte src-1: Fonte sintética\nURL: https://example.invalid/1. Data-base: 2026-09-01. Versão: v1. Licença: public_reusable. Tipo: text/plain. SHA-256: "
      + `${"c".repeat(64)}.\nNota: Cerca de 5 tokens estimados; não coube no limite de 10 tokens estimados por pedido.\nConteúdo não incluído neste pedido por limite de tamanho; só a referência está disponível.`);
    expect(rendered).not.toContain("\nfonte\n");
    // The reference keeps its hash among the content hashes the contract declares.
    expect(baselineSnapshotContentHashes(omitted)).toEqual(baselineSnapshotContentHashes(s));
  });

  it("reads a strict snapshot and names every content hash it carries once", () => {
    const s = snapshot();
    expect(baselineSnapshotContentHashes(s)).toEqual(["a".repeat(64), "c".repeat(64)]);
    const extra = structuredClone(s) as unknown as {informationBase: Record<string, unknown>};
    extra.informationBase.professionalContext = {useForms: ["institutional_work"]};
    expect(baselineGeneralistSnapshotSchema.safeParse(extra).success).toBe(false);
    const unknownSetting = structuredClone(s) as unknown as {model: Record<string, unknown>};
    unknownSetting.model.temperature = 0;
    expect(baselineGeneralistSnapshotSchema.safeParse(unknownSetting).success).toBe(false);
    expect(baselineGeneralistSnapshotSchema.safeParse({...s, model: {...s.model, primary: {provider: "perplexity", model: "sonar", effort: "high"}}}).success).toBe(false);
  });
});
