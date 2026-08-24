import {describe, expect, it} from "vitest";
import type {CaseBrief} from "./brief";
import {auditClaims} from "./audit";
import {affectedBySupportChanges, buildClaimRegistry, claimFingerprint} from "./claim-registry";
import {normalizeSemanticAudit, supportedSemanticAudit} from "./semantic-audit";

const brief: CaseBrief = {
  executiveSummary: "A companhia busca crédito privado para financiar seu projeto.",
  sections: [{
    id: "request",
    heading: "Operação",
    claims: [
      {id: "amount", text: "O pedido é de R$ 40 milhões.", kind: "fact", material: true, supportIds: ["transaction.requested_amount"]},
      {id: "assessment", text: "A estrutura é adequada ao perfil da companhia.", kind: "judgment", material: true, supportIds: ["leverage_post_transaction"]},
    ],
  }],
};

const numeric = (approved = false) => auditClaims({
  claims: brief.sections[0]!.claims.map((claim) => ({...claim, approved: claim.id === "assessment" && approved})),
  facts: [{
    key: {fieldPath: "transaction.requested_amount"},
    value: "40000000",
    valueType: "number",
    accepted: {fieldPath: "transaction.requested_amount", normalizedValue: "40000000", valueType: "number", sourceDocument: "request.pdf", evidenceRank: 2, informationClass: "company_statement", confidence: 0.99, anchorVerified: true},
    conflicts: [],
    disputed: false,
  }],
  calculations: [{id: "leverage_post_transaction", labels: {pt: "", en: ""}, value: "2.8", trace: [], inputs: ["transaction.requested_amount"], warnings: []}],
  requireJudgmentApproval: approved,
});

describe("claim registry", () => {
  it("blocks publication until a material judgment has a current approval", () => {
    const semantic = normalizeSemanticAudit(brief, supportedSemanticAudit(brief));
    const proposed = brief.sections[0]!.claims[1]!;
    const pending = buildClaimRegistry({brief, numericAudit: numeric(), semanticAudit: semantic});
    expect(pending.publication.allowed).toBe(false);
    expect(pending.claims.find((claim) => claim.id === "assessment")?.status).toBe("pending_approval");

    const approved = buildClaimRegistry({
      brief,
      numericAudit: numeric(true),
      semanticAudit: semantic,
      decisions: [{
        claimId: "assessment",
        decision: "approved",
        claimFingerprint: claimFingerprint(proposed),
        decidedBy: "analyst-1",
        decidedAt: "2026-08-24T12:00:00.000Z",
      }],
    });
    expect(approved.publication.allowed).toBe(true);
    expect(approved.claims.find((claim) => claim.id === "assessment")?.status).toBe("verified");
  });

  it("marks a prior decision stale when the claim changes", () => {
    const semantic = normalizeSemanticAudit(brief, supportedSemanticAudit(brief));
    const registry = buildClaimRegistry({
      brief,
      numericAudit: numeric(true),
      semanticAudit: semantic,
      decisions: [{
        claimId: "assessment",
        decision: "approved",
        claimFingerprint: "old-fingerprint",
        decidedBy: "analyst-1",
        decidedAt: "2026-08-24T12:00:00.000Z",
      }],
    });
    expect(registry.claims.find((claim) => claim.id === "assessment")?.status).toBe("stale");
    expect(registry.publication.allowed).toBe(false);
  });

  it("finds every claim and artifact affected by a changed fact", () => {
    const semantic = normalizeSemanticAudit(brief, supportedSemanticAudit(brief));
    const registry = buildClaimRegistry({
      brief,
      numericAudit: numeric(true),
      semanticAudit: semantic,
      artifacts: [{artifactId: "credit_profile", claimIds: ["amount"], supportIds: []}],
      decisions: [{
        claimId: "assessment",
        decision: "approved",
        claimFingerprint: claimFingerprint(brief.sections[0]!.claims[1]!),
        decidedBy: "analyst-1",
        decidedAt: "2026-08-24T12:00:00.000Z",
      }],
    });
    expect(affectedBySupportChanges(registry, ["transaction.requested_amount"])).toEqual({claimIds: ["amount"], artifactIds: ["credit_profile"]});
  });

  it("fails closed when the independent verifier omits a material claim", () => {
    const semantic = normalizeSemanticAudit(brief, {reviews: [{claimId: "amount", verdict: "supported", reasons: [], explanation: "suportada"}]});
    expect(semantic.status).toBe("blocked");
    expect(semantic.findings).toContainEqual(expect.objectContaining({claimId: "assessment", reason: "review_missing"}));
  });

  it("blocks a material claim rejected for semantic overstatement even when its number is correct", () => {
    const semantic = normalizeSemanticAudit(brief, {
      reviews: [
        {claimId: "amount", verdict: "supported", reasons: [], explanation: "suportada"},
        {claimId: "assessment", verdict: "blocked", reasons: ["overstates_certainty"], explanation: "A evidência não sustenta conclusão definitiva."},
      ],
    });
    const registry = buildClaimRegistry({brief, numericAudit: numeric(true), semanticAudit: semantic});
    expect(registry.publication.allowed).toBe(false);
    expect(registry.claims.find((claim) => claim.id === "assessment")?.blockedBy).toContain("semantic:overstates_certainty");
  });
});
