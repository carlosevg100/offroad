import {buildRedeHorizonteDocumentIntake, redeHorizonteFileHashes, redeHorizonteRequiredFiles} from "@offroad/testing-fixtures";
import {describe, expect, it} from "vitest";

import {buildCandidateRows, buildEvidenceRows, buildIssueRows, buildOpportunityTitle, confirmedCandidates, deriveCase, OPPORTUNITY_TITLE_MAX, summarizeCompilation} from "./case";
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

describe("intake rows", () => {
  it("maps every fixture candidate and issue to tenant-scoped rows", () => {
    const compilation = buildRedeHorizonteDocumentIntake(fullDocumentSet);
    const rows = buildCandidateRows(compilation, scope);
    expect(rows).toHaveLength(compilation.candidates.length);
    expect(rows.every((row) => row.organization_id === scope.organizationId && row.intake_session_id === scope.sessionId && row.created_by === scope.userId)).toBe(true);
    expect(rows.find((row) => row.extractor_key === "requested")?.normalized_value).toBe(54_000_000);

    const idByKey = new Map(rows.map((row, index) => [row.extractor_key, `id-${index}`]));
    const issues = buildIssueRows(compilation, scope, idByKey);
    expect(issues).toHaveLength(compilation.issues.length);
    const conflict = issues.find((issue) => issue.issue_type === "conflict");
    expect(conflict?.candidate_ids).toHaveLength(2);
    expect(summarizeCompilation(compilation, {documents: 8, candidates: rows.length, issues: issues.length})).toMatchObject({fixture_matched: true, missing_files: [], documents: 8});
  });

  it("keeps unknown document sets free of candidates", () => {
    const compilation = buildRedeHorizonteDocumentIntake([{id: "x", original_name: "balancete.xlsx", sha256: "f".repeat(64)}]);
    expect(buildCandidateRows(compilation, scope)).toHaveLength(0);
    expect(buildIssueRows(compilation, scope, new Map())).toHaveLength(1);
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
});

describe("buildEvidenceRows", () => {
  it("promotes only accepted/edited primary candidates and preserves provenance in the anchor", () => {
    const rows = buildEvidenceRows([
      candidate({id: "a", field_path: "historical_financials.2025.revenue", normalized_value: 184_700_000, value_type: "number", currency: "BRL", unit: "currency", information_class: "audited", evidence_rank: 1, review_state: "accepted"}),
      candidate({id: "b", field_path: "project.total_cost", normalized_value: 50_000_000, value_type: "number", review_state: "proposed", is_primary: false}),
      candidate({id: "c", field_path: "company.city", normalized_value: "Ribeirão Preto", review_state: "edited", extraction_method: "user_entry"}),
      candidate({id: "d", field_path: "company.state", normalized_value: "SP", review_state: "rejected"}),
    ], {organizationId: scope.organizationId, opportunityId: "opp-1", userId: scope.userId, now: "2026-08-18T00:00:00Z"});
    expect(rows.map((row) => row.fact_type)).toEqual(["historical_financials.2025.revenue", "company.city"]);
    expect(rows[0]).toMatchObject({value_numeric: 184_700_000, value_text: null, review_state: "approved", opportunity_id: "opp-1"});
    expect(rows[0]?.source_anchor).toMatchObject({page: 1, information_class: "audited", extraction_method: "native_text", raw_value: "raw"});
    expect(rows[1]).toMatchObject({value_numeric: null, value_text: "Ribeirão Preto"});
    expect(rows[1]?.source_anchor).toMatchObject({extraction_method: "user_entry"});
    expect(confirmedCandidates([candidate({review_state: "not_applicable"})])).toHaveLength(0);
  });
});
