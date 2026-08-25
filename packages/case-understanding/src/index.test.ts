import {describe, expect, it} from "vitest";
import type {ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

import {assessReadiness} from "./readiness";
import {auditClaims, financialNumbersIn, normalizeNumber} from "./audit";
import {auditBrief, buildBriefInput, BRIEF_SYSTEM} from "./brief";
import {deriveCaseOutcome} from "./outcome";
import {buildCaseArtifactManifest, sha256} from "./manifest";

describe("the case artifact manifest", () => {
  const versions = {
    parser: "parser-v1",
    ontology: "ontology-v2",
    extractionPrompt: "prompt-ab12",
    modelPolicy: "policy-v1",
    reconciliation: "reconciliation-v1",
    financialCore: "financial-core-v1",
    playbook: "playbook-v2",
    procedureCompiler: "compiler-v1",
    procedureRegistry: "a".repeat(64),
    materialTemplateRegistry: "b".repeat(64),
    marketData: {version: "market-v1", asOf: "2026-08-24T00:00:00.000Z"},
    caseUnderstanding: "case-v2",
    materialCompiler: "materials-v1",
    template: "institutional-v1",
    matching: "mandate-v1",
  };

  const source = {documentId: "doc-1", versionId: "v1", sha256: sha256("document")};

  it("fingerprints the complete lineage independently of input ordering", () => {
    const common = {
      caseId: "case-1",
      runId: "run-1",
      createdAt: "2026-08-24T12:00:00.000Z",
      locale: "pt-BR" as const,
      inputFingerprint: sha256("inputs"),
      capture: {sources: "complete" as const, models: "complete" as const},
      versions,
      sources: [source],
      models: [
        {invocationId: "call-2", task: "write", provider: "anthropic", model: "strong", outcome: "ok" as const, costUsd: 0.1, usage: {inputTokens: 10, outputTokens: 2, cachedInputTokens: 0}, promptFingerprint: sha256("p2"), inputFingerprint: sha256("write-input"), outputFingerprint: sha256("write-output")},
        {invocationId: "call-1", task: "extract", provider: "openai", model: "reader", outcome: "ok" as const, costUsd: 0.2, usage: {inputTokens: 20, outputTokens: 4, cachedInputTokens: 5}, promptFingerprint: sha256("p1"), inputFingerprint: sha256("extract-input"), outputFingerprint: sha256("extract-output")},
      ],
      outputs: [
        {artifactId: "memo", kind: "credit_memo" as const, sha256: sha256("memo")},
        {artifactId: "state", kind: "case_state" as const, sha256: sha256("state")},
      ],
    };
    const first = buildCaseArtifactManifest(common);
    const second = buildCaseArtifactManifest({...common, models: [...common.models].reverse(), outputs: [...common.outputs].reverse()});
    expect(first.manifestFingerprint).toBe(second.manifestFingerprint);
  });

  it("changes the fingerprint when a governing version changes", () => {
    const base = {
      caseId: "case-1",
      runId: "run-1",
      createdAt: "2026-08-24T12:00:00.000Z",
      locale: "pt-BR" as const,
      inputFingerprint: sha256("inputs"),
      capture: {sources: "complete" as const, models: "not_applicable" as const},
      versions,
      sources: [source],
      models: [],
      outputs: [],
    };
    expect(buildCaseArtifactManifest(base).manifestFingerprint).not.toBe(
      buildCaseArtifactManifest({...base, versions: {...versions, playbook: "playbook-v3"}}).manifestFingerprint,
    );
  });

  it("rejects ambiguous duplicate lineage identifiers", () => {
    const base = {
      caseId: "case-1",
      runId: "run-1",
      createdAt: "2026-08-24T12:00:00.000Z",
      locale: "pt-BR" as const,
      inputFingerprint: sha256("inputs"),
      capture: {sources: "complete" as const, models: "not_applicable" as const},
      versions,
      sources: [source, source],
      models: [],
      outputs: [],
    };
    expect(() => buildCaseArtifactManifest(base)).toThrow(/duplicate identifiers/);
  });
});

describe("the operational outcome is not a capital provider credit decision", () => {
  const base = {
    informationSufficient: true,
    materialGapCount: 0,
    analysisComplete: true,
    structureSupportability: "supportable_as_proposed" as const,
    materialsAudit: "pass" as const,
    mandateScreeningComplete: true,
    platformExternalReleaseEnabled: true,
    clientIntroductionAuthorized: true,
    blockers: [],
  };

  it("allows qualified direction only after every independent gate passes", () => {
    expect(deriveCaseOutcome(base)).toMatchObject({
      state: "ready_for_client_authorized_introduction",
      qualifiedIntroductionAllowed: true,
    });

    const releaseDisabled = deriveCaseOutcome({...base, platformExternalReleaseEnabled: false});
    expect(releaseDisabled.state).toBe("alternatives_under_development");
    expect(releaseDisabled.qualifiedIntroductionAllowed).toBe(false);
    expect(releaseDisabled.reasons).toContain("platform_external_release_disabled");

    const clientAuthorizationPending = deriveCaseOutcome({...base, clientIntroductionAuthorized: false});
    expect(clientAuthorizationPending.qualifiedIntroductionAllowed).toBe(false);
    expect(clientAuthorizationPending.reasons).toContain("client_introduction_authorization_pending");
  });

  it("does not turn an incomplete room into a negative credit opinion", () => {
    expect(deriveCaseOutcome({...base, informationSufficient: false, structureSupportability: "not_supported_as_proposed"}).state).toBe("insufficient_information");
  });

  it("keeps gaps, adjusted structures and an unsupported requested configuration distinct", () => {
    expect(deriveCaseOutcome({...base, materialGapCount: 2}).state).toBe("material_information_gaps");
    expect(deriveCaseOutcome({...base, structureSupportability: "supportable_with_adjustments"}).state).toBe("supportable_with_adjustments");
    expect(deriveCaseOutcome({...base, structureSupportability: "not_supported_as_proposed"}).state).toBe("requested_configuration_not_supported");
  });
});

const fact = (fieldPath: string, value: string, over: Partial<ReconciledFact["accepted"]> = {}): ReconciledFact => ({
  key: {fieldPath},
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
    ...over,
  },
  conflicts: [],
  disputed: false,
});

