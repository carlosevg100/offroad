/**
 * Runs the production Intent Classifier contract on the canonical synthetic turns.
 *
 * All sixteen turns run once for accuracy. Six plan-changing turns run three times by default
 * to prove that the same prompt preserves the same workflow identity. The report is evidence
 * for promotion; this script never promotes or changes the production router.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  INTENT_CLASSIFIER_SYSTEM,
  buildIntentClassifierInput,
  intentClassifierOutputSchema,
  type IntentClassifierOutput,
} from "@offroad/agent-contracts";
import {
  createAnthropicAdapter,
  createModelGateway,
  createOpenAIAdapter,
  type GatewayCallLog,
} from "@offroad/model-gateway";

import {intentGoldTurns, type IntentGoldTurn} from "../src/intent-gold";
import {
  intentRoutingFingerprint,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "../src/intent-router-gate";

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
};
const outDir = resolve(option("out", "results/intent-router-gold"));
const stabilityRepeats = Number.parseInt(option("stability-repeats", "3"), 10);
const maxCostUsd = Number(option("max-cost", "3"));
if (!Number.isInteger(stabilityRepeats) || stabilityRepeats < 2 || stabilityRepeats > 5) {
  throw new Error("--stability-repeats must be an integer between 2 and 5");
}
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || maxCostUsd > 10) {
  throw new Error("--max-cost must be greater than 0 and no more than 10 USD");
}

const stabilityTurnIds = new Set([
  "gc01-t01", // ambiguous sponsor instruction -> meeting work
  "gc01-t03", // point question inside an existing project
  "gc02-t03", // explicit correction of objective
  "gc03-t02", // external-effect request that must not be softened
  "gc05-t03", // incremental model change
  "gc05-t04", // abstention
]);

const professionalContextByCase: Record<IntentGoldTurn["caseId"], {
  useForms: string[];
  professionalRoles: string[];
  practiceAreas: string[];
  primaryObjectives: string[];
}> = {
  gc01: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["investment_banking", "dcm"], primaryObjectives: ["prepare_materials"]},
  gc02: {useForms: ["institutional_work"], professionalRoles: ["company_finance"], practiceAreas: ["treasury", "corporate_finance"], primaryObjectives: ["evaluate_capital_structure"]},
  gc03: {useForms: ["institutional_work"], professionalRoles: ["advisor"], practiceAreas: ["structured_credit"], primaryObjectives: ["structure_transactions"]},
  gc04: {useForms: ["institutional_work"], professionalRoles: ["investor"], practiceAreas: ["private_credit"], primaryObjectives: ["evaluate_opportunities"]},
  gc05: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["corporate_banking", "dcm"], primaryObjectives: ["originate_ideas"]},
};

const documentCountByCase: Partial<Record<IntentGoldTurn["caseId"], number>> = {gc03: 2, gc04: 2};
const calls: GatewayCallLog[] = [];

async function main(): Promise<void> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is required; run this gate through its OIDC workflow");

  const plannedCalls = intentGoldTurns.length + stabilityTurnIds.size * (stabilityRepeats - 1);
  const gateway = createModelGateway({
    adapters: {
      anthropic: createAnthropicAdapter({apiKey: anthropicKey}),
      ...(openaiKey ? {openai: createOpenAIAdapter({apiKey: openaiKey})} : {}),
    },
    budget: {maxCostUsd, maxCalls: plannedCalls * 3},
    onCall: (call) => calls.push(call),
  });
  const observations: IntentRouterGateObservation[] = [];

  for (const turn of intentGoldTurns) {
    const repeats = stabilityTurnIds.has(turn.id) ? stabilityRepeats : 1;
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const classifierInput = buildIntentClassifierInput({
        locale: turn.locale,
        latestUserMessage: turn.message,
        recentConversation: turn.priorTurns.slice(-8).map((content) => ({role: "user", content})),
        entryJob: null,
        documentCount: documentCountByCase[turn.caseId] ?? 0,
        professionalContext: professionalContextByCase[turn.caseId],
      });
      const startedAt = Date.now();
      let actual: IntentClassifierOutput | null = null;
      let error: string | null = null;
      let provider: string | null = null;
      let model: string | null = null;
      let costUsd = 0;
      let latencyMs = 0;
      try {
        const result = await gateway.complete({
          task: "route_intent",
          system: INTENT_CLASSIFIER_SYSTEM,
          input: [{type: "text", text: JSON.stringify(classifierInput)}],
          schema: intentClassifierOutputSchema,
          schemaName: "shadow_routing_output",
          outputMode: "prompted_json",
          thinking: "off",
          metadata: {surface: "intent_router_gold", caseId: turn.caseId, turnId: turn.id, repeat: String(repeat)},
        });
        actual = result.output;
        provider = result.provider;
        model = result.model;
        costUsd = result.costUsd;
        latencyMs = result.latencyMs;
      } catch (cause) {
        error = (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)).slice(0, 800);
        latencyMs = Date.now() - startedAt;
      }
      observations.push({
        turnId: turn.id,
        repeat,
        expected: turn.expected,
        actual,
        error,
        checks: scoreIntentGoldTurn(turn, actual),
        routingFingerprint: actual ? intentRoutingFingerprint(actual) : null,
        provider,
        model,
        costUsd,
        latencyMs,
      });
      const status = actual ? (observations.at(-1)!.checks.composition ? "ok" : "mismatch") : "error";
      console.log(`${turn.id} repeat=${repeat} ${status} composition=${actual?.composition ?? "none"} model=${model ?? "none"}`);
    }
  }

  const summary = summarizeIntentRouterGate(observations);
  const spent = gateway.spent();
  const record = {
    ...summary,
    generatedAt: new Date().toISOString(),
    stabilityRepeats,
    stabilityTurnIds: [...stabilityTurnIds],
    budget: {maxCostUsd, plannedCalls},
    gatewaySpent: spent,
    contract: {schemaName: "shadow_routing_output", outputMode: "prompted_json", task: "route_intent"},
    runs: observations,
    calls,
  };
  mkdirSync(outDir, {recursive: true});
  writeFileSync(resolve(outDir, "intent-router-gold.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outDir, "intent-router-gold.md"), renderMarkdown(record), "utf8");
  console.log(`gate=${summary.passed ? "PASS" : "FAIL"} turns=${summary.uniqueTurns} observations=${summary.observations} stability=${percent(summary.stabilityRate)} cost=$${spent.costUsd.toFixed(4)}`);
  console.log(`report=${resolve(outDir, "intent-router-gold.md")}`);
  if (!summary.passed) process.exitCode = 1;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(record: ReturnType<typeof summarizeIntentRouterGate> & {
  generatedAt: string;
  gatewaySpent: ReturnType<ReturnType<typeof createModelGateway>["spent"]>;
    runs: IntentRouterGateObservation[];
}): string {
  const lines = [
    "# Intent Router Gold Gate",
    "",
    `**Verdict:** ${record.passed ? "PASS" : "FAIL"}`,
    `**Generated:** ${record.generatedAt}`,
    `**Coverage:** ${record.uniqueTurns} canonical turns; ${record.observations} observations`,
    `**Stability:** ${record.stableTurns}/${record.repeatedTurns} repeated turns (${percent(record.stabilityRate)})`,
    `**Measured cost:** US$ ${record.gatewaySpent.costUsd.toFixed(4)}; ${record.gatewaySpent.calls} provider attempts; ${record.gatewaySpent.unknownCostCalls} attempts with unknown cost`,
    "",
    "## Promotion metrics",
    "",
    "| Metric | Result | Required | Verdict |",
    "| --- | ---: | ---: | --- |",
    ...record.metrics.map((metric) => `| ${metric.name} | ${metric.passed}/${metric.total} (${percent(metric.rate)}) | ${percent(metric.requiredRate)} | ${metric.gatePassed ? "PASS" : "FAIL"} |`),
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
    "## Invariance failures",
    "",
    record.unstableTurnIds.length === 0 ? "None." : record.unstableTurnIds.map((id) => `- ${id}`).join("\n"),
    "",
    "> Passing this gate is necessary but not sufficient for production routing. It proves the bounded gold set and repeated-prompt invariance; it does not authorize a workflow, executor or customer-facing conclusion.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
