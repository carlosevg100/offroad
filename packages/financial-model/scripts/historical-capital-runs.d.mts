export function loadHistoricalCapitalRuns(): Promise<{
 buildCapitalProcedureRuns: typeof import('../src/capital-procedure-runs.test-support.js').buildCapitalProcedureRuns;
 buildCapitalProcedureV2Runs: typeof import('../src/capital-procedure-v2-runs.test-support.js').buildCapitalProcedureV2Runs;
 fixtureFinancialCoreVersion: string;
}>;
