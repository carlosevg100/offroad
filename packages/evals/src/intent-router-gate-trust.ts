export type PaidGateEnvironment = {
  githubActions?: string | undefined;
  repository?: string | undefined;
  ref?: string | undefined;
  sha?: string | undefined;
  workflowRef?: string | undefined;
  eventName?: string | undefined;
  runId?: string | undefined;
  runAttempt?: string | undefined;
};

const EXPECTED_REPOSITORY = "carlosevg100/offroad";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_SUFFIX = "/.github/workflows/intent-router-gold.yml@refs/heads/main";

/** Refuses paid execution unless the immutable GitHub context is the trusted post-merge gate. */
export function assertTrustedPaidGateEnvironment(env: PaidGateEnvironment): void {
  if (env.githubActions !== "true") throw new Error("paid_gate_requires_github_actions");
  if (env.repository !== EXPECTED_REPOSITORY) throw new Error("paid_gate_untrusted_repository");
  if (env.ref !== EXPECTED_REF) throw new Error("paid_gate_requires_main_ref");
  if (!env.workflowRef?.endsWith(EXPECTED_WORKFLOW_SUFFIX)) throw new Error("paid_gate_requires_main_workflow");
  if (!env.sha || !/^[a-f0-9]{40}$/i.test(env.sha)) throw new Error("paid_gate_missing_commit_sha");
  if (env.eventName !== "workflow_dispatch") throw new Error("paid_gate_untrusted_event");
}

export function paidGateProvenance(env: PaidGateEnvironment) {
  return {
    trust: "github_actions_main_environment" as const,
    repository: env.repository!,
    ref: env.ref!,
    gitSha: env.sha!,
    workflowRef: env.workflowRef!,
    eventName: env.eventName!,
    runId: env.runId ?? null,
    runAttempt: env.runAttempt ?? null,
    cryptographicAttestation: false as const,
  };
}
