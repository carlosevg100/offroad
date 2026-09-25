import {createHash} from "node:crypto";

import {z} from "zod";

/**
 * Stage 18 continuation contract.
 *
 * A pure, deterministic statement of what the SQL commands, the worker and the web must agree on
 * when an input of a finished execution changes: which executions are affected and why, which ones
 * are reused by hash, which recomputations run on their own and which wait for a person to
 * authorize spend, what becomes stale and what stays immutable, how change events are deduplicated
 * and ordered, and how a follow-up in the conversation resolves to an explicit approved base.
 * Nothing here reads a database, calls a model or schedules a job.
 *
 * Supersession is not revocation. Rights and access stay with `execution_inputs_current_v1`
 * (stage 17); this contract only answers whether a newer version of an input exists.
 */

const identifierSchema = z.string().min(1).max(200);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ordinalSchema = z.number().int().positive();

// Named errors ------------------------------------------------------------------------------------

export const continuationContractErrorCodes = [
  "duplicate_execution",
  "execution_work_mismatch",
  "execution_lineage_invalid",
  "multiple_method_pins",
  "source_version_identity_conflict",
  "assumption_version_identity_conflict",
  "source_derivation_cycle",
  "duplicate_head",
  "assumption_set_head_conflict",
  "candidate_work_mismatch",
  "candidate_conflict",
  "impact_integrity_mismatch",
  "request_work_mismatch",
  "request_integrity_mismatch",
  "event_conflict",
  "event_version_conflict",
  "milestone_work_mismatch",
  "duplicate_milestone",
  "milestone_reference_invalid",
  "wait_resolution_invalid",
] as const;
export type ContinuationContractErrorCode = (typeof continuationContractErrorCodes)[number];

/** Every refusal of this contract is an `Error` named `ContinuationContractError` with a stable code. */
export type ContinuationContractError = Error & Readonly<{name: "ContinuationContractError"; code: ContinuationContractErrorCode}>;

const knownErrorCodes: ReadonlySet<string> = new Set(continuationContractErrorCodes);

function contractError(code: ContinuationContractErrorCode, detail: string): ContinuationContractError {
  return Object.assign(new Error(`${code}: ${detail}`), {name: "ContinuationContractError" as const, code});
}

export function isContinuationContractError(value: unknown, code?: ContinuationContractErrorCode): value is ContinuationContractError {
  if (!(value instanceof Error) || value.name !== "ContinuationContractError") return false;
  const actual = (value as {code?: unknown}).code;
  return typeof actual === "string" && knownErrorCodes.has(actual) && (code === undefined || actual === code);
}

// Pinned edges, derivations and heads ------------------------------------------------------------

export const executionDependencyKindSchema = z.enum(["source_version", "assumption_slot", "method_release"]);
export type ExecutionDependencyKind = z.infer<typeof executionDependencyKindSchema>;

/** Spend ceiling of an execution profile. Zero on both axes means a deterministic run. */
export const continuationBudgetSchema = z.object({
  maxCostMicrousd: z.number().int().nonnegative(),
  maxModelCalls: z.number().int().nonnegative(),
}).strict();
export type ContinuationBudget = z.infer<typeof continuationBudgetSchema>;

/** One immutable version of a logical source (`public.source_versions`). */
export const sourceVersionRefSchema = z.object({
  sourceId: identifierSchema,
  versionNo: ordinalSchema,
  versionId: identifierSchema,
}).strict();
export type SourceVersionRef = z.infer<typeof sourceVersionRefSchema>;

const sourceVersionDependencySchema = z.object({
  kind: z.literal("source_version"),
  sourceId: identifierSchema,
  versionNo: ordinalSchema,
  versionId: identifierSchema,
}).strict();

const assumptionSlotDependencySchema = z.object({
  kind: z.literal("assumption_slot"),
  setId: identifierSchema,
  slotKey: sha256Schema,
  revision: ordinalSchema,
  versionId: identifierSchema,
  decisionId: identifierSchema,
  contentFingerprint: sha256Schema,
}).strict();

const methodReleaseDependencySchema = z.object({
  kind: z.literal("method_release"),
  procedureId: identifierSchema,
  platformReleaseId: identifierSchema,
  houseReleaseId: identifierSchema.nullable(),
}).strict();

/**
 * A pinned input of an execution. Logical keys: the source id; the assumption set id plus the slot
 * key; the procedure id. Everything else is the pinned version of that key.
 */
export const executionDependencySchema = z.discriminatedUnion("kind", [
  sourceVersionDependencySchema,
  assumptionSlotDependencySchema,
  methodReleaseDependencySchema,
]);
export type ExecutionDependency = z.infer<typeof executionDependencySchema>;

/** Derived source version to the parent version it was derived from (`private.resource_dependencies`). */
export const sourceDerivationEdgeSchema = z.object({
  derived: sourceVersionRefSchema,
  parent: sourceVersionRefSchema,
}).strict();
export type SourceDerivationEdge = z.infer<typeof sourceDerivationEdgeSchema>;

const assumptionSlotHeadSchema = z.object({
  kind: z.literal("assumption_slot"),
  setId: identifierSchema,
  slotKey: sha256Schema,
  revision: ordinalSchema,
  versionId: identifierSchema,
  /** The slot's decision in the head revision; null when the head revision no longer holds the slot. */
  decisionId: identifierSchema.nullable(),
}).strict();

const methodReleaseHeadSchema = z.object({
  kind: z.literal("method_release"),
  procedureId: identifierSchema,
  platformReleaseId: identifierSchema,
  houseReleaseId: identifierSchema.nullable(),
  /** Budget of the profile a recomputation under this release runs with. */
  profileBudget: continuationBudgetSchema,
}).strict();

/**
 * The newest version of a logical key: the source's newest version; the assumption set's head
 * revision with the slot's current decision; the procedure's newest published release.
 */
export const dependencyHeadSchema = z.discriminatedUnion("kind", [
  sourceVersionDependencySchema,
  assumptionSlotHeadSchema,
  methodReleaseHeadSchema,
]);
export type DependencyHead = z.infer<typeof dependencyHeadSchema>;

/**
 * An execution with its recorded edges. `baseExecutionId` is set only on a dependency-update
 * recomputation and always names the root execution of its lineage, never another recomputation.
 */
export const continuationExecutionSchema = z.object({
  executionId: identifierSchema,
  workId: identifierSchema,
  baseExecutionId: identifierSchema.nullable(),
  profileBudget: continuationBudgetSchema,
  dependencies: z.array(executionDependencySchema),
}).strict();
export type ContinuationExecution = z.infer<typeof continuationExecutionSchema>;

/** Everything the impact of one work is computed from, as read at processing time. */
export const continuationGraphSchema = z.object({
  workId: identifierSchema,
  executions: z.array(continuationExecutionSchema),
  derivations: z.array(sourceDerivationEdgeSchema),
  heads: z.array(dependencyHeadSchema),
}).strict();
export type ContinuationGraph = z.infer<typeof continuationGraphSchema>;

type SourceVersionDependency = z.infer<typeof sourceVersionDependencySchema>;
type AssumptionSlotDependency = z.infer<typeof assumptionSlotDependencySchema>;
type AssumptionSlotHead = z.infer<typeof assumptionSlotHeadSchema>;
type MethodReleaseHead = z.infer<typeof methodReleaseHeadSchema>;

