import {describe, expect, it, vi} from "vitest";
import {buildProviderCaseFitWork, processProviderCaseFitJob} from "./provider-case-fit";
import {capitalProjectAnalysisJobSchema, type CapitalProjectAnalysisJob, type QueueClient} from "./queue";
const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const job: CapitalProjectAnalysisJob = {claimed: true, job_id: id("1"), capability_token: "c".repeat(64), lease_expires_at: "2026-09-10T00:00:00Z", attempt: 1, organization_id: id("2"), intake_session_id: id("3"), processing_run_id: id("4"), kind: "capital_project_analysis",
  payload: {analysis_scope: "provider_case_fit", locale: "pt-BR", capital_project_id: id("5"), capital_project_plan_id: id("6"), capital_project_brief_id: id("7"), capital_task_ids: ["M01", "K01", "K02"], capital_artifact_required: true, trigger_event: {}, model_budget: {max_cost_usd: 0, max_calls: 0}}};
const context = {schemaVersion: "provider-case-fit-context.v1", organizationId: job.organization_id, projectId: job.payload.capital_project_id, planId: job.payload.capital_project_plan_id, planFingerprint: "a".repeat(64), approvalStatus: "approved", objective: "Pesquisar registros disponíveis de financiadores", locale: "pt-BR", asOf: "2026-09-09T00:00:00Z", tasks: [{id: "M01", dependencies: []}, {id: "K01", dependencies: ["M01"]}, {id: "K02", dependencies: ["K01"]}],
  caseCriteria: {schemaVersion:"provider-case-criteria.v1",asOf:"2026-09-09T00:00:00Z",currency:"BRL",source:{kind:"user_confirmed",referenceId:id("8")}},
  providers: [{providerId:"fund-1",name:"Fundo próprio",sourceClass:"registered",ownerOrganizationId:job.organization_id,mandate:{active:[],ticket:[],termMonths:[],sectors:[],geographies:[],instruments:[],collateral:[],currencies:[],leverageCeiling:[],minimumDscr:[]}}]};
function harness(value: unknown = context) {
  const records: Array<Record<string, unknown>> = [];
  const starts = vi.fn(async () => id("8"));
  const finish = vi.fn(async () => undefined);
  const complete = vi.fn(async () => undefined);
  const fail = vi.fn(async () => undefined);
  const queue = {loadProviderCaseFitContext: async () => value, startCapitalTask: starts,
    recordCapitalProjectArtifact: async (_job: unknown, input: Record<string, unknown>) => {records.push(input); return {id: id(String(records.length)), artifactFingerprint: String(records.length).repeat(64), artifactVersion: 1, replayed: false};},
    finishCapitalTask: finish, complete, fail} as unknown as QueueClient;
  return {queue, records, starts, finish, complete, fail};
}
describe("provider research runtime", () => {
  it("claims this research with zero model budget without weakening budgets for other scopes", () => {
    expect(capitalProjectAnalysisJobSchema.safeParse(job).success).toBe(true);
    expect(capitalProjectAnalysisJobSchema.safeParse({...job, payload: {...job.payload, model_budget: {max_cost_usd: 1, max_calls: 1}}}).success).toBe(false);
    expect(capitalProjectAnalysisJobSchema.safeParse({...job, payload: {...job.payload, analysis_scope: "company_debt_view"}}).success).toBe(false);
  });
  it("executes only the three approved tasks and persists a separate research result with dependencies", async () => {
    const test = harness();
    expect(await processProviderCaseFitJob(job, test)).toMatchObject({status: "succeeded"});
    expect(test.records.map(record => record.artifactType)).toEqual(["provider_case_fit_scope", "provider_case_fit_sources", "provider_case_fit"]);
    expect(test.records[1]?.dependencies).toEqual([{artifactId: id("1"), artifactFingerprint: "1".repeat(64)}]);
    expect(test.records[2]?.dependencies).toEqual([{artifactId: id("2"), artifactFingerprint: "2".repeat(64)}]);
    expect(test.records[2]?.content).toMatchObject({scope: "research_case_fit", shortlistAuthorized: false, externalEffectAllowed: false, candidates: [{providerId:"fund-1",reviewReadiness:"requires_confirmation"}]});
    expect(test.finish.mock.calls).toHaveLength(3);
    expect(test.complete).toHaveBeenCalledOnce();
    expect(test.fail).not.toHaveBeenCalled();
  });
  it("rejects foreign ownership, project, unapproved or changed graph before writing anything", async () => {
    for (const invalid of [
      {...context, providers: [{...context.providers[0], ownerOrganizationId: id("9")}]},
      {...context, projectId: id("9")}, {...context, approvalStatus: "draft"},
      {...context, tasks: [context.tasks[0], context.tasks[1], {id: "K02", dependencies: []}]},
      {...context, tasks: [context.tasks[0], context.tasks[1], {id: "K04", dependencies: ["K01"]}]},
    ]) {
      const test = harness(invalid);
      expect(await processProviderCaseFitJob(job, test)).toEqual({status: "failed"});
      expect(test.starts).not.toHaveBeenCalled();
      expect(test.records).toEqual([]);
      expect(test.complete).not.toHaveBeenCalled();
    }
  });
  it("retries after partial persistence using the same task fingerprints and dependency references", async () => {
    const test = harness();
    const recorded = test.queue.recordCapitalProjectArtifact;
    let failed = false;
    const byInput = new Map<string, Awaited<ReturnType<typeof recorded>>>();
    test.queue.recordCapitalProjectArtifact = async (claimed, input) => {
      if (input.artifactType === "provider_case_fit" && !failed) { failed = true; throw new Error("ECONNRESET while persisting artifact"); }
      const prior = byInput.get(input.inputFingerprint);
      if (prior) throw new Error("succeeded tasks must be read through the bound loader");
      const artifact = await recorded(claimed, input); byInput.set(input.inputFingerprint, artifact); return artifact;
    };
    expect(await processProviderCaseFitJob(job, test)).toEqual({status: "failed"});
    expect(test.fail).toHaveBeenCalledWith(job, expect.objectContaining({retryable: true}), {retryable: true});
    test.queue.loadProviderCaseFitContext = async () => ({...context, priorArtifacts: test.records.map((record, index) => ({taskId: ["M01", "K01"][index], id: id(String(index + 1)), artifactFingerprint: String(index + 1).repeat(64), inputFingerprint: record.inputFingerprint, content: record.content}))});
    expect(await processProviderCaseFitJob({...job, attempt: 2}, test)).toMatchObject({status: "succeeded"});
    expect(test.records.map(record => record.artifactType)).toEqual(["provider_case_fit_scope", "provider_case_fit_sources", "provider_case_fit"]);
    expect(test.complete).toHaveBeenCalledOnce();
  });
  it("rejects a tampered replay before publishing or completing the result", async () => {
    const test = harness({...context, priorArtifacts: [{taskId: "M01", id: id("8"), artifactFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64), content: {objective: "Different approved work"}}]});
    expect(await processProviderCaseFitJob(job, test)).toEqual({status: "failed"});
    expect(test.starts).not.toHaveBeenCalled();
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("preserves empty coverage without inventing participants",()=>{
    expect(buildProviderCaseFitWork({...context,providers:[]},job).artifact.candidates).toEqual([]);
  });
});
