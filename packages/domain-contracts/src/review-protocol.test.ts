import {describe, expect, it} from "vitest";
import {approvalCoversRevision, artifactReviewSchema, decisionPrecedence, reportedDecisionEffects,
  requiredActForChange, reviewActionAllowed, workDecisionSchema, type ReviewRole, type WorkDecision} from "./review-protocol";
import fixtures from "./fixtures/review-authorization.json";
const id = (n: number) => `b5200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fp = "a".repeat(64);
const target = {organizationId: id(1), workId: id(2), artifactId: id(3), revisionId: id(4), manifestFingerprint: fp, audience: "internal" as const};
const at = "2026-09-27T16:00:00Z";
const approval = artifactReviewSchema.parse({id: id(10), target, act: "approve", reviewerId: id(11), preparedBy: id(12),
  selfApprovalDeclared: false, reviewMode: "assigned", policySnapshot: {assignmentRequired: true, selfApprovalAllowed: false, roles: ["approver"]},
  block: null, basisReviewId: null, changeReport: null, commandId: id(13), note: null, createdAt: at});
const emptyBasis = {artifacts: [], milestones: [], assessments: [], decisions: [], execution: null, configuration: null};
function decision(revision: number, expected: number | null, overrides: Partial<WorkDecision> = {}): WorkDecision {
  return workDecisionSchema.parse({id: id(100 + revision), organizationId: id(1), workId: id(2), decisionKey: "capital-choice", revision,
    fingerprint: fp, kind: "choose_alternative", basis: emptyBasis, effects: ["none"], origin: "in_product", report: null,
    decidedBy: id(11), expectedPreviousRevision: expected, supersedesDecisionId: null, contested: false,
    commandId: id(200 + revision), createdAt: at, ...overrides});
}
const ref = (d: WorkDecision) => ({decisionId: d.id, revision: d.revision, fingerprint: d.fingerprint});

describe("stage 20 review authority", () => {
  it.each(fixtures)("$name", (fixture) => {
    const result = reviewActionAllowed({act: "approve", regime: fixture, roles: fixture.roles as ReviewRole[],
      preparedBy: id(12), reviewerId: fixture.samePerson ? id(12) : id(11), selfApprovalDeclared: fixture.declared,
      workAccess: true, sourceAccess: fixture.sourceAccess, hasSubstance: true, manageAccess: false});
    expect(result).toEqual(fixture.allowed ? {allowed: true} : {allowed: false, reason: fixture.reason});
  });
  it("denies approval without work access or substance and reassignment without management", () => {
    const input = {act: "approve" as const, regime: {assignmentRequired: false, selfApprovalAllowed: true}, roles: [],
      preparedBy: null, reviewerId: id(11), selfApprovalDeclared: false, workAccess: true, sourceAccess: true, hasSubstance: true, manageAccess: false};
    expect(reviewActionAllowed({...input, workAccess: false})).toEqual({allowed: false, reason: "review_work_access_required"});
    expect(reviewActionAllowed({...input, hasSubstance: false})).toEqual({allowed: false, reason: "review_substance_required"});
    expect(reviewActionAllowed({...input, act: "reassign"})).toEqual({allowed: false, reason: "review_manage_access_required"});
  });
  it("binds approval to every exact target field, never just shared bytes", () => {
    expect(approvalCoversRevision(target, approval, [approval])).toBe(true);
    for (const key of ["organizationId", "workId", "artifactId", "revisionId"] as const) {
      expect(approvalCoversRevision({...target, [key]: id(99)}, approval, [approval])).toBe(false);
    }
    expect(approvalCoversRevision({...target, manifestFingerprint: "b".repeat(64)}, approval, [approval])).toBe(false);
    expect(approvalCoversRevision({...target, audience: "external"}, approval, [approval])).toBe(false);
    const revoked = {...approval, id: id(20), act: "revoke_approval" as const, basisReviewId: approval.id};
    expect(approvalCoversRevision(target, approval, [approval, revoked])).toBe(false);
  });
  it("requires a live explicit approval base for cosmetic reaffirmation", () => {
    const next = {...target, revisionId: id(5)};
    const reaffirm = {...approval, id: id(21), target: next, act: "reaffirm" as const, basisReviewId: approval.id,
      changeReport: {outcome: "cosmetic" as const, reasons: []}};
    expect(approvalCoversRevision(next, reaffirm, [approval, reaffirm])).toBe(true);
    expect(approvalCoversRevision(next, reaffirm, [reaffirm])).toBe(false);
    expect(approvalCoversRevision(next, reaffirm, [approval, reaffirm, {...approval, id: id(22), act: "revoke_approval", basisReviewId: approval.id}])).toBe(false);
    expect(approvalCoversRevision(next, {...reaffirm, basisReviewId: reaffirm.id}, [reaffirm])).toBe(false);
  });
  it("checks the entire reaffirmation chain and rejects cycles and cross-scope bases", () => {
    const middle = {...approval, id: id(31), target: {...target, revisionId: id(32)}, act: "reaffirm" as const,
      basisReviewId: approval.id, changeReport: {outcome: "cosmetic" as const, reasons: []}};
    const final = {...middle, id: id(33), target: {...target, revisionId: id(34)}, basisReviewId: middle.id};
    expect(approvalCoversRevision(final.target, final, [approval, middle, final])).toBe(true);
    expect(approvalCoversRevision(final.target, final, [approval, middle, final,
      {...middle, id: id(35), act: "revoke_approval", basisReviewId: middle.id}])).toBe(false);
    expect(approvalCoversRevision(final.target, final, [approval, {...middle, basisReviewId: final.id}, final])).toBe(false);
    for (const key of ["organizationId", "workId", "artifactId"] as const) {
      expect(approvalCoversRevision(final.target, final, [{...approval, target: {...target, [key]: id(99)}}, middle, final])).toBe(false);
    }
    expect(approvalCoversRevision(final.target, final, [{...approval, target: {...target, audience: "external"}}, middle, final])).toBe(false);
  });
  it("material changes require approve and cannot be relabeled without reasons", () => {
    expect(requiredActForChange({outcome: "material", reasons: ["block_content"]})).toBe("approve");
    expect(requiredActForChange({outcome: "cosmetic", reasons: []})).toBe("reaffirm");
    expect(requiredActForChange({outcome: "identical", reasons: []})).toBe("replay");
    expect(() => requiredActForChange({outcome: "cosmetic", reasons: ["block_content"]})).toThrow();
    expect(artifactReviewSchema.safeParse({...approval, act: "reaffirm", basisReviewId: id(99), changeReport: {outcome: "material", reasons: ["claim_value"]}}).success).toBe(false);
  });
});

describe("immutable work decisions", () => {
  const a = decision(1, null);
  const b = decision(2, null, {contested: true});
  const c = decision(3, null, {contested: true});
  it("keeps every concurrent branch and requires all of them for resolution", () => {
    for (const history of [[a, b, c], [c, a, b], [b, c, a]]) {
      const result = decisionPrecedence(history);
      expect(result.state).toBe("contested"); expect(result.current).toBeNull();
      expect(result.unresolved.map((r) => r.id)).toEqual([a.id, b.id, c.id]);
    }
    const partial = decision(4, 3, {basis: {...emptyBasis, decisions: [ref(a), ref(b)]}});
    expect(decisionPrecedence([a, b, c, partial]).state).toBe("contested");
    const resolution = decision(5, 4, {basis: {...emptyBasis, decisions: [a, b, c, partial].map(ref)}});
    expect(decisionPrecedence([a, b, c, partial, resolution]).current?.id).toBe(resolution.id);
    expect(a.contested).toBe(false); expect(b.contested).toBe(true);
  });
  it("derives conflict from expected base even if a row fails to mark contested", () => {
    expect(decisionPrecedence([a, {...b, contested: false}]).state).toBe("contested");
    expect(decisionPrecedence([a, decision(2, 1)]).state).toBe("current");
  });
  it("rejects cross scope, missing history, invalid references and duplicate command replay", () => {
    expect(() => decisionPrecedence([a, {...b, workId: id(99)}])).toThrow("decision_history_invalid");
    expect(() => decisionPrecedence([b])).toThrow("decision_history_invalid");
    expect(() => decisionPrecedence([{...a, contested: true}, decision(2, 1)])).toThrow("decision_history_invalid");
    expect(() => decisionPrecedence([a, {...b, commandId: a.commandId}])).toThrow("decision_history_invalid");
    expect(() => decisionPrecedence([a, decision(2, 1, {basis: {...emptyBasis, decisions: [{...ref(a), fingerprint: "b".repeat(64)}]}})])).toThrow("decision_basis_invalid");
  });
  it("reported decisions never queue, recompute, publish or send", () => {
    expect(reportedDecisionEffects(["none"])).toEqual(["none"]);
    for (const effect of ["queue_execution", "recompute", "freeze_assessment", "publish_vault", "send_external"]) {
      expect(() => reportedDecisionEffects([effect])).toThrow("reported_decision_has_effect");
      expect(workDecisionSchema.safeParse({...a, kind: "record_report", origin: "reported", report: {decidedBy: "CFO", forum: "Reunião", decidedOn: "2026-09-27", evidenceSourceVersionId: null}, effects: [effect]}).success).toBe(false);
    }
    expect(workDecisionSchema.safeParse({...a, origin: "reported", report: null}).success).toBe(false);
  });
});

import changeFixtures from "./fixtures/review-change-cases.json";
import {describeRevisionChange, type RevisionSnapshot} from "./artifact-protocol";
describe("review change shared SQL parity fixtures", () => {
  it.each(changeFixtures)("$name", (fixture) => {
    const report = describeRevisionChange(fixture.previous as RevisionSnapshot, fixture.next as RevisionSnapshot);
    expect(report.outcome).toBe(fixture.outcome);
    if (fixture.reason) expect(report.reasons).toContain(fixture.reason);
  });
  it("support changes and repeated claims cannot be hidden by a map overwrite", () => {
    const base = structuredClone(changeFixtures[0]!.previous) as unknown as {revision: RevisionSnapshot["revision"]; blocks: Array<Record<string, unknown>>};
    base.blocks[0]!.claims = [{claimId: "debt", kind: "fact", value: "10", unit: "BRL", period: "2026", supportIds: ["source-a"]}];
    const next = structuredClone(base);
    next.blocks[0]!.claims = [{claimId: "debt", kind: "fact", value: "10", unit: "BRL", period: "2026", supportIds: ["source-b"]}];
    expect(describeRevisionChange(base as unknown as RevisionSnapshot, next as unknown as RevisionSnapshot).reasons).toContain("claim_support");
    next.blocks.push({...next.blocks[0], blockKey: "duplicate"});
    expect(describeRevisionChange(base as unknown as RevisionSnapshot, next as unknown as RevisionSnapshot).reasons).toContain("invalid_snapshot");
  });
});