const exception = (severity: ReconciliationException["severity"], ruleId = "R4"): ReconciliationException => ({
  ruleId,
  type: "source_conflict",
  severity,
  title: `regra ${ruleId}`,
  description: "",
  evidence: [],
  ownerRole: "company",
  blocksExternalOutputs: severity === "critical",
});

describe("readiness is five components, not one number", () => {
  const documents = [
    {id: "d1", kind: "audited_financial_statements" as const},
    {id: "d2", kind: "trial_balance" as const},
    {id: "d3", kind: "debt_schedule" as const},
    {id: "d4", kind: "company_registration" as const},
    {id: "d5", kind: "capital_request_letter" as const},
    {id: "d6", kind: "business_plan" as const},
  ];

  it("explains every component in numbers the reader can check", () => {
    const report = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000")],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross", "transaction.requested_amount"],
    });

    expect(report.components).toHaveLength(5);
    for (const component of report.components) {
      expect(component.explanation.pt.length).toBeGreaterThan(20);
      expect(component.explanation.en.length).toBeGreaterThan(20);
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(1);
    }
    expect(report.components.find((c) => c.id === "material_gaps")?.explanation.pt).toContain("1 de 2");
  });

  it("holds the case blocked on a critical exception, whatever the score says", () => {
    const report = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000"), fact("transaction.requested_amount", "38000000")],
      exceptions: [exception("critical", "R14")],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross", "transaction.requested_amount"],
    });

    // A package that is nearly complete with a balance sheet that does not balance is not
    // nearly ready — it is not ready.
    expect(report.state).toBe("blocked");
    expect(report.blockers.map((b) => b.id)).toContain("exception:R14");
  });

  it("blocks on a missing minimum document even with everything else perfect", () => {
    const report = assessReadiness({
      archetypeId: "growth_expansion",
      documents: [{id: "d1", kind: "audited_financial_statements"}],
      facts: [fact("debt.total_gross", "65000000")],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    });
    expect(report.state).toBe("blocked");
    expect(report.blockers.map((b) => b.id)).toContain("minimum_documents");
  });

  it("weighs one critical exception more heavily than several low ones", () => {
    const base = {
      archetypeId: "growth_expansion" as const,
      documents,
      facts: [fact("debt.total_gross", "65000000")],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    };
    const lows = assessReadiness({...base, exceptions: [exception("low"), exception("low"), exception("low")]});
    const critical = assessReadiness({...base, exceptions: [exception("critical")]});
    const score = (report: ReturnType<typeof assessReadiness>) => report.components.find((c) => c.id === "reconciliation")!.score;
    expect(score(critical)).toBeLessThan(score(lows));
  });

  it("rates audited, anchor-verified evidence above a company statement", () => {
    const audited = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000")],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    });
    const hearsay = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000", {evidenceRank: 7, anchorVerified: false, informationClass: "company_document"})],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    });
    const quality = (r: ReturnType<typeof assessReadiness>) => r.components.find((c) => c.id === "evidence_quality")!.score;
    expect(quality(audited)).toBeGreaterThan(quality(hearsay));
    expect(quality(hearsay)).toBe(0);
  });
});

