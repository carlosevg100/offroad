/** Historical live evaluators lack a worker processing capability. Offline preparation and
 * historical evidence remain available; live runs must move to governed worker transport. */
export function requireGovernedEvaluationTransport(): void {
  throw new Error("live_evaluation_requires_worker_retention_authority");
}
