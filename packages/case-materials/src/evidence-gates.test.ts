import {compileAuthoredBrief, type CaseBrief, type ReadinessReport} from "@offroad/case-understanding";
import type {ReconciledFact} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";

import {auditCompiledMaterial, buildMaterialTruthSet, compileMaterials, type Material} from "./index";

/**
 * Where case-materials relied on the semantics of the retired evidence-compiler package: the two
 * claim gates, now called from case-understanding's audit (through `auditBrief` for the brief and
 * directly in the material truth), and the bilingual economic identity, which the conduct audit
 * enforces as LC-07.
 */
const revenue: ReconciledFact = {
  key: {fieldPath: "historical_financials.2025.revenue", periodEnd: "2025-12-31"}, value: "184700000", valueType: "number",
  accepted: {fieldPath: "historical_financials.2025.revenue", normalizedValue: "184700000", valueType: "number", sourceDocument: "df.pdf",
    evidenceRank: 1, informationClass: "audited", confidence: 0.95, anchorVerified: true, periodEnd: "2025-12-31"},
  conflicts: [], disputed: false,
};
const readiness: ReadinessReport = {state: "in_progress", score: 0.7, components: [], blockers: []};
const briefWith = (claim: CaseBrief["sections"][number]["claims"][number]): CaseBrief => compileAuthoredBrief({sections: [{id: "history", heading: "Histórico", claims: [claim]}], executiveSummaryClaimIds: [claim.id]});

describe("the evidence gates case-materials calls", () => {
  it("refuses a brief whose material claim has no support, with the audit's code", () => {
    const outcome = compileMaterials({brief: briefWith({id: "c1", text: "Receita líquida de R$ 184,7 milhões em 2025.", material: true, kind: "fact", supportIds: []}), facts: [revenue], calculations: [], exceptions: [], readiness});
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail.join(" ")).toContain("c1: material_claim_without_support");
  });

  it("refuses a material judgment until it is approved, and compiles it once approved", () => {
    const judgment = {id: "j1", text: "A receita sustenta a operação proposta.", material: true, kind: "judgment" as const, supportIds: ["historical_financials.2025.revenue"]};
    const refused = compileMaterials({brief: briefWith(judgment), facts: [revenue], calculations: [], exceptions: [], readiness});
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.detail.join(" ")).toContain("j1: material_judgment_without_approval");
    expect(compileMaterials({brief: briefWith(judgment), facts: [revenue], calculations: [], exceptions: [], readiness, approvedJudgmentIds: ["j1"]}).ok).toBe(true);
  });

  it("blocks a compiled block that claims without support in the material truth", () => {
    const material: Material = {kind: "teaser", title: {pt: "Oportunidade", en: "Opportunity"}, dependsOn: [], blocks: [
      {type: "paragraph", text: {pt: "Receita de R$ 10 milhões.", en: "Revenue of BRL 10 million."}, material: true, claimKind: "fact"},
      {type: "disclaimer", text: {pt: "Material indicativo.", en: "Indicative material."}},
    ]};
    const truth = buildMaterialTruthSet({materials: [material], dataRoom: {entries: [], folders: [], counts: {ready: 0, held: 0, requested: 0}, releasable: true}, financialModel: null});
    expect(truth.artifacts[0]?.unsupportedMaterialClaims).toEqual(["teaser:0"]);
    expect(truth.exceptions.map((exception) => exception.id)).toContain("unsupported-claims:teaser");
  });

  it("keeps the two languages economically identical: the same figures in another order pass, another figure is blocked", () => {
    const material = (en: string): Material => ({kind: "teaser", title: {pt: "Oportunidade", en: "Opportunity"}, dependsOn: ["calc"], blocks: [
      {type: "paragraph", text: {pt: "Dívida de R$ 54 milhões e DSCR de 1,74x.", en}, claimId: "c", supportIds: ["calc"]},
    ]});
    expect(auditCompiledMaterial(material("DSCR of 1.74x and debt of BRL 54 million.")).status).toBe("pass");
    const divergent = auditCompiledMaterial(material("Debt of BRL 55 million and DSCR of 1.74x."));
    expect(divergent.status).toBe("blocked");
    expect(divergent.findings).toContainEqual(expect.objectContaining({ruleId: "LC-07", code: "bilingual_economic_divergence"}));
  });
});
