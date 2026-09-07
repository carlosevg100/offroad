import {createHash} from "node:crypto";

import {
  INTENT_CLASSIFIER_SYSTEM,
  SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
  intentClassifierOutputSchema,
  semanticObjectExtractorOutputSchema,
} from "@offroad/agent-contracts";
import {
  buildRepairGuidance,
  defaultTaskPolicies,
  estimateCostReservationUsd,
  estimateCostUsd,
  estimateInputTokens,
  listPrices,
  type ContentPart,
  type GatewayCallLog,
  type ModelRef,
} from "@offroad/model-gateway";
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
  recomputedMeasuredCostUsd: number;
  recomputedBudgetExposureUsd: number;
  unknownCostReservationUsd: number;
  pricingTableFingerprint: string;
  unknownCostAttempts: number;
  cassetteAttempts: number;
};

const turnById = new Map(intentGoldTurns.map((turn) => [turn.id, turn]));
const surfaceContract = {
  intent_router_gold: {task: "route_intent", schemaName: "shadow_routing_output", system: INTENT_CLASSIFIER_SYSTEM, schema: intentClassifierOutputSchema},
  intent_object_gold: {task: "extract_semantic_objects", schemaName: "semantic_object_extractor_output", system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM, schema: semanticObjectExtractorOutputSchema},
} as const;

const sameRef = (left: Pick<ModelRef, "provider" | "model" | "effort">, right: Pick<ModelRef, "provider" | "model" | "effort">): boolean =>
  left.provider === right.provider && left.model === right.model && left.effort === right.effort;

const configuredRefs = (task: keyof typeof defaultTaskPolicies): ModelRef[] => {
  const policy = defaultTaskPolicies[task];
  return [policy.primary, ...(policy.fallback ? [policy.fallback] : [])].filter((ref, index, refs) =>
    refs.findIndex((candidate) => sameRef(candidate, ref)) === index);
};

