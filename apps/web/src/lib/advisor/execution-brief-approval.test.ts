import {describe, expect, it} from "vitest";
import {projectExecutionBriefApproval} from "./execution-brief-approval";

const expected = {id: "00000000-0000-4000-8000-000000000001", fingerprint: "a".repeat(64), version: 3};
const proposed = {status: "proposed", execution_brief_id: expected.id, brief_fingerprint: expected.fingerprint,
  processing_job_id: "00000000-0000-4000-8000-000000000002", accepted_at: null};

describe("execution brief approval projection", () => {
  it("exposes a bound proposed job without manufacturing approval", () => {
    expect(projectExecutionBriefApproval(proposed, expected)).toEqual({status: "awaiting", fingerprint: expected.fingerprint, version: 3});
  });
  it.each([null, {}, {...proposed, execution_brief_id: proposed.processing_job_id},
    {...proposed, brief_fingerprint: "b".repeat(64)}, {...proposed, processing_job_id: null},
    {...proposed, status: "approved"}, {...proposed, status: "approved", accepted_at: "yesterday"}, {...proposed, reason: "approved"}])("fails closed for unbound or incomplete state", (raw) => {
    expect(projectExecutionBriefApproval(raw, expected).status).toBe("unavailable");
  });
  it("keeps a persisted approval and superseded state distinct", () => {
    expect(projectExecutionBriefApproval({...proposed, status: "approved", accepted_at: "2026-09-08T02:00:00Z"}, expected).status).toBe("approved");
    expect(projectExecutionBriefApproval({...proposed, status: "superseded", processing_job_id: null}, expected).status).toBe("superseded");
  });
  it("preserves a prerequisite explanation without permitting an unbound job", () => {
    const result = projectExecutionBriefApproval({...proposed, status: "unavailable", processing_job_id: null,
      reason: "awaiting_preliminary_confirmation"}, expected);
    expect(result).toMatchObject({status: "unavailable", reason: "awaiting_preliminary_confirmation"});
    expect(projectExecutionBriefApproval({...proposed, reason: "unknown_permission"}, expected).status).toBe("unavailable");
  });

});
