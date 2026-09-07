import {describe, expect, it} from "vitest";

import {
  createContextCandidate,
  createContextResolutionIntent,
  createSystemContextControl,
  resolveAuthorizedContext,
  verifyAuthorizedContextResolution,
  type ContextCandidate,
} from "./context-resolution";

const sha = (value: string) => value.repeat(64);
const NOW = new Date("2026-09-07T15:00:00.000Z");

function control(overrides: Record<string, unknown> = {}) {
  return createSystemContextControl({
    schemaVersion: "system-context-control.v1",
    source: "system",
    organizationId: "org-a",
    projectId: "project-a",
    conversationId: "conversation-a",
    authority: "analysis_only",
    evidenceRegime: "project_private",
    authorityGrants: ["read"],
    permissions: [
      "read_organization_context",
      "read_project_context",
      "read_company_context",
      "read_conversation_context",
      "read_document_context",
    ],
    authorizedContextItemIds: ["ctx-project-v1", "ctx-project-v2", "ctx-conflict", "ctx-company", "ctx-document", "ctx-stale", "ctx-revoked", "ctx-wrong-date", "ctx-wrong-jurisdiction", "ctx-irrelevant"],
    authorizedDocumentIds: ["document-a"],
    authorizedCompanyIds: ["company-a"],
    executionContextHash: sha("a"),
    revision: 7,
    issuedAt: "2026-09-07T14:00:00.000Z",
    expiresAt: "2026-09-07T16:00:00.000Z",
    ...overrides,
  } as never);
}

function intent(overrides: Record<string, unknown> = {}) {
  return createContextResolutionIntent({
    schemaVersion: "context-resolution-intent.v1",
    primaryWorks: ["capital_strategy", "analyze"],
    objectKinds: ["company", "operation"],
    objectRefs: [{kind: "company", id: "company-a"}],
    productKeys: ["refinance", "debenture"],
    jurisdictions: {values: ["BR"], state: "explicit"},
    asOfDate: {value: "2026-06-30", state: "explicit"},
    continuity: "resume",
    ...overrides,
  } as never);
}

function candidate(id: string, overrides: Record<string, unknown> = {}): ContextCandidate {
  return createContextCandidate({
    schemaVersion: "context-candidate.v1",
    id,
    logicalKey: "project.capital-structure",
    kind: "project_memory",
    organizationId: "org-a",
    projectId: "project-a",
    companyId: "company-a",
    conversationId: null,
    documentId: null,
    dataClass: "project_confidential",
    payloadRef: `context://${id}`,
    contentHash: sha("b"),
    sourceVersion: "source-v1",
    snapshotVersion: 1,
    capturedAt: "2026-09-07T14:00:00.000Z",
    validFrom: "2026-09-07T14:00:00.000Z",
    validUntil: null,
    freshUntil: "2026-10-07T14:00:00.000Z",
    revokedAt: null,
    asOfDate: "2026-06-30",
    temporalPolicy: "exact_as_of",
    jurisdictions: ["BR"],
    selectors: {
      primaryWorks: ["capital_strategy"],
      objectKinds: ["company"],
      objectRefs: [{kind: "company", id: "company-a"}],
      productKeys: ["refinance"],
    },
    supersedesId: null,
    ...overrides,
  } as never);
}

