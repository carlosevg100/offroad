/**
 * The documentary scoring moved to `@offroad/agent-contracts`, where the worker that now runs the
 * evaluation reads it; these names stay importable here. The protected-workflow check is the
 * script's own and stays in this package.
 */
export {compareDocumentWorkRepeats, scoreDocumentWorkLive, scoreDocumentWorkSemantics, scoreDocumentWorkSourceReviewControl, type LiveProduct} from "@offroad/agent-contracts";
export function assertDocumentWorkLiveEnvironment(env: Record<string, string | undefined>) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "carlosevg100/offroad"
    || env.GITHUB_RUN_ATTEMPT !== "1"
    || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch"
    || env.GITHUB_WORKFLOW_REF !== "carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main"
    || !/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA ?? "")) throw new Error("document_work_live_requires_protected_main_workflow");
}
