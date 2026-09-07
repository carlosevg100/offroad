import {createHash} from "node:crypto";

import {
  INTENT_CLASSIFIER_SYSTEM,
  SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
  intentClassifierOutputSchema,
  semanticObjectExtractorOutputSchema,
} from "@offroad/agent-contracts";
import type {GatewayCallLog} from "@offroad/model-gateway";
import {z} from "zod";

import {intentGoldTurns} from "./intent-gold";
import {intentGoldClassifierInput, intentGoldMessage, intentGoldObjectInput} from "./intent-router-gate-input";
import type {IntentRouterGateObservation} from "./intent-router-gate";
import type {IntentRouterProviderPreflight} from "./intent-router-preflight";

export type GatewaySpentEvidence = {costUsd: number; calls: number; unknownCostCalls: number; budgetExposureUsd: number};
export type IntentRouterCallEvidence = {
  passed: boolean;
  issues: string[];
  observationOperations: number;
  linkedObservationOperations: number;
  preflightOperations: number;
  linkedPreflightOperations: number;
  providerAttempts: number;
  measuredCostUsd: number;
  unknownCostAttempts: number;
  cassetteAttempts: number;
};

const turnById = new Map(intentGoldTurns.map((turn) => [turn.id, turn]));
const surfaceContract = {
  intent_router_gold: {task: "route_intent", schemaName: "shadow_routing_output", system: INTENT_CLASSIFIER_SYSTEM, schema: intentClassifierOutputSchema},
  intent_object_gold: {task: "extract_semantic_objects", schemaName: "semantic_object_extractor_output", system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM, schema: semanticObjectExtractorOutputSchema},
} as const;

/**
 * Verifies the call ledger independently from the report. Every observation operation must own one
 * and only one terminal success and every provider attempt must belong to a declared operation.
 */
