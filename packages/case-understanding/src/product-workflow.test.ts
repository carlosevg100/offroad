import {describe, expect, it} from "vitest";

import {
  assertProductStateTransition,
  assessUnderstandingGate,
  buildClarificationBatch,
  buildUnderstandingSnapshot,
  diffUnderstandingSnapshots,
  findingsFromUnderstanding,
  offroadProductBoundary,
  productPhaseForState,
  productPhaseOrder,
  understandingClaimSchema,
  type UnderstandingClaim,
} from "./product-workflow";

const hash = (character: string) => character.repeat(64);
const text = (pt: string, en = pt) => ({pt, en});

function claim(overrides: Partial<UnderstandingClaim> & Pick<UnderstandingClaim, "id" | "classification">): UnderstandingClaim {
  const {id, classification, ...rest} = overrides;
  const base: UnderstandingClaim = {
    id,
    domain: "company",
    label: text(overrides.id),
    statement: text(`statement ${overrides.id}`),
    classification,
    materiality: "medium",
    decisionImpact: "understanding",
    supports: [],
    dependsOnClaimIds: [],
    ...rest,
  };
  return understandingClaimSchema.parse(base);
}

function snapshot(claims: UnderstandingClaim[], sequence = 1, supersedesFingerprint: string | null = null) {
  return buildUnderstandingSnapshot({
    version: "2026.08.29-v1",
    caseFingerprint: hash("a"),
    sequence,
    createdAt: `2026-08-29T10:00:0${sequence}Z`,
    sourceFingerprint: hash(String(sequence)),
    supersedesFingerprint,
    summary: text("Entendimento preliminar", "Preliminary understanding"),
    claims,
  });
}

describe("canonical product workflow", () => {
  it("allows explicit progress and returns but rejects skipped decisions", () => {
    expect(() => assertProductStateTransition("understanding_in_progress", "clarification_required")).not.toThrow();
    expect(() => assertProductStateTransition("clarification_required", "structuring_ready")).not.toThrow();
    expect(() => assertProductStateTransition("package_approved", "matching_in_progress")).not.toThrow();
    expect(() => assertProductStateTransition("introduced", "feedback_capture_in_progress")).not.toThrow();
    expect(() => assertProductStateTransition("feedback_capture_in_progress", "matching_in_progress")).not.toThrow();
    expect(() => assertProductStateTransition("guided_intake_in_progress", "materials_in_progress")).toThrow(
      "invalid product workflow transition",
    );
  });

  it("exposes the seven stable product phases without lender execution inside Offroad", () => {
    expect(productPhaseOrder).toEqual([
      "understand",
      "diagnose",
      "structure",
      "prepare",
      "match",
      "introduce",
      "capture_feedback",
    ]);
    expect(productPhaseForState("clarification_required")).toBe("diagnose");
    expect(productPhaseForState("company_review_required")).toBe("prepare");
    expect(productPhaseForState("feedback_capture_in_progress")).toBe("capture_feedback");
    expect(offroadProductBoundary.offroadPerforms).not.toContain("underwriting");
    expect(offroadProductBoundary.offroadPerforms).not.toContain("funding");
    expect(offroadProductBoundary.lenderPerforms).toContain("underwriting");
    expect(offroadProductBoundary.lenderPerforms).toContain("funding");
  });
});

describe("understanding claims", () => {
  it("does not let evidence classifications become decorative", () => {
    expect(() => claim({id: "company.revenue", classification: "confirmed"})).toThrow("confirmed assertions require support");
    expect(() => claim({
      id: "company.revenue",
      classification: "confirmed",
      supports: [{id: "doc:financials:revenue", kind: "evidence"}],
    })).not.toThrow();
    expect(() => claim({id: "financials.ebitda", classification: "calculated"})).toThrow("calculated assertions require a calculation id");
    expect(() => claim({id: "debt.balance", classification: "divergent"})).toThrow("divergent assertions require at least two sources");
  });

  it("requires an identified person for declarations", () => {
    expect(() => claim({id: "project.opening_date", classification: "declared"})).toThrow("identified declarant");
    expect(() => claim({id: "project.opening_date", classification: "declared", declaredBy: "company:cfo"})).not.toThrow();
  });

  it("builds the same fingerprint regardless of claim order", () => {
    const a = claim({
      id: "company.name",
      classification: "confirmed",
      supports: [{id: "doc:corporate", kind: "evidence"}],
    });
    const b = claim({id: "project.purpose", classification: "declared", declaredBy: "company:cfo"});
    expect(snapshot([a, b]).fingerprint).toBe(snapshot([b, a]).fingerprint);
  });
});

