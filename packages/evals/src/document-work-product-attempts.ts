/** Evidence accounting only; validation and regeneration remain in the real executor. */
export function summarizeDocumentWorkAttempts(
  runs: readonly {passed:boolean;completeCalls:number;firstResponseValid:boolean;providerCalls:number}[],
  repeats: readonly boolean[],
  spent: {calls:number;costUsd:number;unknownCostCalls:number},
) {
  const firstPassSuccessCount = runs.filter(run=>run.passed && run.completeCalls === 1 && run.firstResponseValid).length;
  const bounded = runs.every(run=>run.completeCalls >= 1 && run.completeCalls <= 2 && run.providerCalls >= run.completeCalls)
    && runs.reduce((sum,run)=>sum+run.providerCalls,0) === spent.calls;
  return {passed:runs.length === 6 && runs.every(run=>run.passed) && repeats.length === 3 && repeats.every(Boolean)
    && bounded && spent.calls >= 6 && spent.calls <= 12 && Number.isFinite(spent.costUsd) && spent.costUsd >= 0 && spent.costUsd <= 3 && spent.unknownCostCalls === 0,
    firstPassSuccessCount, firstPassSuccessRate:runs.length ? firstPassSuccessCount/runs.length : 0,
    requestsRecorded:runs.length, callsPerRequest:runs.map(run=>({executorCompleteCalls:run.completeCalls,providerCalls:run.providerCalls}))};
}