describe("reading numbers out of prose", () => {
  it("finds the magnitudes and ignores what is not one", () => {
    expect(financialNumbersIn("EBITDA de R$ 33,4 milhões em 2025")).toEqual(["33400000"]);
    expect(financialNumbersIn("margem de 18,5% no período")).toEqual([]);
    expect(financialNumbersIn("exercício de 2025")).toEqual([]);
    expect(financialNumbersIn("alavancagem de 2,87x")).toEqual(["2.87"]);
    expect(financialNumbersIn("dívida de R$ 65.000.000")).toEqual(["65000000"]);
  });

  it("reads both Brazilian and international formatting", () => {
    expect(normalizeNumber("1.234.567,89")).toBe("1234567.89");
    expect(normalizeNumber("1,234,567.89")).toBe("1234567.89");
    expect(normalizeNumber("33,4", "milhões")).toBe("33400000");
    expect(normalizeNumber("1,452", "x")).toBe("1.452");
    expect(normalizeNumber("2.8735", "x")).toBe("2.8735");
    expect(financialNumbersIn("DSCR mínimo de 1,452x e alavancagem de 2.8735x")).toEqual(["1.452", "2.8735"]);
  });
});

describe("the evidence auditor", () => {
  const facts = [fact("debt.total_gross", "65000000")];
  const calculations: TracedCalculation[] = [
    {id: "leverage_pre_transaction", labels: {pt: "", en: ""}, value: "1.7788", trace: [], inputs: [], warnings: []},
  ];

  it("accepts a claim whose numbers are in the facts it cites, rounding included", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A dívida bruta é de R$ 65 milhões.", supportIds: ["debt.total_gross"]}],
      facts,
      calculations,
    });
    expect(report.status).toBe("pass");
    expect(report.coverage).toBe(1);
  });

  it("refuses a number that appears nowhere in the support — the citation makes it worse", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A dívida bruta é de R$ 71 milhões.", supportIds: ["debt.total_gross"]}],
      facts,
      calculations,
    });
    expect(report.status).toBe("blocked");
    expect(report.findings[0]?.reason).toBe("number_not_in_support");
  });

  it("refuses a support id that does not exist", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "R$ 65 milhões.", supportIds: ["debt.imaginary"]}],
      facts,
      calculations,
    });
    expect(report.findings[0]?.reason).toBe("support_not_found");
  });

  it("keeps an unverified candidate in the case but refuses it as publication support", () => {
    const unverified = fact("collateral.total_capacity", "57000000", {anchorVerified: false});
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A garantia declarada soma R$ 57 milhões.", supportIds: ["collateral.total_capacity"]}],
      facts: [unverified],
      calculations: [],
    });
    expect(report.status).toBe("blocked");
    expect(report.findings[0]?.reason).toBe("support_anchor_unverified");
  });

  it("refuses a calculation whose lineage reaches an unverified fact", () => {
    const unverified = fact("debt.total_gross", "65000000", {anchorVerified: false});
    const derived: TracedCalculation = {id: "derived_debt", labels: {pt: "", en: ""}, value: "65000000", trace: [], inputs: ["debt.total_gross"], warnings: []};
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "calculation", text: "A dívida derivada é R$ 65 milhões.", supportIds: ["derived_debt"]}],
      facts: [unverified],
      calculations: [derived],
    });
    expect(report.findings[0]?.reason).toBe("support_anchor_unverified");
  });

  it("refuses a material claim with no support at all", () => {
    const report = auditClaims({claims: [{id: "c1", material: true, kind: "fact", text: "R$ 65 milhões.", supportIds: []}], facts, calculations});
    expect(report.findings[0]?.reason).toBe("material_claim_without_support");
  });

  it("refuses a material judgement nobody approved", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "judgment", text: "A alavancagem de 1,7788x é confortável.", supportIds: ["leverage_pre_transaction"]}],
      facts,
      calculations,
    });
    expect(report.findings[0]?.reason).toBe("material_judgment_without_approval");
  });

  it("lets prose that carries no magnitude through, so text stays writable", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A companhia opera três lojas em São Paulo.", supportIds: ["debt.total_gross"]}],
      facts,
      calculations,
    });
    expect(report.status).toBe("pass");
  });

  it("does not parse punctuation in a text fact as a malformed financial number", () => {
    const identity = {...fact("company.legal_name", "Rede Horizonte Alimentos S.A."), valueType: "text" as const};
    const report = auditClaims({
      claims: [{
        id: "identity",
        material: true,
        kind: "fact",
        text: "A tomadora é Rede Horizonte Alimentos S.A.",
        supportIds: ["company.legal_name"],
      }],
      facts: [identity],
      calculations: [],
    });
    expect(report.status).toBe("pass");
  });

  it("does not police a non-material claim", () => {
    const report = auditClaims({claims: [{id: "c1", material: false, kind: "judgment", text: "R$ 999 milhões.", supportIds: []}], facts, calculations});
    expect(report.status).toBe("pass");
  });
});

