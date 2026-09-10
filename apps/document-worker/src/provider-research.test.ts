import {describe, expect, it, vi} from "vitest";
import {buildProviderResearch, processProviderResearchJob} from "./provider-research";
import {capitalProjectAnalysisJobSchema, type CapitalProjectAnalysisJob, type QueueClient} from "./queue";
const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const job: CapitalProjectAnalysisJob = {claimed: true, job_id: id("1"), capability_token: "c".repeat(64), lease_expires_at: "2026-09-10T00:00:00Z", attempt: 1, organization_id: id("2"), intake_session_id: id("3"), processing_run_id: id("4"), kind: "capital_project_analysis",
  payload: {analysis_scope: "provider_research", locale: "pt-BR", capital_project_id: id("5"), capital_project_plan_id: id("6"), capital_project_brief_id: id("7"), capital_task_ids: ["M01", "K01", "K02"], capital_artifact_required: true, trigger_event: {}, model_budget: {max_cost_usd: 0, max_calls: 0}}};
const context = {schemaVersion: "provider-research-context.v1", organizationId: job.organization_id, projectId: job.payload.capital_project_id, planId: job.payload.capital_project_plan_id, planFingerprint: "a".repeat(64), approvalStatus: "approved", objective: "Pesquisar registros disponíveis de financiadores", locale: "pt-BR", asOf: "2026-09-09T00:00:00Z", tasks: [{id: "M01", dependencies: []}, {id: "K01", dependencies: ["M01"]}, {id: "K02", dependencies: ["K01"]}],
  providers: [{providerId: "fund-1", name: "Fundo próprio", sourceClass: "registered", ownerOrganizationId: job.organization_id, observations: [{criterion: "sectors", value: "Energia", provenance: "declared", observedAt: null}]}]};
function harness(value: unknown = context) {
  const records: Array<Record<string, unknown>> = [];
  const starts = vi.fn(async () => id("8"));
  const finish = vi.fn(async () => undefined);
  const complete = vi.fn(async () => undefined);
  const fail = vi.fn(async () => undefined);
  const queue = {loadProviderResearchContext: async () => value, startCapitalTask: starts,
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
    expect(await processProviderResearchJob(job, test)).toMatchObject({status: "succeeded"});
    expect(test.records.map(record => record.artifactType)).toEqual(["provider_research_scope", "provider_research_sources", "provider_research"]);
    expect(test.records[1]?.dependencies).toEqual([{artifactId: id("1"), artifactFingerprint: "1".repeat(64)}]);
    expect(test.records[2]?.dependencies).toEqual([{artifactId: id("2"), artifactFingerprint: "2".repeat(64)}]);
    expect(test.records[2]?.content).toMatchObject({scope: "research_only", shortlistAuthorized: false, externalEffectAllowed: false, providers: [{observations: [{criterion: "Setores", provenance: "declared", observedAt: null}]}]});
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
      expect(await processProviderResearchJob(job, test)).toEqual({status: "failed"});
      expect(test.starts).not.toHaveBeenCalled();
      expect(test.records).toEqual([]);
      expect(test.complete).not.toHaveBeenCalled();
    }
  });
  it("is stable across loader ordering and excludes later observations from the as-of readout", () => {
    const first = {...context.providers[0]!, observations: [{criterion: "ticket", value: "100", provenance: "declared", observedAt: "2026-09-10T00:00:00Z"}, context.providers[0]!.observations[0]!]};
    const second = {...first, providerId: "fund-2"};
    const ordered = buildProviderResearch({...context, providers: [first, second]}, job).artifact;
    const reordered = buildProviderResearch({...context, providers: [second, {...first, observations: [...first.observations].reverse()}]}, job).artifact;
    expect(reordered).toEqual(ordered);
    expect(ordered.providers[0]?.observations).toHaveLength(1);
    expect(ordered.providers[0]?.gaps).toContain("1 observações posteriores à data de referência foram excluídas da leitura.");
  });
  it("retries after partial persistence using the same task fingerprints and dependency references", async () => {
    const test = harness();
    const recorded = test.queue.recordCapitalProjectArtifact;
    let failed = false;
    const byInput = new Map<string, Awaited<ReturnType<typeof recorded>>>();
    test.queue.recordCapitalProjectArtifact = async (claimed, input) => {
      if (input.artifactType === "provider_research" && !failed) { failed = true; throw new Error("ECONNRESET while persisting artifact"); }
      const prior = byInput.get(input.inputFingerprint);
      if (prior) throw new Error("succeeded tasks must be read through the bound loader");
      const artifact = await recorded(claimed, input); byInput.set(input.inputFingerprint, artifact); return artifact;
    };
    expect(await processProviderResearchJob(job, test)).toEqual({status: "failed"});
    expect(test.fail).toHaveBeenCalledWith(job, expect.objectContaining({retryable: true}), {retryable: true});
    test.queue.loadProviderResearchContext = async () => ({...context, priorArtifacts: test.records.map((record, index) => ({taskId: ["M01", "K01"][index], id: id(String(index + 1)), artifactFingerprint: String(index + 1).repeat(64), inputFingerprint: record.inputFingerprint, content: record.content}))});
    expect(await processProviderResearchJob({...job, attempt: 2}, test)).toMatchObject({status: "succeeded"});
    expect(test.records.map(record => record.artifactType)).toEqual(["provider_research_scope", "provider_research_sources", "provider_research"]);
    expect(test.complete).toHaveBeenCalledOnce();
  });
  it("rejects a tampered replay before publishing or completing the result", async () => {
    const test = harness({...context, priorArtifacts: [{taskId: "M01", id: id("8"), artifactFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64), content: {objective: "Different approved work"}}]});
    expect(await processProviderResearchJob(job, test)).toEqual({status: "failed"});
    expect(test.starts).not.toHaveBeenCalled();
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("preserves empty coverage and original reference date without inventing market participants", () => {
    const result = buildProviderResearch({...context, providers: []}, job).artifact;
    expect(result.providers).toEqual([]);
    expect(result.asOf).toBe(context.asOf);
    expect(result.limitations[0]).toContain("não representa todo o mercado");
    expect(buildProviderResearch(context, job).artifact.fingerprint).toBe(buildProviderResearch(context, job).artifact.fingerprint);
    expect(buildProviderResearch({...context, asOf: "2026-09-10T00:00:00Z"}, job).artifact.fingerprint).not.toBe(buildProviderResearch(context, job).artifact.fingerprint);
  });
});