// Logical keys -----------------------------------------------------------------------------------

export type DependencyLogicalKey =
  | Readonly<{kind: "source_version"; sourceId: string}>
  | Readonly<{kind: "assumption_slot"; setId: string; slotKey: string}>
  | Readonly<{kind: "method_release"; procedureId: string}>;

export function dependencyLogicalKey(value: ExecutionDependency | DependencyHead): DependencyLogicalKey {
  switch (value.kind) {
    case "source_version": return {kind: "source_version", sourceId: value.sourceId};
    case "assumption_slot": return {kind: "assumption_slot", setId: value.setId, slotKey: value.slotKey};
    case "method_release": return {kind: "method_release", procedureId: value.procedureId};
  }
}

/** Canonical, collision-free text of a logical key; stable across processes and usable as a column. */
export function dependencyLogicalKeyId(key: DependencyLogicalKey): string {
  switch (key.kind) {
    case "source_version": return JSON.stringify([key.kind, key.sourceId]);
    case "assumption_slot": return JSON.stringify([key.kind, key.setId, key.slotKey]);
    case "method_release": return JSON.stringify([key.kind, key.procedureId]);
  }
}

// Impact -----------------------------------------------------------------------------------------

/** Why an execution is affected. Each reason names the kind, the logical key, the pin and the head. */
export type DependencyImpactReason =
  | Readonly<{
    kind: "source_version";
    reasonClass: "data_change";
    key: Readonly<{kind: "source_version"; sourceId: string}>;
    pinned: SourceVersionRef;
    current: SourceVersionRef;
    /** Directly pinned derived versions that carry the moved ancestor; empty when the pin itself moved. */
    viaDerivedVersionIds: readonly string[];
  }>
  | Readonly<{
    kind: "assumption_slot";
    reasonClass: "data_change";
    key: Readonly<{kind: "assumption_slot"; setId: string; slotKey: string}>;
    pinned: Readonly<{revision: number; versionId: string; decisionId: string; contentFingerprint: string}>;
    current: Readonly<{revision: number; versionId: string; decisionId: string | null}>;
  }>
  | Readonly<{
    kind: "method_release";
    reasonClass: "method_update";
    key: Readonly<{kind: "method_release"; procedureId: string}>;
    pinned: Readonly<{platformReleaseId: string; houseReleaseId: string | null}>;
    current: Readonly<{platformReleaseId: string; houseReleaseId: string | null}>;
  }>;

/** Why reuse cannot be decided: the recorded graph does not reach a known, consistent head. */
export type DependencyGraphGap =
  | Readonly<{code: "no_recorded_edges"}>
  | Readonly<{code: "head_unknown"; key: DependencyLogicalKey; viaDerivedVersionIds: readonly string[]}>
  | Readonly<{code: "head_behind_pin"; key: DependencyLogicalKey; pinnedVersionId: string; currentVersionId: string}>;

export type ExecutionImpactStatus = "affected" | "unaffected" | "graph_incomplete";

export type ExecutionImpact = Readonly<{
  executionId: string;
  status: ExecutionImpactStatus;
  reasons: readonly DependencyImpactReason[];
  gaps: readonly DependencyGraphGap[];
  /** Identity of the newest version of each logical input the execution relied on. */
  pinnedInputFingerprint: string;
  /** The same identity under the current heads; null when the graph is incomplete. */
  currentInputFingerprint: string | null;
}>;

export type DependencyImpact = Readonly<{
  schemaVersion: "dependency-impact.v1";
  workId: string;
  executions: readonly ExecutionImpact[];
  /** Affected executions, including every incomplete one: its whole output is treated as affected. */
  affectedExecutionIds: readonly string[];
  unaffectedExecutionIds: readonly string[];
  incompleteExecutionIds: readonly string[];
  fingerprint: string;
}>;

/** `spendCeiling`: the pinned profile's ceiling, or after a method update the larger of it and the head profile's. */
type Assessment = ExecutionImpact & Readonly<{spendCeiling: ContinuationBudget}>;
type IdentityEntry = readonly [string, unknown];

type GraphIndex = Readonly<{
  executions: ReadonlyMap<string, ContinuationExecution>;
  versions: ReadonlyMap<string, SourceVersionRef>;
  parents: ReadonlyMap<string, ReadonlySet<string>>;
  ancestors: Map<string, ReadonlySet<string>>;
  sourceHeads: ReadonlyMap<string, SourceVersionDependency>;
  slotHeads: ReadonlyMap<string, AssumptionSlotHead>;
  methodHeads: ReadonlyMap<string, MethodReleaseHead>;
}>;

/**
 * Compares each execution's pinned edges with the current heads. A logical key is superseded only
 * by a version newer than every version of that key the execution relied on, directly or through
 * the derivation closure; an assumption slot is superseded only when its decision changed, so an
 * execution that used unchanged slots of a revised set is unaffected. A method change is its own
 * reason class. An execution without edges, or with a key whose head is unknown or behind the pin,
 * is `graph_incomplete`: treated as affected and never reported as reusable.
 */
export function computeDependencyImpact(graph: ContinuationGraph): DependencyImpact {
  return assessGraph(continuationGraphSchema.parse(graph)).impact;
}

function assessGraph(graph: ContinuationGraph): {index: GraphIndex; assessments: readonly Assessment[]; impact: DependencyImpact} {
  const index = indexGraph(graph);
  const assessments = [...graph.executions]
    .sort((left, right) => compareText(left.executionId, right.executionId))
    .map((execution) => assessExecution(execution, index));
  const executions: ExecutionImpact[] = assessments.map((assessment) => ({
    executionId: assessment.executionId,
    status: assessment.status,
    reasons: assessment.reasons,
    gaps: assessment.gaps,
    pinnedInputFingerprint: assessment.pinnedInputFingerprint,
    currentInputFingerprint: assessment.currentInputFingerprint,
  }));
  return {index, assessments, impact: impactFromExecutions(graph.workId, executions)};
}

function impactFromExecutions(workId: string, executions: readonly ExecutionImpact[]): DependencyImpact {
  const body = {schemaVersion: "dependency-impact.v1" as const, workId, executions};
  const idsWith = (predicate: (status: ExecutionImpactStatus) => boolean) =>
    executions.filter((execution) => predicate(execution.status)).map((execution) => execution.executionId);
  return {
    ...body,
    affectedExecutionIds: idsWith((status) => status !== "unaffected"),
    unaffectedExecutionIds: idsWith((status) => status === "unaffected"),
    incompleteExecutionIds: idsWith((status) => status === "graph_incomplete"),
    fingerprint: fingerprintOf(body),
  };
}

