import {execFileSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {deterministicMethodRunSchema} from "@offroad/credit-playbook";

import {buildReceivablesMethodRuns} from "../src/receivables-method-runs";

/**
 * Writes the recorded gold, adversarial and consistency runs of the R01 method. Timestamps and the
 * commit are the only parts a rerun changes; `receivables-method-runs.test.ts` compares everything
 * else against a fresh execution, so a record that stops reproducing fails the suite.
 */
const here = dirname(fileURLToPath(import.meta.url));
const runsRoot = resolve(here, "../../credit-playbook/knowledge/reviews/runs");
const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8", cwd: here}).trim();
  } catch {
    return undefined;
  }
})();

const startedAt = new Date().toISOString();
for (const evidence of buildReceivablesMethodRuns()) {
  const record = deterministicMethodRunSchema.parse({
    schemaVersion: "deterministic-method-run.v1",
    runId: evidence.runId,
    kind: evidence.kind,
    humanApproval: false,
    method: evidence.method,
    executor: evidence.executor,
    harness: evidence.harness,
    run: {startedAt, finishedAt: new Date().toISOString(), ...(commit ? {commit} : {})},
    modelCalls: evidence.modelCalls,
    cases: evidence.cases,
    result: evidence.result,
    evidenceFingerprint: evidence.evidenceFingerprint,
    notes: evidence.notes,
  });
  const directory = join(runsRoot, record.runId);
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, "run.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`${record.runId}: ${record.result} (${record.cases.length} cases)`);
}
