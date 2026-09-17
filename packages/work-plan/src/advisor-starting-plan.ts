import {capitalProjectPlanSnapshot} from "./capital-jobs";
import {documentWorkPlanSnapshot} from "./document-work-plan";
import {canCompileStandaloneDocumentWorkRequest, documentWorkJob} from "./document-work-request";
import {inferCapitalProjectJob, type CapitalProjectJobHint} from "./job-inference";

/** A question opens a conversation, not a financial execution plan. Documentary
 * planning starts only when the user actually brings documents to the work. */
export function compileWorkEntry(input: Parameters<typeof compileAdvisorStartingPlan>[0]) {
  if (input.hasAttachments) return compileAdvisorStartingPlan(input);
  return {entryJob: inferCapitalProjectJob(input).job, plan: null};
}

/** Select the initial graph before project creation; never replace an existing plan.
 * Entry labels retain compatibility with the private upload/confirmation rail. The
 * approved objective and documentary task graph own the actual assignment. */
export function compileAdvisorStartingPlan(input: {
  message:string; hasAttachments:boolean; explicitHint?:CapitalProjectJobHint|null;
  documentaryEnabled:boolean;
}) {
  const inferred = inferCapitalProjectJob(input).job;
  const privateHint = !input.explicitHint || ["structure_from_documents","review_existing_operation"].includes(input.explicitHint);
  const documentary = input.documentaryEnabled && input.hasAttachments && privateHint
    // The compiler proposes its scope; people need not know its internal terminology.
    // Approval still binds the original objective and the visible documentary limits.
    && canCompileStandaloneDocumentWorkRequest({objective:input.message,proposedDeliverable:"Preliminary documentary reading"});
  const entryJob = documentary
    ? input.explicitHint ?? (documentWorkJob(input.message) === "meeting" ? "structure_from_documents" : "review_existing_operation")
    : inferred;
  return {entryJob, plan:documentary ? documentWorkPlanSnapshot(entryJob) : capitalProjectPlanSnapshot(entryJob)};
}