function assessExecution(execution: ContinuationExecution, index: GraphIndex): Assessment {
  const reasons: DependencyImpactReason[] = [];
  const gaps: DependencyGraphGap[] = [];
  const pinned: IdentityEntry[] = [];
  const current: IdentityEntry[] = [];
  let spendCeiling: ContinuationBudget = execution.profileBudget;
  if (execution.dependencies.length === 0) gaps.push({code: "no_recorded_edges"});

  for (const {ref, via} of effectiveSources(execution, index)) {
    const key = {kind: "source_version" as const, sourceId: ref.sourceId};
    const keyId = dependencyLogicalKeyId(key);
    pinned.push([keyId, {versionNo: ref.versionNo, versionId: ref.versionId}]);
    const head = index.sourceHeads.get(ref.sourceId);
    if (!head) {
      gaps.push({code: "head_unknown", key, viaDerivedVersionIds: via});
      continue;
    }
    if (head.versionNo < ref.versionNo) {
      gaps.push({code: "head_behind_pin", key, pinnedVersionId: ref.versionId, currentVersionId: head.versionId});
      continue;
    }
    current.push([keyId, {versionNo: head.versionNo, versionId: head.versionId}]);
    if (head.versionNo > ref.versionNo) {
      reasons.push({
        kind: "source_version",
        reasonClass: "data_change",
        key,
        pinned: ref,
        current: {sourceId: head.sourceId, versionNo: head.versionNo, versionId: head.versionId},
        viaDerivedVersionIds: via,
      });
    }
  }

  for (const pin of effectiveSlots(execution)) {
    const key = {kind: "assumption_slot" as const, setId: pin.setId, slotKey: pin.slotKey};
    const keyId = dependencyLogicalKeyId(key);
    pinned.push([keyId, {decisionId: pin.decisionId}]);
    const head = index.slotHeads.get(keyId);
    if (!head) {
      gaps.push({code: "head_unknown", key, viaDerivedVersionIds: []});
      continue;
    }
    if (head.revision < pin.revision) {
      gaps.push({code: "head_behind_pin", key, pinnedVersionId: pin.versionId, currentVersionId: head.versionId});
      continue;
    }
    current.push([keyId, {decisionId: head.decisionId}]);
    if (head.decisionId !== pin.decisionId) {
      reasons.push({
        kind: "assumption_slot",
        reasonClass: "data_change",
        key,
        pinned: {revision: pin.revision, versionId: pin.versionId, decisionId: pin.decisionId, contentFingerprint: pin.contentFingerprint},
        current: {revision: head.revision, versionId: head.versionId, decisionId: head.decisionId},
      });
    }
  }

  for (const pin of execution.dependencies) {
    if (pin.kind !== "method_release") continue;
    const key = {kind: "method_release" as const, procedureId: pin.procedureId};
    const keyId = dependencyLogicalKeyId(key);
    const release = {platformReleaseId: pin.platformReleaseId, houseReleaseId: pin.houseReleaseId};
    pinned.push([keyId, release]);
    const head = index.methodHeads.get(pin.procedureId);
    if (!head) {
      gaps.push({code: "head_unknown", key, viaDerivedVersionIds: []});
      continue;
    }
    const headRelease = {platformReleaseId: head.platformReleaseId, houseReleaseId: head.houseReleaseId};
    current.push([keyId, headRelease]);
    if (headRelease.platformReleaseId !== release.platformReleaseId || headRelease.houseReleaseId !== release.houseReleaseId) {
      reasons.push({kind: "method_release", reasonClass: "method_update", key, pinned: release, current: headRelease});
      // The recomputation runs under the head release, whose profile can spend too: the larger ceiling decides.
      spendCeiling = maxBudget(execution.profileBudget, head.profileBudget);
    }
  }

  const status: ExecutionImpactStatus = gaps.length > 0 ? "graph_incomplete" : reasons.length > 0 ? "affected" : "unaffected";
  return {
    executionId: execution.executionId,
    status,
    reasons,
    gaps,
    pinnedInputFingerprint: inputFingerprint(pinned),
    currentInputFingerprint: gaps.length > 0 ? null : inputFingerprint(current),
    spendCeiling,
  };
}

/** For each source key reached by the execution, the newest version it relied on and the derived pins that carry it. */
function effectiveSources(execution: ContinuationExecution, index: GraphIndex): readonly {ref: SourceVersionRef; via: readonly string[]}[] {
  const pins = execution.dependencies.filter((dependency): dependency is SourceVersionDependency => dependency.kind === "source_version");
  const direct = new Set(pins.map((pin) => pin.versionId));
  const carriers = new Map<string, Set<string>>();
  for (const pin of pins) {
    for (const versionId of [pin.versionId, ...ancestorsOf(pin.versionId, index)]) {
      const set = carriers.get(versionId) ?? new Set<string>();
      set.add(pin.versionId);
      carriers.set(versionId, set);
    }
  }
  const newest = new Map<string, SourceVersionRef>();
  for (const versionId of carriers.keys()) {
    const ref = index.versions.get(versionId);
    if (!ref) throw contractError("source_version_identity_conflict", `${versionId} has no recorded identity`);
    const known = newest.get(ref.sourceId);
    if (!known || ref.versionNo > known.versionNo) newest.set(ref.sourceId, ref);
  }
  return [...newest.values()]
    .sort((left, right) => compareText(left.sourceId, right.sourceId))
    .map((ref) => ({
      ref,
      via: direct.has(ref.versionId) ? [] : [...(carriers.get(ref.versionId) ?? [])].sort(compareText),
    }));
}

/** For each assumption slot, the pin of the highest revision the execution relied on. */
function effectiveSlots(execution: ContinuationExecution): readonly AssumptionSlotDependency[] {
  const newest = new Map<string, AssumptionSlotDependency>();
  for (const pin of execution.dependencies) {
    if (pin.kind !== "assumption_slot") continue;
    const keyId = dependencyLogicalKeyId(dependencyLogicalKey(pin));
    const known = newest.get(keyId);
    if (!known || pin.revision > known.revision) newest.set(keyId, pin);
  }
  return [...newest.entries()].sort(([left], [right]) => compareText(left, right)).map(([, pin]) => pin);
}

function ancestorsOf(versionId: string, index: GraphIndex): ReadonlySet<string> {
  const cached = index.ancestors.get(versionId);
  if (cached) return cached;
  const result = new Set<string>();
  for (const parent of index.parents.get(versionId) ?? []) {
    result.add(parent);
    for (const ancestor of ancestorsOf(parent, index)) result.add(ancestor);
  }
  index.ancestors.set(versionId, result);
  return result;
}

function inputFingerprint(entries: readonly IdentityEntry[]): string {
  const inputs = [...entries].sort(([left], [right]) => compareText(left, right));
  return fingerprintOf({schemaVersion: "continuation-input-identity.v1", inputs});
}

