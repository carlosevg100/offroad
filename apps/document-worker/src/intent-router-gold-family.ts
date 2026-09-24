import {
 intentRouterGoldRoutes,
 intentRouterGoldSnapshotContentHashes,
 intentRouterGoldSnapshotSchema,
 runIntentRouterGold,
 type IntentRouterGoldCallLog,
 type IntentRouterGoldResult,
 type IntentRouterGoldTask,
 type IntentRouterGoldTaskSettings,
} from "@offroad/agent-contracts";
import {defaultTaskPolicies, type GatewayCallLog, type TaskPolicy} from "@offroad/model-gateway";
import type {EvaluationFamily} from "./evaluation-families";

/** Compile time: the result schema names every field of a gateway call log, so the ledger crosses whole. */
type UnreadCallLogField = Exclude<keyof GatewayCallLog, keyof IntentRouterGoldCallLog>;
const callLogCovered: [UnreadCallLogField] extends [never] ? true : never = true;
void callLogCovered;

/** The task policy the gateway uses: the snapshot's routes and ceiling, the task's own timeout. */
function policyOf(task: IntentRouterGoldTask, settings: IntentRouterGoldTaskSettings): TaskPolicy {
 const {primary, fallback, maxOutputTokens} = settings;
 return {primary, ...(fallback ? {fallback} : {}), maxOutputTokens, timeoutMs: defaultTaskPolicies[task].timeoutMs};
}

/** Text as the commit stores it: a value with nothing JSON would drop or refuse. */
const asPublished = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The intent router gold gate (`run-intent-router-gold`): the provider preflight on every configured
 * route of the router and of the semantic-object extractor, then the router and the extractor on
 * every observation of the snapshot, one attempt at a time. It publishes the run with the complete
 * call ledger of its gateway; the script scores the run against the gold and verifies the ledger.
 */
export const intentRouterGoldFamily: EvaluationFamily = {
 id: "intent_router_gold",
 prepare(value) {
  const snapshot = intentRouterGoldSnapshotSchema.parse(value);
  const calls: IntentRouterGoldCallLog[] = [];
  return {
   family: "intent_router_gold",
   routes: intentRouterGoldRoutes(snapshot),
   contentHashes: intentRouterGoldSnapshotContentHashes(snapshot),
   audience: {caseId: snapshot.audience.caseId, caseVersion: snapshot.audience.caseVersion},
   policies: {
    route_intent: policyOf("route_intent", snapshot.model.route_intent),
    extract_semantic_objects: policyOf("extract_semantic_objects", snapshot.model.extract_semantic_objects),
   },
   onCall: (log) => { calls.push(asPublished(log) as unknown as IntentRouterGoldCallLog); },
   async run(gateway, clock) {
    const result = await runIntentRouterGold(snapshot, {complete: gateway.complete, spent: gateway.spent, calls: () => calls}, clock);
    // The shape the script reads back with intentRouterGoldResultSchema.
    return asPublished(result) satisfies IntentRouterGoldResult;
   },
  };
 },
};
