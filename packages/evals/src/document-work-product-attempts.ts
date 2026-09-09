/** Evidence accounting only; validation and source review remain in the real executor. */
export function summarizeDocumentWorkAttempts(
  runs: readonly {passed:boolean;completeCalls:number;narrativeCalls:number;reviewCalls:number;firstResponseValid:boolean;providerCalls:number}[],
  repeats: readonly boolean[],
  spent: {calls:number;costUsd:number;unknownCostCalls:number},
) {
  const firstPassSuccessCount = runs.filter(run=>run.passed && run.narrativeCalls === 1 && run.reviewCalls === 1 && run.firstResponseValid).length;
  const bounded = runs.every(run=>run.completeCalls >= 2 && run.completeCalls <= 3 && run.narrativeCalls >= 1 && run.narrativeCalls <= 2
    && ((run.reviewCalls === 1 && run.completeCalls <= 3) || (run.reviewCalls === 2 && run.narrativeCalls === 1 && run.completeCalls === 3)) && run.completeCalls === run.narrativeCalls + run.reviewCalls && run.providerCalls >= run.completeCalls)
    && runs.reduce((sum,run)=>sum+run.providerCalls,0) === spent.calls;
  return {passed:runs.length === 6 && runs.every(run=>run.passed) && repeats.length === 3 && repeats.every(Boolean)
    && bounded && spent.calls >= 12 && spent.calls <= 18 && Number.isFinite(spent.costUsd) && spent.costUsd >= 0 && spent.costUsd <= 2.5 && spent.unknownCostCalls === 0,
    firstPassSuccessCount, firstPassSuccessRate:runs.length ? firstPassSuccessCount/runs.length : 0,
    requestsRecorded:runs.length, callsPerRequest:runs.map(run=>({executorCompleteCalls:run.completeCalls,narrativeCalls:run.narrativeCalls,sourceReviewCalls:run.reviewCalls,providerCalls:run.providerCalls}))};
}
