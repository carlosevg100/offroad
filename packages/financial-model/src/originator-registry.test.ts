import {describe, expect, it} from "vitest";
import {reviewOriginatorRegistry} from "./originator-registry";
import {originatorRegistryFixture as base} from "./originator-registry.test-support";

describe("originator documentary registry review", () => {
  it("opens the indirect owners and the current joint powers without approving registration", () => {
    const r = reviewOriginatorRegistry(base());
    expect(r.status).toBe("prepared_for_registry_decision");
    expect(r.ownership).toMatchObject({status: "complete", resolvedPersons: [{personId: "person-a", resolvedShare: "0.6"}, {personId: "person-b", resolvedShare: "0.3"}, {personId: "person-c", resolvedShare: "0.1"}]});
    expect(r.signing).toMatchObject({status: "documented", signatoryIds: ["person-a", "person-b"], powers: [{id: "current", signingMode: "all", signatoryIds: ["person-a", "person-b"], sourceId: "current-power"}]});
    expect(r.decisions).toEqual({registry: "pending_human_decision", credit: "outside_scope", operation: "not_authorized"});
    expect(r.liveQueriesPerformedByThisExecutor).toBe(false); expect(r.documentsAuthenticated).toBe(false);
  });
  it("retains the expired proxy as a finding and never uses it as current power", () => {
    const r = reviewOriginatorRegistry(base());
    expect(r.findings).toContainEqual(expect.objectContaining({code: "proxy_expired", sourceId: "expired-proxy"}));
    expect(r.signing.powers.some(p => p.id === "proxy")).toBe(false);
  });
  it("does not use superseded individual powers", () => {
    const f = base(); f.inForcePowerIds = ["old"];
    expect(reviewOriginatorRegistry(f)).toMatchObject({status: "pending_evidence", signing: {status: "pending"}});
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "selected_power_superseded"}));
  });
  it("does not guess the person behind a missing holding page", () => {
    const f = base(); f.nodes.find(n => n.id === "holding")!.shareholders = null;
    expect(reviewOriginatorRegistry(f)).toMatchObject({status: "pending_evidence", ownership: {status: "partial"}});
  });
  it("keeps a homonym report apart from the requested person's screening", () => {
    const f = base(); const c = f.checks.find(c => c.id === "negative_news:person-a")!;
    c.reportedSubjectId = "homonym"; c.result = "hit_reported"; c.identityConfirmed = false;
    const r = reviewOriginatorRegistry(f);
    expect(r.status).toBe("pending_evidence");
    expect(r.findings).toContainEqual(expect.objectContaining({code: "screening_not_attributed", subjectId: "person-a"}));
    expect(r.findings.some(x => x.code === "reported_hit_for_responsible_review" && x.subjectId === "person-a")).toBe(false);
  });
  it("does not treat unconfirmed identical names as an identity match", () => {
    const f = base(); f.checks.find(c => c.id === "pep:person-a")!.identityConfirmed = false;
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "screening_missing_or_unattributed", subjectId: "person-a"}));
  });
  it("requires current reports for every person covered by the supplied screening policy", () => {
    const f = base(); f.checks = f.checks.filter(c => !(c.kind === "sanctions" && c.requestedSubjectId === "person-c"));
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "screening_missing_or_unattributed", subjectId: "person-c"}));
  });
  it("keeps a stale report open", () => {
    const f = base(); f.sources.find(s => s.id === "reports")!.consultedAt = "2026-06-30";
    expect(reviewOriginatorRegistry(f)).toMatchObject({status: "pending_evidence"});
    expect(reviewOriginatorRegistry(f).gaps.some(g => g.code === "screening_stale")).toBe(true);
  });
  it("requires a recorded assessment of an attributed hit", () => {
    const f = base(); f.checks.find(c => c.id === "litigation:cedent")!.result = "hit_reported";
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "reported_hit_disposition_missing", subjectId: "cedent"}));
    f.checks.find(c => c.id === "litigation:cedent")!.disposition = "Counsel reports possible loss; no attachment documented; responsible officer to decide.";
    expect(reviewOriginatorRegistry(f).status).toBe("prepared_for_registry_decision");
    expect(reviewOriginatorRegistry(f).decisions.registry).toBe("pending_human_decision");
  });
  it("does not hide competing current signing documents", () => {
    const f = base(); f.powers[0]!.supersededBy = null;
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "unresolved_competing_power"}));
  });
  it("does not manufacture a screening policy", () => {
    const f = base(); f.screeningPolicy = null;
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "screening_policy_missing"}));
  });
  it("refuses a source dated after the analysis", () => {
    const f = base(); f.sources[0]!.consultedAt = "2026-10-30";
    expect(() => reviewOriginatorRegistry(f)).toThrow("originator_registry_future_source");
  });
  it("does not accept a share literal absent from its anchored quote", () => {
    const f = base(); f.nodes[0]!.shareholders![0]!.shareLiteral = "61%";
    expect(reviewOriginatorRegistry(f).gaps).toContainEqual(expect.objectContaining({code: "ownership_literal_not_in_quote"}));
  });
  it("refuses a screening attributed to a requested identity outside the case", () => {
    const f = base(); f.checks[0]!.requestedSubjectId = "not-in-case";
    expect(() => reviewOriginatorRegistry(f)).toThrow("originator_registry_screening_subject_unknown");
  });
});
