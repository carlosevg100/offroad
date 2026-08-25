import {describe, expect, it} from "vitest";

import {advisoryDisclaimerId, auditConduct, type ConductAuditInput} from "./conduct-policy";

const fingerprint = "a".repeat(64);

const base = (): ConductAuditInput => ({
  artifactId: "memo-v1",
  channel: "external_material",
  claims: [{
    id: "claim-1",
    text: "Em 31/12/2025, a dívida líquida era de R$ 182,4 milhões.",
    kind: "calculation",
    material: true,
    supportIds: ["calc.net_debt.2025"],
  }],
  bilingualStatements: [{
    id: "metric-1",
    pt: "Dívida líquida de R$ 182,4 milhões e alavancagem de 2,7x.",
    en: "Net debt of BRL 182.4 million and leverage of 2.7x.",
  }],
  sourceOrganizationId: "org-1",
  targetOrganizationId: "org-1",
  sourceCaseId: "case-1",
  targetCaseId: "case-1",
  recipientAuthorized: true,
  disclaimerId: advisoryDisclaimerId,
  conflictStatus: "clear",
  riskSectionPosition: 2,
  promotionalSectionPosition: 3,
  knowledgeState: "known",
});

describe("House Playbook language and conduct gate", () => {
  it("passes a supported, authorized and economically identical external material", () => {
    const audit = auditConduct(base());
    expect(audit.status).toBe("pass");
    expect(audit.findings).toEqual([]);
    expect(audit.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("blocks unsupported claims, outcome promises and unapproved judgments", () => {
    const audit = auditConduct({
      ...base(),
      claims: [
        {id: "unsupported", text: "A companhia tem posição sólida.", kind: "fact", material: true, supportIds: []},
        {id: "promise", text: "O financiamento está aprovado.", kind: "fact", material: true, supportIds: ["email-1"]},
        {id: "judgment", text: "A estrutura é suportável.", kind: "judgment", material: true, supportIds: ["calc-1"]},
      ],
    });
    expect(audit.status).toBe("blocked");
    expect(audit.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "material_claim_without_support",
      "unbased_material_qualifier",
      "outcome_promise",
      "judgment_without_exact_approval",
    ]));
  });

  it("accepts a material judgment only with exact approval and a based qualifier", () => {
    const audit = auditConduct({
      ...base(),
      claims: [{
        id: "judgment",
        text: "A posição de liquidez é sólida segundo o cenário base.",
        kind: "judgment",
        material: true,
        supportIds: ["calc.liquidity"],
        qualifierBasis: ["caixa cobre 18 meses de serviço da dívida"],
        approvedFingerprint: fingerprint,
      }],
    });
    expect(audit.status).toBe("pass");
  });

  it("blocks bilingual economic drift even when the prose is fluent", () => {
    const audit = auditConduct({
      ...base(),
      bilingualStatements: [{id: "drift", pt: "Prazo de 48 meses.", en: "A 60-month tenor."}],
    });
    expect(audit.status).toBe("blocked");
    expect(audit.findings).toContainEqual(expect.objectContaining({ruleId: "LC-07", code: "bilingual_economic_divergence"}));
  });

  it("blocks the confidentiality, authorization, disclaimer and conflict boundaries", () => {
    const {disclaimerId: _disclaimerId, ...withoutDisclaimer} = base();
    const audit = auditConduct({
      ...withoutDisclaimer,
      targetOrganizationId: "org-2",
      targetCaseId: "case-2",
      recipientAuthorized: false,
      conflictStatus: "unresolved",
    });
    expect(audit.status).toBe("blocked");
    expect(audit.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "cross_case_disclosure",
      "recipient_not_authorized",
      "missing_advisory_disclaimer",
      "unresolved_conflict",
    ]));
  });

  it("requires written records, absolute dates and attributed diligence surprises", () => {
    const audit = auditConduct({
      ...base(),
      channel: "external_communication",
      hasMaterialCommitment: true,
      knowledgeState: "partially_known",
      claims: [{id: "relative", text: "Recentemente a estrutura melhorou — retorno em breve.", kind: "fact", material: false, supportIds: []}],
      diligenceSurprises: [{id: "surprise-1", description: "Garantia já estava onerada."}],
    });
    expect(audit.status).toBe("blocked");
    expect(audit.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "material_commitment_not_recorded",
      "unknown_without_due_date",
      "unattributed_diligence_surprise",
      "relative_date",
      "em_dash",
    ]));
  });

  it("does not require an external disclaimer on an internal work product", () => {
    const {disclaimerId: _disclaimerId, ...withoutDisclaimer} = base();
    const audit = auditConduct({...withoutDisclaimer, channel: "internal_material"});
    expect(audit.findings.some((finding) => finding.code === "missing_advisory_disclaimer")).toBe(false);
  });
});
