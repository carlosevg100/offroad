import {createHash} from "node:crypto";
import {z} from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().trim().min(1).max(200);
const revision = z.string().regex(/^[1-9][0-9]*$/);
const timestamp = z.iso.datetime({offset: true});
const reference = z.object({id: z.uuid(), fingerprint: hash}).strict();
export const executionEffectSchema = z.enum(["read_only", "propose_state", "compile_artifact"]);
export const executionMethodSchema = z.object({
  platformReleaseId: identifier, houseReleaseId: z.uuid().nullable(),
  methodId: identifier, methodVersion: identifier, manifestHash: hash, baseManifestHash: hash,
  compilerVersion: identifier, compilerHash: hash,
  executor: z.object({key: identifier, version: identifier, sourceClosureHash: hash, inputContractHash: hash, outputContractHash: hash}).strict(),
  formulas: z.array(z.object({id: identifier, version: identifier, sourceHash: hash}).strict()).max(1000),
}).strict();

/** An immutable record of intent and inputs. This object cannot grant live authority. */
export const executionContractSchema = z.object({
  schemaVersion: z.literal("execution-contract.v1"),
  executionId: z.uuid(), organizationId: z.uuid(), workId: z.uuid(), principalId: z.uuid(),
  requestId: z.uuid(), processingRunId: z.uuid(),
  purpose: z.string().trim().min(1).max(8000),
  audience: z.object({kind: z.literal("work_participants"), workId: z.uuid(), policyFingerprint: hash}).strict(),
  method: executionMethodSchema,
  inputs: z.object({
    snapshotId: z.uuid(), fingerprint: hash,
    sources: z.array(z.object({resourceId: z.uuid(), sourceVersionId: z.uuid(), contentHash: hash, rightsRevision: revision}).strict()).max(10000),
    adoptions: z.array(reference).max(10000), hypotheses: z.array(reference).max(10000),
  }).strict(),
  policy: z.object({version: identifier, fingerprint: hash, authorityRevision: revision}).strict(),
  tools: z.array(z.object({id: identifier, version: identifier, effect: executionEffectSchema}).strict()).max(1000),
  allowedEffects: z.array(executionEffectSchema).min(1).max(3),
  budget: z.object({maxCostMicrousd: z.number().int().nonnegative().safe(), maxModelCalls: z.number().int().nonnegative().safe(), expiresAt: timestamp}).strict(),
  requestedAt: timestamp,
}).strict().superRefine((value, context) => {
  const fail = (path: (string | number)[], message: string) => context.addIssue({code: "custom", path, message});
  if (value.audience.workId !== value.workId) fail(["audience", "workId"], "audience must belong to this work");
  if (Date.parse(value.budget.expiresAt) <= Date.parse(value.requestedAt)) fail(["budget", "expiresAt"], "budget must expire after request");
  if (value.method.houseReleaseId === null && value.method.manifestHash !== value.method.baseManifestHash) fail(["method", "manifestHash"], "base release manifest mismatch");
  for (const tool of value.tools) if (!value.allowedEffects.includes(tool.effect)) fail(["tools"], "tool effect is outside contract");
  const distinct: Array<[string[], (string | number)[]]> = [
    [value.tools.map(tool => tool.id), ["tools"]], [value.allowedEffects, ["allowedEffects"]],
    [value.method.formulas.map(formula => formula.id), ["method", "formulas"]],
    [value.inputs.sources.map(source => source.sourceVersionId), ["inputs", "sources"]],
    [value.inputs.adoptions.map(item => item.id), ["inputs", "adoptions"]],
    [value.inputs.hypotheses.map(item => item.id), ["inputs", "hypotheses"]],
  ];
  for (const [ids, path] of distinct) if (new Set(ids).size !== ids.length) fail(path, "duplicate identity");
});
export type ExecutionContract = z.infer<typeof executionContractSchema>;
export type ExecutionMethod = z.infer<typeof executionMethodSchema>;
export type ExecutionEffect = z.infer<typeof executionEffectSchema>;

/** JSON only: undefined, non-finite numbers and class instances cannot form reproducible inputs. */
function parseSnapshot(value: unknown) {
  // Zod's record clone omits __proto__; refuse it before parsing so no input loses bytes.
  const visit = (item: unknown, depth: number): void => {
    if (depth > 128) throw new Error("execution_snapshot_depth_exceeded");
    if (typeof item === "string" && [...item].some(character => character === "\u0000" || (character.codePointAt(0)! >= 0xd800 && character.codePointAt(0)! <= 0xdfff))) throw new Error("execution_snapshot_invalid_unicode");
    if (item === null || typeof item !== "object") return;
    if (Object.hasOwn(item, "__proto__")) throw new Error("execution_snapshot_reserved_key");
    for (const key of Object.keys(item)) visit(key, depth + 1);
    for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(value, 0);
  return z.json().parse(value);
}
/** Versioned independently of historical method fingerprints. UTF-16 key order, no locale. */
export const executionSerializationVersion = "offroad-execution-json-utf16-v1";
export function executionCanonicalText(value: unknown): string {
  const json = parseSnapshot(value);
  const encode = (item: typeof json): string => {
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    if (item !== null && typeof item === "object") return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key]!)}`).join(",")}}`;
    return JSON.stringify(item);
  };
  return encode(json);
}
const fingerprint = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export function loadExecutionCanonicalText(text: string, expectedFingerprint: string, version: string): unknown {
  if (version !== executionSerializationVersion) throw new Error("execution_serialization_version_unavailable");
  if (!hash.safeParse(expectedFingerprint).success || fingerprint(text) !== expectedFingerprint) throw new Error("execution_bytes_mismatch");
  const parsed: unknown = JSON.parse(text);
  if (executionCanonicalText(parsed) !== text) throw new Error("execution_bytes_not_canonical");
  return parsed;
}
export function executionInputFingerprint(value: unknown): string {
  return fingerprint(executionCanonicalText(value));
}
export function executionContractFingerprint(value: unknown): string {
  return fingerprint(executionCanonicalText(executionContractSchema.parse(value)));
}
export type Frozen<T> = T extends readonly (infer U)[] ? readonly Frozen<U>[] : T extends object ? {readonly [K in keyof T]: Frozen<T[K]>} : T;
function freeze<T>(value: T): Frozen<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
export function pinExecutionContract(value: unknown, expectedFingerprint: string): Frozen<ExecutionContract> {
  const contract = executionContractSchema.parse(value);
  if (!hash.safeParse(expectedFingerprint).success || executionContractFingerprint(contract) !== expectedFingerprint) throw new Error("execution_contract_fingerprint_mismatch");
  return freeze(contract);
}

export function pinExecutionInput(value: unknown, expectedFingerprint: string): Frozen<z.infer<ReturnType<typeof z.json>>> {
  const snapshot = parseSnapshot(value);
  if (executionInputFingerprint(snapshot) !== expectedFingerprint) throw new Error("execution_snapshot_mismatch");
  return freeze(snapshot);
}
