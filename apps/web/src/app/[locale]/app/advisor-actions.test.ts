import {beforeEach, describe, expect, it, vi} from "vitest";

const {rpc, after} = vi.hoisted(() => ({rpc: vi.fn(), after: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: vi.fn(async () => ({supabase: {rpc}})), requireUser: vi.fn()}));
vi.mock("@/lib/intake/server", () => ({processIntakeSession: vi.fn()}));
vi.mock("next/server", () => ({after}));
vi.mock("next-intl/server", async () => {
  const {createTranslator} = await import("next-intl");
  const catalogues = {"pt-BR": (await import("../../../../messages/pt-BR.json")).default, "en-US": (await import("../../../../messages/en-US.json")).default};
  const translator = createTranslator as unknown as (config: {locale: string; messages: unknown; namespace: string}) => unknown;
  return {getTranslations: async ({locale, namespace}: {locale: "pt-BR" | "en-US"; namespace: string}) => translator({locale, messages: catalogues[locale], namespace})};
});
import {appendAdvisorMessage, continueAdvisorWorkFromBase, reviewAdvisorInstitutionalConfiguration, sendAdvisorMessageAsTurn, startAdvisorProject} from "./advisor-actions";

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

describe("conversation routing of a continuation", () => {
  const work = "10000000-0000-4000-8000-000000000010";
  const message = "10000000-0000-4000-8000-000000000011";
  const ref = (n: number) => `a4220000-0000-4000-9000-${String(n).padStart(12, "0")}`;
  const milestone = (n: number, sequence: number, kind: string, label: string, extra: Record<string, unknown> = {}) => ({
    milestoneId: ref(n), sequence, kind, subjectKind: kind === "execution_result" ? "work_execution" : "capital_project_artifact", subjectId: ref(100 + n), label,
    revision: kind === "decision" || kind === "update_adopted" ? 2 : null, outcome: kind === "execution_result" ? "succeeded" : null, references: [], createdBy: ref(900),
    occurredAt: `2026-09-25T12:0${sequence}:00+00:00`, ...extra,
  });
  const view = (milestones: unknown[]) => ({schemaVersion: "work-update-view.v1", workId: work, conversationId: null, milestones, bases: [], updates: [], followups: []});
  const approved = [
    milestone(1, 1, "execution_result", "Cenário de alongamento"),
    milestone(2, 2, "decision", "Alongamento com os bancos atuais", {references: [ref(1)]}),
    milestone(3, 3, "execution_result", "Refinanciamento por debêntures"),
    milestone(4, 4, "decision", "Emissão de debêntures", {references: [ref(3)]}),
  ];
  const turn = (content: string) => ({locale: "pt-BR", projectId: work, content, messageId: message});
  const responses = (answers: Record<string, unknown>) => rpc.mockImplementation(async (name: string) => answers[name] ?? {data: null, error: {code: "XX000", message: `unexpected ${name}`}});
  const called = () => rpc.mock.calls.map(([name]) => name);

  beforeEach(() => vi.clearAllMocks());

  it("records a continuation from the one approved base the text names, with its decision and revision, and replies with it", async () => {
    responses({
      work_update_view_v1: {data: view(approved), error: null},
      request_work_continuation_v1: {data: {requestId: message, base: {milestoneId: ref(2), decisionId: ref(102), revision: 2, kind: "decision", label: "Alongamento com os bancos atuais"}}, error: null},
    });
    expect(await appendAdvisorMessage(turn("Aprofundar o alongamento aprovado"))).toEqual({ok: true, continuation: {status: "proposed",
      base: {milestoneId: ref(2), decisionId: ref(102), revision: 2, label: "Alongamento com os bancos atuais"}}});
    expect(called()).toEqual(["work_update_view_v1", "request_work_continuation_v1"]);
    expect(rpc).toHaveBeenLastCalledWith("request_work_continuation_v1", {p_request_id: message, p_work_id: work, p_locale: "pt-BR",
      p_content: "Aprofundar o alongamento aprovado", p_base_milestone_id: ref(2), p_base_decision_id: ref(102), p_base_revision: 2});
  });

  it("returns the question with the options and records nothing when the base is ambiguous", async () => {
    const two = [...approved, milestone(5, 5, "execution_result", "Alongamento via debêntures"), milestone(6, 6, "decision", "Alongamento com debêntures", {references: [ref(5)]})];
    responses({work_update_view_v1: {data: view(two), error: null}});
    const result = await appendAdvisorMessage(turn("Aprofundar o alongamento"));
    expect(result).toEqual({ok: true, continuation: {status: "question", code: "ambiguous_base", options: [
      {milestoneId: ref(2), decisionId: ref(102), revision: 2, label: "Alongamento com os bancos atuais"},
      {milestoneId: ref(6), decisionId: ref(106), revision: 2, label: "Alongamento com debêntures"},
    ]}});
    expect(called()).toEqual(["work_update_view_v1"]);
  });

  it("asks with no option when the work has no approved base, and records nothing", async () => {
    responses({work_update_view_v1: {data: view([milestone(1, 1, "execution_result", "Cenário")]), error: null}});
    expect(await appendAdvisorMessage(turn("Aprofundar o cenário"))).toEqual({ok: true, continuation: {status: "question", code: "no_approved_base", options: []}});
    expect(called()).toEqual(["work_update_view_v1"]);
  });

  it("works in a work without an intake session: a named draft that cannot be revised falls back to the continuation", async () => {
    responses({
      submit_advisor_artifact_revision_turn_v1: {data: null, error: {code: "P0002", message: "query returned no rows"}},
      work_update_view_v1: {data: view(approved), error: null},
    });
    // No draft exists here, and no approved base is called a draft: the person is asked, nothing is recorded.
    const result = await appendAdvisorMessage(turn("Revisar o rascunho do alongamento"));
    expect(result).toMatchObject({ok: true, continuation: {status: "question", code: "no_approved_base"}});
    expect(called()).toEqual(["submit_advisor_artifact_revision_turn_v1", "work_update_view_v1"]);
  });

  it("keeps the draft revision path only when the message names the draft and a draft awaits confirmation", async () => {
    responses({submit_advisor_artifact_revision_turn_v1: {data: {status: "queued"}, error: null}});
    expect(await appendAdvisorMessage(turn("Aprofunde o rascunho com premissas editáveis"))).toEqual({ok: true});
    expect(called()).toEqual(["submit_advisor_artifact_revision_turn_v1"]);
    vi.clearAllMocks();
    responses({append_work_turn_v1: {data: {status: "queued"}, error: null}});
    // A revision request that does not name the draft is an ordinary turn: never the draft by default.
    expect(await appendAdvisorMessage(turn("Corrija o prazo e inclua um cenário downside"))).toEqual({ok: true});
    expect(called()).toEqual(["append_work_turn_v1"]);
  });

  it("fails closed on a refused base or a denied read, and never falls back to an ordinary turn", async () => {
    responses({work_update_view_v1: {data: null, error: {code: "42501", message: "work_continuation_access_denied"}}});
    expect(await appendAdvisorMessage(turn("Aprofundar o alongamento aprovado"))).toEqual({ok: false, error: "denied"});
    vi.clearAllMocks();
    responses({
      work_update_view_v1: {data: view(approved), error: null},
      request_work_continuation_v1: {data: null, error: {code: "40001", message: "work_continuation_base_superseded"}},
    });
    expect(await appendAdvisorMessage(turn("Aprofundar o alongamento aprovado"))).toEqual({ok: false, error: "stale"});
    expect(called()).not.toContain("append_work_turn_v1");
  });

  it("records the base the person chose, or sends the text as an ordinary turn", async () => {
    responses({request_work_continuation_v1: {data: {base: {label: "dependency_update_adopted"}}, error: null}, append_work_turn_v1: {data: {}, error: null}});
    const chosen = await continueAdvisorWorkFromBase({...turn("Aprofundar o alongamento"), base: {milestoneId: "a5ee8591-a849-a54e-9f9b-5663cc91bc07", decisionId: ref(200), revision: 4}});
    expect(chosen).toEqual({ok: true, continuation: {status: "proposed", base: {milestoneId: "a5ee8591-a849-a54e-9f9b-5663cc91bc07", decisionId: ref(200), revision: 4, label: "Atualização adotada"}}});
    expect(await sendAdvisorMessageAsTurn(turn("Aprofundar o alongamento"))).toEqual({ok: true});
    expect(called()).toEqual(["request_work_continuation_v1", "append_work_turn_v1"]);
    expect(await continueAdvisorWorkFromBase({...turn("Aprofundar"), base: {milestoneId: "not-an-id", decisionId: ref(200), revision: 4}})).toEqual({ok: false, error: "invalid"});
  });
});