function indexGraph(graph: ContinuationGraph): GraphIndex {
  const executions = indexExecutions(graph);
  const identities = createIdentityRegistry();
  for (const execution of graph.executions) {
    for (const dependency of execution.dependencies) {
      if (dependency.kind === "source_version") identities.source(dependency);
      if (dependency.kind === "assumption_slot") identities.slot(dependency, dependency.contentFingerprint);
    }
  }

  const parents = new Map<string, Set<string>>();
  for (const edge of graph.derivations) {
    identities.source(edge.derived);
    identities.source(edge.parent);
    if (edge.derived.versionId === edge.parent.versionId) {
      throw contractError("source_derivation_cycle", `${edge.derived.versionId} derives from itself`);
    }
    const set = parents.get(edge.derived.versionId) ?? new Set<string>();
    set.add(edge.parent.versionId);
    parents.set(edge.derived.versionId, set);
  }
  assertAcyclicDerivations(parents);

  const sourceHeads = new Map<string, SourceVersionDependency>();
  const slotHeads = new Map<string, AssumptionSlotHead>();
  const methodHeads = new Map<string, MethodReleaseHead>();
  const setHeads = new Map<string, {revision: number; versionId: string}>();
  for (const head of graph.heads) {
    switch (head.kind) {
      case "source_version": {
        identities.source(head);
        if (sourceHeads.has(head.sourceId)) throw contractError("duplicate_head", `source ${head.sourceId}`);
        sourceHeads.set(head.sourceId, head);
        break;
      }
      case "assumption_slot": {
        identities.slot(head, null);
        const keyId = dependencyLogicalKeyId(dependencyLogicalKey(head));
        if (slotHeads.has(keyId)) throw contractError("duplicate_head", `assumption slot ${keyId}`);
        const setHead = setHeads.get(head.setId);
        if (setHead && (setHead.revision !== head.revision || setHead.versionId !== head.versionId)) {
          throw contractError("assumption_set_head_conflict", `set ${head.setId} has heads at revisions ${setHead.revision} and ${head.revision}`);
        }
        setHeads.set(head.setId, {revision: head.revision, versionId: head.versionId});
        slotHeads.set(keyId, head);
        break;
      }
      case "method_release": {
        if (methodHeads.has(head.procedureId)) throw contractError("duplicate_head", `procedure ${head.procedureId}`);
        methodHeads.set(head.procedureId, head);
        break;
      }
    }
  }
  return {executions, versions: identities.versions, parents, ancestors: new Map(), sourceHeads, slotHeads, methodHeads};
}

function indexExecutions(graph: ContinuationGraph): ReadonlyMap<string, ContinuationExecution> {
  const byId = new Map<string, ContinuationExecution>();
  for (const execution of graph.executions) {
    if (execution.workId !== graph.workId) {
      throw contractError("execution_work_mismatch", `${execution.executionId} belongs to ${execution.workId}, not ${graph.workId}`);
    }
    if (byId.has(execution.executionId)) throw contractError("duplicate_execution", execution.executionId);
    if (execution.dependencies.filter((dependency) => dependency.kind === "method_release").length > 1) {
      throw contractError("multiple_method_pins", execution.executionId);
    }
    byId.set(execution.executionId, execution);
  }
  for (const execution of graph.executions) {
    const base = execution.baseExecutionId;
    if (base === null) continue;
    if (base === execution.executionId) throw contractError("execution_lineage_invalid", `${base} recomputes itself`);
    const root = byId.get(base);
    if (root && root.baseExecutionId !== null) {
      throw contractError("execution_lineage_invalid", `${execution.executionId} names ${base}, which is itself a recomputation`);
    }
  }
  return byId;
}

/**
 * Identities that must agree wherever they appear: a source version belongs to one source and one
 * version number; an assumption revision is one version with one content fingerprint; a slot holds
 * one decision per revision; a decision belongs to one set and slot.
 */
function createIdentityRegistry() {
  const versions = new Map<string, SourceVersionRef>();
  const versionIdsByNumber = new Map<string, string>();
  const assumptionVersions = new Map<string, {setId: string; revision: number; contentFingerprint: string | null}>();
  const assumptionVersionIdsByRevision = new Map<string, string>();
  const slotDecisions = new Map<string, string | null>();
  const decisionOwners = new Map<string, string>();
  const conflict = (code: "source_version_identity_conflict" | "assumption_version_identity_conflict", detail: string) => contractError(code, detail);
  return {
    versions: versions as ReadonlyMap<string, SourceVersionRef>,
    source(ref: SourceVersionRef): void {
      const known = versions.get(ref.versionId);
      if (known && (known.sourceId !== ref.sourceId || known.versionNo !== ref.versionNo)) {
        throw conflict("source_version_identity_conflict", `${ref.versionId} is recorded as ${known.sourceId} v${known.versionNo} and ${ref.sourceId} v${ref.versionNo}`);
      }
      const numbered = compositeKey(ref.sourceId, ref.versionNo);
      const knownId = versionIdsByNumber.get(numbered);
      if (knownId !== undefined && knownId !== ref.versionId) {
        throw conflict("source_version_identity_conflict", `${ref.sourceId} v${ref.versionNo} is recorded as ${knownId} and ${ref.versionId}`);
      }
      versions.set(ref.versionId, {sourceId: ref.sourceId, versionNo: ref.versionNo, versionId: ref.versionId});
      versionIdsByNumber.set(numbered, ref.versionId);
    },
    slot(value: {setId: string; slotKey: string; revision: number; versionId: string; decisionId: string | null}, contentFingerprint: string | null): void {
      const known = assumptionVersions.get(value.versionId);
      if (known && (known.setId !== value.setId || known.revision !== value.revision
        || (contentFingerprint !== null && known.contentFingerprint !== null && known.contentFingerprint !== contentFingerprint))) {
        throw conflict("assumption_version_identity_conflict", `${value.versionId} is recorded with two identities`);
      }
      const byRevision = compositeKey(value.setId, value.revision);
      const knownId = assumptionVersionIdsByRevision.get(byRevision);
      if (knownId !== undefined && knownId !== value.versionId) {
        throw conflict("assumption_version_identity_conflict", `set ${value.setId} revision ${value.revision} is recorded as ${knownId} and ${value.versionId}`);
      }
      assumptionVersions.set(value.versionId, {setId: value.setId, revision: value.revision, contentFingerprint: contentFingerprint ?? known?.contentFingerprint ?? null});
      assumptionVersionIdsByRevision.set(byRevision, value.versionId);
      const slotAt = compositeKey(value.setId, value.revision, value.slotKey);
      if (slotDecisions.has(slotAt) && slotDecisions.get(slotAt) !== value.decisionId) {
        throw conflict("assumption_version_identity_conflict", `set ${value.setId} revision ${value.revision} holds two decisions for one slot`);
      }
      slotDecisions.set(slotAt, value.decisionId);
      if (value.decisionId === null) return;
      const owner = compositeKey(value.setId, value.slotKey);
      const knownOwner = decisionOwners.get(value.decisionId);
      if (knownOwner !== undefined && knownOwner !== owner) {
        throw conflict("assumption_version_identity_conflict", `decision ${value.decisionId} is recorded for two slots`);
      }
      decisionOwners.set(value.decisionId, owner);
    },
  };
}

function assertAcyclicDerivations(parents: ReadonlyMap<string, ReadonlySet<string>>): void {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (versionId: string): void => {
    if (done.has(versionId)) return;
    if (visiting.has(versionId)) throw contractError("source_derivation_cycle", `${versionId} is its own ancestor`);
    visiting.add(versionId);
    for (const parent of [...(parents.get(versionId) ?? [])].sort(compareText)) visit(parent);
    visiting.delete(versionId);
    done.add(versionId);
  };
  for (const versionId of [...parents.keys()].sort(compareText)) visit(versionId);
}

// Change events and the dependency-update request -------------------------------------------------

