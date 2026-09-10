import {beforeEach, describe, expect, it, vi} from "vitest";
import {providerResearchPlanSnapshot} from "@offroad/work-plan";

const {rpc, after} = vi.hoisted(() => ({rpc: vi.fn(), after: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: vi.fn(async () => ({supabase: {rpc}})), requireUser: vi.fn()}));
vi.mock("@/lib/intake/server", () => ({processIntakeSession: vi.fn()}));
vi.mock("next/server", () => ({after}));
import {reviewAdvisorInstitutionalConfiguration, startAdvisorProject} from "./advisor-actions";

const input = {locale: "pt-BR", prompt: "Pesquise os financiadores disponíveis para nossa organização.", hasAttachments: false, requestId: "10000000-0000-4000-8000-000000000001"};
describe("provider research activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({data: {capital_project_id: "project", intake_session_id: "session", research_job_id: "job"}, error: null});
  });
  it("persists the research plan through its real command without dispatching a generic initial turn", async () => {
    expect(await startAdvisorProject(input)).toEqual({ok: true, entryJob: "company_debt_view", projectId: "project", sessionId: "session"});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("start_provider_research_project_v1", expect.objectContaining({p_plan: providerResearchPlanSnapshot(), p_prompt: input.prompt}));
    expect(after).not.toHaveBeenCalled();
  });
  it("preserves explicit case intent and attachments", async () => {
    await startAdvisorProject({...input, entryJobHint: "company_debt_view"});
    expect(rpc.mock.calls[0][0]).toBe("start_advisor_project_in_group_v1");
    rpc.mockClear();
    await startAdvisorProject({...input, hasAttachments: true});
    expect(rpc.mock.calls[0][0]).toBe("start_advisor_project_in_group_v1");
  });
  it("does not navigate or queue after rejection of the research contract", async () => {
    rpc.mockResolvedValue({data: null, error: {code: "42501", message: "provider_research_project_denied"}});
    expect(await startAdvisorProject(input)).toEqual({ok: false, error: "denied"});
    expect(after).not.toHaveBeenCalled();
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
