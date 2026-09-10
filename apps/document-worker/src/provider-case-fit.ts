import {buildProviderCaseFit, caseFitProviderSchema, providerCaseCriteriaSchema} from "@offroad/fund-mandate";
import {fingerprintJson} from "@offroad/case-understanding";

import {z} from "zod";
import {describeJobFailure} from "./job-failure";
import {completeAdvisorSpecializedWork} from "./advisor-specialized-completion";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

export const providerCaseFitContextSchema = z.object({
  schemaVersion: z.literal("provider-case-fit-context.v1"), organizationId: z.uuid(), projectId: z.uuid(), planId: z.uuid(), planFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  approvalStatus: z.literal("approved"), objective: z.string().min(1).max(20000), locale: z.enum(["pt-BR", "en-US"]), asOf: z.iso.datetime({offset: true}),
  tasks: z.array(z.object({id: z.enum(["M01", "K01", "K02"]), dependencies: z.array(z.string())}).strict()).length(3),
  priorArtifacts: z.array(z.object({taskId: z.enum(["M01", "K01", "K02"]), id: z.uuid(), artifactFingerprint: z.string().regex(/^[a-f0-9]{64}$/), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), content: z.record(z.string(), z.unknown())}).strict()).max(3).default([]),
  caseCriteria: providerCaseCriteriaSchema,
  providers: z.array(caseFitProviderSchema).max(500),
}).strict();
const graph = [{id: "M01", dependencies: []}, {id: "K01", dependencies: ["M01"]}, {id: "K02", dependencies: ["K01"]}];
export function buildProviderCaseFitWork(contextValue: unknown, job: CapitalProjectAnalysisJob) {
  const context = providerCaseFitContextSchema.parse(contextValue);
  if (job.payload.analysis_scope !== "provider_case_fit" || job.payload.revision_of_artifact_id
    || context.organizationId !== job.organization_id || context.projectId !== job.payload.capital_project_id
    || context.planId !== job.payload.capital_project_plan_id || context.locale !== job.payload.locale
    || context.tasks.some((task, index) => task.id !== graph[index]!.id || JSON.stringify(task.dependencies) !== JSON.stringify(graph[index]!.dependencies))
    || JSON.stringify(job.payload.capital_task_ids) !== JSON.stringify(graph.map(task => task.id))
    || new Set(context.priorArtifacts.map(item => item.taskId)).size !== context.priorArtifacts.length
    || context.providers.some(provider => provider.ownerOrganizationId !== context.organizationId)
    || new Set(context.providers.map(provider => `${provider.sourceClass}:${provider.providerId}`)).size !== context.providers.length) throw new Error("provider_case_fit_context_binding_invalid");
  if (Date.parse(context.caseCriteria.asOf) !== Date.parse(context.asOf)) throw new Error("provider_case_fit_date_binding_invalid");
  return {context, artifact: buildProviderCaseFit({organizationId:context.organizationId,projectId:context.projectId,planId:context.planId,planFingerprint:context.planFingerprint,criteria:context.caseCriteria,providers:context.providers,mandateMaxAgeMonths:context.caseCriteria.mandateMaxAgeMonths ?? null})};
}

/** This processor consumes a separately authorized loader, never the internal matching universe. */
export async function processProviderCaseFitJob(job: CapitalProjectAnalysisJob, dependencies: {queue: QueueClient}) {
  const {queue} = dependencies;
  let runningTaskId: string | null = null;
  try {
    if (!queue.loadProviderCaseFitContext) throw new Error("provider_case_fit_loader_unavailable");
    const {context, artifact} = buildProviderCaseFitWork(await queue.loadProviderCaseFitContext(job), job);
    let previous: {id: string; artifactFingerprint: string} | null = null;
    for (const task of context.tasks) {
      const content = task.id === "K02" ? artifact : task.id === "M01"
        ? {schemaVersion: "provider-case-fit-scope.v1", projectId: context.projectId, planId: context.planId, objective: context.objective, caseCriteria:context.caseCriteria, caseFingerprint:artifact.caseFingerprint, asOf: context.asOf, scope: "research_case_fit"}
        : {schemaVersion: "provider-case-fit-sources.v1", projectId: context.projectId, planId: context.planId, sourceFingerprint: artifact.sourceFingerprint, providerCount: artifact.candidates.length, asOf: context.asOf};
      const inputFingerprint = fingerprintJson({executorKey: "provider_case_fit", executorVersion: "2026.09.10-v1", planFingerprint: context.planFingerprint, taskId: task.id, content, dependency: previous?.artifactFingerprint ?? null});
      const prior = context.priorArtifacts.find(item => item.taskId === task.id);
      if (prior) {
        if (prior.inputFingerprint !== inputFingerprint || fingerprintJson(prior.content) !== fingerprintJson(content)) throw new Error("provider_case_fit_replay_mismatch");
        previous = {id: prior.id, artifactFingerprint: prior.artifactFingerprint};
        continue;
      }
      runningTaskId = await queue.startCapitalTask(job, {taskId: task.id, executorKey: "provider_case_fit", executorVersion: "2026.09.10-v1", inputFingerprint,
        contextManifest: {projectId: context.projectId, planId: context.planId, sourceFingerprint: artifact.sourceFingerprint, caseFingerprint:artifact.caseFingerprint, scope: "research_case_fit"}});
      const recorded = await queue.recordCapitalProjectArtifact(job, {taskRunId: runningTaskId, artifactType: task.id === "K02" ? "provider_case_fit" : task.id === "M01" ? "provider_case_fit_scope" : "provider_case_fit_sources",
        schemaVersion: content.schemaVersion, status: "draft", inputFingerprint, content,
        evidenceRefs: [], dependencies: previous ? [{artifactId: previous.id, artifactFingerprint: previous.artifactFingerprint}] : []});
      await queue.finishCapitalTask(job, {taskRunId: runningTaskId, status: "succeeded", outputReference: {type: "capital_project_artifact", id: recorded.id}, outputFingerprint: recorded.artifactFingerprint,
        qualityResults: [{id: "authorized_research_scope", passed: true}], usage: {modelCalls: 0, costUsd: 0}});
      runningTaskId = null;
      previous = recorded;
    }
    if (!previous) throw new Error("provider_case_fit_artifact_missing");
    await completeAdvisorSpecializedWork({queue, job, artifact: previous, result: {capital_project_id: context.projectId, provider_case_fit_artifact_id: previous.id, artifact_fingerprint: previous.artifactFingerprint,
      scope: "research_case_fit", model_lineage: [], spend: {modelCalls: 0, costUsd: 0}, externalEffectAllowed: false}});
    return {status: "succeeded" as const, artifactId: previous.id};
  } catch (error) {
    if (runningTaskId) await queue.finishCapitalTask(job, {taskRunId: runningTaskId, status: "failed", error: {code: "provider_case_fit_failed"}}).catch(() => undefined);
    const failure = describeJobFailure(error, {code: "provider_case_fit_failed", stage: "provider_case_fit"});
    const retryable = failure.retryable && job.attempt < 3;
    await queue.fail(job, {...failure, retryable}, {retryable});
    return {status: "failed" as const};
  }
}