describe("authorized context resolution", () => {
  it("treats absence of existing context as a normal, prompt-free state", () => {
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [], now: NOW});
    expect(result).toMatchObject({status: "empty", included: [], excluded: [], gaps: [], blockers: [], externalEffectAllowed: false});
    expect(Object.keys(result)).not.toContain("message");
    expect(Object.keys(result)).not.toContain("question");
    expect(() => verifyAuthorizedContextResolution(result)).not.toThrow();
  });

  it("excludes context that is authorized but immaterial to the requested work", () => {
    const irrelevant = candidate("ctx-irrelevant", {
      logicalKey: "project.unrelated-legal-note",
      selectors: {primaryWorks: ["read_documents"], objectKinds: ["instrument"], objectRefs: [], productKeys: ["project-finance"]},
      temporalPolicy: "timeless",
      asOfDate: null,
      jurisdictions: [],
    });
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [irrelevant], now: NOW});
    expect(result).toMatchObject({status: "empty", included: [], gaps: [], excluded: [{itemId: "ctx-irrelevant", reason: "irrelevant"}]});
  });

  it("blocks a cross-tenant candidate even when its selectors are irrelevant", () => {
    const foreign = candidate("ctx-project-v1", {
      organizationId: "org-b",
      selectors: {primaryWorks: ["read_documents"], objectKinds: ["instrument"], objectRefs: [], productKeys: ["project-finance"]},
    });
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [foreign], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: [], blockers: [{code: "cross_tenant_candidate", itemIds: []}]});
    expect(JSON.stringify(result)).not.toContain("ctx-project-v1");
  });

  it("blocks cross-project, cross-conversation and unauthorized document scope", () => {
    const project = candidate("ctx-project-v1", {projectId: "project-b"});
    const conversation = candidate("ctx-project-v2", {
      logicalKey: "conversation.current",
      kind: "conversation_memory",
      conversationId: "conversation-b",
    });
    const document = candidate("ctx-document", {
      logicalKey: "document.ledger",
      kind: "document",
      documentId: "document-b",
    });
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [project, conversation, document], now: NOW});
    expect(result.status).toBe("blocked");
    expect(result.blockers.map(({code}) => code)).toEqual(expect.arrayContaining([
      "cross_project_candidate", "cross_conversation_candidate", "unauthorized_document_candidate",
    ]));
  });

  it("blocks a same-project candidate absent from the system authorization snapshot", () => {
    const unlisted = candidate("not-on-the-authorized-list");
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [unlisted], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: [], blockers: [{code: "unauthorized_context_candidate", itemIds: []}]});
    expect(JSON.stringify(result)).not.toContain("not-on-the-authorized-list");
  });

  it("never accepts authority or permissions added by memory and detects control-plane alteration", () => {
    const withAuthority = {...candidate("ctx-project-v1"), authority: "external_action"};
    const memoryResult = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [withAuthority], now: NOW});
    expect(memoryResult).toMatchObject({status: "blocked", blockers: [{code: "candidate_invalid"}]});

    const alteredControl = {...control(), authority: "external_action"};
    const controlResult = resolveAuthorizedContext({systemControl: alteredControl, intent: intent(), candidates: [], now: NOW});
    expect(controlResult).toMatchObject({status: "blocked", blockers: [{code: "system_control_invalid"}]});
  });

  it("turns missing system permission into a structured gap without manufacturing user copy", () => {
    const result = resolveAuthorizedContext({
      systemControl: control({permissions: ["read_company_context"]}),
      intent: intent(),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "needs_context",
      included: [],
      excluded: [{itemId: "ctx-project-v1", reason: "permission_missing"}],
      gaps: [{code: "context_permission_required", askIfMaterial: true}],
    });
    expect(JSON.stringify(result)).not.toMatch(/quem|qual|please|which/i);
  });

  it("fails closed on two live heads for the same logical context", () => {
    const left = candidate("ctx-project-v1");
    const right = candidate("ctx-conflict", {snapshotVersion: 2, contentHash: sha("c"), sourceVersion: "source-v2"});
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [right, left], now: NOW});
    expect(result).toMatchObject({
      status: "needs_context",
      included: [],
      gaps: [{code: "context_conflict", logicalKey: "project.capital-structure", sourceItemIds: ["ctx-conflict", "ctx-project-v1"]}],
    });
    expect(result.excluded.every(({reason}) => reason === "conflict")).toBe(true);
  });

  it("selects the explicit incremental successor and records the prior snapshot as superseded", () => {
    const prior = candidate("ctx-project-v1");
    const current = candidate("ctx-project-v2", {
      snapshotVersion: 2,
      contentHash: sha("c"),
      sourceVersion: "source-v2",
      supersedesId: prior.id,
    });
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [prior, current], now: NOW});
    expect(result).toMatchObject({
      status: "resolved",
      included: [{itemId: "ctx-project-v2", snapshotVersion: 2, contentHash: sha("c")}],
      excluded: [{itemId: "ctx-project-v1", reason: "superseded"}],
      gaps: [],
    });
  });

  it("produces byte-identical recovery regardless of candidate order", () => {
    const prior = candidate("ctx-project-v1");
    const current = candidate("ctx-project-v2", {snapshotVersion: 2, supersedesId: prior.id, contentHash: sha("c")});
    const company = candidate("ctx-company", {
      logicalKey: "company.identity",
      kind: "company_memory",
      projectId: null,
      dataClass: "public",
      temporalPolicy: "timeless",
      asOfDate: null,
      jurisdictions: [],
      selectors: {primaryWorks: ["understand"], objectKinds: ["company"], objectRefs: [{kind: "company", id: "company-a"}], productKeys: []},
    });
    const one = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [prior, current, company], now: NOW});
    const two = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [company, current, prior], now: NOW});
    expect(two).toEqual(one);
  });

  it("marks stale and revoked material context instead of silently reusing it", () => {
    const stale = candidate("ctx-stale", {
      logicalKey: "project.stale",
      capturedAt: "2026-08-01T00:00:00.000Z",
      validFrom: "2026-08-01T00:00:00.000Z",
      freshUntil: "2026-09-01T00:00:00.000Z",
    });
    const revoked = candidate("ctx-revoked", {logicalKey: "project.revoked", revokedAt: "2026-09-07T14:30:00.000Z"});
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [stale, revoked], now: NOW});
    expect(result.status).toBe("needs_context");
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({itemId: "ctx-stale", reason: "stale"}),
      expect.objectContaining({itemId: "ctx-revoked", reason: "revoked"}),
    ]));
    expect(result.gaps.map(({code}) => code)).toEqual(["current_context_required", "current_context_required"]);
  });

  it("does not reuse jurisdiction-specific context while jurisdiction is ambiguous", () => {
    const result = resolveAuthorizedContext({
      systemControl: control(),
      intent: intent({jurisdictions: {values: [], state: "ambiguous"}}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(result).toMatchObject({status: "needs_context", included: [], excluded: [{reason: "jurisdiction_unresolved"}], gaps: [{code: "jurisdiction_required"}]});
  });

  it("requires confirmation before relying on inferred jurisdiction or as-of context", () => {
    const inferredJurisdiction = resolveAuthorizedContext({
      systemControl: control(),
      intent: intent({jurisdictions: {values: ["BR"], state: "inferred"}}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    const inferredAsOf = resolveAuthorizedContext({
      systemControl: control(),
      intent: intent({asOfDate: {value: "2026-06-30", state: "inferred"}}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(inferredJurisdiction).toMatchObject({status: "needs_context", gaps: [{code: "jurisdiction_required"}]});
    expect(inferredAsOf).toMatchObject({status: "needs_context", gaps: [{code: "as_of_date_required"}]});
  });

  it("does not reuse context from a different jurisdiction or exact as-of date", () => {
    const wrongJurisdiction = candidate("ctx-wrong-jurisdiction", {logicalKey: "project.us", jurisdictions: ["US"]});
    const wrongDate = candidate("ctx-wrong-date", {logicalKey: "project.old", asOfDate: "2025-12-31"});
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [wrongDate, wrongJurisdiction], now: NOW});
    expect(result.status).toBe("needs_context");
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({reason: "wrong_jurisdiction"}),
      expect.objectContaining({reason: "wrong_as_of"}),
    ]));
    expect(result.gaps.map(({code}) => code)).toEqual(["context_as_of_mismatch", "context_jurisdiction_mismatch"]);
  });

  it("blocks a lineage cycle and never exposes either payload reference", () => {
    const left = candidate("ctx-project-v1", {supersedesId: "ctx-project-v2"});
    const right = candidate("ctx-project-v2", {snapshotVersion: 2, supersedesId: "ctx-project-v1"});
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [left, right], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toContain("lineage_cycle");
    expect(JSON.stringify(result)).not.toContain("context://");
  });

  it("rejects a modified resolution fingerprint", () => {
    const result = resolveAuthorizedContext({systemControl: control(), intent: intent(), candidates: [], now: NOW});
    expect(() => verifyAuthorizedContextResolution({...result, status: "resolved"})).toThrow("context_resolution_fingerprint_mismatch");
  });
});
