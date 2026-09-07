import {describe, expect, it} from "vitest";

import {
  createContextCandidate,
  createContextResolutionIntent,
  issueSystemContextControl,
  resolveAuthorizedContext,
  verifyAuthorizedContextResolution,
  type ContextCandidate,
} from "./context-resolution";

const sha = (value: string) => value.repeat(64);
const NOW = new Date("2026-09-07T15:00:00.000Z");
const CONTROL_SECRET = "control-secret-for-internal-shadow-tests";
const RESOLUTION_SECRET = "resolution-secret-for-internal-shadow-tests";
const CONTROL_TRUST = [{issuerId: "control-plane-test", keyId: "control-key", algorithm: "hmac-sha256" as const, secret: CONTROL_SECRET, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z", revokedAt: null}];
const RESOLUTION_TRUST = [{issuerId: "context-resolver-test", keyId: "resolution-key", algorithm: "hmac-sha256" as const, secret: RESOLUTION_SECRET, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z", revokedAt: null}];
const RESOLUTION_ISSUER = {issuerId: "context-resolver-test", keyId: "resolution-key", algorithm: "hmac-sha256" as const, secret: RESOLUTION_SECRET};
const AUTHORIZED_CONTEXT_IDS = new Set(["ctx-project-v1", "ctx-project-v2", "ctx-conflict", "ctx-company", "ctx-document", "ctx-stale", "ctx-revoked", "ctx-wrong-date", "ctx-wrong-jurisdiction", "ctx-irrelevant"]);

function control(overrides: Record<string, unknown> = {}) {
  return issueSystemContextControl({
    schemaVersion: "system-context-control.v2",
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
    authorizedContextSnapshots: [],
    authorizedDocumentIds: ["document-a"],
    authorizedCompanyIds: ["company-a"],
    executionContextHash: sha("a"),
    revision: 7,
    issuedAt: "2026-09-07T14:00:00.000Z",
    expiresAt: "2026-09-07T16:00:00.000Z",
    issuer: {issuerId: "control-plane-test", keyId: "control-key", algorithm: "hmac-sha256"},
    ...overrides,
  } as never, CONTROL_SECRET);
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
    controlRevision: 7,
    projectId: "project-a",
    companyId: "company-a",
    conversationId: null,
    documentId: null,
    dataClass: "project_confidential",
    payloadLocator: {scheme: "context_snapshot", locatorId: id},
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

function resolve(input: {systemControl: unknown; intent: unknown; candidates: readonly unknown[]; now: Date}) {
  let systemControl = input.systemControl;
  if (input.candidates.length > 0 && systemControl && typeof systemControl === "object") {
    const value = systemControl as ReturnType<typeof control>;
    const snapshots = input.candidates
      .filter((raw): raw is ContextCandidate => Boolean(raw && typeof raw === "object" && "id" in raw && "fingerprint" in raw))
      .filter(({id}) => AUTHORIZED_CONTEXT_IDS.has(id))
      .map(({id, fingerprint}) => ({itemId: id, snapshotFingerprint: fingerprint}));
    const {fingerprint: _fingerprint, signature: _signature, candidateSetFingerprint: _candidateSetFingerprint, ...payload} = value;
    systemControl = issueSystemContextControl({
      ...payload,
      authorizedContextSnapshots: snapshots,
    }, CONTROL_SECRET);
  }
  return resolveAuthorizedContext({...input, systemControl, systemControlTrust: CONTROL_TRUST, resolutionIssuer: RESOLUTION_ISSUER});
}

function verify(raw: unknown, at: Date = NOW) {
  return verifyAuthorizedContextResolution(raw, RESOLUTION_TRUST, at);
}

describe("authorized context resolution", () => {
  it("treats absence of existing context as a normal, prompt-free state", () => {
    const result = resolve({systemControl: control(), intent: intent(), candidates: [], now: NOW});
    expect(result).toMatchObject({status: "empty", included: [], excluded: [], gaps: [], blockers: [], externalEffectAllowed: false});
    expect(Object.keys(result)).not.toContain("message");
    expect(Object.keys(result)).not.toContain("question");
    expect(() => verify(result)).not.toThrow();
  });

  it("excludes context that is authorized but immaterial to the requested work", () => {
    const irrelevant = candidate("ctx-irrelevant", {
      logicalKey: "project.unrelated-legal-note",
      companyId: null,
      selectors: {primaryWorks: ["read_documents"], objectKinds: ["instrument"], objectRefs: [], productKeys: ["project-finance"]},
      temporalPolicy: "timeless",
      asOfDate: null,
      jurisdictions: [],
    });
    const result = resolve({systemControl: control(), intent: intent(), candidates: [irrelevant], now: NOW});
    expect(result).toMatchObject({status: "empty", included: [], gaps: [], excluded: [{itemId: "ctx-irrelevant", reason: "irrelevant"}]});
  });

  it("blocks a cross-tenant candidate even when its selectors are irrelevant", () => {
    const foreign = candidate("ctx-project-v1", {
      organizationId: "org-b",
      companyId: null,
      selectors: {primaryWorks: ["read_documents"], objectKinds: ["instrument"], objectRefs: [], productKeys: ["project-finance"]},
    });
    const result = resolve({systemControl: control(), intent: intent(), candidates: [foreign], now: NOW});
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
      payloadLocator: {scheme: "document_snapshot", locatorId: "ctx-document"},
    });
    const result = resolve({systemControl: control(), intent: intent(), candidates: [project, conversation, document], now: NOW});
    expect(result.status).toBe("blocked");
    expect(result.blockers.map(({code}) => code)).toEqual(expect.arrayContaining([
      "cross_project_candidate", "cross_conversation_candidate", "unauthorized_document_candidate",
    ]));
  });

  it("blocks a same-project candidate absent from the system authorization snapshot", () => {
    const unlisted = candidate("not-on-the-authorized-list");
    const result = resolve({systemControl: control(), intent: intent(), candidates: [unlisted], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toEqual(expect.arrayContaining(["unauthorized_context_candidate", "control_candidate_set_mismatch"]));
    expect(JSON.stringify(result)).not.toContain("not-on-the-authorized-list");
  });

  it("does not permit project memory to bypass the authorized company scope", () => {
    const disguisedCompanyContext = candidate("ctx-project-v1", {
      companyId: "company-b",
      selectors: {primaryWorks: ["capital_strategy"], objectKinds: ["company"], objectRefs: [{kind: "company", id: "company-b"}], productKeys: ["refinance"]},
    });
    const result = resolve({systemControl: control(), intent: intent(), candidates: [disguisedCompanyContext], now: NOW});
    expect(result).toMatchObject({status: "blocked", blockers: [{code: "unauthorized_company_candidate", itemIds: []}]});
    expect(JSON.stringify(result)).not.toContain("company-b");
  });

  it("never accepts authority or permissions added by memory and detects control-plane alteration", () => {
    const withAuthority = {...candidate("ctx-project-v1"), authority: "external_action"};
    const memoryResult = resolve({systemControl: control(), intent: intent(), candidates: [withAuthority], now: NOW});
    expect(memoryResult).toMatchObject({status: "blocked"});
    expect(memoryResult.blockers.map(({code}) => code)).toEqual(expect.arrayContaining(["candidate_invalid", "control_candidate_set_mismatch"]));

    const alteredControl = {...control(), authority: "external_action"};
    const controlResult = resolve({systemControl: alteredControl, intent: intent(), candidates: [], now: NOW});
    expect(controlResult).toMatchObject({status: "blocked", blockers: [{code: "system_control_invalid"}]});
  });

  it("turns missing system permission into a structured gap without manufacturing user copy", () => {
    const result = resolve({
      systemControl: control({permissions: ["read_company_context"]}),
      intent: intent(),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "needs_context",
      included: [],
      excluded: [{itemId: "ctx-project-v1", reason: "permission_missing"}],
      gaps: [{code: "context_permission_required", handling: "obtain_system_authorization"}],
    });
    expect(JSON.stringify(result)).not.toMatch(/quem|qual|please|which/i);
  });

  it("fails closed on two live heads for the same logical context", () => {
    const left = candidate("ctx-project-v1");
    const right = candidate("ctx-conflict", {snapshotVersion: 2, contentHash: sha("c"), sourceVersion: "source-v2"});
    const result = resolve({systemControl: control(), intent: intent(), candidates: [right, left], now: NOW});
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
    const result = resolve({systemControl: control(), intent: intent(), candidates: [prior, current], now: NOW});
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
    const one = resolve({systemControl: control(), intent: intent(), candidates: [prior, current, company], now: NOW});
    const two = resolve({systemControl: control(), intent: intent(), candidates: [company, current, prior], now: NOW});
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
    const result = resolve({systemControl: control(), intent: intent(), candidates: [stale, revoked], now: NOW});
    expect(result.status).toBe("needs_context");
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({itemId: "ctx-stale", reason: "stale"}),
      expect.objectContaining({itemId: "ctx-revoked", reason: "revoked"}),
    ]));
    expect(result.gaps.map(({code}) => code)).toEqual(["current_context_required", "current_context_required"]);
    expect(result.gaps.every(({handling}) => handling === "refresh_source")).toBe(true);
  });

  it("does not reuse jurisdiction-specific context while jurisdiction is ambiguous", () => {
    const result = resolve({
      systemControl: control(),
      intent: intent({jurisdictions: {values: [], state: "ambiguous"}}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(result).toMatchObject({status: "needs_context", included: [], excluded: [{reason: "jurisdiction_unresolved"}], gaps: [{code: "jurisdiction_required"}]});
  });

  it("requires confirmation before relying on inferred jurisdiction or as-of context", () => {
    const inferredJurisdiction = resolve({
      systemControl: control(),
      intent: intent({jurisdictions: {values: ["BR"], state: "inferred"}}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    const inferredAsOf = resolve({
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
    const result = resolve({systemControl: control(), intent: intent(), candidates: [wrongDate, wrongJurisdiction], now: NOW});
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
    const result = resolve({systemControl: control(), intent: intent(), candidates: [left, right], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toContain("lineage_cycle");
    expect(JSON.stringify(result)).not.toContain("context://");
  });

  it("rejects a modified resolution fingerprint", () => {
    const result = resolve({systemControl: control(), intent: intent(), candidates: [], now: NOW});
    expect(() => verify({...result, status: "resolved"})).toThrow("context_resolution_fingerprint_mismatch");
  });

  it("requires an exact company object target before company-scoped context may enter", () => {
    const result = resolve({
      systemControl: control(),
      intent: intent({objectRefs: []}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "needs_context",
      included: [],
      excluded: [{itemId: "ctx-project-v1", reason: "company_target_unresolved"}],
      gaps: [{code: "company_target_required", sourceItemIds: ["ctx-project-v1"], handling: "ask_if_material"}],
    });
  });

  it("does not treat an object-kind match as authority to cross company targets", () => {
    const result = resolve({
      systemControl: control({authorizedCompanyIds: ["company-a", "company-b"]}),
      intent: intent({objectRefs: [{kind: "company", id: "company-b"}]}),
      candidates: [candidate("ctx-project-v1")],
      now: NOW,
    });
    expect(result).toMatchObject({status: "needs_context", included: [], excluded: [{reason: "wrong_company"}], gaps: [{code: "context_company_mismatch"}]});
  });

  it("rejects company selectors that do not exactly agree with candidate scope", () => {
    expect(() => candidate("ctx-project-v1", {
      selectors: {primaryWorks: ["capital_strategy"], objectKinds: ["company"], objectRefs: [{kind: "company", id: "company-b"}], productKeys: []},
    })).toThrow(/company-scoped context requires exactly coherent company selectors/);
    expect(() => candidate("ctx-project-v1", {
      companyId: null,
      selectors: {primaryWorks: ["capital_strategy"], objectKinds: ["company"], objectRefs: [{kind: "company", id: "company-b"}], productKeys: []},
    })).toThrow(/non-company-scoped context cannot carry company selectors/);
  });

  it("deduplicates exact object references before fingerprinting intent", () => {
    const value = intent({objectRefs: [{kind: "company", id: "company-a"}, {kind: "company", id: "company-a"}]});
    expect(value.objectRefs).toEqual([{kind: "company", id: "company-a"}]);
  });

  it("binds candidates to the exact signed control revision and capture horizon", () => {
    const wrongRevision = resolve({systemControl: control(), intent: intent(), candidates: [candidate("ctx-project-v1", {controlRevision: 6})], now: NOW});
    const createdAfterSnapshot = resolve({
      systemControl: control(), intent: intent(),
      candidates: [candidate("ctx-project-v1", {capturedAt: "2026-09-07T14:30:00.000Z", validFrom: "2026-09-07T14:30:00.000Z"})], now: NOW,
    });
    expect(wrongRevision).toMatchObject({status: "blocked", blockers: [{code: "control_snapshot_mismatch"}]});
    expect(createdAfterSnapshot).toMatchObject({status: "blocked", blockers: [{code: "control_snapshot_mismatch"}]});
  });

  it("rejects snapshot substitution under an otherwise authorized context id", () => {
    const original = candidate("ctx-project-v1");
    const substituted = candidate("ctx-project-v1", {contentHash: sha("c")});
    const frozenControl = issueSystemContextControl({
      schemaVersion: "system-context-control.v2", source: "system", organizationId: "org-a", projectId: "project-a", conversationId: "conversation-a",
      authority: "analysis_only", evidenceRegime: "project_private", authorityGrants: ["read"], permissions: ["read_project_context"],
      authorizedContextSnapshots: [{itemId: original.id, snapshotFingerprint: original.fingerprint}], authorizedDocumentIds: [], authorizedCompanyIds: ["company-a"],
      executionContextHash: sha("a"), revision: 7, issuedAt: "2026-09-07T14:00:00.000Z", expiresAt: "2026-09-07T16:00:00.000Z",
      issuer: {issuerId: "control-plane-test", keyId: "control-key", algorithm: "hmac-sha256"},
    }, CONTROL_SECRET);
    const result = resolveAuthorizedContext({
      systemControl: frozenControl, systemControlTrust: CONTROL_TRUST, intent: intent(), candidates: [substituted], now: NOW, resolutionIssuer: RESOLUTION_ISSUER,
    });
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toEqual(expect.arrayContaining(["control_snapshot_mismatch", "control_candidate_set_mismatch"]));
  });

  it("never resurrects an ancestor when the authorized head is stale, revoked, or irrelevant", () => {
    const prior = candidate("ctx-project-v1", {capturedAt: "2026-09-01T00:00:00.000Z", validFrom: "2026-09-01T00:00:00.000Z"});
    const staleHead = candidate("ctx-project-v2", {
      snapshotVersion: 2, supersedesId: prior.id, capturedAt: "2026-09-02T00:00:00.000Z", validFrom: "2026-09-02T00:00:00.000Z", freshUntil: "2026-09-06T00:00:00.000Z",
    });
    const stale = resolve({systemControl: control(), intent: intent(), candidates: [prior, staleHead], now: NOW});
    expect(stale.included).toEqual([]);
    expect(stale.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({itemId: prior.id, reason: "superseded"}),
      expect.objectContaining({itemId: staleHead.id, reason: "stale"}),
    ]));

    const revokedHead = candidate("ctx-project-v2", {snapshotVersion: 2, supersedesId: prior.id, revokedAt: "2026-09-07T14:30:00.000Z"});
    const revoked = resolve({systemControl: control(), intent: intent(), candidates: [prior, revokedHead], now: NOW});
    expect(revoked.included).toEqual([]);
    expect(revoked.excluded).toEqual(expect.arrayContaining([expect.objectContaining({itemId: prior.id, reason: "superseded"}), expect.objectContaining({itemId: revokedHead.id, reason: "revoked"})]));

    const irrelevantIntent = intent({primaryWorks: ["read_documents"], objectKinds: ["instrument"], objectRefs: [{kind: "company", id: "company-a"}], productKeys: ["project-finance"]});
    const irrelevant = resolve({systemControl: control(), intent: irrelevantIntent, candidates: [prior, candidate("ctx-project-v2", {snapshotVersion: 2, supersedesId: prior.id})], now: NOW});
    expect(irrelevant.included).toEqual([]);
    expect(irrelevant.excluded).toEqual(expect.arrayContaining([expect.objectContaining({itemId: prior.id, reason: "superseded"}), expect.objectContaining({itemId: "ctx-project-v2", reason: "irrelevant"})]));
  });

  it("allows a valid successor even when its ancestor is temporally unusable", () => {
    const stalePrior = candidate("ctx-project-v1", {
      capturedAt: "2026-08-01T00:00:00.000Z", validFrom: "2026-08-01T00:00:00.000Z", freshUntil: "2026-09-01T00:00:00.000Z",
    });
    const current = candidate("ctx-project-v2", {snapshotVersion: 2, supersedesId: stalePrior.id, contentHash: sha("c")});
    const result = resolve({systemControl: control(), intent: intent(), candidates: [stalePrior, current], now: NOW});
    expect(result).toMatchObject({status: "resolved", included: [{itemId: current.id}], excluded: [{itemId: stalePrior.id, reason: "superseded"}], gaps: []});
  });

  it("fails closed when immutable lineage dimensions or selectors change", () => {
    const prior = candidate("ctx-project-v1");
    const widened = candidate("ctx-project-v2", {
      snapshotVersion: 2,
      supersedesId: prior.id,
      selectors: {primaryWorks: ["capital_strategy", "analyze"], objectKinds: ["company"], objectRefs: [{kind: "company", id: "company-a"}], productKeys: ["refinance"]},
    });
    const result = resolve({systemControl: control(), intent: intent(), candidates: [prior, widened], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toContain("lineage_scope_mismatch");
  });

  it("requires the complete parent chain before selecting a lineage head", () => {
    const orphan = candidate("ctx-project-v2", {snapshotVersion: 2, supersedesId: "ctx-project-v1"});
    const result = resolve({systemControl: control(), intent: intent(), candidates: [orphan], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toContain("lineage_parent_missing");
  });

  it("sets resolution validity to the earliest control or included-head cutoff", () => {
    const head = candidate("ctx-project-v1", {validUntil: "2026-09-07T15:45:00.000Z", freshUntil: "2026-09-07T15:30:00.000Z", revokedAt: "2026-09-07T15:20:00.000Z"});
    const result = resolve({systemControl: control(), intent: intent(), candidates: [head], now: NOW});
    expect(result).toMatchObject({status: "resolved", controlRevision: 7, validUntil: "2026-09-07T15:20:00.000Z"});
    expect(() => verify(result, new Date("2026-09-07T15:20:00.000Z"))).toThrow("context_resolution_expired");
  });

  it("requires verifiable control and resolution issuers", () => {
    const badControl = resolveAuthorizedContext({
      systemControl: control(), systemControlTrust: [{...CONTROL_TRUST[0]!, secret: "wrong-secret-value"}], intent: intent(), candidates: [], now: NOW, resolutionIssuer: RESOLUTION_ISSUER,
    });
    expect(badControl).toMatchObject({status: "blocked", blockers: [{code: "system_control_invalid"}]});
    const result = resolve({systemControl: control(), intent: intent(), candidates: [], now: NOW});
    expect(() => verifyAuthorizedContextResolution(result, [{...RESOLUTION_TRUST[0]!, secret: "wrong-secret-value"}], NOW)).toThrow("context_resolution_signature_invalid");
    expect(() => verifyAuthorizedContextResolution(result, [{...RESOLUTION_TRUST[0]!, issuerId: "other-resolver"}], NOW)).toThrow("context_resolution_signature_invalid");
    expect(() => verifyAuthorizedContextResolution(result, [{...RESOLUTION_TRUST[0]!, revokedAt: "2026-09-07T14:59:59.000Z"}], NOW)).toThrow("context_resolution_signature_invalid");
    expect(() => verifyAuthorizedContextResolution(result, [{...RESOLUTION_TRUST[0]!, validUntil: "2026-09-07T14:59:59.000Z"}], NOW)).toThrow("context_resolution_signature_invalid");
    expect(() => verifyAuthorizedContextResolution(result, RESOLUTION_TRUST, new Date(Number.NaN))).toThrow("context_resolution_now_invalid");
  });

  it("never reflects foreign lineage identities through derived blockers", () => {
    const foreign = candidate("ctx-project-v1", {
      organizationId: "org-b",
      companyId: null,
      selectors: {primaryWorks: ["read_documents"], objectKinds: ["instrument"], objectRefs: [], productKeys: ["project-finance"]},
      supersedesId: "foreign-parent-secret",
    });
    const result = resolve({systemControl: control(), intent: intent(), candidates: [foreign], now: NOW});
    expect(result).toMatchObject({status: "blocked", included: []});
    expect(result.blockers.map(({code}) => code)).toContain("cross_tenant_candidate");
    expect(result.blockers.map(({code}) => code)).not.toContain("lineage_parent_missing");
    expect(JSON.stringify(result)).not.toContain("ctx-project-v1");
    expect(JSON.stringify(result)).not.toContain("foreign-parent-secret");
  });

  it("accepts only typed allowlisted payload locators", () => {
    expect(() => createContextCandidate({
      ...candidate("ctx-project-v1"),
      payloadLocator: "https://attacker.invalid/payload",
      fingerprint: undefined,
    } as never)).toThrow();
  });
});
