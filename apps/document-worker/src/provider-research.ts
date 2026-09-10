import {providerResearchCriterionLabels, providerResearchCoverageGaps} from "@offroad/credit-playbook";
import {fingerprintJson} from "@offroad/case-understanding";
import {compileProviderResearchArtifact} from "@offroad/work-plan";
import {z} from "zod";
import {describeJobFailure} from "./job-failure";
import {completeAdvisorSpecializedWork} from "./advisor-specialized-completion";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

const observation = z.object({criterion: z.enum(["ticket", "ticket_min", "ticket_max", "term_months", "term_months_min", "term_months_max", "sectors", "instruments", "structure_types", "collateral", "geographies", "leverage_ceiling", "minimum_dscr", "active"]), value: z.string().min(1).max(2000), provenance: z.string().min(1).max(100), observedAt: z.iso.datetime({offset: true}).nullable()}).strict();
export const providerResearchContextSchema = z.object({
  schemaVersion: z.literal("provider-research-context.v1"), organizationId: z.uuid(), projectId: z.uuid(), planId: z.uuid(), planFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  approvalStatus: z.literal("approved"), objective: z.string().min(1).max(20000), locale: z.enum(["pt-BR", "en-US"]), asOf: z.iso.datetime({offset: true}),
  tasks: z.array(z.object({id: z.enum(["M01", "K01", "K02"]), dependencies: z.array(z.string())}).strict()).length(3),
  priorArtifacts: z.array(z.object({taskId: z.enum(["M01", "K01", "K02"]), id: z.uuid(), artifactFingerprint: z.string().regex(/^[a-f0-9]{64}$/), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), content: z.record(z.string(), z.unknown())}).strict()).max(3).default([]),
  providers: z.array(z.object({providerId: z.string().min(1).max(200), name: z.string().min(1).max(500), sourceClass: z.enum(["directory", "registered"]), ownerOrganizationId: z.uuid(), observations: z.array(observation).max(100)}).strict()).max(500),
}).strict();
const graph = [{id: "M01", dependencies: []}, {id: "K01", dependencies: ["M01"]}, {id: "K02", dependencies: ["K01"]}];
export function buildProviderResearch(contextValue: unknown, job: CapitalProjectAnalysisJob) {
  const context = providerResearchContextSchema.parse(contextValue);
  if (job.payload.analysis_scope !== "provider_research" || job.payload.revision_of_artifact_id
    || context.organizationId !== job.organization_id || context.projectId !== job.payload.capital_project_id
    || context.planId !== job.payload.capital_project_plan_id || context.locale !== job.payload.locale
    || context.tasks.some((task, index) => task.id !== graph[index]!.id || JSON.stringify(task.dependencies) !== JSON.stringify(graph[index]!.dependencies))
    || JSON.stringify(job.payload.capital_task_ids) !== JSON.stringify(graph.map(task => task.id))
    || new Set(context.priorArtifacts.map(item => item.taskId)).size !== context.priorArtifacts.length
    || context.providers.some(provider => provider.ownerOrganizationId !== context.organizationId)
    || new Set(context.providers.map(provider => `${provider.sourceClass}:${provider.providerId}`)).size !== context.providers.length) throw new Error("provider_research_context_binding_invalid");
  context.providers.sort((a, b) => `${a.sourceClass}:${a.providerId}` < `${b.sourceClass}:${b.providerId}` ? -1 : `${a.sourceClass}:${a.providerId}` > `${b.sourceClass}:${b.providerId}` ? 1 : 0);
  for (const provider of context.providers) provider.observations.sort((a, b) => {
    const left = JSON.stringify([a.criterion, a.observedAt, a.provenance, a.value]);
    const right = JSON.stringify([b.criterion, b.observedAt, b.provenance, b.value]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const pt = context.locale === "pt-BR";
  const providers = context.providers.map(({ownerOrganizationId: _owner, ...provider}) => ({
    ...provider,
    observations: provider.observations.filter(item => item.observedAt === null || Date.parse(item.observedAt) <= Date.parse(context.asOf)).map(item => ({...item, criterion: providerResearchCriterionLabels[item.criterion]?.[pt ? 0 : 1] ?? item.criterion.replaceAll("_", " ")})),
    gaps: providerResearchCoverageGaps(provider.observations, context.asOf, context.locale, provider.sourceClass),
  }));
  return {context, artifact: compileProviderResearchArtifact({
    schemaVersion: "provider-research.v1", scope: "research_only", projectId: context.projectId, planId: context.planId, planFingerprint: context.planFingerprint,
    locale: context.locale, objective: context.objective, asOf: context.asOf, sourceFingerprint: fingerprintJson(context.providers), providers,
    limitations: [pt ? "Cobertura limitada aos registros que esta organização tem autorização para consultar; não representa todo o mercado." : "Coverage is limited to records this organization is authorized to read; it does not represent the whole market.",
      pt ? "Declarações e observações são preservadas como registradas; esta pesquisa não seleciona financiadores nem autoriza contato." : "Declarations and observations are preserved as recorded; this research neither selects lenders nor authorizes contact."],
    shortlistAuthorized: false, externalEffectAllowed: false,
  })};
}

/** This processor consumes a separately authorized loader, never the internal matching universe. */
export async function processProviderResearchJob(job: CapitalProjectAnalysisJob, dependencies: {queue: QueueClient}) {
  const {queue} = dependencies;
  let runningTaskId: string | null = null;
  try {
    if (!queue.loadProviderResearchContext) throw new Error("provider_research_loader_unavailable");
    const {context, artifact} = buildProviderResearch(await queue.loadProviderResearchContext(job), job);
    let previous: {id: string; artifactFingerprint: string} | null = null;
    for (const task of context.tasks) {
      const content = task.id === "K02" ? artifact : task.id === "M01"
        ? {schemaVersion: "provider-research-scope.v1", projectId: context.projectId, planId: context.planId, objective: context.objective, asOf: context.asOf, scope: "research_only"}
        : {schemaVersion: "provider-research-sources.v1", projectId: context.projectId, planId: context.planId, sourceFingerprint: artifact.sourceFingerprint, providerCount: artifact.providers.length, asOf: context.asOf};
      const inputFingerprint = fingerprintJson({executorKey: "provider_research", executorVersion: "2026.09.10-v1", planFingerprint: context.planFingerprint, taskId: task.id, content, dependency: previous?.artifactFingerprint ?? null});
      const prior = context.priorArtifacts.find(item => item.taskId === task.id);
      if (prior) {
        if (prior.inputFingerprint !== inputFingerprint || fingerprintJson(prior.content) !== fingerprintJson(content)) throw new Error("provider_research_replay_mismatch");
        previous = {id: prior.id, artifactFingerprint: prior.artifactFingerprint};
        continue;
      }
      runningTaskId = await queue.startCapitalTask(job, {taskId: task.id, executorKey: "provider_research", executorVersion: "2026.09.10-v1", inputFingerprint,
        contextManifest: {projectId: context.projectId, planId: context.planId, sourceFingerprint: artifact.sourceFingerprint, scope: "research_only"}});
      const recorded = await queue.recordCapitalProjectArtifact(job, {taskRunId: runningTaskId, artifactType: task.id === "K02" ? "provider_research" : task.id === "M01" ? "provider_research_scope" : "provider_research_sources",
        schemaVersion: content.schemaVersion, status: "draft", inputFingerprint, content,
        evidenceRefs: [], dependencies: previous ? [{artifactId: previous.id, artifactFingerprint: previous.artifactFingerprint}] : []});
      await queue.finishCapitalTask(job, {taskRunId: runningTaskId, status: "succeeded", outputReference: {type: "capital_project_artifact", id: recorded.id}, outputFingerprint: recorded.artifactFingerprint,
        qualityResults: [{id: "authorized_research_scope", passed: true}], usage: {modelCalls: 0, costUsd: 0}});
      runningTaskId = null;
      previous = recorded;
    }
    if (!previous) throw new Error("provider_research_artifact_missing");
    await completeAdvisorSpecializedWork({queue, job, artifact: previous, result: {capital_project_id: context.projectId, provider_research_artifact_id: previous.id, artifact_fingerprint: previous.artifactFingerprint,
      scope: "research_only", model_lineage: [], spend: {modelCalls: 0, costUsd: 0}, externalEffectAllowed: false}});
    return {status: "succeeded" as const, artifactId: previous.id};
  } catch (error) {
    if (runningTaskId) await queue.finishCapitalTask(job, {taskRunId: runningTaskId, status: "failed", error: {code: "provider_research_failed"}}).catch(() => undefined);
    const failure = describeJobFailure(error, {code: "provider_research_failed", stage: "provider_research"});
    const retryable = failure.retryable && job.attempt < 3;
    await queue.fail(job, {...failure, retryable}, {retryable});
    return {status: "failed" as const};
  }
}