export function verifyIntentRouterCallEvidence(input: {
  observations: readonly IntentRouterGateObservation[];
  calls: readonly GatewayCallLog[];
  providerPreflight: readonly IntentRouterProviderPreflight[];
  gatewaySpent: GatewaySpentEvidence;
}): IntentRouterCallEvidence {
  const issues: string[] = [];
  const invocationIds = new Set<string>();
  for (const call of input.calls) {
    if (invocationIds.has(call.invocationId)) issues.push(`duplicate_invocation:${call.invocationId}`);
    invocationIds.add(call.invocationId);
  }

  let linkedObservationOperations = 0;
  const claimedInvocationIds = new Set<string>();
  for (const observation of input.observations) {
    const turn = turnById.get(observation.turnId);
    if (!turn) {
      issues.push(`unknown_turn:${observation.turnId}:${observation.repeat}`);
      continue;
    }
    const message = intentGoldMessage(turn, observation.repeat);
    const inputs = {
      intent_router_gold: [{type: "text", text: JSON.stringify(intentGoldClassifierInput(turn, message))}],
      intent_object_gold: [{type: "text", text: JSON.stringify(intentGoldObjectInput(turn, message))}],
    } as const;
    for (const surface of Object.keys(surfaceContract) as Array<keyof typeof surfaceContract>) {
      const operation = `${observation.turnId}:${observation.repeat}:${surface}`;
      const contract = surfaceContract[surface];
      const calls = input.calls.filter((call) => call.metadata?.surface === surface
        && call.metadata.turnId === observation.turnId && call.metadata.repeat === String(observation.repeat));
      for (const call of calls) claimedInvocationIds.add(call.invocationId);
      if (calls.length === 0) {
        issues.push(`missing_calls:${operation}`);
        continue;
      }
      const successes = calls.filter(({outcome}) => outcome === "ok");
      if (successes.length !== 1) issues.push(`terminal_success_count:${operation}:${successes.length}`);
      const expectedInputFingerprint = evidenceFingerprint(inputs[surface]);
      const expectedInitialPromptFingerprint = evidenceFingerprint({
        system: contract.system,
        schemaName: contract.schemaName,
        schema: z.toJSONSchema(contract.schema),
      });
      calls.forEach((call, index) => {
        if (call.task !== contract.task) issues.push(`task_mismatch:${operation}:${index}`);
        if (call.schemaName !== contract.schemaName) issues.push(`schema_mismatch:${operation}:${index}`);
        if (call.inputFingerprint !== expectedInputFingerprint) issues.push(`input_mismatch:${operation}:${index}`);
        if (call.metadata?.caseId !== turn.caseId) issues.push(`case_mismatch:${operation}:${index}`);
        if (call.fromCassette || call.costStatus === "cassette") issues.push(`cassette_not_paid_evidence:${operation}:${index}`);
        const prior = calls[index - 1];
        if (call.isSameModelRepair) {
          validateRepairLineage(call, prior, expectedInitialPromptFingerprint, operation, index, issues);
        } else {
          if (call.promptFingerprint !== expectedInitialPromptFingerprint) issues.push(`prompt_mismatch:${operation}:${index}`);
          if (call.previousInvocationId || call.repairGuidanceFingerprint || call.repairValidationIssueCodeFingerprint) {
            issues.push(`unexpected_repair_lineage:${operation}:${index}`);
          }
        }
        if ((call.retryOrdinal ?? 0) !== index && !call.usedProviderFallback) issues.push(`retry_ordinal_mismatch:${operation}:${index}`);
        if (index > 0 && calls[index - 1]?.outcome === "ok") issues.push(`attempt_after_success:${operation}:${index}`);
      });
      const success = successes[0];
      const expectedOutputFingerprint = surface === "intent_router_gold"
        ? observation.rawActualFingerprint : observation.rawObjectActualFingerprint;
      if (!success || !expectedOutputFingerprint || success.outputFingerprint !== expectedOutputFingerprint) {
        issues.push(`output_mismatch:${operation}`);
      }
      if (success && (success.provider !== (surface === "intent_router_gold" ? observation.provider : observation.objectProvider)
        || success.model !== (surface === "intent_router_gold" ? observation.model : observation.objectModel))) {
        issues.push(`provider_model_mismatch:${operation}`);
      }
      const counted = calls.filter(({costStatus}) => costStatus !== "not_called");
      const expectedAttempts = surface === "intent_router_gold" ? observation.routeAttemptCount : observation.objectAttemptCount;
      const expectedCost = surface === "intent_router_gold" ? observation.routeCostUsd : observation.objectCostUsd;
      const expectedLatency = surface === "intent_router_gold" ? observation.routeLatencyMs : observation.objectLatencyMs;
      if (counted.length !== expectedAttempts) issues.push(`attempt_count_mismatch:${operation}`);
      if (!close(sum(calls.map(({costUsd}) => costUsd)), expectedCost)) issues.push(`cost_mismatch:${operation}`);
      if (sum(calls.map(({latencyMs}) => latencyMs)) !== expectedLatency) issues.push(`latency_mismatch:${operation}`);
      linkedObservationOperations += 1;
    }
    if (!close(observation.routeCostUsd + observation.objectCostUsd, observation.costUsd)) {
      issues.push(`observation_cost_mismatch:${observation.turnId}:${observation.repeat}`);
    }
  }

  let linkedPreflightOperations = 0;
  for (const row of input.providerPreflight) {
    const preflightTurn = intentGoldTurns[0]!;
    const route = row.task === "route_intent";
    const contract = route ? surfaceContract.intent_router_gold : surfaceContract.intent_object_gold;
    const preflightInput = [{type: "text", text: JSON.stringify(route
      ? intentGoldClassifierInput(preflightTurn, preflightTurn.message)
      : intentGoldObjectInput(preflightTurn, preflightTurn.message))}];
    const expectedPromptFingerprint = evidenceFingerprint({
      system: contract.system, schemaName: contract.schemaName, schema: z.toJSONSchema(contract.schema),
    });
    const expectedInputFingerprint = evidenceFingerprint(preflightInput);
    const matching = input.calls.filter((call) => call.metadata?.surface === "intent_router_provider_preflight"
      && call.task === row.task && call.schemaName === row.schemaName && call.metadata?.provider === row.provider
      && call.metadata?.configuredModel === row.configuredModel);
    for (const call of matching) claimedInvocationIds.add(call.invocationId);
    if (matching.length === 0) issues.push(`missing_preflight_calls:${row.task}:${row.provider}`);
    if (matching.filter(({outcome}) => outcome === "ok").length !== (row.passed ? 1 : 0)) {
      issues.push(`preflight_outcome_mismatch:${row.task}:${row.provider}`);
    }
    matching.forEach((call, index) => {
      if (call.provider !== row.provider) issues.push(`preflight_provider_mismatch:${row.task}:${row.provider}:${index}`);
      if (call.inputFingerprint !== expectedInputFingerprint) issues.push(`preflight_input_mismatch:${row.task}:${row.provider}:${index}`);
      if (call.isSameModelRepair) {
        validateRepairLineage(call, matching[index - 1], expectedPromptFingerprint, `preflight:${row.task}:${row.provider}`, index, issues);
      } else {
        if (call.promptFingerprint !== expectedPromptFingerprint) issues.push(`preflight_prompt_mismatch:${row.task}:${row.provider}:${index}`);
        if (call.previousInvocationId || call.repairGuidanceFingerprint || call.repairValidationIssueCodeFingerprint) {
          issues.push(`unexpected_repair_lineage:preflight:${row.task}:${row.provider}:${index}`);
        }
      }
      if (call.outcome === "ok" && call.model !== row.resolvedModel) issues.push(`preflight_model_mismatch:${row.task}:${row.provider}:${index}`);
      if (call.fromCassette || call.costStatus === "cassette") issues.push(`preflight_cassette_not_paid_evidence:${row.task}:${row.provider}:${index}`);
    });
    if (matching.filter(({costStatus}) => costStatus !== "not_called").length !== row.attemptCount) {
      issues.push(`preflight_attempt_count_mismatch:${row.task}:${row.provider}`);
    }
    if (!close(sum(matching.map(({costUsd}) => costUsd)), row.measuredCostUsd)) {
      issues.push(`preflight_cost_mismatch:${row.task}:${row.provider}`);
    }
    linkedPreflightOperations += 1;
  }
  for (const call of input.calls) {
    if (!claimedInvocationIds.has(call.invocationId)) issues.push(`orphan_call:${call.invocationId}`);
  }

  const providerAttempts = input.calls.filter(({costStatus}) => costStatus === "measured" || costStatus === "unknown").length;
  const measuredCostUsd = sum(input.calls.map(({costStatus, costUsd}) => costStatus === "measured" ? costUsd : 0));
  const unknownCostAttempts = input.calls.filter(({costStatus}) => costStatus === "unknown").length;
  const cassetteAttempts = input.calls.filter(({costStatus}) => costStatus === "cassette").length;
  if (providerAttempts !== input.gatewaySpent.calls) issues.push("gateway_call_count_mismatch");
  if (!close(measuredCostUsd, input.gatewaySpent.costUsd)) issues.push("gateway_measured_cost_mismatch");
  if (unknownCostAttempts !== input.gatewaySpent.unknownCostCalls) issues.push("gateway_unknown_cost_mismatch");
  if (input.gatewaySpent.budgetExposureUsd + 1e-9 < input.gatewaySpent.costUsd) issues.push("gateway_exposure_below_measured_cost");

  return {
    passed: issues.length === 0,
    issues,
    observationOperations: input.observations.length * 2,
    linkedObservationOperations,
    preflightOperations: input.providerPreflight.length,
    linkedPreflightOperations,
    providerAttempts,
    measuredCostUsd,
    unknownCostAttempts,
    cassetteAttempts,
  };
}

