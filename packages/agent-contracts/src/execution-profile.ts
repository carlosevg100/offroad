import {z} from "zod";
import {executionContractSchema, executionInputFingerprint, executionMethodSchema} from "./execution-contract";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(200);
const pin = z.object({path: z.string().min(1), hash}).strict();
const ref = z.object({module: id, exportName: id, version: id}).strict();
const component = z.object({
  component: z.object({id, version: id, kind: id, inputs: z.json(), outputs: z.json(), executor: ref.optional()}).passthrough(),
  componentHash: hash,
  executor: ref.extend({sources: z.array(pin).min(1), hash}).strict().nullable(),
}).passthrough();
const compiled = z.object({
  schemaVersion: z.literal("compiled-procedure-manifest.v1"), manifestHash: hash,
  procedure: z.object({id, version: id}).passthrough(),
  compiler: z.object({version: id, hash, sources: z.array(pin).min(1)}).strict(),
  components: z.array(component).min(1),
  budget: z.object({currency: id, maxCostMinorUnits: z.number().int().nonnegative().safe(), maxModelCalls: z.number().int().nonnegative().safe(), maxDurationMs: z.number().int().positive().safe()}).strict(),
  allowedTools: z.array(id), maximumEffect: id, grantsExecution: z.literal(false),
}).passthrough();

/** The approved method hash uses the same JSON representation for valid JSON, but is
 * named separately in the profile. Existing method identities are never recomputed
 * with fingerprintJson (whose locale-based key order has a different contract). */
const methodHash = executionInputFingerprint;
const trustedProfiles = new WeakSet<object>();
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Pure derivation, not publication, current access or permission to execute.
 * `release` must come from the trusted publication registry. SQL must independently
 * resolve it before accepting a request; a hash supplied by a client is not authority.
 * Legacy R01/composed/multi-executor formats need their own reviewed adapters. */
