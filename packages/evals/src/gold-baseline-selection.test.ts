import {describe, expect, it} from "vitest";

import {
  conservativeTextReservationUsd,
  createModelGateway,
  listPrices,
  retentionMatrixVersion,
  type AdapterRequest,
  type AdapterResponse,
  type GatewayAttempt,
} from "@offroad/model-gateway";

import {
  baselineGeneralistSnapshotSchema,
  baselineInformationBaseSchema,
  baselineSelectionCaveat,
  planBaselineRequests,
  renderInformationBase,
  runBaselineGeneralist,
  selectBaselineInformationBase,
  type BaselineInformationBase,
  type BaselineModelSettings,
  type BaselineSourceCategory,
} from "./gold-baseline";

/** Synthetic material: one attached document and pack sources of known sizes in several categories. */
const words = (count: number) => "palavra ".repeat(count).trim();
const source = (id: string, asOfDate: string, wordCount: number) => ({
  id, title: `Fonte sintética ${id}`, url: `https://example.invalid/${id}`, asOfDate, version: "v1", licencePolicy: "public_reusable",
  contentType: "application/pdf", sha256: "c".repeat(64), text: words(wordCount), rendering: "full_text" as const,
});
const material = (): BaselineInformationBase => baselineInformationBaseSchema.parse({
  caseId: "gc01-synthetic", caseVersion: "1.0", language: "pt-BR", asOfDate: "2026-09-04",
  turns: [{id: "gc01-t01", text: "Pedido sintético do primeiro turno."}, {id: "gc01-t02", text: "Pedido sintético do segundo turno."}],
  documents: [{id: "doc-a", title: "Documento sintético", fileName: "a.pdf", sha256: "a".repeat(64), pages: 1, text: words(100)}],
  sources: [
    source("contract-new", "2025-10-01", 900),
    source("contract-old", "2021-10-01", 250),
    source("report", "2026-05-31", 250),
    source("event", "2026-07-14", 250),
    source("contract-mid", "2024-06-01", 600),
    {id: "manual", title: "Consulta manual", url: "https://example.invalid/manual", asOfDate: "2026-09-04", version: "manual", licencePolicy: "manual_only",
      contentType: "manual", sha256: null, text: null, rendering: "not_retained" as const},
  ],
});
const categories: Record<string, BaselineSourceCategory> = {
  "contract-new": "debt_indenture", "contract-old": "debt_indenture", "contract-mid": "debt_indenture", report: "periodic_report", event: "corporate_event", manual: "market_data",
};
const model: BaselineModelSettings = {primary: {provider: "anthropic", model: "claude-opus-5", effort: "high"}, fallback: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}, maxOutputTokens: 100};
/** The request budget of these tests: the fixed part and the three small sources fit, the largest source does not. */
const requestInputTokenBudget = 6_500;

