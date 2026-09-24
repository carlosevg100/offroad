/**
 * Fair baseline for a gold case (gold-cases/README.md §5). The contract of the baseline family,
 * from the information base to the per-turn loop and the run record, lives in
 * `@offroad/agent-contracts`, shared with the worker that runs it under the governed evaluation
 * transport. This module keeps the names the evals scripts and tests import, plus the helpers
 * that only the script needs to assemble the information base from the case files.
 */
export {
  BASELINE_SYSTEM_PROMPT,
  baselineDocumentSchema,
  baselineGeneralistSnapshotSchema,
  baselineInformationBaseSchema,
  baselineModelRouteSchema,
  baselineModelSettingsSchema,
  baselineOutputSchema,
  baselineRunRecordSchema,
  baselineSnapshotContentHashes,
  baselineSourceSchema,
  baselineTurnSchema,
  informationBaseHash,
  renderInformationBase,
  renderTurnMessage,
  runBaselineGeneralist,
  sha256Hex,
  type BaselineDocument,
  type BaselineGateway,
  type BaselineGeneralistRun,
  type BaselineGeneralistSnapshot,
  type BaselineInformationBase,
  type BaselineModelRoute,
  type BaselineModelSettings,
  type BaselineOutput,
  type BaselineRunRecord,
  type BaselineSource,
  type BaselineTurn,
  type BaselineTurnRequest,
} from "@offroad/agent-contracts";

/** Keeps only the header and the rows of a CSV that mention the company; large registries stay readable. */
export function filterCsvRows(csv: string, pattern: RegExp, maxRows = 200): {text: string; kept: number; total: number} {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  const [header, ...rows] = lines;
  const kept = rows.filter((row) => pattern.test(row)).slice(0, maxRows);
  return {text: [header ?? "", ...kept].join("\n"), kept: kept.length, total: rows.length};
}
