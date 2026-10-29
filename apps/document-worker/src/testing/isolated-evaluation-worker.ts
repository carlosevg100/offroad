import {setTimeout as delay} from "node:timers/promises";
import {governedEvaluationContractSchema, loadExecutionCanonicalText, executionSerializationVersion} from "@offroad/agent-contracts";
import {createAnthropicAdapter} from "@offroad/model-gateway";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {createEvaluationQueue, EvaluationTransportError, type EvaluationQueue} from "../evaluation-queue";
import {modelCallLogDetail} from "../model-call-log";
import {processGovernedEvaluation} from "../process-governed-evaluation";
import {providerConnectionsSchema} from "../provider-processing";

const stageUrl = "https://gjkkjtbfnssdsbmlhmwk.supabase.co";
const configSchema = z.object({
  SUPABASE_URL: z.literal(stageUrl), SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  OFFROAD_WORKER_EMAIL: z.email(), OFFROAD_WORKER_PASSWORD: z.string().min(16),
  OFFROAD_WORKER_TOKEN: z.string().min(32), OFFROAD_EVALUATION_ORGANIZATION_ID: z.uuid(),
  ANTHROPIC_API_KEY: z.string().min(20), PROVIDER_CONNECTIONS_JSON: z.string(),
});

/** Technical evaluation helper, never imported by the product dispatcher. Production is refused
 * before sign-in; only the dedicated namespace and the two document measurements may be consumed. */
export function readIsolatedEvaluationConfig(env: NodeJS.ProcessEnv) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error("isolated_evaluation_configuration_required");
  let connections: z.infer<typeof providerConnectionsSchema>;
  try {connections = providerConnectionsSchema.parse(JSON.parse(parsed.data.PROVIDER_CONNECTIONS_JSON));}
  catch {throw new Error("isolated_evaluation_connections_required");}
  if (!connections.anthropic || Object.keys(connections).length !== 1) throw new Error("isolated_evaluation_connections_required");
  return {...parsed.data, connections};
}

export async function runIsolatedEvaluationWorker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = readIsolatedEvaluationConfig(env);
  const log = (record: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(record)}\n`);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {auth: {persistSession: false, autoRefreshToken: true}});
  const {error} = await client.auth.signInWithPassword({email: config.OFFROAD_WORKER_EMAIL, password: config.OFFROAD_WORKER_PASSWORD});
  if (error) throw new Error("isolated_worker_sign_in_failed");
  const base = createEvaluationQueue(client, config.OFFROAD_WORKER_TOKEN);
  async function trace<T>(method: string, call: () => Promise<T>): Promise<T> {
    try {return await call();}
    catch (error) {log({event: "evaluation.transport", method, code: error instanceof EvaluationTransportError ? error.code : "transport_failed"}); throw error;}
  }
  const queue: EvaluationQueue = {
    claim: () => trace("claim", () => base.claim()), renew: (claim) => trace("renew", () => base.renew(claim)),
    reserve: (claim, operation) => trace("reserve", () => base.reserve(claim, operation)),
    settle: (claim, id, settlement) => trace("settle", () => base.settle(claim, id, settlement)),
    commit: (claim, hash, text, outcome, reason) => trace("commit", () => base.commit(claim, hash, text, outcome, reason)),
  };
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  const deadline = setTimeout(stop, 180 * 60_000);
  const hardStop = setTimeout(() => process.exit(2), 185 * 60_000);
  deadline.unref(); hardStop.unref();
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  log({ready: true, pid: process.pid, scope: "staging_governed_document_evaluations_only"});
  try {
    while (!shutdown.signal.aborted) {
      const claim = await queue.claim();
      if (!claim) {await delay(2000); continue;}
      const contract = governedEvaluationContractSchema.parse(loadExecutionCanonicalText(claim.contractText, claim.contractFingerprint, executionSerializationVersion));
      if (contract.organizationId !== config.OFFROAD_EVALUATION_ORGANIZATION_ID
        || !["measure-classification", "measure-extraction"].includes(contract.audience.scriptId)) throw new Error("isolated_evaluation_scope_denied");
      log({claimed: claim.executionId});
      const result = await processGovernedEvaluation(claim, queue, shutdown.signal, {
        adapters: {anthropic: createAnthropicAdapter({apiKey: config.ANTHROPIC_API_KEY})}, connections: config.connections,
        onCall: (call) => log({event: "model.call", ...modelCallLogDetail(claim.jobId, call)}),
      });
      log({finished: claim.executionId, result});
    }
  } finally {
    clearTimeout(deadline); clearTimeout(hardStop); process.off("SIGTERM", stop); process.off("SIGINT", stop);
    await client.auth.signOut({scope: "local"}); client.auth.stopAutoRefresh();
  }
}