const configuredModel = (call: GatewayCallLog): string => call.configuredModel ?? call.model;

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
    const recomputed = recomputedCallCost(call);
    if (call.costStatus === "measured" && (!Number.isFinite(recomputed) || !close(call.costUsd, recomputed))) {
      issues.push(`call_cost_mismatch:${call.invocationId}`);
    }
    if (call.costStatus !== "measured" && call.costUsd !== 0) issues.push(`non_measured_call_has_cost:${call.invocationId}`);
  }

  let linkedObservationOperations = 0;
  const claimedInvocationIds = new Set<string>();
  const unknownReservations = new Map<string, number>();
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
      const allowedRefs = configuredRefs(contract.task);
      validateAttemptTopology(calls, allowedRefs[0]!, allowedRefs[1], operation, issues);
      calls.forEach((call, index) => {
        recordUnknownReservation(call, inputs[surface], unknownReservations, issues);
        if (call.task !== contract.task) issues.push(`task_mismatch:${operation}:${index}`);
        if (call.schemaName !== contract.schemaName) issues.push(`schema_mismatch:${operation}:${index}`);
        if (call.inputFingerprint !== expectedInputFingerprint) issues.push(`input_mismatch:${operation}:${index}`);
        if (call.metadata?.caseId !== turn.caseId) issues.push(`case_mismatch:${operation}:${index}`);
        if (call.fromCassette || call.costStatus === "cassette") issues.push(`cassette_not_paid_evidence:${operation}:${index}`);
        const preflight = input.providerPreflight.find((row) => row.task === contract.task && row.passed
          && row.provider === call.provider && row.configuredModel === configuredModel(call));
        if (!preflight) issues.push(`provider_not_preflighted:${operation}:${index}`);
        else if (call.costStatus === "measured" && call.model !== preflight.resolvedModel) {
          issues.push(`resolved_model_not_preflighted:${operation}:${index}`);
        }
        const prior = calls[index - 1];
        if (call.isSameModelRepair) {
          validateRepairLineage(call, prior, contract.system, contract.schemaName, contract.schema, operation, index, issues);
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
      if (!close(sum(calls.map(recomputedCallCost)), expectedCost)) issues.push(`cost_mismatch:${operation}`);
      if (sum(calls.map(({latencyMs}) => latencyMs)) !== expectedLatency) issues.push(`latency_mismatch:${operation}`);
      linkedObservationOperations += 1;
    }
    if (!close(observation.routeCostUsd + observation.objectCostUsd, observation.costUsd)) {
      issues.push(`observation_cost_mismatch:${observation.turnId}:${observation.repeat}`);
    }
  }

  let linkedPreflightOperations = 0;
  const expectedPreflights = (Object.keys(surfaceContract) as Array<keyof typeof surfaceContract>).flatMap((surface) => {
    const contract = surfaceContract[surface];
    return configuredRefs(contract.task).map((ref) => ({contract, ref}));
  });
  for (const {contract, ref} of expectedPreflights) {
    const rows = input.providerPreflight.filter((row) => row.task === contract.task
      && row.schemaName === contract.schemaName && row.provider === ref.provider && row.configuredModel === ref.model);
    if (rows.length !== 1) {
      issues.push(`preflight_row_count:${contract.task}:${ref.provider}:${ref.model}:${rows.length}`);
      continue;
    }
    const row = rows[0]!;
    if (!row.passed) issues.push(`preflight_not_passed:${row.task}:${row.provider}:${row.configuredModel}`);
    const preflightTurn = intentGoldTurns[0]!;
    const route = contract.task === "route_intent";
    const preflightInput = [{type: "text" as const, text: JSON.stringify(route
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
    for (const call of matching) recordUnknownReservation(call, preflightInput, unknownReservations, issues);
    if (matching.length === 0) issues.push(`missing_preflight_calls:${row.task}:${row.provider}`);
    if (matching.filter(({outcome}) => outcome === "ok").length !== (row.passed ? 1 : 0)) {
      issues.push(`preflight_outcome_mismatch:${row.task}:${row.provider}`);
    }
    matching.forEach((call, index) => {
      if (call.provider !== row.provider) issues.push(`preflight_provider_mismatch:${row.task}:${row.provider}:${index}`);
      if (configuredModel(call) !== row.configuredModel || call.effort !== ref.effort) {
        issues.push(`preflight_configured_model_mismatch:${row.task}:${row.provider}:${index}`);
      }
      if (call.inputFingerprint !== expectedInputFingerprint) issues.push(`preflight_input_mismatch:${row.task}:${row.provider}:${index}`);
      if (call.isSameModelRepair) {
        validateRepairLineage(call, matching[index - 1], contract.system, contract.schemaName, contract.schema, `preflight:${row.task}:${row.provider}`, index, issues);
      } else {
        if (call.promptFingerprint !== expectedPromptFingerprint) issues.push(`preflight_prompt_mismatch:${row.task}:${row.provider}:${index}`);
        if (call.previousInvocationId || call.repairGuidanceFingerprint || call.repairValidationIssueCodeFingerprint) {
          issues.push(`unexpected_repair_lineage:preflight:${row.task}:${row.provider}:${index}`);
        }
      }
      if (call.outcome === "ok" && call.model !== row.resolvedModel) issues.push(`preflight_model_mismatch:${row.task}:${row.provider}:${index}`);
      if (call.fromCassette || call.costStatus === "cassette") issues.push(`preflight_cassette_not_paid_evidence:${row.task}:${row.provider}:${index}`);
    });
    validateAttemptTopology(matching, ref, undefined, `preflight:${row.task}:${row.provider}:${row.configuredModel}`, issues);
    if (matching.filter(({costStatus}) => costStatus !== "not_called").length !== row.attemptCount) {
      issues.push(`preflight_attempt_count_mismatch:${row.task}:${row.provider}`);
    }
    if (!close(sum(matching.map(recomputedCallCost)), row.measuredCostUsd)) {
      issues.push(`preflight_cost_mismatch:${row.task}:${row.provider}`);
    }
    const expectedPreflightExposureUsd = sum(matching.map((call) =>
      recomputedCallCost(call) + (unknownReservations.get(call.invocationId) ?? 0)));
    if (!Number.isFinite(expectedPreflightExposureUsd)
      || !close(expectedPreflightExposureUsd, row.conservativeExposureUsd)) {
      issues.push(`preflight_exposure_mismatch:${row.task}:${row.provider}`);
    }
    const expectedMinimumLatencyMs = sum(matching.map(({latencyMs}) => latencyMs));
    if (!Number.isFinite(row.latencyMs) || row.latencyMs < expectedMinimumLatencyMs) {
      issues.push(`preflight_latency_mismatch:${row.task}:${row.provider}`);
    }
    linkedPreflightOperations += 1;
  }
  const expectedPreflightKeys = new Set(expectedPreflights.map(({contract, ref}) =>
    `${contract.task}:${contract.schemaName}:${ref.provider}:${ref.model}`));
  for (const row of input.providerPreflight) {
    const key = `${row.task}:${row.schemaName}:${row.provider}:${row.configuredModel}`;
    if (!expectedPreflightKeys.has(key)) issues.push(`unexpected_preflight_row:${key}`);
  }
  for (const call of input.calls) {
    if (!claimedInvocationIds.has(call.invocationId)) issues.push(`orphan_call:${call.invocationId}`);
  }

  const providerAttempts = input.calls.filter(({costStatus}) => costStatus === "measured" || costStatus === "unknown").length;
  const measuredCostUsd = sum(input.calls.map(({costStatus, costUsd}) => costStatus === "measured" ? costUsd : 0));
  const recomputedMeasuredCostUsd = sum(input.calls.map(recomputedCallCost));
  const unknownCostAttempts = input.calls.filter(({costStatus}) => costStatus === "unknown").length;
  const cassetteAttempts = input.calls.filter(({costStatus}) => costStatus === "cassette").length;
  const unknownCostReservationUsd = sum([...unknownReservations.values()]);
  const recomputedBudgetExposureUsd = recomputedMeasuredCostUsd + unknownCostReservationUsd;
  if (providerAttempts !== input.gatewaySpent.calls) issues.push("gateway_call_count_mismatch");
  if (!Number.isFinite(recomputedMeasuredCostUsd)) issues.push("unpriced_measured_call");
  if (!close(recomputedMeasuredCostUsd, input.gatewaySpent.costUsd)) issues.push("gateway_measured_cost_mismatch");
  if (unknownCostAttempts !== input.gatewaySpent.unknownCostCalls) issues.push("gateway_unknown_cost_mismatch");
  if (!Number.isFinite(recomputedBudgetExposureUsd)
    || !close(input.gatewaySpent.budgetExposureUsd, recomputedBudgetExposureUsd)) {
    issues.push("gateway_conservative_exposure_mismatch");
  }

  return {
    passed: issues.length === 0,
    issues,
    observationOperations: input.observations.length * 2,
    linkedObservationOperations,
    preflightOperations: expectedPreflights.length,
    linkedPreflightOperations,
    providerAttempts,
    measuredCostUsd,
    recomputedMeasuredCostUsd,
    recomputedBudgetExposureUsd,
    unknownCostReservationUsd,
    pricingTableFingerprint: evidenceFingerprint(listPrices),
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
  system: string,
  schemaName: string,
  schema: z.ZodType,
  operation: string,
  index: number,
  issues: string[],
): void {
  if (!prior || prior.outcome !== "invalid_output") {
    issues.push(`repair_without_rejection:${operation}:${index}`);
    return;
  }
  if (call.previousInvocationId !== prior.invocationId) issues.push(`repair_predecessor_mismatch:${operation}:${index}`);
  if (call.provider !== prior.provider || call.model !== prior.model || configuredModel(call) !== configuredModel(prior)
    || call.effort !== prior.effort) issues.push(`repair_model_mismatch:${operation}:${index}`);
  if (call.usedProviderFallback || !call.usedFallback || call.retryOrdinal !== 1) issues.push(`repair_topology_mismatch:${operation}:${index}`);
  const priorIssueFingerprint = evidenceFingerprint((prior.validationIssues ?? []).map(({path, code, allowedValues}) => ({
    path, code, allowedValues: allowedValues ?? [],
  })));
  if (!prior.validationIssueCodeFingerprint || prior.validationIssueCodeFingerprint !== priorIssueFingerprint) {
    issues.push(`rejection_issue_fingerprint_mismatch:${operation}:${index}`);
  }
  if (!call.repairValidationIssueCodeFingerprint
    || call.repairValidationIssueCodeFingerprint !== prior.validationIssueCodeFingerprint) {
    issues.push(`repair_issue_fingerprint_mismatch:${operation}:${index}`);
  }
  if (!prior.validationSource) {
    issues.push(`repair_validation_source_missing:${operation}:${index}`);
    return;
  }
  const guidance = buildRepairGuidance(prior.validationSource, prior.validationIssues ?? []);
  if (call.repairGuidanceFingerprint !== evidenceFingerprint(guidance)) issues.push(`repair_guidance_mismatch:${operation}:${index}`);
  const effectivePromptFingerprint = evidenceFingerprint({
    system: `${system}\n\n${guidance}`,
    schemaName,
    schema: z.toJSONSchema(schema),
  });
  if (call.promptFingerprint !== effectivePromptFingerprint) issues.push(`repair_prompt_mismatch:${operation}:${index}`);
}

function validateAttemptTopology(
  calls: readonly GatewayCallLog[],
  primary: ModelRef,
  fallback: ModelRef | undefined,
  operation: string,
  issues: string[],
): void {
  if (calls.length === 0) return;
  if (calls.length > 3) issues.push(`attempt_limit_exceeded:${operation}:${calls.length}`);
  calls.forEach((call, index) => {
    if (!call.configuredModel) issues.push(`configured_model_missing:${operation}:${index}`);
  });

  const initial = calls[0]!;
  const initialRef = {provider: initial.provider, model: configuredModel(initial), effort: initial.effort};
  if (!sameRef(initialRef, primary) || initial.retryOrdinal !== 0 || initial.isSameModelRepair
    || initial.usedProviderFallback || initial.usedFallback) {
    issues.push(`initial_attempt_topology_mismatch:${operation}:0`);
  }

  let cursor = 1;
  const possibleRepair = calls[cursor];
  if (possibleRepair?.isSameModelRepair) {
    if (initial.outcome !== "invalid_output") {
      issues.push(`repair_not_immediately_after_invalid_primary:${operation}:${cursor}`);
    }
    cursor += 1;
  }

  const possibleFallback = calls[cursor];
  if (possibleFallback) {
    const fallbackRef = {
      provider: possibleFallback.provider,
      model: configuredModel(possibleFallback),
      effort: possibleFallback.effort,
    };
    if (possibleFallback.isSameModelRepair || !fallback || !sameRef(fallbackRef, fallback)
      || possibleFallback.retryOrdinal !== 0 || !possibleFallback.usedProviderFallback
      || !possibleFallback.usedFallback || calls[cursor - 1]?.outcome === "ok") {
      issues.push(`fallback_topology_mismatch:${operation}:${cursor}`);
    }
    cursor += 1;
  }

  if (cursor < calls.length) issues.push(`unexpected_attempt_sequence:${operation}:${cursor}`);
}

function recordUnknownReservation(
  call: GatewayCallLog,
  input: readonly ContentPart[],
  reservations: Map<string, number>,
  issues: string[],
): void {
  if (call.costStatus !== "unknown") return;
  const policy = defaultTaskPolicies[call.task];
  const model = configuredModel(call);
  if (!policy || !listPrices[model]) {
    issues.push(`unknown_cost_reservation_unpriced:${call.invocationId}`);
    reservations.set(call.invocationId, Number.NaN);
    return;
  }
  const inputTokens = input.reduce((total, part) =>
    total + (part.type === "text" ? estimateInputTokens(part.text) : 0), 0);
  reservations.set(call.invocationId,
    estimateCostReservationUsd(model, inputTokens, policy.maxOutputTokens));
}

function recomputedCallCost(call: GatewayCallLog): number {
  if (call.costStatus !== "measured") return 0;
  const model = configuredModel(call);
  if (!listPrices[model]) return Number.NaN;
  return estimateCostUsd(model, call.usage);
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
