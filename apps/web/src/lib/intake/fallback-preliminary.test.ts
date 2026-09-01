import {describe, expect, it} from "vitest";

import type {IntakeCandidatePayload} from "./case";
import {buildFallbackPreliminaryUnderstanding} from "./server";

function candidate(fieldPath: string, value: string): IntakeCandidatePayload {
  return {
    extractor_key: fieldPath,
    source_document_id: "10000000-0000-4000-8000-000000000001",
    field_path: fieldPath,
    field_group: fieldPath.split(".")[0] ?? "company",
    label: fieldPath,
    raw_value: value,
    normalized_value: value,
    value_type: "text",
    unit: null,
    currency: null,
    period_start: null,
    period_end: null,
    information_class: "company_document",
    evidence_rank: 6,
    source_anchor: {page: 1},
    confidence: 0.99,
    extraction_method: "native_text",
    is_primary: true,
  };
}

describe("deterministic preliminary understanding", () => {
  it("uses document facts when the user did not retype the company or operation", () => {
    const result = buildFallbackPreliminaryUnderstanding({
      caseId: "20000000-0000-4000-8000-000000000001",
      session: {
        archetype: "growth_expansion",
        locale: "pt-BR",
        company_profile: {},
        capital_objective: null,
        capital_currency: "BRL",
        capital_urgency: null,
        capital_consequence: null,
        requested_amount: null,
        requested_term_months: null,
        sector: null,
        geography: null,
      },
      candidates: [
        candidate("company.display_name", "Rede Horizonte Supermercados"),
        candidate("company.legal_name", "Rede Horizonte Alimentos S.A."),
        candidate("transaction.purpose", "Expansão regional"),
        candidate("company.state", "SP"),
      ],
      documentCount: 8,
    });

    expect(result.company.name).toBe("Rede Horizonte Supermercados");
    expect(result.company.legalName).toBe("Rede Horizonte Alimentos S.A.");
    expect(result.operation.objective).toBe("Expansão regional");
    expect(result.operation.archetypeLabel).toBe("Crescimento / Expansão");
    expect(result.basis.publicResearch.status).toBe("abstained");
    expect(result.preliminaryAssessment.openPoints).toContain("Confirmar o setor de atuação.");
  });

  it("keeps missing facts open instead of inventing them", () => {
    const result = buildFallbackPreliminaryUnderstanding({
      caseId: "20000000-0000-4000-8000-000000000002",
      session: {
        archetype: "other",
        locale: "en-US",
        company_profile: {},
        capital_objective: null,
        capital_currency: "USD",
        capital_urgency: null,
        capital_consequence: null,
        requested_amount: null,
        requested_term_months: null,
        sector: null,
        geography: null,
      },
      candidates: [],
      documentCount: 1,
    });

    expect(result.company.name).toBe("Company not yet identified");
    expect(result.operation.objective).toBeNull();
    expect(result.preliminaryAssessment.openPoints).toEqual(expect.arrayContaining([
      "Confirm the objective and use of proceeds.",
      "Confirm the indicative amount.",
      "Confirm the operating sector.",
      "Confirm the main operating geography.",
    ]));
  });
});
