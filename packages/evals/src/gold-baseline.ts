import {
  BASELINE_SYSTEM_PROMPT,
  baselineGeneralistResultSchema,
  informationBaseHash,
  renderTurnMessage,
  sha256Hex,
  type BaselineGeneralistRun,
  type BaselineGeneralistSnapshot,
} from "@offroad/agent-contracts";

/**
 * Fair baseline for a gold case (gold-cases/README.md §5). The contract of the baseline family,
 * from the information base to the per-turn loop, the run record and the published result, lives
 * in `@offroad/agent-contracts`, shared with the worker that runs it under the governed evaluation
 * transport. This module keeps the names the evals scripts and tests import, plus the helpers
 * that only the script needs: assembling the information base from the case files and reading
 * back the result the worker committed.
 */
export {
  BASELINE_SYSTEM_PROMPT,
  baselineDocumentSchema,
  baselineGeneralistResultSchema,
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
  type BaselineGeneralistResult,
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

/**
 * The committed result of a governed baseline, read strictly and bound to the snapshot this
 * process sent: the same case, the same rendered base and system prompt, one deliverable per turn
 * in order, each file named after its turn and each hash matching the text it names. Anything else
 * is not the run of these inputs, and nothing of it is written.
 */
export function readBaselineGovernedResult(value: unknown, snapshot: BaselineGeneralistSnapshot): BaselineGeneralistRun {
  const {record, outputs} = baselineGeneralistResultSchema.parse(value);
  const base = snapshot.informationBase;
  const mismatch = (what: string) => new Error(`baseline_result_mismatch: ${what}`);
  if (record.caseId !== base.caseId || record.caseVersion !== base.caseVersion || record.asOfDate !== base.asOfDate) throw mismatch("case");
  if (record.informationBaseSha256 !== informationBaseHash(base)) throw mismatch("information base");
  if (record.systemPromptSha256 !== sha256Hex(BASELINE_SYSTEM_PROMPT)) throw mismatch("system prompt");
  if (record.caveats.length !== snapshot.caveats.length || record.caveats.some((caveat, index) => caveat !== snapshot.caveats[index])) throw mismatch("caveats");
  if (outputs.length !== base.turns.length || record.turns.length !== base.turns.length) throw mismatch("turns");
  base.turns.forEach((turn, index) => {
    const output = outputs[index]!, entry = record.turns[index]!, file = `${turn.id}.output.md`;
    if (output.turnId !== turn.id || output.file !== file || entry.id !== turn.id || entry.outputFile !== file
      || entry.messageSha256 !== sha256Hex(renderTurnMessage(turn, index)) || entry.outputSha256 !== sha256Hex(output.deliverable)) {
      throw mismatch(`turn ${turn.id}`);
    }
  });
  return {record, outputs};
}