/**
 * A change notification from the outbox (`private.domain_events`). Only identity and the
 * per-aggregate version are read: the impact itself always comes from the current heads.
 */
export const dependencyChangeEventSchema = z.object({
  eventId: identifierSchema,
  aggregateKind: z.string().min(1).max(80),
  aggregateId: identifierSchema,
  aggregateVersion: ordinalSchema,
}).strict();
export type DependencyChangeEvent = z.infer<typeof dependencyChangeEventSchema>;

const aggregateVersionSchema = z.object({
  aggregateKind: z.string().min(1).max(80),
  aggregateId: identifierSchema,
  version: ordinalSchema,
}).strict();

/**
 * The one open dependency-update request of a work: the union of the executions its events
 * affected, the contributing events in canonical order and the newest version seen per aggregate.
 */
export const dependencyUpdateRequestSchema = z.object({
  schemaVersion: z.literal("dependency-update-request.v1"),
  workId: identifierSchema,
  status: z.literal("open"),
  affectedExecutionIds: z.array(identifierSchema),
  events: z.array(dependencyChangeEventSchema),
  aggregateVersions: z.array(aggregateVersionSchema),
  fingerprint: sha256Schema,
}).strict();
export type DependencyUpdateRequest = z.infer<typeof dependencyUpdateRequestSchema>;

export type DependencyUpdateMerge = Readonly<{
  /** Null only when there was no open request and nothing is affected. */
  request: DependencyUpdateRequest | null;
  newEventIds: readonly string[];
  duplicateEventIds: readonly string[];
  /** New events older than a version already recorded for their aggregate; recorded, never regressing. */
  lateEventIds: readonly string[];
  addedExecutionIds: readonly string[];
}>;

/**
 * Merges an impact computed from the current heads into the work's open dependency-update request.
 * Events are deduplicated by id, a stale version never lowers the newest version recorded for its
 * aggregate, and the stored request is canonical, so any delivery order of the same events and
 * impacts yields the same request.
 */
export function mergeDependencyUpdate(input: {
  workId: string;
  openRequest: DependencyUpdateRequest | null;
  events: readonly DependencyChangeEvent[];
  impact: DependencyImpact;
}): DependencyUpdateMerge {
  const workId = identifierSchema.parse(input.workId);
  const events = z.array(dependencyChangeEventSchema).parse(input.events);
  const open = input.openRequest === null ? null : readOpenRequest(input.openRequest, workId);
  const affectedNow = verifiedAffectedExecutionIds(input.impact, workId);

  const recorded = new Map<string, DependencyChangeEvent>();
  const holders = new Map<string, string>();
  const newest = new Map<string, number>();
  const remember = (event: DependencyChangeEvent) => {
    recorded.set(event.eventId, event);
    holders.set(compositeKey(event.aggregateKind, event.aggregateId, event.aggregateVersion), event.eventId);
    const aggregate = compositeKey(event.aggregateKind, event.aggregateId);
    newest.set(aggregate, Math.max(newest.get(aggregate) ?? 0, event.aggregateVersion));
  };
  for (const event of open?.events ?? []) remember(event);

  const newEventIds: string[] = [];
  const duplicateEventIds: string[] = [];
  const lateEventIds: string[] = [];
  for (const event of events) {
    const known = recorded.get(event.eventId);
    if (known) {
      if (stableJson(known) !== stableJson(event)) throw contractError("event_conflict", `${event.eventId} was delivered with two contents`);
      duplicateEventIds.push(event.eventId);
      continue;
    }
    const holder = holders.get(compositeKey(event.aggregateKind, event.aggregateId, event.aggregateVersion));
    if (holder !== undefined) {
      throw contractError("event_version_conflict", `${event.aggregateKind} ${event.aggregateId} v${event.aggregateVersion} is held by ${holder} and ${event.eventId}`);
    }
    if (event.aggregateVersion < (newest.get(compositeKey(event.aggregateKind, event.aggregateId)) ?? 0)) lateEventIds.push(event.eventId);
    newEventIds.push(event.eventId);
    remember(event);
  }

  const previous = new Set(open?.affectedExecutionIds ?? []);
  const addedExecutionIds = affectedNow.filter((executionId) => !previous.has(executionId)).sort(compareText);
  const affected = [...previous, ...addedExecutionIds];
  const request = open === null && affected.length === 0 ? null : buildRequest(workId, affected, recorded.values());
  return {
    request,
    newEventIds: [...newEventIds].sort(compareText),
    duplicateEventIds: [...new Set(duplicateEventIds)].sort(compareText),
    lateEventIds: [...lateEventIds].sort(compareText),
    addedExecutionIds,
  };
}

function buildRequest(workId: string, affected: Iterable<string>, events: Iterable<DependencyChangeEvent>): DependencyUpdateRequest {
  const ordered = [...events].sort(compareEvents).map((event) => ({
    eventId: event.eventId,
    aggregateKind: event.aggregateKind,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
  }));
  const newest = new Map<string, {aggregateKind: string; aggregateId: string; version: number}>();
  for (const event of ordered) {
    const aggregate = compositeKey(event.aggregateKind, event.aggregateId);
    const known = newest.get(aggregate);
    if (!known || event.aggregateVersion > known.version) {
      newest.set(aggregate, {aggregateKind: event.aggregateKind, aggregateId: event.aggregateId, version: event.aggregateVersion});
    }
  }
  const body = {
    schemaVersion: "dependency-update-request.v1" as const,
    workId,
    status: "open" as const,
    affectedExecutionIds: [...new Set(affected)].sort(compareText),
    events: ordered,
    aggregateVersions: [...newest.values()].sort((left, right) =>
      compareText(left.aggregateKind, right.aggregateKind) || compareText(left.aggregateId, right.aggregateId)),
  };
  return {...body, fingerprint: fingerprintOf(body)};
}

function readOpenRequest(value: DependencyUpdateRequest, workId: string): DependencyUpdateRequest {
  const request = dependencyUpdateRequestSchema.parse(value);
  if (request.workId !== workId) throw contractError("request_work_mismatch", `request of ${request.workId} merged into ${workId}`);
  const ids = new Set(request.events.map((event) => event.eventId));
  const versions = new Set(request.events.map((event) => compositeKey(event.aggregateKind, event.aggregateId, event.aggregateVersion)));
  if (ids.size !== request.events.length || versions.size !== request.events.length) {
    throw contractError("request_integrity_mismatch", "stored events repeat an id or an aggregate version");
  }
  const canonical = buildRequest(request.workId, request.affectedExecutionIds, request.events);
  if (stableJson(canonical) !== stableJson(request)) throw contractError("request_integrity_mismatch", "stored request is not in its canonical, fingerprinted form");
  return canonical;
}

function verifiedAffectedExecutionIds(impact: DependencyImpact, workId: string): readonly string[] {
  if (impact.workId !== workId) throw contractError("impact_integrity_mismatch", `impact of ${impact.workId} merged into ${workId}`);
  const expected = impactFromExecutions(impact.workId, impact.executions);
  if (stableJson(expected) !== stableJson(impact)) throw contractError("impact_integrity_mismatch", "impact does not match its fingerprint");
  return expected.affectedExecutionIds;
}

