import {buildRedeHorizonteDocumentIntake, redeHorizonteFileHashes, redeHorizonteRequiredFiles} from "@offroad/testing-fixtures";
import {describe, expect, it} from "vitest";

import {buildCandidatePayload, buildIssuePayload, buildOpportunityTitle, confirmedCandidates, deriveCase, OPPORTUNITY_TITLE_MAX, summarizeCompilation} from "./case";
import type {IntakeCandidate} from "./types";

const scope = {organizationId: "org-1", sessionId: "session-1", userId: "user-1"};

const fullDocumentSet = redeHorizonteRequiredFiles.map((name, index) => ({id: `doc-${index}`, original_name: name, sha256: redeHorizonteFileHashes[name]}));

function candidate(overrides: Partial<IntakeCandidate>): IntakeCandidate {
  return {
    id: "c", organization_id: scope.organizationId, intake_session_id: scope.sessionId, source_document_id: "doc-0", extractor_key: "k",
    field_path: "company.legal_name", field_group: "company", label: "Razão social", raw_value: "raw", normalized_value: "value",
    value_type: "text", unit: null, currency: null, period_start: null, period_end: null, information_class: "company_document",
    evidence_rank: 6, source_anchor: {page: 1}, confidence: 0.99, extraction_method: "native_text", is_primary: true,
    review_state: "accepted", reviewer_comment: null, reviewed_by: null, reviewed_at: null, created_by: scope.userId,
    created_at: "2026-08-18T00:00:00Z", updated_at: "2026-08-18T00:00:00Z",
    ...overrides,
  } as IntakeCandidate;
}

describe("intake payloads", () => {
  it("maps every fixture candidate and issue to the RPC payload without tenant fields", () => {
    const compilation = buildRedeHorizonteDocumentIntake(fullDocumentSet);
    const candidates = buildCandidatePayload(compilation);
    expect(candidates).toHaveLength(compilation.candidates.length);
    expect(candidates.find((row) => row.extractor_key === "requested")).toMatchObject({normalized_value: 54_000_000, source_document_id: "doc-1", currency: "BRL", is_primary: true});
    expect(candidates.every((row) => !("organization_id" in row) && !("created_by" in row))).toBe(true);

    const issues = buildIssuePayload(compilation);
    expect(issues).toHaveLength(compilation.issues.length);
    const conflict = issues.find((issue) => issue.issue_type === "conflict");
    expect(conflict?.candidate_keys).toEqual(["project-letter", "project-plan"]);
    expect(summarizeCompilation(compilation, {documents: 8, candidates: candidates.length, issues: issues.length})).toMatchObject({fixture_matched: true, missing_files: [], documents: 8});
  });

  it("keeps unknown document sets free of candidates", () => {
    const compilation = buildRedeHorizonteDocumentIntake([{id: "x", original_name: "balancete.xlsx", sha256: "f".repeat(64)}]);
    expect(buildCandidatePayload(compilation)).toHaveLength(0);
    expect(buildIssuePayload(compilation)).toHaveLength(1);
    expect(buildIssuePayload(compilation)[0]?.candidate_keys).toEqual([]);
  });
});

describe("deriveCase", () => {
  it("returns null until legal name, purpose and a positive amount are confirmed", () => {
    expect(deriveCase([])).toBeNull();
    expect(deriveCase([
      candidate({field_path: "company.legal_name", normalized_value: "Empresa X"}),
      candidate({field_path: "transaction.purpose", normalized_value: "Expansão"}),
    ])).toBeNull();
    expect(deriveCase([
      candidate({field_path: "company.legal_name", normalized_value: "Empresa X"}),
      candidate({field_path: "transaction.purpose", normalized_value: "Expansão"}),
      candidate({field_path: "transaction.requested_amount", normalized_value: 0, value_type: "number"}),
    ])).toBeNull();
    // proposed (not yet accepted) values do not count
    expect(deriveCase([
      candidate({field_path: "company.legal_name", normalized_value: "Empresa X", review_state: "proposed"}),
      candidate({field_path: "transaction.purpose", normalized_value: "Expansão"}),
      candidate({field_path: "transaction.requested_amount", normalized_value: 10, value_type: "number"}),
    ])).toBeNull();
  });

  it("derives the case only from confirmed primary candidates, never from fixed text", () => {
    const derived = deriveCase([
      candidate({field_path: "company.legal_name", normalized_value: "Padaria Aurora Ltda."}),
      candidate({field_path: "company.display_name", normalized_value: "Aurora"}),
      candidate({field_path: "company.legal_identifier", normalized_value: "12.345.678/0001-95"}),
      candidate({field_path: "company.city", normalized_value: "Curitiba"}),
      candidate({field_path: "transaction.purpose", normalized_value: "Capital de giro para safra"}),
      candidate({field_path: "transaction.requested_amount", normalized_value: 2_500_000, value_type: "number", currency: "BRL"}),
      candidate({field_path: "collateral.total_capacity", normalized_value: 3_000_000, value_type: "number", currency: "BRL"}),
    ]);
    expect(derived).not.toBeNull();
    expect(derived).toMatchObject({legalName: "Padaria Aurora Ltda.", displayName: "Aurora", identifier: "12345678000195", city: "Curitiba", state: null, requestedAmount: 2_500_000, currency: "BRL", collateralTotal: 3_000_000, projectCost: null});
    expect(derived?.title).toBe("Aurora · Capital de giro para safra");
    expect(JSON.stringify(derived)).not.toMatch(/Expansão de três novas lojas|Rede Horizonte/);
  });

  it("bounds the opportunity title to the schema limit", () => {
    const longPurpose = "x".repeat(400);
    const title = buildOpportunityTitle("Empresa", longPurpose);
    expect(title.length).toBeLessThanOrEqual(OPPORTUNITY_TITLE_MAX);
    expect(title.startsWith("Empresa · ")).toBe(true);
    expect(buildOpportunityTitle("Nome", "")).toBe("Nome");
    expect(buildOpportunityTitle("N".repeat(200), "p").length).toBeLessThanOrEqual(OPPORTUNITY_TITLE_MAX);
  });

  it("only counts accepted/edited primary candidates as confirmed", () => {
    expect(confirmedCandidates([
      candidate({review_state: "accepted"}),
      candidate({review_state: "edited"}),
      candidate({review_state: "accepted", is_primary: false}),
      candidate({review_state: "not_applicable"}),
      candidate({review_state: "proposed"}),
    ])).toHaveLength(2);
  });
});