describe("findings and clarification", () => {
  const claims = [
    claim({
      id: "debt.balance",
      domain: "debt",
      classification: "divergent",
      materiality: "critical",
      decisionImpact: "transaction_blocker",
      supports: [{id: "doc:balance_sheet", kind: "evidence"}, {id: "doc:debt_schedule", kind: "evidence"}],
      discrepancyGroupId: "debt-closing-balance",
      impact: text("A dívida de abertura da operação não está definida."),
      nextAction: text("Confirmar o saldo correto e enviar a ponte."),
    }),
    claim({
      id: "project.capex_schedule",
      domain: "project",
      classification: "absent",
      materiality: "high",
      decisionImpact: "structure_or_sizing",
      impact: text("Sem o cronograma não é possível casar desembolsos."),
      nextAction: text("Enviar o cronograma físico-financeiro ou informar os marcos."),
    }),
    claim({
      id: "company.market_share",
      domain: "sector",
      classification: "assumption",
      materiality: "low",
      decisionImpact: "material_production",
      rationale: text("Estimativa preliminar baseada em fonte pública."),
      impact: text("A estimativa precisa permanecer identificada no material."),
      nextAction: text("Confirmar se existe estudo interno mais recente."),
    }),
    claim({id: "project.opening_date", domain: "project", classification: "declared", declaredBy: "company:cfo"}),
    claim({id: "company.founded_at", classification: "declared", declaredBy: "company:ceo"}),
    claim({id: "company.employees", classification: "declared", declaredBy: "company:hr"}),
  ];

  it("orders findings by decision impact and limits the active batch to five", () => {
    const current = snapshot(claims);
    const findings = findingsFromUnderstanding(current);
    expect(findings[0]).toMatchObject({claimId: "debt.balance", priority: "transaction_blocker"});
    expect(findings[1]).toMatchObject({claimId: "project.capex_schedule", priority: "structure_or_sizing"});
    const batch = buildClarificationBatch(current);
    expect(batch.items).toHaveLength(5);
    expect(batch.backlogFindingIds).toHaveLength(1);
  });

  it("makes gate sufficiency an explicit requirement contract", () => {
    const current = snapshot(claims);
    const blocked = assessUnderstandingGate(current, [
      {id: "debt", claimId: "debt.balance", description: text("Saldo de dívida"), acceptedClassifications: ["confirmed", "calculated"]},
      {id: "purpose", claimId: "project.opening_date", description: text("Data pretendida"), acceptedClassifications: ["declared", "confirmed"]},
    ]);
    expect(blocked).toMatchObject({status: "blocked", blockerClaimIds: ["debt.balance"], satisfiedRequirementIds: ["purpose"]});
  });
});

describe("incremental invalidation", () => {
  it("invalidates only a changed claim and its transitive dependants", () => {
    const initialDebt = claim({id: "debt.balance", domain: "debt", classification: "declared", declaredBy: "company:cfo"});
    const leverage = claim({
      id: "financials.leverage",
      domain: "financials",
      classification: "calculated",
      calculationId: "calc:leverage",
      supports: [{id: "calc:leverage", kind: "calculation"}],
      dependsOnClaimIds: ["debt.balance"],
    });
    const structure = claim({
      id: "operation.max_size",
      domain: "operation",
      classification: "calculated",
      calculationId: "calc:max-size",
      supports: [{id: "calc:max-size", kind: "calculation"}],
      dependsOnClaimIds: ["financials.leverage"],
    });
    const companyName = claim({
      id: "company.name",
      classification: "confirmed",
      supports: [{id: "doc:corporate", kind: "evidence"}],
    });
    const before = snapshot([initialDebt, leverage, structure, companyName]);
    const after = snapshot([
      claim({
        id: "debt.balance",
        domain: "debt",
        classification: "confirmed",
        supports: [{id: "doc:debt-schedule", kind: "evidence"}],
      }),
      leverage,
      structure,
      companyName,
    ], 2, before.fingerprint);
    expect(diffUnderstandingSnapshots(before, after)).toEqual({
      changedClaimIds: ["debt.balance"],
      impactedClaimIds: ["debt.balance", "financials.leverage", "operation.max_size"],
      impactedDomains: ["debt", "financials", "operation"],
    });
  });
});