function compareEvents(left: DependencyChangeEvent, right: DependencyChangeEvent): number {
  return compareText(left.aggregateKind, right.aggregateKind)
    || compareText(left.aggregateId, right.aggregateId)
    || left.aggregateVersion - right.aggregateVersion
    || compareText(left.eventId, right.eventId);
}

// Bounded recompute plan --------------------------------------------------------------------------

export const recomputeCandidateStateSchema = z.enum(["awaiting_authorization", "scheduled", "settled", "declined", "failed"]);
export type RecomputeCandidateState = z.infer<typeof recomputeCandidateStateSchema>;

/** A candidate already persisted under its idempotency key, in any state. */
export const recomputeCandidateRecordSchema = z.object({
  workId: identifierSchema,
  idempotencyKey: sha256Schema,
  baseExecutionId: identifierSchema,
  state: recomputeCandidateStateSchema,
}).strict();
export type RecomputeCandidateRecord = z.infer<typeof recomputeCandidateRecordSchema>;

/** Idempotency key of a recomputation: work, root base execution and the new input fingerprint. */
export function dependencyRecomputeKey(input: {workId: string; baseExecutionId: string; newInputFingerprint: string}): string {
  const parsed = z.object({workId: identifierSchema, baseExecutionId: identifierSchema, newInputFingerprint: sha256Schema}).strict().parse(input);
  return fingerprintOf({schemaVersion: "dependency-recompute-key.v1", ...parsed});
}

export type RecomputePlanItem =
  | Readonly<{executionId: string; action: "reuse"; inputFingerprint: string}>
  | Readonly<{executionId: string; action: "rebuild_graph"; gaps: readonly DependencyGraphGap[]}>
  | Readonly<{
    executionId: string;
    action: "recompute" | "await_authorization";
    baseExecutionId: string;
    idempotencyKey: string;
    newInputFingerprint: string;
    reasons: readonly DependencyImpactReason[];
  }>;

export type RecomputeCandidate = Readonly<{
  idempotencyKey: string;
  workId: string;
  baseExecutionId: string;
  newInputFingerprint: string;
  action: "recompute" | "await_authorization";
  /** The largest spend ceiling among the covered executions; what a person authorizes. */
  budget: ContinuationBudget;
  executionIds: readonly string[];
  recordedState: RecomputeCandidateState | null;
  /** Put a job on the current queue: only a new, zero-budget candidate. */
  enqueue: boolean;
  /** Open a persisted human wait (an `awaiting_human` milestone), never a job or a lease. */
  openWait: boolean;
}>;

export type RecomputePlan = Readonly<{
  schemaVersion: "dependency-recompute-plan.v1";
  workId: string;
  impactFingerprint: string;
  items: readonly RecomputePlanItem[];
  candidates: readonly RecomputeCandidate[];
  /** Open candidates recorded under keys the current heads no longer produce. */
  supersededCandidateKeys: readonly string[];
  fingerprint: string;
}>;

/**
 * One item per execution: `reuse` when unaffected (identical input fingerprints), `rebuild_graph`
 * when the graph is incomplete, otherwise `recompute` for a zero budget or `await_authorization`
 * for a positive one. Affected executions of one lineage under the same heads share one candidate.
 * A key already recorded in any state is never enqueued or put to a person again, so a retry or a
 * worker restart repeats no confirmed cost.
 */
export function planDependencyRecompute(input: {
  graph: ContinuationGraph;
  candidates: readonly RecomputeCandidateRecord[];
}): RecomputePlan {
  const graph = continuationGraphSchema.parse(input.graph);
  const records = z.array(recomputeCandidateRecordSchema).parse(input.candidates);
  const {index, assessments, impact} = assessGraph(graph);

  const recordsByKey = new Map<string, RecomputeCandidateRecord>();
  for (const record of records) {
    if (record.workId !== graph.workId) throw contractError("candidate_work_mismatch", `${record.idempotencyKey} belongs to ${record.workId}`);
    if (recordsByKey.has(record.idempotencyKey)) throw contractError("candidate_conflict", `${record.idempotencyKey} is recorded twice`);
    recordsByKey.set(record.idempotencyKey, record);
  }

  const drafts = new Map<string, {baseExecutionId: string; newInputFingerprint: string; executionIds: string[]; budgets: ContinuationBudget[]}>();
  const keyByExecution = new Map<string, string>();
  for (const assessment of assessments) {
    if (assessment.status !== "affected" || assessment.currentInputFingerprint === null) continue;
    const execution = index.executions.get(assessment.executionId);
    if (!execution) continue;
    const baseExecutionId = execution.baseExecutionId ?? execution.executionId;
    const key = dependencyRecomputeKey({workId: graph.workId, baseExecutionId, newInputFingerprint: assessment.currentInputFingerprint});
    const draft = drafts.get(key) ?? {baseExecutionId, newInputFingerprint: assessment.currentInputFingerprint, executionIds: [], budgets: []};
    draft.executionIds.push(execution.executionId);
    draft.budgets.push(assessment.spendCeiling);
    drafts.set(key, draft);
    keyByExecution.set(execution.executionId, key);
  }

  const candidates: RecomputeCandidate[] = [...drafts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([idempotencyKey, draft]) => {
      const record = recordsByKey.get(idempotencyKey);
      if (record && record.baseExecutionId !== draft.baseExecutionId) {
        throw contractError("candidate_conflict", `${idempotencyKey} is recorded for ${record.baseExecutionId}, planned for ${draft.baseExecutionId}`);
      }
      const budget = draft.budgets.reduce(maxBudget, {maxCostMicrousd: 0, maxModelCalls: 0});
      const action = isPositiveBudget(budget) ? "await_authorization" as const : "recompute" as const;
      const recordedState = record?.state ?? null;
      return {
        idempotencyKey,
        workId: graph.workId,
        baseExecutionId: draft.baseExecutionId,
        newInputFingerprint: draft.newInputFingerprint,
        action,
        budget,
        executionIds: [...draft.executionIds].sort(compareText),
        recordedState,
        enqueue: recordedState === null && action === "recompute",
        openWait: recordedState === null && action === "await_authorization",
      };
    });
  const candidatesByKey = new Map(candidates.map((candidate) => [candidate.idempotencyKey, candidate]));

  const items: RecomputePlanItem[] = assessments.map((assessment): RecomputePlanItem => {
    if (assessment.status === "graph_incomplete") return {executionId: assessment.executionId, action: "rebuild_graph", gaps: assessment.gaps};
    if (assessment.status === "unaffected") return {executionId: assessment.executionId, action: "reuse", inputFingerprint: assessment.pinnedInputFingerprint};
    const candidate = candidatesByKey.get(keyByExecution.get(assessment.executionId) ?? "");
    if (!candidate) throw contractError("candidate_conflict", `${assessment.executionId} has no planned candidate`);
    return {
      executionId: assessment.executionId,
      action: candidate.action,
      baseExecutionId: candidate.baseExecutionId,
      idempotencyKey: candidate.idempotencyKey,
      newInputFingerprint: candidate.newInputFingerprint,
      reasons: assessment.reasons,
    };
  });

  const supersededCandidateKeys = records
    .filter((record) => (record.state === "scheduled" || record.state === "awaiting_authorization") && !candidatesByKey.has(record.idempotencyKey))
    .map((record) => record.idempotencyKey)
    .sort(compareText);
  const body = {
    schemaVersion: "dependency-recompute-plan.v1" as const,
    workId: graph.workId,
    impactFingerprint: impact.fingerprint,
    items,
    candidates,
    supersededCandidateKeys,
  };
  return {...body, fingerprint: fingerprintOf(body)};
}