describe("the case brief", () => {
  const facts = [fact("historical_financials.2025.revenue", "184700000"), fact("debt.total_gross", "65000000")];
  const calculations: TracedCalculation[] = [
    {id: "leverage_pre_transaction", labels: {pt: "", en: ""}, value: "1.7788", trace: [], inputs: ["debt.total_gross"], warnings: []},
  ];

  const brief = (claims: Array<Partial<{text: string; material: boolean; kind: string; supportIds: string[]}>>) => ({
    executiveSummary: "resumo",
    sections: [
      {
        id: "history" as const,
        heading: "Histórico",
        claims: claims.map((claim, index) => ({
          id: `c${index}`,
          text: claim.text ?? "",
          material: claim.material ?? true,
          kind: (claim.kind ?? "fact") as "fact" | "calculation" | "judgment" | "public_source",
          supportIds: claim.supportIds ?? [],
        })),
      },
    ],
  });

  it("passes a brief whose every figure is in the facts it cites", () => {
    const outcome = auditBrief({
      brief: brief([{text: "Receita líquida de R$ 184,7 milhões em 2025.", supportIds: ["historical_financials.2025.revenue"]}]),
      facts,
      calculations,
    });
    expect(outcome.ok).toBe(true);
  });

  it("refuses the whole brief when one sentence carries a number nobody stated", () => {
    // A brief that is 95% sourced is not 95% publishable: the unsourced sentence is the one a
    // committee would act on and the one nobody could defend.
    const outcome = auditBrief({
      brief: brief([
        {text: "Receita líquida de R$ 184,7 milhões em 2025.", supportIds: ["historical_financials.2025.revenue"]},
        {text: "O EBITDA ajustado foi de R$ 41,2 milhões.", supportIds: ["historical_financials.2025.revenue"]},
      ]),
      facts,
      calculations,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.audit.findings[0]?.reason).toBe("number_not_in_support");
  });

  it("holds a judgement as a proposal until a person approves it", () => {
    const outcome = auditBrief({
      brief: brief([{text: "A alavancagem de 1,7788x é confortável para o setor.", kind: "judgment", supportIds: ["leverage_pre_transaction"]}]),
      facts,
      calculations,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.audit.findings[0]?.reason).toBe("material_judgment_without_approval");
  });

  it("hands the model the facts and the desk's questions, never the raw data room", () => {
    const payload = buildBriefInput({
      archetypeId: "growth_expansion",
      facts,
      calculations,
      exceptions: [exception("high", "R4")],
      gaps: [{id: "g1", severity: "high", title: "Laudo", description: "porque importa", ownerRole: "company", reference: "appraisal"}],
      locale: "pt",
    });

    expect(payload).toContain("historical_financials.2025.revenue");
    expect(payload).toContain("leverage_pre_transaction");
    expect(payload).toContain("Credibilidade do ramp-up");
    expect(payload).toContain("[high] R4");
    expect(payload).toContain("Laudo");
    // The rule the whole design rests on, restated where the model reads it.
    expect(payload).toContain("os únicos números que você pode usar");
  });

  it("marks a disputed fact as disputed, so the brief can say so", () => {
    const disputed: ReconciledFact = {
      ...fact("debt.total_gross", "65000000"),
      disputed: true,
      conflicts: [{candidate: {...fact("debt.total_gross", "68000000").accepted, sourceDocument: "mapa.xlsx"}, relativeDelta: "0.046"}],
    };
    const payload = buildBriefInput({archetypeId: "growth_expansion", facts: [disputed], calculations: [], exceptions: [], gaps: [], locale: "pt"});
    expect(payload).toContain("DISPUTADO");
    expect(payload).toContain("68000000");
  });

  it("forbids computing, in the instructions the model actually receives", () => {
    expect(BRIEF_SYSTEM).toContain("You never produce a number");
    expect(BRIEF_SYSTEM).toContain("qualified introduction");
  });
});
