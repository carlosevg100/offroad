import {describe, expect, it, vi} from "vitest";
import {capitalProjectPlanSnapshot} from "@offroad/work-plan";
import {processExecutionBriefProposalJob} from "./execution-brief-proposal";
import {claimedJobSchema, type ExecutionBriefProposalJob} from "./queue";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job: ExecutionBriefProposalJob = {claimed: true, kind: "execution_brief_proposal", job_id: id(1), capability_token: "a".repeat(40), lease_expires_at: "2026-09-08T00:00:00Z", attempt: 1, organization_id: id(2), intake_session_id: id(3), processing_run_id: id(4), payload: {approval_target_job_id: id(5), locale: "pt-BR"}};
function context(access_basis = "authorized_private") {
  return {target_kind: "case_analysis", input_fingerprint: "f".repeat(64), target_job_id: id(5), locale: "pt-BR", project: {entry_job: "structure_from_documents", id: id(6), name: "Company", access_basis}, objective: "Revisar posição de liquidez e próximos caminhos", documents: [{id: id(7), name: "Budget.xlsx"}], plan: capitalProjectPlanSnapshot("structure_from_documents")};
}
function queue(value: unknown) {return {loadExecutionBriefProposal: vi.fn().mockResolvedValue(value), recordExecutionBriefProposal: vi.fn().mockResolvedValue({status: "proposed"}), fail: vi.fn()};}
describe("execution brief proposal", () => {
  it("claims the distinct planning kind and rejects a missing immutable target", () => {
    expect(claimedJobSchema.parse(job).kind).toBe("execution_brief_proposal");
    expect(claimedJobSchema.safeParse({...job, payload: {locale: "pt-BR"}}).success).toBe(false);
  });
  it("records only a consent-requiring proposal, preserving private sources and leaving dispatch to SQL", async () => {
    const q = queue(context());
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    expect(q.recordExecutionBriefProposal).toHaveBeenCalledOnce();
    expect(q.recordExecutionBriefProposal.mock.calls[0]![3]).toBe("f".repeat(64));
    const [, internal, visible] = q.recordExecutionBriefProposal.mock.calls[0]!;
    expect(internal.authority.evidenceRegime).toBe("private");
    expect(visible.executionMode).not.toBe("start_after_display");
    expect(internal.sources ?? internal.currentContext).toBeDefined();
    expect(JSON.stringify(visible)).not.toContain('"informationClass":"public"');
    expect(q.fail).not.toHaveBeenCalled();
  });
  it("keeps missing private documents as a request instead of claiming availability", async () => {
    const q = queue({...context(), documents: []});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    const internal = q.recordExecutionBriefProposal.mock.calls[0]![1];
    const documents = internal.workstreams.flatMap((stream: {sources: Array<{role: string; status: string}>}) => stream.sources).filter((source: {role: string}) => source.role === "provided_documents");
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((source: {status: string}) => source.status === "to_request")).toBe(true);
  });
  it("preserves public scope without claiming public research has already happened", async () => {
    const q = queue({...context("public_information"), documents: [], plan: capitalProjectPlanSnapshot("company_debt_view")});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    const [, internal, visible] = q.recordExecutionBriefProposal.mock.calls[0]!;
    expect(internal.authority.evidenceRegime).toBe("public");
    expect(visible.executionMode).toBe("confirm_before_expensive_work");
    const publicSources = internal.workstreams.flatMap((stream: {sources: Array<{informationClass: string; status: string}>}) => stream.sources).filter((source: {informationClass: string}) => source.informationClass === "public");
    expect(publicSources.length).toBeGreaterThan(0);
    expect(publicSources.every((source: {status: string}) => source.status === "to_research")).toBe(true);
  });
  it("rejects context for a different held job before recording anything", async () => {
    const q = queue({...context(), target_job_id: id(99)});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "failed"});
    expect(q.recordExecutionBriefProposal).not.toHaveBeenCalled();
    expect(q.fail).toHaveBeenCalledOnce();
  });
  it("bootstraps only a missing case plan with the existing canonical compiler", async () => {
    const q = queue({...context(), plan: null});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    expect(q.recordExecutionBriefProposal.mock.calls[0]![4]).toEqual(capitalProjectPlanSnapshot("structure_from_documents"));
    const existing = queue(context()); await processExecutionBriefProposalJob(job, existing);
    expect(existing.recordExecutionBriefProposal.mock.calls[0]![4]).toBeNull();
    const capital = queue({...context(), target_kind: "capital_project_analysis", plan: null});
    expect(await processExecutionBriefProposalJob(job, capital)).toEqual({status: "failed"});
    expect(capital.recordExecutionBriefProposal).not.toHaveBeenCalled();
  });
  it("supports the existing preview work product without changing its task graph", async () => {
    const canonical = capitalProjectPlanSnapshot("origination_thesis");
    const plan = {...canonical, taskSpecs: [{id: "C05", dependencies: [], effect: "propose_state"}, {id: "A03", dependencies: ["C05"], effect: "propose_state"}]};
    const q = queue({...context("public_information"), plan: {...plan, job: {...plan.job, firstWorkProduct: "preview_meeting_brief"}}});
    const outcome = await processExecutionBriefProposalJob(job, q);
    expect(q.fail.mock.calls).toEqual([]);
    expect(outcome).toEqual({status: "proposed"});
    expect(q.recordExecutionBriefProposal.mock.calls[0]![2].proposedDeliverable).toContain("em validação");
    expect(q.recordExecutionBriefProposal.mock.calls[0]![2].workstreams).toHaveLength(2);
  });
  it("retries transient transport failures with the same bounded planning job", async () => {
    const q = queue(context()); q.loadExecutionBriefProposal.mockRejectedValue(new Error("fetch failed: ECONNRESET"));
    await processExecutionBriefProposalJob(job, q);
    expect(q.fail.mock.calls[0]![0]).toBe(job);
    expect(q.fail.mock.calls[0]![2]).toEqual({retryable: true});
    expect(q.recordExecutionBriefProposal).not.toHaveBeenCalled();
    const exhausted = queue(context()); exhausted.loadExecutionBriefProposal.mockRejectedValue(new Error("fetch failed: ECONNRESET"));
    await processExecutionBriefProposalJob({...job, attempt: 3}, exhausted);
    expect(exhausted.fail.mock.calls[0]![2]).toEqual({retryable: false});
  });
  it("gives two dispatches distinct fingerprints without changing visible economic content", async () => {
    const q1 = queue(context()); const q2 = queue({...context(), target_job_id: id(8)});
    await processExecutionBriefProposalJob(job, q1);
    await processExecutionBriefProposalJob({...job, payload: {...job.payload, approval_target_job_id: id(8)}}, q2);
    const first = q1.recordExecutionBriefProposal.mock.calls[0]![2]; const second = q2.recordExecutionBriefProposal.mock.calls[0]![2];
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect({...first, fingerprint: null}).toEqual({...second, fingerprint: null});
  });
});