describe("gold baseline selection", () => {
  it("keeps the documents whole and takes sources by category, then most recent first, each whole or as a reference", () => {
    const {base, selection} = selectBaselineInformationBase({base: material(), categories, model, requestInputTokenBudget});
    expect(selection.sources.map((entry) => [entry.id, entry.category, entry.included])).toEqual([
      ["report", "periodic_report", true],
      ["event", "corporate_event", true],
      ["contract-new", "debt_indenture", false],
      ["contract-mid", "debt_indenture", false],
      ["contract-old", "debt_indenture", true],
    ]);
    expect(base.documents).toEqual(material().documents);
    const byId = new Map(base.sources.map((entry) => [entry.id, entry]));
    expect(byId.get("contract-new")).toMatchObject({text: null, rendering: "omitted_for_budget", sha256: "c".repeat(64)});
    expect(byId.get("contract-new")?.note).toMatch(/^Cerca de \d+ tokens estimados; não coube no limite de 6500 tokens estimados por pedido\.$/);
    expect(byId.get("manual")).toEqual(material().sources.find((entry) => entry.id === "manual"));
    const rendered = renderInformationBase(base);
    expect(rendered).toContain("Por limite de tamanho do pedido ao modelo, 2 destas fontes aparecem só com a referência, sem o conteúdo.");
    expect(rendered.match(/Conteúdo não incluído neste pedido por limite de tamanho/g)).toHaveLength(2);
    expect(baselineSelectionCaveat(selection)).toContain("2 de 5 fontes com conteúdo ficaram só com a referência");
  });

  it("fits every request of every turn within the budget and each route's ceiling, earlier deliverables at their allowance", () => {
    const {selection} = selectBaselineInformationBase({base: material(), categories, model, requestInputTokenBudget});
    expect(selection.deliverableAllowanceTokens).toBe(150);
    expect(selection.turns.map((turn) => turn.turnId)).toEqual(["gc01-t01", "gc01-t02"]);
    for (const turn of selection.turns) {
      expect(turn.routes.map((route) => route.model)).toEqual(["claude-opus-5", "gpt-5.6-sol"]);
      for (const route of turn.routes) {
        expect(route.ceilingInputTokens).toBe(requestInputTokenBudget);
        expect(route.estimatedInputTokens).toBeLessThanOrEqual(route.ceilingInputTokens);
      }
    }
    // The second request carries the first deliverable's allowance.
    expect(selection.turns[1]!.routes[0]!.estimatedInputTokens - selection.turns[0]!.routes[0]!.estimatedInputTokens).toBeGreaterThanOrEqual(150);
    const micro = selection.turns.flatMap((turn) => turn.routes).reduce((sum, route) => sum + Math.ceil(route.reservationUsd * 1_000_000), 0);
    expect(selection.maxCostUsd).toBe(Math.ceil(micro / 10_000) / 100);
  });

  it("selects the same base whatever the order of the manifest", () => {
    const shuffled = material();
    shuffled.sources.reverse();
    const first = selectBaselineInformationBase({base: material(), categories, model, requestInputTokenBudget});
    const second = selectBaselineInformationBase({base: shuffled, categories, model, requestInputTokenBudget});
    expect(renderInformationBase(second.base)).toBe(renderInformationBase(first.base));
    expect(second.selection).toEqual(first.selection);
  });

  it("refuses documents that do not fit, a source without a category and an invalid budget", () => {
    expect(() => selectBaselineInformationBase({base: material(), categories, model, requestInputTokenBudget: 1_500})).toThrow("baseline_documents_exceed_request_budget");
    const {report: _report, ...partial} = categories;
    expect(() => selectBaselineInformationBase({base: material(), categories: partial, model, requestInputTokenBudget})).toThrow("baseline_source_uncategorized: report");
    expect(() => selectBaselineInformationBase({base: material(), categories, model, requestInputTokenBudget: 0})).toThrow("baseline_request_budget_invalid");
  });

  it("caps each route by its own input limit and by the room its whole answer needs", () => {
    const plan = planBaselineRequests(material(), {...model, maxOutputTokens: 32_000}, {requestInputTokenBudget: 5_000_000});
    expect(plan.turns[0]!.routes.map((route) => route.ceilingInputTokens)).toEqual([968_000, 922_000]);
  });

  it("plans the reservation the gateway charges: equal for the first turn, an upper bound once a deliverable joins", async () => {
    const {base} = selectBaselineInformationBase({base: material(), categories, model, requestInputTokenBudget});
    const snapshot = baselineGeneralistSnapshotSchema.parse({schemaVersion: "gold-baseline-snapshot.v1", informationBase: base, model, caveats: ["Sintético."]});
    const plan = planBaselineRequests(base, model, {requestInputTokenBudget});
    const charged: GatewayAttempt[] = [];
    const sent: AdapterRequest[] = [];
    const gateway = createModelGateway({
      adapters: {anthropic: {provider: "anthropic", async complete(request) {
        sent.push(request);
        return {output: {deliverable: `Entrega sintética ${sent.length}.`}, rawText: "{}", usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: request.model, stopReason: "end"} satisfies AdapterResponse;
      }}},
      budgetReservation: "conservative_text_v1",
      processingEligibility: async ({attempt}) => { charged.push(attempt); return {allowed: true, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: []}; },
    });
    await runBaselineGeneralist(snapshot, gateway);
    expect(charged.map((attempt) => attempt.reservationUsd)).toEqual(sent.map((request) => conservativeTextReservationUsd("anthropic", request, listPrices)));
    expect(charged[0]!.reservationUsd).toBeCloseTo(plan.turns[0]!.routes[0]!.reservationUsd, 9);
    expect(charged[1]!.reservationUsd).toBeLessThanOrEqual(plan.turns[1]!.routes[0]!.reservationUsd);
  });
});
