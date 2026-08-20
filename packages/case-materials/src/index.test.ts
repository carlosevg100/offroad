import {describe, expect, it} from "vitest";
import type {CaseBrief, ReadinessReport} from "@offroad/case-understanding";
import type {ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

import {compileMaterials, isStale} from "./index";

const fact = (fieldPath: string, value: string, periodEnd?: string): ReconciledFact => ({
  key: {fieldPath, ...(periodEnd ? {periodEnd} : {})},
  value,
  valueType: "number",
  accepted: {
    fieldPath,
    normalizedValue: value,
    valueType: "number",
    sourceDocument: "df.pdf",
    evidenceRank: 1,
    informationClass: "audited",
    confidence: 0.95,
    anchorVerified: true,
    ...(periodEnd ? {periodEnd} : {}),
  },
  conflicts: [],
  disputed: false,
});

const calculations: TracedCalculation[] = [
  {id: "adjusted_ebitda", labels: {pt: "EBITDA ajustado", en: "Adjusted EBITDA"}, value: "33000000", trace: [], inputs: ["historical_financials.2025.ebitda"], warnings: []},
  {id: "leverage_pre_transaction", labels: {pt: "Alavancagem", en: "Leverage"}, value: "1.7788", trace: [], inputs: ["calculated.net_debt"], warnings: []},
];

const facts = [
  fact("historical_financials.2025.revenue", "184700000", "2025-12-31"),
  fact("historical_financials.2025.ebitda", "30400000", "2025-12-31"),
];

const brief: CaseBrief = {
  executiveSummary: "A companhia opera no varejo alimentar e busca capital para expansão.",
  sections: [
    {
      id: "history",
      heading: "Histórico",
      claims: [{id: "c1", text: "Receita líquida de R$ 184,7 milhões em 2025.", material: true, kind: "fact", supportIds: ["historical_financials.2025.revenue"]}],
    },
  ],
};

const readiness: ReadinessReport = {state: "in_progress", score: 0.7, components: [], blockers: []};

const exception = (severity: ReconciliationException["severity"], blocks: boolean): ReconciliationException => ({
  ruleId: "R14",
  type: "validation",
  severity,
  title: "escala inconsistente",
  description: "as duas linhas estão em escalas diferentes",
  evidence: [],
  ownerRole: "internal_analyst",
  blocksExternalOutputs: blocks,
});

describe("materials are compiled, and refused when they should be", () => {
  it("produces the three documents a debt process needs", () => {
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [], readiness});
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.materials.map((material) => material.kind)).toEqual(["teaser", "credit_profile", "package"]);
  });

  it("refuses everything while a critical exception is open", () => {
    // A case whose numbers do not reconcile should not reach an investor with a nice cover.
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [exception("critical", true)], readiness});
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("blocked_by_exception");
    expect(outcome.detail[0]).toContain("R14");
  });

  it("refuses when a sentence carries a number nobody stated", () => {
    const outcome = compileMaterials({
      brief: {...brief, sections: [{...brief.sections[0]!, claims: [{id: "c1", text: "Receita de R$ 220 milhões.", material: true, kind: "fact", supportIds: ["historical_financials.2025.revenue"]}]}]},
      facts,
      calculations,
      exceptions: [],
      readiness,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("audit_failed");
  });

  it("keeps the company anonymous until disclosure is authorised", () => {
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [], readiness});
    if (!outcome.ok) return;
    const teaser = outcome.materials.find((material) => material.kind === "teaser")!;
    expect(teaser.title.pt).toBe("Oportunidade de crédito privado");

    const named = compileMaterials({brief, facts, calculations, exceptions: [], readiness, companyName: "Rede Horizonte"});
    if (!named.ok) return;
    expect(named.materials[0]?.title.pt).toContain("Rede Horizonte");
  });

  it("carries identical economics in both languages", () => {
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [], readiness});
    if (!outcome.ok) return;
    for (const material of outcome.materials) {
      for (const block of material.blocks) {
        if (block.type !== "metrics") continue;
        for (const item of block.items) {
          // Formatting differs by locale; the number behind it never does.
          expect(item.formatted.pt.replace(/[^\d]/g, "")).toBe(item.formatted.en.replace(/[^\d]/g, ""));
        }
      }
    }
  });

  it("points every metric at the calculation and its inputs", () => {
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [], readiness});
    if (!outcome.ok) return;
    const teaser = outcome.materials[0]!;
    const metrics = teaser.blocks.find((block) => block.type === "metrics");
    expect(metrics && metrics.type === "metrics" && metrics.items[0]?.supportIds).toContain("adjusted_ebitda");
    expect(metrics && metrics.type === "metrics" && metrics.items[0]?.supportIds).toContain("historical_financials.2025.ebitda");
  });

  it("puts the open questions in the document instead of leaving them to be found", () => {
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [exception("medium", false)], readiness});
    if (!outcome.ok) return;
    const profile = outcome.materials.find((material) => material.kind === "credit_profile")!;
    const list = profile.blocks.find((block) => block.type === "list");
    expect(list && list.type === "list" && list.items[0]?.pt).toContain("escalas diferentes");
  });

  it("carries the disclaimer in every document, in both languages", () => {
    const outcome = compileMaterials({brief, facts, calculations, exceptions: [], readiness});
    if (!outcome.ok) return;
    for (const material of outcome.materials) {
      const disclaimer = material.blocks.find((block) => block.type === "disclaimer");
      expect(disclaimer && disclaimer.type === "disclaimer" && disclaimer.text.pt).toContain("Não constitui oferta");
      expect(disclaimer && disclaimer.type === "disclaimer" && disclaimer.text.en).toContain("not an offer");
    }
  });
});

describe("staleness", () => {
  const material = {kind: "teaser" as const, title: {pt: "", en: ""}, blocks: [], dependsOn: ["adjusted_ebitda"]};

  it("says a document is stale when a fact behind it moved", () => {
    // Silently regenerating would be worse: someone may already have sent the old one.
    expect(isStale(material, new Map([["adjusted_ebitda", "34000000"]]), new Map([["adjusted_ebitda", "33000000"]]))).toBe(true);
  });

  it("is not fooled by formatting", () => {
    expect(isStale(material, new Map([["adjusted_ebitda", "33000000.00"]]), new Map([["adjusted_ebitda", "33000000"]]))).toBe(false);
  });

  it("treats a dependency that disappeared as stale", () => {
    expect(isStale(material, new Map(), new Map([["adjusted_ebitda", "33000000"]]))).toBe(true);
  });
});
