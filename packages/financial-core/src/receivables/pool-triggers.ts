import {decimal, full, receivablesPoolKernelsVersion, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type ReceivablesPoolTriggerComparison = "maximum" | "minimum";
export type ReceivablesPoolTriggerConsequence = "block" | "remediate";

export type ReceivablesPoolTrigger = {
  version: typeof receivablesPoolKernelsVersion;
  id: string;
  actual: string;
  threshold: string;
  comparison: ReceivablesPoolTriggerComparison;
  status: "within_limit" | "breached";
  consequence: ReceivablesPoolTriggerConsequence;
  /** Distance to the limit with the sign of the comparison: negative when breached. */
  headroom: string;
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Compares a measured value with a declared limit. A maximum is breached strictly above the
 * threshold, a minimum strictly below it; a value exactly at the limit is within it.
 */
export function compareReceivablesPoolTrigger(input: {
  id: string;
  actual: string;
  threshold: string;
  comparison: ReceivablesPoolTriggerComparison;
  consequence: ReceivablesPoolTriggerConsequence;
}): ReceivablesPoolTrigger {
  if (!/^[a-z][a-z0-9_]*$/.test(input.id)) throw new RangeError(`trigger id must be a snake_case identifier: ${input.id}`);
  const actual = decimal(input.actual);
  const threshold = decimal(input.threshold);
  if (!actual.isFinite() || !threshold.isFinite()) throw new RangeError(`trigger ${input.id} needs finite actual and threshold values`);
  const breached = input.comparison === "maximum" ? actual.gt(threshold) : actual.lt(threshold);
  const headroom = input.comparison === "maximum" ? threshold.minus(actual) : actual.minus(threshold);
  return {
    version: receivablesPoolKernelsVersion,
    id: input.id,
    actual: full(actual),
    threshold: full(threshold),
    comparison: input.comparison,
    status: breached ? "breached" : "within_limit",
    consequence: input.consequence,
    headroom: full(headroom),
    trace: {
      id: "receivables.pool_trigger",
      formula: input.comparison === "maximum" ? "breached when actual > threshold; headroom = threshold - actual" : "breached when actual < threshold; headroom = actual - threshold",
      operands: {trigger: input.id, actual: full(actual), threshold: full(threshold), comparison: input.comparison, consequence: input.consequence},
      result: breached ? "breached" : "within_limit",
    },
  };
}
