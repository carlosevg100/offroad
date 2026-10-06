import type {ClaimedJob, QueueClient} from "./queue";
import {describeJobFailure} from "./job-failure";

/** Internal preview consumers live in technical evaluators; no production gateway is opened. */
export async function rejectRetiredFrameworkJob(job: ClaimedJob, queue: Pick<QueueClient, "fail">): Promise<boolean> {
  const historicalPreview = "integration_preview" in job && job.integration_preview === true;
  if (!historicalPreview && (job.kind !== "capital_project_analysis" || job.payload.analysis_scope !== "integration_preview")) return false;
  await queue.fail(job, describeJobFailure(new Error("integration_preview_retired"), {
    code: "integration_preview_retired", stage: "claim", retryable: false,
  }), {retryable: false});
  return true;
}