function maxBudget(left: ContinuationBudget, right: ContinuationBudget): ContinuationBudget {
  return {
    maxCostMicrousd: Math.max(left.maxCostMicrousd, right.maxCostMicrousd),
    maxModelCalls: Math.max(left.maxModelCalls, right.maxModelCalls),
  };
}

function isPositiveBudget(budget: ContinuationBudget): boolean {
  return budget.maxCostMicrousd > 0 || budget.maxModelCalls > 0;
}

// Milestones, waits and descendants ---------------------------------------------------------------

export const workMilestoneKindSchema = z.enum([
  "execution_result",
  "decision",
  "awaiting_human",
  "human_resolved",
  "continuation_proposed",
  "update_adopted",
]);
export type WorkMilestoneKind = z.infer<typeof workMilestoneKindSchema>;

/** Decisions and approvals are records of a human act: never stale, never rewritten. */
const immutableMilestoneKinds: ReadonlySet<WorkMilestoneKind> = new Set(["decision", "human_resolved", "update_adopted"]);

export const workMilestoneDecisionSchema = z.object({
  decisionId: identifierSchema,
  /** The exact revision the decision was taken on. */
  revision: ordinalSchema,
  outcome: z.enum(["approved", "rejected"]),
}).strict();
export type WorkMilestoneDecision = z.infer<typeof workMilestoneDecisionSchema>;

/**
 * An immutable milestone of a work, in append order. Results carry their execution and reference
 * nothing; every other milestone references earlier milestones it is about. A wait
 * (`awaiting_human`) stays open until a `human_resolved` references it; it holds no job or lease.
 */
export const workMilestoneSchema = z.object({
  milestoneId: identifierSchema,
  workId: identifierSchema,
  sequence: ordinalSchema,
  kind: workMilestoneKindSchema,
  label: z.string().min(1).max(300),
  executionId: identifierSchema.nullable(),
  references: z.array(identifierSchema),
  decision: workMilestoneDecisionSchema.nullable(),
}).strict().superRefine((milestone, context) => {
  const issue = (path: string, message: string) => context.addIssue({code: "custom", path: [path], message});
  if ((milestone.kind === "execution_result") !== (milestone.executionId !== null)) issue("executionId", "only an execution result carries an execution");
  if (milestone.kind === "execution_result" && milestone.references.length > 0) issue("references", "an execution result depends on its inputs, not on milestones");
  if ((milestone.kind === "decision" || milestone.kind === "update_adopted") && milestone.decision === null) issue("decision", "a decision records its outcome");
  if ((milestone.kind === "execution_result" || milestone.kind === "awaiting_human" || milestone.kind === "continuation_proposed") && milestone.decision !== null) {
    issue("decision", "only decisions, adoptions and human resolutions carry a decision");
  }
  if ((milestone.kind === "decision" || milestone.kind === "update_adopted" || milestone.kind === "human_resolved" || milestone.kind === "continuation_proposed")
    && milestone.references.length === 0) issue("references", "this milestone must reference what it is about");
  if (new Set(milestone.references).size !== milestone.references.length) issue("references", "references repeat");
});
export type WorkMilestone = z.infer<typeof workMilestoneSchema>;

type MilestoneLog = Readonly<{ordered: readonly WorkMilestone[]; byId: ReadonlyMap<string, WorkMilestone>}>;

function readMilestoneLog(workId: string, milestones: readonly WorkMilestone[]): MilestoneLog {
  const parsed = z.array(workMilestoneSchema).parse(milestones);
  const byId = new Map<string, WorkMilestone>();
  const sequences = new Set<number>();
  for (const milestone of parsed) {
    if (milestone.workId !== workId) throw contractError("milestone_work_mismatch", `${milestone.milestoneId} belongs to ${milestone.workId}`);
    if (byId.has(milestone.milestoneId) || sequences.has(milestone.sequence)) throw contractError("duplicate_milestone", milestone.milestoneId);
    byId.set(milestone.milestoneId, milestone);
    sequences.add(milestone.sequence);
  }
  const resolvedWaits = new Set<string>();
  for (const milestone of parsed) {
    for (const reference of milestone.references) {
      const target = byId.get(reference);
      if (!target || target.sequence >= milestone.sequence) {
        throw contractError("milestone_reference_invalid", `${milestone.milestoneId} references ${reference}, which is not an earlier milestone of the work`);
      }
    }
    if (milestone.kind !== "human_resolved") continue;
    const waits = milestone.references.filter((reference) => byId.get(reference)?.kind === "awaiting_human");
    const [wait] = waits;
    if (waits.length !== 1 || wait === undefined) throw contractError("wait_resolution_invalid", `${milestone.milestoneId} must resolve exactly one wait`);
    if (resolvedWaits.has(wait)) throw contractError("wait_resolution_invalid", `${wait} is resolved twice`);
    resolvedWaits.add(wait);
  }
  return {ordered: [...parsed].sort((left, right) => left.sequence - right.sequence), byId};
}

export type OpenWorkWait = Readonly<{milestoneId: string; sequence: number; label: string; references: readonly string[]}>;

/** Waits still open: `awaiting_human` milestones no `human_resolved` references. A wait is state, not work. */
export function openWorkWaits(input: {workId: string; milestones: readonly WorkMilestone[]}): readonly OpenWorkWait[] {
  const log = readMilestoneLog(identifierSchema.parse(input.workId), input.milestones);
  const resolved = new Set<string>();
  for (const milestone of log.ordered) {
    if (milestone.kind !== "human_resolved") continue;
    for (const reference of milestone.references) if (log.byId.get(reference)?.kind === "awaiting_human") resolved.add(reference);
  }
  return log.ordered
    .filter((milestone) => milestone.kind === "awaiting_human" && !resolved.has(milestone.milestoneId))
    .map((milestone) => ({milestoneId: milestone.milestoneId, sequence: milestone.sequence, label: milestone.label, references: milestone.references}));
}

export type DependencyDescendants = Readonly<{
  workId: string;
  /** Results of affected executions and the non-decision milestones built on them. */
  stale: readonly Readonly<{milestoneId: string; kind: WorkMilestoneKind}>[];
  /** Decisions and approvals referencing a stale milestone: kept as they are, never marked for rewrite. */
  referencedImmutable: readonly Readonly<{milestoneId: string; kind: WorkMilestoneKind; decisionId: string | null}>[];
}>;

/**
 * Descendants of the affected executions. Staleness starts at their result milestones and follows
 * the milestones that reference them; it stops at decisions and approvals, which are returned as
 * `referenced_immutable`: what a person decided stays recorded against the exact result they saw.
 */