describe("pinned public research v2", () => {
  const pin = {schemaVersion: "offroad.public-capital-research.v1", snapshotId: "br-capital-2026-09-10.v1", sourceFingerprint: "f158ac09fc2a44a77d608cc57a1fbb074f7de8b88d558ce9d29bff917429f235", asOf: "2026-09-10"};
  const v2 = {...context, schemaVersion: "provider-research-context.v2", publicCatalog: pin, asOf: "2026-09-10T12:00:00Z", providers: []};
  it("delivers 28 real sourced public profiles even with an empty private directory, without funding claims", async () => {
    const artifact = buildProviderResearch(v2, job).artifact;
    expect(artifact.schemaVersion).toBe("provider-research.v2");
    expect(artifact.providers).toHaveLength(28);
    expect(artifact.providers.every(row => row.sourceClass === "public_research")).toBe(true);
    expect(artifact.providers[0]?.observations[0]).toMatchObject({observedAt: "2026-09-10T00:00:00Z", sources: [{url: "https://www.itau.com.br/empresas/emprestimos-financiamentos"}]});
    expect(JSON.stringify(artifact)).not.toContain("ownerOrganizationId");
    expect(artifact.shortlistAuthorized).toBe(false);
    expect(artifact.externalEffectAllowed).toBe(false);
    const test = harness(v2);
    expect(await processProviderResearchJob(job, test)).toMatchObject({status: "succeeded"});
    expect(test.records).toHaveLength(3);
    for (const record of test.records) expect(record.content).toMatchObject({publicCatalog: pin});
    for (const call of test.starts.mock.calls as unknown as Array<[unknown, {executorVersion: string}]>) expect(call[1].executorVersion).toBe("2026.09.10-v2");
    test.queue.loadProviderResearchContext = async () => ({...v2, priorArtifacts: test.records.map((record, index) => ({taskId: ["M01", "K01", "K02"][index], id: id(String(index + 1)), artifactFingerprint: String(index + 1).repeat(64), inputFingerprint: record.inputFingerprint, content: record.content}))});
    expect(await processProviderResearchJob({...job, attempt: 2}, test)).toMatchObject({status: "succeeded"});
    expect(test.records).toHaveLength(3);
  });
  it("refuses unknown or modified pins and reference dates before the catalog instead of falling back", async () => {
    for (const invalid of [{...v2, publicCatalog: {...pin, sourceFingerprint: "f".repeat(64)}}, {...v2, publicCatalog: {...pin, snapshotId: "future"}}, {...v2, publicCatalog: {...pin, asOf: "2026-09-11"}}, {...v2, asOf: "2026-09-09T00:00:00Z"}]) {
      const test = harness(invalid);
      expect(await processProviderResearchJob(job, test)).toEqual({status: "failed"});
      expect(test.records).toHaveLength(0);
      expect(test.complete).not.toHaveBeenCalled();
    }
  });
  it("supports 500 private records plus 28 public profiles and identifies intermediary roles", () => {
    const privateProviders = Array.from({length: 500}, (_, index) => ({...context.providers[0]!, providerId: `fund-${index}`}));
    const artifact = buildProviderResearch({...v2, providers: privateProviders}, job).artifact;
    expect(artifact.providers).toHaveLength(528);
    expect(artifact.providers.find(row => row.providerId === "public:bradesco-bbi")?.observations[0]?.value).toBe("Estruturador / distribuidor");
    expect(artifact.providers.find(row => row.providerId === "public:oliveira-trust")?.observations[0]?.value).toBe("Serviços fiduciários");
  });
  it("preserves private ownership checks, while public and private identities remain distinct", () => {
    const artifact = buildProviderResearch({...v2, providers: context.providers}, job).artifact;
    expect(artifact.providers).toHaveLength(29);
    expect(artifact.providers[0]?.sourceClass).toBe("registered");
    expect(() => buildProviderResearch({...v2, providers: [{...context.providers[0], ownerOrganizationId: id("9")}]}, job)).toThrow();
    expect(buildProviderResearch({...context, providers: []}, job).artifact.providers).toHaveLength(0);
  });
});

it("preserves the exact pre-bridge v1 artifact and fingerprint", async () => {
  const {default: golden} = await import("./provider-research-v1.fixture.json");
  expect(buildProviderResearch(golden.context, golden.job as CapitalProjectAnalysisJob).artifact).toEqual(golden.artifact);
});