export function evidenceFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function fingerprintIntentRouterEvidenceRecord(value: unknown): string {
  return evidenceFingerprint(value);
}

export function verifyIntentRouterEvidenceRecord(record: Record<string, unknown> & {evidenceFingerprint?: unknown}): boolean {
  const {evidenceFingerprint: recorded, ...unsigned} = record;
  return typeof recorded === "string" && recorded === fingerprintIntentRouterEvidenceRecord(unsigned);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-8;
}

function validateRepairLineage(
  call: GatewayCallLog,
  prior: GatewayCallLog | undefined,
  basePromptFingerprint: string,
  operation: string,
  index: number,
  issues: string[],
): void {
  if (!prior || prior.outcome !== "invalid_output") {
    issues.push(`repair_without_rejection:${operation}:${index}`);
    return;
  }
  if (call.previousInvocationId !== prior.invocationId) issues.push(`repair_predecessor_mismatch:${operation}:${index}`);
  const priorIssueFingerprint = evidenceFingerprint((prior.validationIssues ?? []).map(({path, code}) => ({path, code})));
  if (!prior.validationIssueCodeFingerprint || prior.validationIssueCodeFingerprint !== priorIssueFingerprint) {
    issues.push(`rejection_issue_fingerprint_mismatch:${operation}:${index}`);
  }
  if (!call.repairValidationIssueCodeFingerprint
    || call.repairValidationIssueCodeFingerprint !== prior.validationIssueCodeFingerprint) {
    issues.push(`repair_issue_fingerprint_mismatch:${operation}:${index}`);
  }
  if (!call.repairGuidanceFingerprint || !/^[a-f0-9]{64}$/.test(call.repairGuidanceFingerprint)) {
    issues.push(`repair_guidance_fingerprint_missing:${operation}:${index}`);
  }
  // The gateway never exposes repair text. Its exact content is committed by the guidance hash;
  // the effective full prompt must therefore be distinct from the independently reconstructed
  // base prompt and bound to the rejected invocation above.
  if (!call.promptFingerprint || call.promptFingerprint === basePromptFingerprint) {
    issues.push(`repair_prompt_not_distinct:${operation}:${index}`);
  }
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