export function collectDependencyDescendants(input: {
  workId: string;
  affectedExecutionIds: readonly string[];
  milestones: readonly WorkMilestone[];
}): DependencyDescendants {
  const workId = identifierSchema.parse(input.workId);
  const affected = new Set(z.array(identifierSchema).parse(input.affectedExecutionIds));
  const log = readMilestoneLog(workId, input.milestones);
  const referencedBy = new Map<string, WorkMilestone[]>();
  for (const milestone of log.ordered) {
    for (const reference of milestone.references) {
      const list = referencedBy.get(reference) ?? [];
      list.push(milestone);
      referencedBy.set(reference, list);
    }
  }
  const reached = new Map<string, WorkMilestone>();
  const queue = log.ordered.filter((milestone) => milestone.kind === "execution_result" && milestone.executionId !== null && affected.has(milestone.executionId));
  for (const seed of queue) reached.set(seed.milestoneId, seed);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current || immutableMilestoneKinds.has(current.kind)) continue;
    for (const child of referencedBy.get(current.milestoneId) ?? []) {
      if (reached.has(child.milestoneId)) continue;
      reached.set(child.milestoneId, child);
      queue.push(child);
    }
  }
  const ordered = [...reached.values()].sort((left, right) => left.sequence - right.sequence);
  return {
    workId,
    stale: ordered.filter((milestone) => !immutableMilestoneKinds.has(milestone.kind)).map((milestone) => ({milestoneId: milestone.milestoneId, kind: milestone.kind})),
    referencedImmutable: ordered
      .filter((milestone) => immutableMilestoneKinds.has(milestone.kind))
      .map((milestone) => ({milestoneId: milestone.milestoneId, kind: milestone.kind, decisionId: milestone.decision?.decisionId ?? null})),
  };
}

// Continuation base -------------------------------------------------------------------------------

/**
 * A follow-up typed in the conversation of a work. No intake session is read or required: the
 * work and its conversation are the whole context.
 */
export const workContinuationRequestSchema = z.object({
  workId: identifierSchema,
  conversationId: identifierSchema,
  text: z.string().min(1).max(8000).refine((text) => text.trim().length > 0, "the follow-up is blank"),
}).strict();
export type WorkContinuationRequest = z.infer<typeof workContinuationRequestSchema>;

export type ContinuationBaseOption = Readonly<{milestoneId: string; decisionId: string; revision: number; label: string}>;

export type WorkContinuationResolution =
  | Readonly<{
    status: "proposed";
    workId: string;
    conversationId: string;
    terms: readonly string[];
    base: ContinuationBaseOption;
    /** The new objective, linked to the base decision and revision. */
    objective: Readonly<{request: string; baseMilestoneId: string; baseDecisionId: string; baseRevision: number}>;
    milestone: Readonly<{kind: "continuation_proposed"; references: readonly [string]}>;
  }>
  | Readonly<{
    status: "question";
    workId: string;
    conversationId: string;
    terms: readonly string[];
    code: "ambiguous_base" | "no_approved_base";
    /** What the person can choose from; never chosen for them. */
    options: readonly ContinuationBaseOption[];
  }>;

/**
 * Words that carry no reference to a milestone: function words, continuation verbs and approval
 * status (every candidate base is approved already), in pt-BR and en-US, without accents.
 */
const nonReferentialWords: ReadonlySet<string> = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "ao", "aos", "para", "pra", "por", "pelo", "pela", "pelos", "pelas", "com", "e", "ou", "que", "se", "mais", "agora",
  "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas", "isso", "isto", "aquele", "aquela",
  "meu", "minha", "nosso", "nossa", "seu", "sua", "favor",
  "the", "an", "of", "to", "for", "on", "in", "at", "by", "with", "and", "or", "this", "that", "these", "those",
  "our", "my", "your", "please", "now", "more",
  "aprofundar", "aprofunde", "aprofunda", "detalhar", "detalhe", "detalha", "revisar", "revise", "revisa",
  "atualizar", "atualize", "atualiza", "continuar", "continue", "continua", "retomar", "retome", "retoma",
  "expandir", "expanda", "desenvolver", "desenvolva", "explorar", "explore", "refazer", "refaca", "seguir", "siga",
  "avancar", "avance", "deepen", "detail", "review", "update", "resume", "expand", "develop", "extend", "redo", "revisit",
  "aprovado", "aprovada", "aprovados", "aprovadas", "approved",
  "decisao", "decisoes", "decision", "decisions", "resultado", "resultados", "result", "results",
]);

/**
 * Resolves a follow-up to an explicit approved base. Case and accents are normalised; the words
 * left after removing non-referential ones must all appear in the label of an approved,
 * unsuperseded decision or adoption, or in the labels of the milestones it references. Exactly one
 * match is the base; several or none become a question. Never the latest message, never the
 * newest artifact.
 */
export function resolveWorkContinuation(input: WorkContinuationRequest & {milestones: readonly WorkMilestone[]}): WorkContinuationResolution {
  const request = workContinuationRequestSchema.parse({workId: input.workId, conversationId: input.conversationId, text: input.text});
  const log = readMilestoneLog(request.workId, input.milestones);
  const terms = [...new Set(words(request.text).filter((word) => !nonReferentialWords.has(word)))];
  const bases = approvedBases(log);
  const matches = terms.length === 0 ? [] : bases.filter((base) => terms.every((term) => base.words.has(term)));
  const context = {workId: request.workId, conversationId: request.conversationId, terms};
  const [only] = matches;
  if (matches.length === 1 && only) {
    return {
      ...context,
      status: "proposed",
      base: only.option,
      objective: {
        request: request.text.trim().replace(/\s+/g, " "),
        baseMilestoneId: only.option.milestoneId,
        baseDecisionId: only.option.decisionId,
        baseRevision: only.option.revision,
      },
      milestone: {kind: "continuation_proposed", references: [only.option.milestoneId]},
    };
  }
  return {
    ...context,
    status: "question",
    code: matches.length > 1 ? "ambiguous_base" : "no_approved_base",
    options: (matches.length > 1 ? matches : bases).map((base) => base.option),
  };
}

/** Approved decisions and adoptions not replaced by a later decision or adoption on the same subject. */
function approvedBases(log: MilestoneLog): readonly {option: ContinuationBaseOption; words: ReadonlySet<string>}[] {
  const deciding = log.ordered.filter((milestone) => milestone.kind === "decision" || milestone.kind === "update_adopted");
  const superseded = (candidate: WorkMilestone) => deciding.some((later) => later.sequence > candidate.sequence
    && (later.references.includes(candidate.milestoneId) || later.references.some((reference) => candidate.references.includes(reference))));
  return deciding.flatMap((milestone) => {
    const decision = milestone.decision;
    if (decision?.outcome !== "approved" || superseded(milestone)) return [];
    const labels = [milestone.label, ...milestone.references.map((reference) => log.byId.get(reference)?.label ?? "")];
    return [{
      option: {milestoneId: milestone.milestoneId, decisionId: decision.decisionId, revision: decision.revision, label: milestone.label},
      words: new Set(labels.flatMap(words)),
    }];
  });
}

function words(text: string): string[] {
  const normalised = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalised === "" ? [] : normalised.split(" ");
}

// Canonical helpers ------------------------------------------------------------------------------

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compositeKey(...parts: readonly (string | number)[]): string {
  return JSON.stringify(parts);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fingerprintOf(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
