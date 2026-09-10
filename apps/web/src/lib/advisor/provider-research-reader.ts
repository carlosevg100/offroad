import {readProviderResearchArtifact} from "@offroad/work-plan";

export type ProviderResearchRow = {
  id: string; artifact_type: string; schema_version: string; artifact_version: number;
  status: string; plan_id: string; task_run_id: string; content: unknown;
};

/** Receives only organization/project-scoped rows from the authorized project loader. */
export function currentProviderResearch(
  rows: readonly ProviderResearchRow[],
  runs: readonly {id: string; status: string}[],
  binding: {projectId: string; planId: string; planFingerprint: string} | null,
) {
  if (!binding) return null;
  const row = rows.filter(item => item.artifact_type === "provider_research" && item.plan_id === binding.planId)
    .sort((a, b) => b.artifact_version - a.artifact_version)[0];
  // Never fall back to an earlier version when the newest result is invalidated or incomplete.
  if (!row || !["draft", "pending_confirmation", "confirmed", "approved"].includes(row.status)
    || !["provider-research.v1", "provider-research.v2"].includes(row.schema_version)
    || !runs.some(run => run.id === row.task_run_id && run.status === "succeeded")) return null;
  const research = readProviderResearchArtifact(row.content, binding);
  return research && research.schemaVersion === row.schema_version ? {row, research} : null;
}
