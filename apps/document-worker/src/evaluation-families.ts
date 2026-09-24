import {baselineGeneralistSnapshotSchema, baselineSnapshotContentHashes, runBaselineGeneralist, type BaselineGeneralistResult} from "@offroad/agent-contracts";
import {defaultTaskPolicies, type ModelGateway, type ModelRef, type TaskKind, type TaskPolicy} from "@offroad/model-gateway";

/**
 * An evaluation family turns one snapshot into model calls through the governed gateway it
 * receives and returns the result it publishes. Preparing reads the snapshot strictly and names
 * everything the consumer checks against the contract before anything is sent: the routes the
 * run may use, the content hashes it carries and the case it belongs to.
 */
export type PreparedEvaluation = {
 family: string;
 /** Every route a call may take, primary first; each must be a declared tool of the contract. */
 routes: ModelRef[];
 /** The content hashes the snapshot carries; the contract declares exactly these as its sources. */
 contentHashes: string[];
 audience: {caseId: string; caseVersion: string};
 /** Task policies the gateway uses, derived from the snapshot's model settings only. */
 policies: Partial<Record<TaskKind, TaskPolicy>>;
 run(gateway: ModelGateway, clock: () => Date): Promise<unknown>;
};
export type EvaluationFamily = {id: string; prepare(snapshot: unknown): PreparedEvaluation};

/** The fair baseline of a gold case: the strongest generalist over the frozen information base. */
export const baselineGeneralistFamily: EvaluationFamily = {
 id: "baseline_generalist",
 prepare(value) {
  const snapshot = baselineGeneralistSnapshotSchema.parse(value);
  const {primary, fallback, maxOutputTokens} = snapshot.model;
  const policy: TaskPolicy = {primary, ...(fallback ? {fallback} : {}), maxOutputTokens, timeoutMs: defaultTaskPolicies.baseline_generalist.timeoutMs};
  return {
   family: "baseline_generalist",
   routes: fallback ? [primary, fallback] : [primary],
   contentHashes: baselineSnapshotContentHashes(snapshot),
   audience: {caseId: snapshot.informationBase.caseId, caseVersion: snapshot.informationBase.caseVersion},
   policies: {baseline_generalist: policy},
   async run(gateway, clock) {
    const {record, outputs} = await runBaselineGeneralist(snapshot, gateway, clock);
    // The shape the script reads back with baselineGeneralistResultSchema.
    return {schemaVersion: "gold-baseline-result.v1", record, outputs} satisfies BaselineGeneralistResult;
   },
  };
 },
};

/** The contract's audience.scriptId selects the family; a script without one sends nothing. */
export const evaluationFamilies: Readonly<Record<string, EvaluationFamily>> = Object.freeze({"run-gold-baseline": baselineGeneralistFamily});
