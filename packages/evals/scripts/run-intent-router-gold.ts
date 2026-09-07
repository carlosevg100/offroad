/**
 * Runs the production Intent Classifier contract on the canonical synthetic turns.
 *
 * All canonical turns run once for accuracy. Six plan-changing turns additionally run through two
 * authored paraphrases to prove that the same meaning preserves workflow identity. Each observation
 * runs the production router and the independent attributable-span extractor in parallel, then
 * compiles semantic objects before canonicalization. The report is promotion evidence only when all
 * 52 manifest entries pass; this script never promotes or changes the production router.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  INTENT_CLASSIFIER_SYSTEM,
  SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
  applySemanticObjectCompilation,
  buildSemanticObjectExtractorInput,
  buildIntentClassifierInput,
  canonicalizeIntentClassifierOutput,
  compileSemanticObjects,
  intentClassifierOutputSchema,
  semanticObjectExtractorOutputSchema,
  validateSemanticObjectOutput,
  type SemanticObjectCompilation,
  type SemanticObjectExtractorOutput,
  type IntentClassifierOutput,
} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {
  createAnthropicAdapter,
  createModelGateway,
  createOpenAIAdapter,
  defaultTaskPolicies,
  type GatewayCallLog,
  type ModelRef,
} from "@offroad/model-gateway";

import {assertCanonicalIntentGold, intentGoldTurns, stabilityIntentTurnIds, type IntentGoldTurn} from "../src/intent-gold";
import {
  expectedIntentRouterManifest,
  fingerprintIntentMessage,
  intentRouterGateObservationSchema,
  intentRoutingFingerprint,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "../src/intent-router-gate";
import {
  IntentRouterProviderPreflightError,
  preflightIntentRouterProviders,
  type IntentRouterProviderPreflight,
} from "../src/intent-router-preflight";

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
};
const outDir = resolve(option("out", "results/intent-router-gold"));
const maxCostUsd = Number(option("max-cost", "3"));
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || maxCostUsd > 10) {
  throw new Error("--max-cost must be greater than 0 and no more than 10 USD");
}

const stabilityTurnIds = new Set(stabilityIntentTurnIds);

const professionalContextByCase: Partial<Record<IntentGoldTurn["caseId"], {
  useForms: string[];
  professionalRoles: string[];
  practiceAreas: string[];
  primaryObjectives: string[];
}>> = {
  gc01: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["investment_banking", "dcm"], primaryObjectives: ["prepare_materials"]},
  gc02: {useForms: ["institutional_work"], professionalRoles: ["company_finance"], practiceAreas: ["treasury", "corporate_finance"], primaryObjectives: ["evaluate_capital_structure"]},
  gc03: {useForms: ["institutional_work"], professionalRoles: ["advisor"], practiceAreas: ["structured_credit"], primaryObjectives: ["structure_transactions"]},
  gc04: {useForms: ["institutional_work"], professionalRoles: ["investor"], practiceAreas: ["private_credit"], primaryObjectives: ["evaluate_opportunities"]},
  gc05: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["corporate_banking", "dcm"], primaryObjectives: ["originate_ideas"]},
};

const calls: GatewayCallLog[] = [];

async function main(): Promise<void> {
  assertCanonicalIntentGold();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const routePolicy = defaultTaskPolicies.route_intent;
  const objectPolicy = defaultTaskPolicies.extract_semantic_objects;
  const routeProviders = uniqueModelRefs([routePolicy.primary, ...(routePolicy.fallback ? [routePolicy.fallback] : [])]);
  const objectProviders = uniqueModelRefs([objectPolicy.primary, ...(objectPolicy.fallback ? [objectPolicy.fallback] : [])]);
  const configuredProviders = uniqueModelRefs([...routeProviders, ...objectProviders]);
  const missingProviderKeys = configuredProviders.filter(({provider}) =>
    provider === "anthropic" ? !anthropicKey : !openaiKey).map(({provider}) => provider);
  if (missingProviderKeys.length > 0) {
    throw new Error(`configured route_intent provider credentials missing: ${missingProviderKeys.join(",")}; run this gate through its OIDC workflow`);
  }

  const plannedCalls = expectedIntentRouterManifest().length;
  if (plannedCalls !== 52) throw new Error(`intent_router_manifest_must_have_52_observations:${plannedCalls}`);
  mkdirSync(outDir, {recursive: true});
  const gateway = createModelGateway({
    adapters: {
      anthropic: createAnthropicAdapter({apiKey: anthropicKey!}),
      openai: createOpenAIAdapter({apiKey: openaiKey!}),
    },
    budget: {maxCostUsd, maxCalls: plannedCalls * 2 * 3 + configuredProviders.length * 4},
    onCall: (call) => calls.push(call),
  });
  const observations: IntentRouterGateObservation[] = [];
  const preflightTurn = intentGoldTurns[0]!;
  let providerPreflight: IntentRouterProviderPreflight[] = [];
  let preflightFailed = false;
  try {
    providerPreflight.push(...await preflightIntentRouterProviders(gateway, routeProviders, {
      task: "route_intent",
      system: INTENT_CLASSIFIER_SYSTEM,
      input: [{type: "text", text: JSON.stringify(classifierInputFor(preflightTurn, preflightTurn.message))}],
      schema: intentClassifierOutputSchema,
      schemaName: "shadow_routing_output",
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {caseId: preflightTurn.caseId, turnId: preflightTurn.id},
    }));
  } catch (cause) {
    if (cause instanceof IntentRouterProviderPreflightError) providerPreflight.push(...cause.results);
    preflightFailed = true;
  }
  const preflightObjectInput = objectInputFor(preflightTurn, preflightTurn.message);
  try {
    providerPreflight.push(...await preflightIntentRouterProviders(gateway, objectProviders, {
      task: "extract_semantic_objects",
      system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
      input: [{type: "text", text: JSON.stringify(preflightObjectInput)}],
      schema: semanticObjectExtractorOutputSchema,
      schemaName: "semantic_object_extractor_output",
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {caseId: preflightTurn.caseId, turnId: preflightTurn.id},
      validateOutput: (output) => validateSemanticObjectOutput(preflightObjectInput, output),
    }));
  } catch (cause) {
    if (cause instanceof IntentRouterProviderPreflightError) providerPreflight.push(...cause.results);
    preflightFailed = true;
  }
  if (preflightFailed) {
    writeFileSync(resolve(outDir, "provider-preflight.json"), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      passed: false,
      providers: providerPreflight,
      gatewaySpent: gateway.spent(),
      calls,
    }, null, 2)}\n`, "utf8");
    writeFileSync(resolve(outDir, "intent-router-gold.md"), renderPreflightFailure(providerPreflight, gateway.spent()), "utf8");
    throw new IntentRouterProviderPreflightError(providerPreflight);
  }

  for (const turn of intentGoldTurns) {
    const repeats = stabilityTurnIds.has(turn.id) ? 3 : 1;
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const message = repeat === 1 ? turn.message : turn.stabilityParaphrases?.[repeat - 2];
      if (!message) throw new Error(`missing_authored_paraphrase:${turn.id}:${repeat}`);
      const classifierInput = classifierInputFor(turn, message);
      const objectInput = objectInputFor(turn, message);
      const startedAt = Date.now();
      const spentBefore = gateway.spent();
      let actual: IntentClassifierOutput | null = null;
      let rawActual: IntentClassifierOutput | null = null;
      let rawObjectActual: SemanticObjectExtractorOutput | null = null;
      let objectCompilation: SemanticObjectCompilation | null = null;
      let error: string | null = null;
      let provider: string | null = null;
      let model: string | null = null;
      let objectProvider: string | null = null;
      let objectModel: string | null = null;
      let objectAttemptCount = 0;
      let objectCostUsd = 0;
      let objectLatencyMs = 0;
      let costUsd = 0;
      let latencyMs = 0;
      try {
        const [routeResult, objectResult] = await Promise.allSettled([
          gateway.complete({
            task: "route_intent",
            system: INTENT_CLASSIFIER_SYSTEM,
            input: [{type: "text", text: JSON.stringify(classifierInput)}],
            schema: intentClassifierOutputSchema,
            schemaName: "shadow_routing_output",
            outputMode: "prompted_json",
            thinking: "off",
            metadata: {surface: "intent_router_gold", caseId: turn.caseId, turnId: turn.id, repeat: String(repeat)},
          }),
          gateway.complete({
            task: "extract_semantic_objects",
            system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
            input: [{type: "text", text: JSON.stringify(objectInput)}],
            schema: semanticObjectExtractorOutputSchema,
            schemaName: "semantic_object_extractor_output",
            outputMode: "prompted_json",
            thinking: "off",
            metadata: {surface: "intent_object_gold", caseId: turn.caseId, turnId: turn.id, repeat: String(repeat)},
            validateOutput: (output) => validateSemanticObjectOutput(objectInput, output),
          }),
        ]);
        if (routeResult.status === "fulfilled") {
          rawActual = routeResult.value.output;
          provider = routeResult.value.provider;
          model = routeResult.value.model;
        }
        if (objectResult.status === "fulfilled") {
          rawObjectActual = objectResult.value.output;
          objectProvider = objectResult.value.provider;
          objectModel = objectResult.value.model;
        }
        if (routeResult.status === "rejected" || objectResult.status === "rejected") {
          const failures = [routeResult, objectResult]
            .filter((result): result is PromiseRejectedResult => result.status === "rejected")
            .map(({reason}) => reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
          throw new Error(failures.join(" | "));
        }
        objectCompilation = compileSemanticObjects(objectInput, objectResult.value.output);
        actual = canonicalizeIntentClassifierOutput(
          applySemanticObjectCompilation(routeResult.value.output, objectCompilation),
          classifierInput,
        );
      } catch (cause) {
        error = (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)).slice(0, 800);
      }
      const spentAfter = gateway.spent();
      costUsd = spentAfter.costUsd - spentBefore.costUsd;
      latencyMs = Date.now() - startedAt;
      const recordedObjectAttempts = calls.filter((call) => call.metadata?.surface === "intent_object_gold"
        && call.metadata.turnId === turn.id && call.metadata.repeat === String(repeat)
        && call.costStatus !== "not_called");
      objectAttemptCount = recordedObjectAttempts.length;
      objectCostUsd = recordedObjectAttempts.reduce((sum, call) => sum + call.costUsd, 0);
      objectLatencyMs = recordedObjectAttempts.reduce((sum, call) => sum + call.latencyMs, 0);
      observations.push({
        turnId: turn.id,
        suite: turn.suite,
        repeat,
        messageFingerprint: fingerprintIntentMessage(message),
        expected: turn.expected,
        rawActual,
        rawActualFingerprint: rawActual ? fingerprintJson(rawActual) : null,
        rawObjectActual,
        rawObjectActualFingerprint: rawObjectActual ? fingerprintJson(rawObjectActual) : null,
        objectCompilation,
        actual,
        error,
        checks: scoreIntentGoldTurn(turn, actual, rawActual, objectCompilation),
        routingFingerprint: actual ? intentRoutingFingerprint(actual) : null,
        provider,
        model,
        objectProvider,
        objectModel,
        objectAttemptCount,
        objectCostUsd,
        objectLatencyMs,
        costUsd,
        latencyMs,
      });
      const status = actual ? (observations.at(-1)!.checks.composition ? "ok" : "mismatch") : "error";
      console.log(`${turn.id} repeat=${repeat} ${status} composition=${actual?.composition ?? "none"} model=${model ?? "none"}`);
    }
  }

  const parsedObservations = observations.map((observation) => intentRouterGateObservationSchema.parse(observation));
  const summary = summarizeIntentRouterGate(parsedObservations);
  const providerOutputEvidence = parsedObservations.flatMap((observation) => ([
    providerOutputCheck(calls, observation, "intent_router_gold", observation.rawActualFingerprint),
    providerOutputCheck(calls, observation, "intent_object_gold", observation.rawObjectActualFingerprint),
  ]));
  const providerOutputEvidencePassed = providerOutputEvidence.every(({passed}) => passed);
  const gatePassed = summary.passed && providerOutputEvidencePassed;
  const spent = gateway.spent();
  const observationCalls = calls.filter(({metadata}) => metadata?.surface === "intent_router_gold");
  const objectCalls = calls.filter(({metadata}) => metadata?.surface === "intent_object_gold");
  const preflightCalls = calls.filter(({metadata}) => metadata?.surface === "intent_router_provider_preflight");
  const attemptTelemetry = {
    observations: parsedObservations.length,
    totalProviderAttempts: spent.calls,
    observationProviderAttempts: observationCalls.filter(({costStatus}) => costStatus !== "not_called").length,
    objectProviderAttempts: objectCalls.filter(({costStatus}) => costStatus !== "not_called").length,
    preflightProviderAttempts: preflightCalls.filter(({costStatus}) => costStatus !== "not_called").length,
    sameModelRepairAttempts: calls.filter(({isSameModelRepair}) => isSameModelRepair === true).length,
    providerFallbackAttempts: calls.filter(({usedProviderFallback}) => usedProviderFallback === true).length,
    unknownCostAttempts: spent.unknownCostCalls,
  };
  const record = {
    ...summary,
    passed: gatePassed,
    generatedAt: new Date().toISOString(),
    stabilityRepeats: 3,
    stabilityTurnIds: [...stabilityTurnIds],
    budget: {maxCostUsd, plannedCalls},
    gatewaySpent: spent,
    providerPreflight,
    providerOutputEvidencePassed,
    providerOutputEvidence,
    attemptTelemetry,
    contract: {
      router: {schemaName: "shadow_routing_output", outputMode: "prompted_json", task: "route_intent"},
      semanticObjects: {schemaName: "semantic_object_extractor_output", outputMode: "prompted_json", task: "extract_semantic_objects", activeWorkContext: "null_in_current_gold_fixture"},
    },
    expectedManifest: expectedIntentRouterManifest(),
    runs: parsedObservations,
    calls,
  };
  writeFileSync(resolve(outDir, "intent-router-gold.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outDir, "intent-router-gold.md"), renderMarkdown(record), "utf8");
  console.log(`gate=${gatePassed ? "PASS" : "FAIL"} turns=${summary.uniqueTurns} observations=${summary.observations} fingerprint_invariance=${percent(summary.fingerprintInvarianceRate)} qualified_stability=${percent(summary.qualifiedStabilityRate)} attempts=${spent.calls} measured_cost=$${spent.costUsd.toFixed(4)} conservative_exposure=$${spent.budgetExposureUsd.toFixed(4)}`);
  console.log(`report=${resolve(outDir, "intent-router-gold.md")}`);
  if (!gatePassed) process.exitCode = 1;
}

function providerOutputCheck(
  gatewayCalls: readonly GatewayCallLog[],
  observation: IntentRouterGateObservation,
  surface: "intent_router_gold" | "intent_object_gold",
  expectedFingerprint: string | null,
) {
  const successful = gatewayCalls.filter((call) => call.outcome === "ok"
    && call.metadata?.surface === surface
    && call.metadata?.turnId === observation.turnId
    && call.metadata?.repeat === String(observation.repeat));
  return {
    turnId: observation.turnId,
    repeat: observation.repeat,
    surface,
    expectedFingerprint,
    recordedFingerprints: successful.map(({outputFingerprint}) => outputFingerprint),
    passed: expectedFingerprint !== null
      && successful.length === 1
      && successful[0]?.outputFingerprint === expectedFingerprint,
  };
}

function classifierInputFor(turn: IntentGoldTurn, message: string) {
  return buildIntentClassifierInput({
    locale: turn.locale,
    latestUserMessage: message,
    recentConversation: turn.priorTurns.slice(-8).map((content) => ({role: "user", content})),
    entryJob: null,
    documentCount: turn.documentCount,
    professionalContext: professionalContextByCase[turn.caseId] ?? null,
  });
}

function objectInputFor(turn: IntentGoldTurn, message: string) {
  return buildSemanticObjectExtractorInput({
    locale: turn.locale,
    latestUserMessage: message,
    // These authored fixtures are conversation input, not an authority source. The current gold
    // corpus has no control-plane-governed active work context, so the contract receives null
    // rather than deriving memory from the answer key.
    recentConversation: turn.priorTurns.slice(-8).map((content) => ({role: "user" as const, content})),
    activeWorkContext: null,
  });
}

function uniqueModelRefs(refs: readonly ModelRef[]): ModelRef[] {
  return refs.filter((ref, index, values) => values.findIndex((candidate) =>
    candidate.provider === ref.provider && candidate.model === ref.model && candidate.effort === ref.effort) === index);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(record: ReturnType<typeof summarizeIntentRouterGate> & {
  generatedAt: string;
  gatewaySpent: ReturnType<ReturnType<typeof createModelGateway>["spent"]>;
  providerPreflight: IntentRouterProviderPreflight[];
  providerOutputEvidencePassed: boolean;
  attemptTelemetry: {
    observations: number; totalProviderAttempts: number; observationProviderAttempts: number;
    objectProviderAttempts: number;
    preflightProviderAttempts: number; sameModelRepairAttempts: number; providerFallbackAttempts: number;
    unknownCostAttempts: number;
  };
  runs: IntentRouterGateObservation[];
}): string {
  const routedObjectRuns = record.runs.filter(({expected}) => !expected.abstain);
  const diagnosticAbstentions = record.runs.filter(({expected, objectCompilation}) => expected.abstain
    && objectCompilation?.status !== "complete" && (objectCompilation?.coverage.issues.length ?? 0) > 0);
  const lines = [
    "# Intent Router Gold Gate",
    "",
    `**Verdict:** ${record.passed ? "PASS" : "FAIL"}`,
    `**Generated:** ${record.generatedAt}`,
    `**Coverage:** ${record.uniqueTurns}/40 canonical turns; ${record.observations}/52 observations`,
    `**Manifest:** ${record.manifestPassed ? "PASS" : "FAIL"}`,
    `**Provider preflight:** ${record.providerPreflight.every(({passed}) => passed) ? "PASS" : "FAIL"} (${record.providerPreflight.map(({task, provider, configuredModel}) => `${task}:${provider}/${configuredModel}`).join(", ")})`,
    `**Raw provider-output linkage:** ${record.providerOutputEvidencePassed ? "PASS" : "FAIL"}`,
    `**Pure fingerprint invariance:** ${record.fingerprintInvariantTurns}/${record.repeatedTurns} repeated turns (${percent(record.fingerprintInvarianceRate)})`,
    `**Qualified stability:** ${record.qualifiedStableTurns}/${record.repeatedTurns} repeated turns (${percent(record.qualifiedStabilityRate)})`,
    `**Cost:** measured US$ ${record.gatewaySpent.costUsd.toFixed(4)}; conservative exposure US$ ${record.gatewaySpent.budgetExposureUsd.toFixed(4)}; ${record.gatewaySpent.unknownCostCalls} attempts with unknown cost`,
    `**Volume:** ${record.attemptTelemetry.observations} observations; ${record.attemptTelemetry.totalProviderAttempts} total provider attempts (${record.attemptTelemetry.observationProviderAttempts} router + ${record.attemptTelemetry.objectProviderAttempts} object extractor + ${record.attemptTelemetry.preflightProviderAttempts} preflight); ${record.attemptTelemetry.sameModelRepairAttempts} same-model repairs; ${record.attemptTelemetry.providerFallbackAttempts} provider fallbacks`,
    `**Object extraction:** ${routedObjectRuns.filter(({objectCompilation}) => objectCompilation?.status === "complete").length}/${routedObjectRuns.length} routed observations complete; ${diagnosticAbstentions.length}/${record.runs.length - routedObjectRuns.length} abstentions carry fail-closed diagnostics; measured attempt cost US$ ${record.runs.reduce((sum, run) => sum + run.objectCostUsd, 0).toFixed(4)}`,
    "",
    "## Promotion metrics",
    "",
    "| Metric | Result | Required | Verdict |",
    "| --- | ---: | ---: | --- |",
    ...record.metrics.map((metric) => `| ${metric.name} | ${metric.passed}/${metric.total} (${percent(metric.rate)}) | ${percent(metric.requiredRate)} | ${metric.gatePassed ? "PASS" : "FAIL"} |`),
    "",
    "## Suite gates",
    "",
    "| Suite | Base observations | Verdict | Failed turns |",
    "| --- | ---: | --- | --- |",
    ...record.suiteGates.map((suite) => `| ${suite.suite} | ${suite.observations} | ${suite.passed ? "PASS" : "FAIL"} | ${suite.failedTurnIds.join(", ") || "none"} |`),
    "",
    "## Turn results",
    "",
    "| Turn | Run | Expected composition | Actual composition | Workflow checks | Error |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...record.runs.map((observation) => {
      const failed = Object.entries(observation.checks).filter(([, passed]) => !passed).map(([name]) => name);
      return `| ${observation.turnId} | ${observation.repeat} | ${observation.expected.composition ?? "abstain/no composition"} | ${observation.actual?.composition ?? "none"} | ${failed.length === 0 ? "PASS" : `FAIL: ${failed.join(", ")}`} | ${observation.error?.replaceAll("|", "\\|") ?? "none"} |`;
    }),
    "",
    "## Pure fingerprint invariance failures",
    "",
    record.fingerprintVariantTurnIds.length === 0 ? "None." : record.fingerprintVariantTurnIds.map((id) => `- ${id}`).join("\n"),
    "",
    "## Qualified stability failures",
    "",
    record.qualifiedUnstableTurnIds.length === 0 ? "None." : record.qualifiedUnstableTurnIds.map((id) => `- ${id}`).join("\n"),
    "",
    "> Passing this gate is necessary but not sufficient for production routing. It proves the bounded gold set and repeated-prompt invariance; it does not authorize a workflow, executor or customer-facing conclusion.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderPreflightFailure(
  providers: IntentRouterProviderPreflight[],
  spent: ReturnType<ReturnType<typeof createModelGateway>["spent"]>,
): string {
  return [
    "# Intent Router Gold Gate",
    "",
    "**Verdict:** ABORTED BEFORE OBSERVATIONS",
    `**Generated:** ${new Date().toISOString()}`,
    `**Provider preflight:** FAIL (${providers.map(({task, provider, passed}) => `${task}:${provider}=${passed ? "PASS" : "FAIL"}`).join(", ") || "no result"})`,
    "**Coverage:** 0/40 canonical turns; 0/52 observations",
    `**Cost:** measured US$ ${spent.costUsd.toFixed(4)}; conservative exposure US$ ${spent.budgetExposureUsd.toFixed(4)}; ${spent.unknownCostCalls} attempts with unknown cost`,
    "",
    "> The gate aborted before the gold corpus because every configured router and semantic-object provider must pass its real prompt/input/schema contract independently.",
    "",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
