import {createHash} from "node:crypto";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

import {z} from "zod";

/**
 * A recorded execution of a deterministic method, on record. The rungs above `ai_reviewed` ask for
 * gold, adversarial and consistency runs; for a method whose contract declares zero model calls the
 * honest run is an executed one, not a transcript of a conversation. Each record names the exact
 * cases, their expectation, the observed decision and the input/output fingerprints, so a test can
 * re-execute the harness and prove that the record still reproduces instead of trusting prose.
 */
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const deterministicRunKindSchema = z.enum(["gold", "adversarial", "consistency"]);
export type DeterministicRunKind = z.infer<typeof deterministicRunKindSchema>;

export const deterministicMethodRunCaseSchema = z.object({
  id: z.string().min(1).max(160),
  /** What the case asserts, declared independently from the implementation. */
  expectation: z.string().min(1).max(400),
  /** What the execution produced for that assertion. */
  observed: z.string().min(1).max(400),
  inputFingerprint: sha256Schema,
  outputFingerprint: sha256Schema,
  passed: z.boolean(),
}).strict();
export type DeterministicMethodRunCase = z.infer<typeof deterministicMethodRunCaseSchema>;

export const deterministicMethodRunSchema = z.object({
  schemaVersion: z.literal("deterministic-method-run.v1"),
  runId: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,120}$/),
  kind: deterministicRunKindSchema,
  /** A recorded run is evidence of execution, never a human or model approval. */
  humanApproval: z.literal(false),
  method: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  executor: z.object({module: z.string().min(1), exportName: z.string().min(1)}).strict(),
  /** The reproducible harness: re-running it must rebuild the same case evidence. */
  harness: z.object({module: z.string().min(1), exportName: z.string().min(1)}).strict(),
  run: z.object({
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    commit: z.string().regex(/^[a-f0-9]{7,40}$/).optional(),
  }).strict(),
  /** Deterministic methods spend nothing on models; a run that did is not this kind of evidence. */
  modelCalls: z.literal(0),
  cases: z.array(deterministicMethodRunCaseSchema).min(1),
  result: z.enum(["pass", "fail"]),
  /** sha256 of the reproducible part of the record: everything except when it was executed. */
  evidenceFingerprint: sha256Schema,
  notes: z.string().max(4000).default(""),
}).strict();
export type DeterministicMethodRun = z.infer<typeof deterministicMethodRunSchema>;

/** The part of a run that must reproduce exactly. Timestamps and commit are deliberately outside. */
export function deterministicRunEvidence(record: Pick<DeterministicMethodRun, "runId" | "kind" | "method" | "executor" | "harness" | "modelCalls" | "cases" | "result">) {
  return {
    runId: record.runId,
    kind: record.kind,
    method: record.method,
    executor: record.executor,
    harness: record.harness,
    modelCalls: record.modelCalls,
    cases: record.cases,
    result: record.result,
  };
}

export function deterministicRunEvidenceFingerprint(record: Parameters<typeof deterministicRunEvidence>[0]): string {
  return createHash("sha256").update(stableJson(deterministicRunEvidence(record))).digest("hex");
}

/** The verdict a rung can rely on: every case passed, executed, with no model in the loop. */
export function runCountsForPromotion(record: DeterministicMethodRun): boolean {
  return record.result === "pass"
    && record.modelCalls === 0
    && record.cases.length > 0
    && record.cases.every((entry) => entry.passed)
    && deterministicRunEvidenceFingerprint(record) === record.evidenceFingerprint;
}

/** Reads `<runsRoot>/<runId>/run.json`. Directories without one are model-review runs, not these. */
export function loadDeterministicMethodRuns(runsRoot: string): Map<string, DeterministicMethodRun> {
  const records = new Map<string, DeterministicMethodRun>();
  let entries: string[] = [];
  try {
    entries = readdirSync(runsRoot, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return records;
  }
  for (const name of entries) {
    let text: string;
    try {
      text = readFileSync(join(runsRoot, name, "run.json"), "utf8");
    } catch {
      continue;
    }
    const record = deterministicMethodRunSchema.parse(JSON.parse(text));
    if (record.runId !== name) throw new Error(`deterministic run ${name} does not match its runId ${record.runId}`);
    records.set(record.runId, record);
  }
  return records;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
