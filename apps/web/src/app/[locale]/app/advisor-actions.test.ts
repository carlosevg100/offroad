import {beforeEach, describe, expect, it, vi} from "vitest";

const {rpc, after} = vi.hoisted(() => ({rpc: vi.fn(), after: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: vi.fn(async () => ({supabase: {rpc}})), requireUser: vi.fn()}));
vi.mock("@/lib/intake/server", () => ({processIntakeSession: vi.fn()}));
vi.mock("next/server", () => ({after}));
import {reviewAdvisorInstitutionalConfiguration, startAdvisorProject} from "./advisor-actions";

const input = {locale: "pt-BR", prompt: "Pesquise os financiadores disponíveis para nossa organização.", hasAttachments: false, requestId: "10000000-0000-4000-8000-000000000001"};
describe("persistent work entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({data: {workId: "work", capital_project_id: "work", intake_session_id: null, jobId: "job"}, error: null});
  });
  it("atomically queues a conversation without creating an intake or promising research execution", async () => {
    expect(await startAdvisorProject(input)).toEqual({ok: true, entryJob: "capital_planning", workId: "work", projectId: "work", sessionId: null});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("start_work_v1", expect.objectContaining({p_plan: null, p_prompt: input.prompt, p_enqueue: true, p_access_basis: "public_information"}));
    expect(after).not.toHaveBeenCalled();
  });
  it("preserves explicit case intent and attachments", async () => {
    await startAdvisorProject({...input, entryJobHint: "company_debt_view"});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("start_work_v1", expect.objectContaining({p_entry_job: "company_debt_view", p_plan: null, p_enqueue: true}));
    rpc.mockClear();
    await startAdvisorProject({...input, hasAttachments: true});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("start_work_v1", expect.objectContaining({p_plan: expect.any(Object), p_enqueue: false, p_access_basis: "authorized_private"}));
  });
  it("preserves denial without a second dispatch or post-response enqueue", async () => {
    rpc.mockResolvedValue({data: null, error: {code: "42501", message: "resource_access_denied"}});
    expect(await startAdvisorProject(input)).toEqual({ok: false, error: "denied"});
    expect(after).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("institutional premise decision", () => {
  const review = {requestId: input.requestId, locale: "pt-BR", projectId: input.requestId, candidateId: "10000000-0000-4000-8000-000000000002", expectedParentFingerprint: "a".repeat(64), expectedCandidateFingerprint: "b".repeat(64), decision: "approved"};
  beforeEach(() => {vi.clearAllMocks(); rpc.mockResolvedValue({data: {}, error: null});});
  it("sends both fingerprints and never dispatches calculation", async () => {
    expect(await reviewAdvisorInstitutionalConfiguration(review)).toEqual({ok: true});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("review_institutional_configuration_and_calculate_v1", {p_project_id: review.projectId, p_candidate_id: review.candidateId, p_expected_parent_fingerprint: review.expectedParentFingerprint, p_expected_candidate_fingerprint: review.expectedCandidateFingerprint, p_decision: "approved", p_request_id: review.requestId, p_locale: "pt-BR"});
    expect(after).not.toHaveBeenCalled();
  });
  it("rejects malformed decisions and surfaces stale/denied server results", async () => {
    expect(await reviewAdvisorInstitutionalConfiguration({...review, decision: "calculate"})).toEqual({ok: false, error: "invalid"});
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({error: {code: "40001", message: "institutional_review_stale"}});
    expect(await reviewAdvisorInstitutionalConfiguration(review)).toEqual({ok: false, error: "stale"});
    rpc.mockResolvedValue({error: {code: "42501", message: "institutional_review_forbidden"}});
    expect(await reviewAdvisorInstitutionalConfiguration(review)).toEqual({ok: false, error: "denied"});
  });
});