export function deriveExecutionProfile(raw: unknown, release: {id: string; manifestHash: string}) {
  hash.parse(release.manifestHash);
  // Validate raw JSON before Zod can discard reserved keys or normalize anything.
  executionInputFingerprint(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("execution_profile_manifest_invalid");
  const {manifestHash, ...payload} = raw as Record<string, unknown>;
  if (manifestHash !== release.manifestHash || methodHash(payload) !== release.manifestHash) throw new Error("execution_profile_manifest_mismatch");
  const manifest = compiled.parse(raw);
  if (release.id !== `${manifest.procedure.id}-${manifest.procedure.version}`) throw new Error("execution_profile_release_mismatch");
  if (methodHash(manifest.compiler.sources) !== manifest.compiler.hash) throw new Error("execution_profile_compiler_mismatch");
  const seen = new Set<string>();
  for (const entry of manifest.components) {
    if (seen.has(entry.component.id)) throw new Error("execution_profile_component_duplicate");
    seen.add(entry.component.id);
    if (methodHash(entry.component) !== entry.componentHash) throw new Error("execution_profile_component_mismatch");
    if (entry.component.executor && !entry.executor) throw new Error("execution_profile_executor_missing");
    if (entry.executor) {
      const {sources, hash: executorHash, ...executorRef} = entry.executor;
      if (methodHash(executorRef) !== methodHash(entry.component.executor)) throw new Error("execution_profile_executor_mismatch");
      const paths = sources.map(source => source.path);
      if (new Set(paths).size !== paths.length || paths.some(path => path.startsWith("/") || path.includes("\\") || path.split("/").includes(".."))) throw new Error("execution_profile_source_invalid");
      if (methodHash({ref: executorRef, sources, inputContractHash: methodHash(entry.component.inputs), outputContractHash: methodHash(entry.component.outputs)}) !== executorHash) throw new Error("execution_profile_executor_mismatch");
    }
  }
  const executors = manifest.components.filter(entry => entry.executor !== null);
  if (executors.length !== 1) throw new Error("execution_profile_executor_ambiguous");
  // No implicit currency conversion, tool-version assignment or effect escalation.
  // This adapter realizes the published deterministic capital procedure only.
  if (manifest.budget.maxCostMinorUnits !== 0 || manifest.budget.maxModelCalls !== 0
    || manifest.allowedTools.length || manifest.maximumEffect !== "none") throw new Error("execution_profile_policy_requires_adapter");
  const selected = executors[0]!;
  const executor = selected.executor!;
  const formulas = manifest.components.filter(entry => entry.component.kind === "formula").map(entry => {
    if (!entry.executor) throw new Error("execution_profile_formula_unbound");
    return {id: entry.component.id, version: entry.component.version, sourceHash: methodHash(entry.executor.sources)};
  });
  const method = executionMethodSchema.parse({
    platformReleaseId: release.id, houseReleaseId: null,
    methodId: manifest.procedure.id, methodVersion: manifest.procedure.version,
    manifestHash: release.manifestHash, baseManifestHash: release.manifestHash,
    compilerVersion: manifest.compiler.version, compilerHash: manifest.compiler.hash,
    executor: {key: `${executor.module}#${executor.exportName}`, version: executor.version,
      sourceClosureHash: methodHash(executor.sources), inputContractHash: methodHash(selected.component.inputs), outputContractHash: methodHash(selected.component.outputs)},
    formulas,
  });
  const profile = {
    schemaVersion: "execution-profile.v1" as const,
    adapter: "compiled-single-deterministic.v1" as const,
    manifestHashAlgorithm: "method-stable-json-utf16-sha256-v1" as const,
    contractHashAlgorithm: "method-stable-json-utf16-sha256-v1" as const,
    selectedComponentId: selected.component.id, method,
    formulaCoverage: formulas.length ? "declared_components" as const : "executor_source_closure" as const,
    tools: [] as never[],
    // none means no domain mutation/effect. Retaining the calculation result is
    // control-plane bookkeeping, not permission to compile or publish an artifact.
    allowedEffects: ["read_only"] as const,
    limits: {maxCostMicrousd: 0 as const, maxModelCalls: 0 as const, maxDurationMs: manifest.budget.maxDurationMs},
    originalBudget: {...manifest.budget}, grantsExecution: false as const,
  };
  const result = freeze({...profile, fingerprint: executionInputFingerprint(profile)});
  trustedProfiles.add(result);
  return result;
}
/** R01's historical publication has no numeric budget or typed component contracts.
 * These are adapter descriptors and an explicit runtime containment policy, not
 * retroactive additions to that publication. The SQL adapter must enforce the same
 * cumulative limits before this profile can be activated in the queue. */
const r01Source = z.object({
  schemaVersion: z.literal("r01-execution-adapter-source.v1"),
  platformReleaseId: z.literal("r01-2026.09.06-v1"), artifactHash: hash,
  manifest: z.object({
    schemaVersion: z.literal("legacy-procedure-adapter.v1"), manifestHash: hash,
    procedure: z.object({id, version: id}).passthrough(),
    compiler: z.object({version: id, sources: z.array(pin).min(1), hash}).strict(),
    executor: z.object({module: id, exportName: id, sourceClosureHash: hash}).strict(),
    grantsExecution: z.literal(false),
  }).passthrough(),
  capability: z.object({
    taskId: z.literal("R01"), executorKey: id, executorVersion: id,
    procedure: z.object({id, version: id}).strict(),
    allowedProviderIds: z.array(z.string()).length(0), allowedToolIds: z.array(z.string()).length(0),
    providerRequired: z.literal(false), maximumEffect: z.literal("none"),
  }).passthrough(),
  executorSources: z.array(pin).min(1),
}).strict();

export function deriveReceivablesExecutionProfile(raw: unknown, release: {id: string; manifestHash: string; artifactHash: string}) {
  // An arbitrary caller cannot replace the source and bless it with a new hash.
  if (executionInputFingerprint(raw) !== "9e71b791b0f5a9c586c2865e6c3d61b8490d56d34918b1f8c1ea0fe9a8054c3a") throw new Error("execution_r01_source_mismatch");
  const source = r01Source.parse(raw), manifest = source.manifest;
  const {manifestHash, ...manifestPayload} = manifest;
  if (release.id !== source.platformReleaseId || release.manifestHash !== manifestHash || release.artifactHash !== source.artifactHash
    || methodHash(manifestPayload) !== manifestHash) throw new Error("execution_r01_release_mismatch");
  if (methodHash(manifest.compiler.sources) !== manifest.compiler.hash || methodHash(source.executorSources) !== manifest.executor.sourceClosureHash) throw new Error("execution_r01_closure_mismatch");
  if (source.capability.executorKey !== `${manifest.executor.module}#${manifest.executor.exportName}`
    || source.capability.executorVersion !== manifest.procedure.version
    || source.capability.procedure.id !== manifest.procedure.id || source.capability.procedure.version !== manifest.procedure.version) throw new Error("execution_r01_capability_mismatch");
  const descriptor = (exportName: string) => ({schemaVersion: "published-artifact-schema-export.v1" as const, artifactHash: source.artifactHash, exportName});
  const descriptors = {input: descriptor("receivablesPoolUnderwritingInputSchema"), output: descriptor("receivablesPoolUnderwritingSchema")};
  const containment = {version: "r01-runtime-containment.2026-09-22.v1" as const, maxCostMicrousd: 0 as const, maxModelCalls: 0 as const, maxDurationMs: 31000};
  const method = executionMethodSchema.parse({
    platformReleaseId: source.platformReleaseId, houseReleaseId: null,
    methodId: manifest.procedure.id, methodVersion: manifest.procedure.version,
    manifestHash, baseManifestHash: manifestHash,
    compilerVersion: manifest.compiler.version, compilerHash: manifest.compiler.hash,
    executor: {key: source.capability.executorKey, version: source.capability.executorVersion,
      sourceClosureHash: manifest.executor.sourceClosureHash, inputContractHash: methodHash(descriptors.input), outputContractHash: methodHash(descriptors.output)},
    formulas: [],
  });
  const profile = {
    schemaVersion: "execution-profile.v1" as const, adapter: "legacy-r01-artifact.v1" as const,
    manifestHashAlgorithm: "method-stable-json-utf16-sha256-v1" as const,
    contractHashAlgorithm: "published-artifact-schema-export-sha256-v1" as const,
    selectedComponentId: "legacy:R01", method, descriptors,
    formulaCoverage: "executor_source_closure" as const, tools: [] as never[], allowedEffects: ["read_only"] as const,
    limits: {maxCostMicrousd: containment.maxCostMicrousd, maxModelCalls: containment.maxModelCalls, maxDurationMs: containment.maxDurationMs},
    originalBudget: null, containment, sourceFingerprint: executionInputFingerprint(raw), grantsExecution: false as const,
  };
  const result = freeze({...profile, fingerprint: executionInputFingerprint(profile)});
  trustedProfiles.add(result);
  return result;
}
export type ExecutionProfile = ReturnType<typeof deriveExecutionProfile> | ReturnType<typeof deriveReceivablesExecutionProfile>;

/** Local consistency boundary only. A serialized/caller-built profile is not accepted;
 * reconstruct from the trusted pinned manifest. Live release/rights remain SQL gates. */
export function assertContractMatchesExecutionProfile(value: unknown, profile: ExecutionProfile): void {
  if (!trustedProfiles.has(profile)) throw new Error("execution_profile_derivation_required");
  const contract = executionContractSchema.parse(value);
  if (executionInputFingerprint(contract.method) !== executionInputFingerprint(profile.method)) throw new Error("execution_profile_method_mismatch");
  if (contract.tools.length || executionInputFingerprint(contract.allowedEffects) !== executionInputFingerprint(profile.allowedEffects)) throw new Error("execution_profile_effect_denied");
  if (contract.budget.maxCostMicrousd > profile.limits.maxCostMicrousd || contract.budget.maxModelCalls > profile.limits.maxModelCalls
    || contract.budget.maxDurationMs > profile.limits.maxDurationMs) throw new Error("execution_profile_budget_exceeded");
}
