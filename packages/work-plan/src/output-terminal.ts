import {createHash, randomUUID} from "node:crypto";

import {z} from "zod";

import {compileTaskGraph, type CompiledTaskGraph} from "./capital-jobs";
import {
  assertTrustedObjectivePlan,
  objectiveToPlanDecisionSchema,
  type ObjectiveOutputTerminal,
  type ObjectiveToPlanDecision,
} from "./objective-plan";

export const terminalWorkProductSchema = z.enum([
  "cited_answer", "risk_matrix", "meeting_brief", "board_decision_pack", "preliminary_case",
  "capital_shortlist", "operation_review", "capital_alternative_map", "financial_model",
  "indicative_term_sheet", "teaser", "lender_memo", "presentation_deck", "source_index",
  "market_map", "monitoring_setup", "workspace_change_preview",
]);
export type TerminalWorkProduct = z.infer<typeof terminalWorkProductSchema>;

export const terminalDeliveryFormatSchema = z.enum(["chat", "workbench", "pptx", "xlsx", "docx", "pdf"]);
export type TerminalDeliveryFormat = z.infer<typeof terminalDeliveryFormatSchema>;

export const terminalAudienceSchema = z.enum([
  "requester", "internal_team", "senior_sponsor", "executive_management", "credit_committee",
  "board", "company", "investor", "lender", "market_participant", "unknown",
]);
export type TerminalAudience = z.infer<typeof terminalAudienceSchema>;

const signalStateSchema = z.enum(["explicit", "inferred", "unknown"]);
const terminalContinuitySchema = z.enum(["new", "resume", "revise"]);
const deliverableSchema = z.object({
  workProduct: terminalWorkProductSchema,
  format: terminalDeliveryFormatSchema,
}).strict();
type TerminalDeliverable = z.infer<typeof deliverableSchema>;

const workProductSignalSchema = z.object({
  value: z.array(terminalWorkProductSchema).max(8),
  state: signalStateSchema,
}).strict().superRefine((signal, context) => {
  if (signal.state === "explicit" && signal.value.length === 0) {
    context.addIssue({code: "custom", path: ["value"], message: "an explicit terminal selection cannot be empty"});
  }
});

const formatSignalSchema = z.object({
  value: z.array(deliverableSchema).max(16),
  state: signalStateSchema,
}).strict().superRefine((signal, context) => {
  if (signal.state === "explicit" && signal.value.length === 0) {
    context.addIssue({code: "custom", path: ["value"], message: "an explicit format selection cannot be empty"});
  }
});

const audienceSignalSchema = z.object({
  value: terminalAudienceSchema,
  state: signalStateSchema,
}).strict().superRefine((signal, context) => {
  if (signal.state === "explicit" && signal.value === "unknown") {
    context.addIssue({code: "custom", path: ["value"], message: "an explicit audience cannot be unknown"});
  }
});

/** Structural request only. It carries intent, never authority. */
export const outputTerminalRequestSchema = z.object({
  schemaVersion: z.literal("output-terminal-request.v2"),
  basePlan: objectiveToPlanDecisionSchema,
  workProducts: workProductSignalSchema,
  formats: formatSignalSchema,
  audience: audienceSignalSchema,
  continuity: z.object({value: terminalContinuitySchema, state: signalStateSchema}).strict(),
}).strict();
export type OutputTerminalRequest = z.infer<typeof outputTerminalRequestSchema>;

export const resolvedTerminalArtifactBindingSchema = z.object({
  workProduct: terminalWorkProductSchema,
  format: terminalDeliveryFormatSchema,
  artifactId: z.string().uuid(),
  artifactVersionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  authorizationRef: z.string().min(1).max(200),
}).strict();
export type ResolvedTerminalArtifactBinding = z.infer<typeof resolvedTerminalArtifactBindingSchema>;

/**
 * Deliberately opaque. `authorizationId` is an audit locator only; possession of its string is not
 * authority. The resolver recognizes solely the exact object issued by its in-process trust root.
 */
declare const outputTerminalAuthorizationBrand: unique symbol;
/** Opaque witness emitted by a trusted application boundary. It has no caller-constructible fields. */
export type OutputTerminalAuthorization = Readonly<{[outputTerminalAuthorizationBrand]: true}>;

type TestOnlyAuthorityState = Readonly<{
  selectionConfirmed: boolean;
  audienceConfirmed: boolean;
  trustedArtifactRegistryBindings: readonly ResolvedTerminalArtifactBinding[];
}>;

type InternalOutputTerminalAuthorization = OutputTerminalAuthorization & Readonly<{authorizationId: string}>;

type TrustedTerminalAuthorizationReceipt = {
  authorizationId: string;
  requestSnapshot: OutputTerminalRequest;
  basePlanHandle: ObjectiveToPlanDecision;
  basePlanSnapshot: ObjectiveToPlanDecision;
  basePlanIdentity: string;
  specialistTaskIds: readonly string[];
  specialistManifestVersion: string;
  workProducts: readonly TerminalWorkProduct[];
  deliverables: readonly TerminalDeliverable[];
  audience: TerminalAudience;
  continuity: z.infer<typeof terminalContinuitySchema>;
  selectionConfirmed: boolean;
  audienceConfirmed: boolean;
  artifactBindings: readonly ResolvedTerminalArtifactBinding[];
};

const trustedTerminalAuthorizations = new WeakMap<OutputTerminalAuthorization, TrustedTerminalAuthorizationReceipt>();
const trustedTerminalResolutions = new WeakMap<OutputTerminalResolution, TrustedTerminalAuthorizationReceipt>();

type TestOnlyOutputTerminalAuthority = {
  /**
   * Server-only issuance boundary. Its caller is part of the TCB and must obtain confirmation from
   * authenticated interaction state and artifact bindings from an authorized, version-pinned
   * registry lookup. Model output, browser JSON and persisted rows cannot invoke this method.
   */
  attest(request: OutputTerminalRequest): OutputTerminalAuthorization;
};

/**
 * In-memory reference adapter used until the application control plane supplies a durable signer
 * and verifier. Its unforgeable property is object identity held in a private WeakMap. Receipts do
 * not survive serialization: a new process must authenticate the actor, recompile the objective,
 * reload exact artifact versions/scopes, and issue a fresh attestation before execution.
 */
export function createTestOnlyOutputTerminalAuthority(
  state: TestOnlyAuthorityState,
): TestOnlyOutputTerminalAuthority {
  const trustedState = deepFreeze({
    selectionConfirmed: state.selectionConfirmed,
    audienceConfirmed: state.audienceConfirmed,
    trustedArtifactRegistryBindings: state.trustedArtifactRegistryBindings
      .map((binding) => resolvedTerminalArtifactBindingSchema.parse(binding)),
  });
  return Object.freeze({
    attest(request: OutputTerminalRequest) {
      const planReceipt = assertTrustedObjectivePlan(request.basePlan);
      const parsed = outputTerminalRequestSchema.parse(request);
      const requestSnapshot = deepFreeze({...parsed, basePlan: planReceipt.planSnapshot as ObjectiveToPlanDecision});
      const workProducts = terminalProducts(requestSnapshot);
      const deliverables = normalizedDeliverables(requestSnapshot, workProducts);
      const artifactBindings = deepFreeze(trustedState.trustedArtifactRegistryBindings
        .map((binding) => resolvedTerminalArtifactBindingSchema.parse(binding))
        .sort((left, right) => artifactBindingKey(left).localeCompare(artifactBindingKey(right))));
      const authorization = Object.freeze({authorizationId: randomUUID()}) as InternalOutputTerminalAuthorization;
      trustedTerminalAuthorizations.set(authorization, deepFreeze({
        authorizationId: authorization.authorizationId,
        requestSnapshot,
        basePlanHandle: request.basePlan,
        basePlanSnapshot: planReceipt.planSnapshot as ObjectiveToPlanDecision,
        basePlanIdentity: planReceipt.planSnapshot.structuralIdentity,
        specialistTaskIds: deepFreeze([...planReceipt.specialistTaskIds]),
        specialistManifestVersion: planReceipt.specialistManifestVersion,
        workProducts: deepFreeze(workProducts),
        deliverables: deepFreeze(deliverables),
        audience: requestSnapshot.audience.value,
        continuity: requestSnapshot.continuity.value,
        selectionConfirmed: trustedState.selectionConfirmed,
        audienceConfirmed: trustedState.audienceConfirmed,
        artifactBindings,
      }));
      return authorization;
    },
  });
}

const materialGapSchema = z.enum([
  "material_kind", "audience", "revision_target", "compatible_format", "explicit_confirmation",
  "base_plan_context", "terminal_capability",
]);
const planningStateSchema = z.enum([
  "awaiting_selection", "awaiting_context", "awaiting_confirmation", "awaiting_audience",
  "awaiting_artifact_binding", "incompatible_binding", "terminal_task_unavailable",
]);
const terminalPlanningDescriptorSchema = z.object({
  workProduct: terminalWorkProductSchema.nullable(),
  format: terminalDeliveryFormatSchema.nullable(),
  state: planningStateSchema,
  detail: z.string().min(1),
}).strict();

const resolutionCommonShape = {
  schemaVersion: z.literal("output-terminal-resolution.v2"),
  basePlanIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  workProducts: z.array(terminalWorkProductSchema).max(8),
  formats: z.array(terminalDeliveryFormatSchema).max(6),
  deliverables: z.array(deliverableSchema).max(16),
  audience: terminalAudienceSchema,
  continuity: terminalContinuitySchema,
  artifactBindings: z.array(resolvedTerminalArtifactBindingSchema).max(16),
  preservedSpecialistTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).max(100),
  authorizationReceiptId: z.string().uuid().nullable(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
} as const;

const resolvedResolutionSchema = z.object({
  ...resolutionCommonShape,
  status: z.literal("resolved"),
  reason: z.literal("terminal_resolved"),
  authorizationReceiptId: z.string().uuid(),
  targetTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).min(1).max(100),
  taskGraph: z.custom<CompiledTaskGraph>((value) => Boolean(value && typeof value === "object")),
  materialGaps: z.array(materialGapSchema).max(0),
  planningDescriptors: z.array(terminalPlanningDescriptorSchema).max(0),
}).strict();

const pendingResolutionSchema = z.object({
  ...resolutionCommonShape,
  status: z.literal("needs_confirmation"),
  authorizationReceiptId: z.null(),
  reason: z.enum([
    "terminal_inferred_confirmation_required", "material_kind_required", "audience_required",
    "revision_target_required", "base_plan_context_required",
  ]),
  materialGaps: z.array(materialGapSchema).min(1),
  planningDescriptors: z.array(terminalPlanningDescriptorSchema).min(1),
}).strict();

const blockedResolutionSchema = z.object({
  ...resolutionCommonShape,
  status: z.literal("blocked"),
  authorizationReceiptId: z.null(),
  reason: z.enum([
    "incompatible_format", "incompatible_audience", "revision_target_incompatible",
    "base_plan_untrusted", "base_plan_capability_unavailable", "terminal_task_unavailable",
    "execution_authorization_mismatch",
  ]),
  materialGaps: z.array(materialGapSchema).min(1),
  planningDescriptors: z.array(terminalPlanningDescriptorSchema).min(1),
}).strict();

/**
 * Wire/storage schema only. A successful parse establishes structural consistency, not execution
 * authority. Consumers must call `assertTrustedOutputTerminalResolution`, or for persisted JSON
 * `revalidateSameProcessOutputTerminalResolution`, before exposing an executable TaskSpec graph.
 */
export const outputTerminalResolutionStructuralSchema = z.discriminatedUnion("status", [
  resolvedResolutionSchema, pendingResolutionSchema, blockedResolutionSchema,
]).superRefine((resolution, context) => {
  const {fingerprint, ...core} = resolution;
  if (fingerprint !== fingerprintOf(core)) {
    context.addIssue({code: "custom", path: ["fingerprint"], message: "terminal resolution fingerprint mismatch"});
  }
  validateNormalizedResolution(resolution, context);
  if (resolution.status !== "resolved") return;
  let canonicalGraph: CompiledTaskGraph;
  try {
    canonicalGraph = compileTaskGraph(resolution.targetTaskIds);
  } catch (error) {
    context.addIssue({
      code: "custom", path: ["targetTaskIds"],
      message: error instanceof Error ? error.message : "invalid terminal TaskSpec target",
    });
    return;
  }
  if (stableJson(resolution.taskGraph) !== stableJson(canonicalGraph)) {
    context.addIssue({code: "custom", path: ["taskGraph"], message: "task graph does not match canonical target closure"});
  }
  const productTargets = resolution.workProducts.flatMap((product) => targetTasksByProduct[product] ?? []);
  const expectedTargets = uniqueSorted([...resolution.preservedSpecialistTaskIds, ...productTargets]);
  if (stableJson(resolution.targetTaskIds) !== stableJson(expectedTargets)) {
    context.addIssue({code: "custom", path: ["targetTaskIds"], message: "targets do not match terminal and preserved specialist bindings"});
  }
  if (resolution.workProducts.some((product) => targetTasksByProduct[product] === null)) {
    context.addIssue({code: "custom", path: ["workProducts"], message: "planning-only terminal cannot be resolved as executable"});
  }
  const policies = resolution.workProducts
    .map((product) => audiencePolicyByProduct.get(product))
    .filter((policy): policy is ReadonlySet<TerminalAudience> => policy !== undefined);
  if (requiresAudienceConfirmation(resolution.workProducts, resolution.audience)) {
    if (resolution.audience === "unknown") {
      context.addIssue({code: "custom", path: ["audience"], message: "audience-shaped terminal lacks an exact audience"});
    } else if (policies.some((policy) => !policy.has(resolution.audience))) {
      context.addIssue({code: "custom", path: ["audience"], message: "audience is incompatible with terminal work product"});
    }
  }
  const bindingState = validateResolvedArtifactBindings(resolution.continuity, resolution.deliverables, resolution.artifactBindings);
  if (bindingState !== "valid") {
    context.addIssue({code: "custom", path: ["artifactBindings"], message: `resolved artifact bindings are ${bindingState}`});
  }
});
export type OutputTerminalResolution = z.infer<typeof outputTerminalResolutionStructuralSchema>;

declare const trustedOutputTerminalResolutionBrand: unique symbol;
export type TrustedOutputTerminalResolution = Extract<OutputTerminalResolution, {status: "resolved"}> & {
  readonly [trustedOutputTerminalResolutionBrand]: true;
};

const defaultProductByTerminal: Record<ObjectiveOutputTerminal, TerminalWorkProduct | null> = {
  cited_answer: "cited_answer", risk_matrix: "risk_matrix", meeting_brief: "meeting_brief",
  board_decision_pack: "board_decision_pack", preliminary_case: "preliminary_case",
  capital_shortlist: "capital_shortlist", operation_review: "operation_review",
  capital_alternative_map: "capital_alternative_map", reviewable_material: null,
  source_index: "source_index", market_map: "market_map", monitoring_setup: "monitoring_setup",
  workspace_change_preview: "workspace_change_preview", corrigible_scope: null,
};

/** null means planning is allowed but an exact terminal TaskSpec is not yet available. */
const targetTasksByProduct: Record<TerminalWorkProduct, readonly string[] | null> = {
  cited_answer: null, risk_matrix: ["C09"], meeting_brief: ["M07", "S11", "K04"],
  board_decision_pack: ["A02"], preliminary_case: ["S11"], capital_shortlist: ["K09"],
  operation_review: ["S10"], capital_alternative_map: ["S11"], financial_model: ["A05"],
  indicative_term_sheet: ["A06"], teaser: ["A03"], lender_memo: ["A04"], presentation_deck: null,
  source_index: ["D02"], market_map: ["K04"], monitoring_setup: null, workspace_change_preview: null,
};

const defaultFormatByProduct: Record<TerminalWorkProduct, TerminalDeliveryFormat> = {
  cited_answer: "chat", risk_matrix: "workbench", meeting_brief: "workbench",
  board_decision_pack: "workbench", preliminary_case: "workbench", capital_shortlist: "workbench",
  operation_review: "workbench", capital_alternative_map: "workbench", financial_model: "xlsx",
  indicative_term_sheet: "docx", teaser: "pptx", lender_memo: "docx", presentation_deck: "pptx",
  source_index: "workbench", market_map: "workbench", monitoring_setup: "workbench",
  workspace_change_preview: "workbench",
};

const compatibleFormats: Record<TerminalWorkProduct, ReadonlySet<TerminalDeliveryFormat>> = {
  cited_answer: new Set(["chat"]), risk_matrix: new Set(["workbench", "xlsx", "docx", "pdf"]),
  meeting_brief: new Set(["workbench", "docx", "pdf"]), board_decision_pack: new Set(["workbench", "pptx", "pdf"]),
  preliminary_case: new Set(["workbench", "docx", "pdf"]), capital_shortlist: new Set(["workbench", "xlsx", "pdf"]),
  operation_review: new Set(["workbench", "docx", "pdf"]), capital_alternative_map: new Set(["workbench", "xlsx", "pptx", "pdf"]),
  financial_model: new Set(["xlsx"]), indicative_term_sheet: new Set(["docx", "pdf"]),
  teaser: new Set(["pptx", "pdf"]), lender_memo: new Set(["docx", "pdf"]), presentation_deck: new Set(["pptx", "pdf"]),
  source_index: new Set(["workbench", "xlsx", "pdf"]), market_map: new Set(["workbench", "xlsx", "pdf"]),
  monitoring_setup: new Set(["workbench"]), workspace_change_preview: new Set(["workbench"]),
};

const audiencePolicyByProduct = new Map<TerminalWorkProduct, ReadonlySet<TerminalAudience>>([
  ["meeting_brief", new Set(["requester", "internal_team", "senior_sponsor", "executive_management", "company"])],
  ["board_decision_pack", new Set(["executive_management", "board"])],
  ["capital_shortlist", new Set(["requester", "internal_team", "senior_sponsor", "executive_management", "company"])],
  ["indicative_term_sheet", new Set(["requester", "internal_team", "senior_sponsor", "company", "investor", "lender", "market_participant"])],
  ["teaser", new Set(["company", "investor", "lender", "market_participant"])],
  ["lender_memo", new Set(["company", "investor", "lender"])],
  ["presentation_deck", new Set(["senior_sponsor", "executive_management", "credit_committee", "board", "company", "investor", "lender", "market_participant"])],
]);
const audiencesRequiringConfirmation = new Set<TerminalAudience>([
  "senior_sponsor", "executive_management", "credit_committee", "board",
  "company", "investor", "lender", "market_participant",
]);
const highEffortProducts = new Set<TerminalWorkProduct>([
  "financial_model", "indicative_term_sheet", "teaser", "lender_memo", "presentation_deck",
]);
const unavailableBaseContexts = new Set([
  "public_source_collection_executor", "monitoring_executor", "authorized_workspace_action",
]);

/**
 * Resolves a terminal structurally, but emits an executable trusted result only when the exact
 * request is jointly covered by an opaque in-process authorization. No string reference, payload
 * digest, self-consistent plan, or caller-authored artifact binding grants authority.
 */
export function resolveOutputTerminal(
  raw: OutputTerminalRequest,
  authorization?: OutputTerminalAuthorization,
): OutputTerminalResolution {
  const parsed = outputTerminalRequestSchema.parse(raw);
  const authorizationReceipt = authorization ? trustedTerminalAuthorizations.get(authorization) : undefined;
  let planReceipt: ReturnType<typeof assertTrustedObjectivePlan> | null = null;
  try {
    planReceipt = assertTrustedObjectivePlan(raw.basePlan);
  } catch {
    // A structurally valid serialized/reconstructed plan is still not compiler-attested.
  }
  const input = planReceipt ? {...parsed, basePlan: planReceipt.planSnapshot} : parsed;
  const workProducts = terminalProducts(input);
  const deliverables = normalizedDeliverables(input, workProducts);
  const formats = uniqueSorted(deliverables.map(({format}) => format));
  const preservedSpecialistTaskIds = planReceipt ? [...planReceipt.specialistTaskIds] : [];

  if (!planReceipt) {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "base_plan_untrusted", ["base_plan_context"], planningForOrDefault(deliverables, "awaiting_context", "base plan lacks an opaque compiler attestation"));
  }

  if (authorization && (!authorizationReceipt || !authorizationMatches(
    authorizationReceipt, raw, input, workProducts, deliverables, planReceipt,
  ))) {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "execution_authorization_mismatch", ["explicit_confirmation"], planningForOrDefault(deliverables, "awaiting_confirmation", "execution attestation does not cover the exact plan, terminal, audience, specialist targets and revision bindings"));
  }

  if (workProducts.length === 0) {
    return pending(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "material_kind_required", ["material_kind"], [descriptor(null, null, "awaiting_selection", "exact work product required")]);
  }

  const incompatibleFormat = deliverables.some(({workProduct, format}) =>
    !workProducts.includes(workProduct) || !compatibleFormats[workProduct].has(format))
    || workProducts.some((product) => !deliverables.some(({workProduct}) => workProduct === product));
  if (incompatibleFormat) {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "incompatible_format", ["compatible_format"], planningFor(deliverables, "incompatible_binding", "work product and delivery format are incompatible"));
  }

  const unavailableContext = input.basePlan.requiredContext.find((item) => unavailableBaseContexts.has(item));
  if (unavailableContext || input.basePlan.outputTerminal === "monitoring_setup" || input.basePlan.outputTerminal === "workspace_change_preview") {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "base_plan_capability_unavailable", ["base_plan_context"], planningFor(deliverables, "awaiting_context", `base capability unavailable: ${unavailableContext ?? input.basePlan.outputTerminal}`));
  }
  if (input.basePlan.mode === "collect_context" || input.basePlan.mode === "coverage_gap" || input.basePlan.requiredContext.length > 0) {
    return pending(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "base_plan_context_required", ["base_plan_context"], planningFor(deliverables, "awaiting_context", `base context required: ${input.basePlan.requiredContext.join(", ") || input.basePlan.mode}`));
  }

  const selectionRequired = input.workProducts.state === "explicit" || input.formats.state === "explicit"
    || workProducts.some((product) => highEffortProducts.has(product));
  if (!authorizationReceipt || (selectionRequired && !authorizationReceipt.selectionConfirmed)) {
    return pending(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "terminal_inferred_confirmation_required", ["explicit_confirmation"], planningFor(deliverables, "awaiting_confirmation", "terminal selection lacks an exact opaque control-plane attestation"));
  }

  if (workProducts.some((product) => targetTasksByProduct[product] === null)) {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "terminal_task_unavailable", ["terminal_capability"], planningFor(deliverables, "terminal_task_unavailable", "exact terminal TaskSpec is not available; descriptor is planning-only"));
  }

  const artifactBindingState = validateArtifactBindings(input, deliverables, authorizationReceipt.artifactBindings);
  if (artifactBindingState === "missing") {
    return pending(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "revision_target_required", ["revision_target"], planningFor(deliverables, "awaiting_artifact_binding", "revision requires a trusted version-pinned artifact binding per deliverable"));
  }
  if (artifactBindingState === "incompatible") {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "revision_target_incompatible", ["revision_target"], planningFor(deliverables, "incompatible_binding", "trusted artifact bindings do not match the exact revision deliverables"));
  }

  const policies = workProducts.map((product) => audiencePolicyByProduct.get(product))
    .filter((policy): policy is ReadonlySet<TerminalAudience> => policy !== undefined);
  const audienceConfirmationRequired = requiresAudienceConfirmation(workProducts, input.audience.value);
  if (audienceConfirmationRequired) {
    if (input.audience.state !== "explicit" || input.audience.value === "unknown" || !authorizationReceipt.audienceConfirmed) {
      return pending(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
        "audience_required", ["audience"], planningFor(deliverables, "awaiting_audience", "audience-shaped deliverable requires an explicit opaque audience attestation"));
    }
    if (policies.some((policy) => !policy.has(input.audience.value))) {
      return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
        "incompatible_audience", ["audience"], planningFor(deliverables, "incompatible_binding", "audience is incompatible with one or more requested deliverables"));
    }
  }

  const targets = uniqueSorted([
    ...preservedSpecialistTaskIds,
    ...workProducts.flatMap((product) => targetTasksByProduct[product] ?? []),
  ]);
  if (targets.length === 0) {
    return blocked(input, workProducts, formats, deliverables, preservedSpecialistTaskIds,
      "terminal_task_unavailable", ["terminal_capability"], planningFor(deliverables, "terminal_task_unavailable", "terminal has no executable TaskSpec binding"));
  }
  const result = resolved(input, workProducts, formats, deliverables, preservedSpecialistTaskIds, targets,
    input.continuity.value === "revise" ? [...authorizationReceipt.artifactBindings] : [], authorizationReceipt.authorizationId);
  trustedTerminalResolutions.set(result, authorizationReceipt);
  return result;
}

/** Fails closed unless `resolution` is the exact frozen object issued by the trusted resolver. */
export function assertTrustedOutputTerminalResolution(
  resolution: OutputTerminalResolution,
): TrustedOutputTerminalResolution {
  if (resolution.status !== "resolved" || !trustedTerminalResolutions.has(resolution)) {
    throw new Error("output terminal resolution lacks an opaque trusted execution attestation");
  }
  return resolution as TrustedOutputTerminalResolution;
}

/**
 * Revalidates a serialized copy captured inside the same live process by recomputing it from the
 * original opaque plan and authorization witnesses. This is deliberately not a persistence or
 * cross-process verifier: serialization destroys both witnesses and the durable adapter does not
 * exist yet. Structural parsing alone is insufficient even if an attacker recomputes SHA-256.
 */
export function revalidateSameProcessOutputTerminalResolution(input: {
  serializedResolution: unknown;
  request: OutputTerminalRequest;
  authorization: OutputTerminalAuthorization;
}): TrustedOutputTerminalResolution {
  const serialized = outputTerminalResolutionStructuralSchema.parse(input.serializedResolution);
  const recomputed = resolveOutputTerminal(input.request, input.authorization);
  if (recomputed.status !== "resolved" || stableJson(serialized) !== stableJson(recomputed)) {
    throw new Error("serialized output terminal resolution does not match its same-process trusted witness");
  }
  return assertTrustedOutputTerminalResolution(recomputed);
}

function authorizationMatches(
  receipt: TrustedTerminalAuthorizationReceipt,
  raw: OutputTerminalRequest,
  input: OutputTerminalRequest,
  workProducts: readonly TerminalWorkProduct[],
  deliverables: readonly TerminalDeliverable[],
  planReceipt: ReturnType<typeof assertTrustedObjectivePlan>,
): boolean {
  return raw.basePlan === receipt.basePlanHandle
    && stableJson(input.basePlan) === stableJson(receipt.basePlanSnapshot)
    && receipt.basePlanIdentity === input.basePlan.structuralIdentity
    && receipt.specialistManifestVersion === planReceipt.specialistManifestVersion
    && stableJson(receipt.specialistTaskIds) === stableJson(planReceipt.specialistTaskIds)
    && stableJson(receipt.workProducts) === stableJson(workProducts)
    && stableJson(receipt.deliverables) === stableJson(deliverables)
    && receipt.audience === input.audience.value
    && receipt.continuity === input.continuity.value
    && stableJson(receipt.requestSnapshot) === stableJson(input);
}

function terminalProducts(input: OutputTerminalRequest): TerminalWorkProduct[] {
  const fallback = defaultProductByTerminal[input.basePlan.outputTerminal];
  return uniqueSorted(input.workProducts.value.length > 0 ? input.workProducts.value : fallback ? [fallback] : []);
}

function requiresAudienceConfirmation(workProducts: readonly TerminalWorkProduct[], audience: TerminalAudience): boolean {
  return audiencesRequiringConfirmation.has(audience)
    || workProducts.some((product) => audiencePolicyByProduct.has(product));
}

function normalizedDeliverables(input: OutputTerminalRequest, products: readonly TerminalWorkProduct[]): TerminalDeliverable[] {
  return uniqueDeliverables(input.formats.value.length > 0
    ? input.formats.value
    : products.map((workProduct) => ({workProduct, format: defaultFormatByProduct[workProduct]})));
}

function validateArtifactBindings(
  input: OutputTerminalRequest,
  deliverables: readonly TerminalDeliverable[],
  bindings: readonly ResolvedTerminalArtifactBinding[],
): "valid" | "missing" | "incompatible" {
  if (input.continuity.value === "revise" && input.continuity.state !== "explicit") return "missing";
  return validateResolvedArtifactBindings(input.continuity.value, deliverables, bindings);
}

function validateNormalizedResolution(
  resolution: z.infer<typeof resolvedResolutionSchema> | z.infer<typeof pendingResolutionSchema> | z.infer<typeof blockedResolutionSchema>,
  context: z.RefinementCtx,
) {
  if (stableJson(resolution.workProducts) !== stableJson(uniqueSorted(resolution.workProducts))) {
    context.addIssue({code: "custom", path: ["workProducts"], message: "work products must be unique and sorted"});
  }
  if (stableJson(resolution.deliverables) !== stableJson(uniqueDeliverables(resolution.deliverables))) {
    context.addIssue({code: "custom", path: ["deliverables"], message: "deliverables must be unique and sorted"});
  }
  if (stableJson(resolution.formats) !== stableJson(uniqueSorted(resolution.deliverables.map(({format}) => format)))) {
    context.addIssue({code: "custom", path: ["formats"], message: "formats do not match deliverable bindings"});
  }
  const products = uniqueSorted(resolution.deliverables.map(({workProduct}) => workProduct));
  if (resolution.deliverables.length > 0 && stableJson(resolution.workProducts) !== stableJson(products)) {
    context.addIssue({code: "custom", path: ["deliverables"], message: "deliverables do not cover exactly the selected work products"});
  }
  if (stableJson(resolution.preservedSpecialistTaskIds) !== stableJson(uniqueSorted(resolution.preservedSpecialistTaskIds))) {
    context.addIssue({code: "custom", path: ["preservedSpecialistTaskIds"], message: "preserved specialist targets must be unique and sorted"});
  }
  const incompatible = resolution.deliverables.some(({workProduct, format}) => !compatibleFormats[workProduct].has(format));
  if (incompatible && !(resolution.status === "blocked" && resolution.reason === "incompatible_format")) {
    context.addIssue({code: "custom", path: ["deliverables"], message: "deliverable contains an incompatible format"});
  }
  if (resolution.status !== "resolved") {
    if (resolution.artifactBindings.length > 0 || resolution.authorizationReceiptId !== null) {
      context.addIssue({code: "custom", path: ["artifactBindings"], message: "non-resolved terminal cannot carry execution authority"});
    }
    const expected = expectedPendingPolicy(resolution.reason);
    if (stableJson(resolution.materialGaps) !== stableJson([expected.gap])) {
      context.addIssue({code: "custom", path: ["materialGaps"], message: "material gap does not match resolution reason"});
    }
    if (resolution.planningDescriptors.some(({state}) => state !== expected.state)) {
      context.addIssue({code: "custom", path: ["planningDescriptors"], message: "planning descriptor does not match resolution reason"});
    }
  }
}

function resolved(
  input: OutputTerminalRequest,
  workProducts: TerminalWorkProduct[], formats: TerminalDeliveryFormat[], deliverables: TerminalDeliverable[],
  preservedSpecialistTaskIds: string[], targetTaskIds: string[], artifactBindings: ResolvedTerminalArtifactBinding[],
  authorizationReceiptId: string,
): OutputTerminalResolution {
  return parseWithFingerprint({
    schemaVersion: "output-terminal-resolution.v2" as const, status: "resolved" as const,
    reason: "terminal_resolved" as const, authorizationReceiptId,
    basePlanIdentity: input.basePlan.structuralIdentity, workProducts, formats, deliverables,
    audience: input.audience.value, continuity: input.continuity.value,
    artifactBindings: uniqueArtifactBindings(artifactBindings), preservedSpecialistTaskIds,
    targetTaskIds, taskGraph: compileTaskGraph(targetTaskIds), materialGaps: [], planningDescriptors: [],
  });
}

function validateResolvedArtifactBindings(
  continuity: z.infer<typeof terminalContinuitySchema>, deliverables: readonly TerminalDeliverable[],
  bindings: readonly ResolvedTerminalArtifactBinding[],
): "valid" | "missing" | "incompatible" {
  if (continuity !== "revise") return bindings.length === 0 ? "valid" : "incompatible";
  if (bindings.length === 0) return "missing";
  const expected = deliverables.map(deliverableKey).sort();
  const actual = bindings.map(deliverableKey).sort();
  if (new Set(actual).size !== actual.length || actual.some((key) => !expected.includes(key))) return "incompatible";
  if (new Set(bindings.map(({organizationId}) => organizationId)).size !== 1
    || new Set(bindings.map(({projectId}) => projectId)).size !== 1
    || new Set(bindings.map(({artifactId}) => artifactId)).size !== bindings.length) return "incompatible";
  return actual.length < expected.length ? "missing" : stableJson(actual) === stableJson(expected) ? "valid" : "incompatible";
}

function expectedPendingPolicy(
  reason: z.infer<typeof pendingResolutionSchema>["reason"] | z.infer<typeof blockedResolutionSchema>["reason"],
): {gap: z.infer<typeof materialGapSchema>; state: z.infer<typeof planningStateSchema>} {
  switch (reason) {
    case "material_kind_required": return {gap: "material_kind", state: "awaiting_selection"};
    case "terminal_inferred_confirmation_required":
    case "execution_authorization_mismatch": return {gap: "explicit_confirmation", state: "awaiting_confirmation"};
    case "audience_required": return {gap: "audience", state: "awaiting_audience"};
    case "revision_target_required": return {gap: "revision_target", state: "awaiting_artifact_binding"};
    case "base_plan_context_required":
    case "base_plan_untrusted":
    case "base_plan_capability_unavailable": return {gap: "base_plan_context", state: "awaiting_context"};
    case "incompatible_format": return {gap: "compatible_format", state: "incompatible_binding"};
    case "incompatible_audience":
    case "revision_target_incompatible": return {gap: reason === "incompatible_audience" ? "audience" : "revision_target", state: "incompatible_binding"};
    case "terminal_task_unavailable": return {gap: "terminal_capability", state: "terminal_task_unavailable"};
  }
}

function pending(
  input: OutputTerminalRequest,
  workProducts: TerminalWorkProduct[], formats: TerminalDeliveryFormat[], deliverables: TerminalDeliverable[],
  preservedSpecialistTaskIds: string[], reason: z.infer<typeof pendingResolutionSchema>["reason"],
  materialGaps: Array<z.infer<typeof materialGapSchema>>,
  planningDescriptors: Array<z.infer<typeof terminalPlanningDescriptorSchema>>,
): OutputTerminalResolution {
  return parseWithFingerprint({
    schemaVersion: "output-terminal-resolution.v2" as const, status: "needs_confirmation" as const,
    reason, authorizationReceiptId: null, basePlanIdentity: input.basePlan.structuralIdentity,
    workProducts, formats, deliverables, audience: input.audience.value, continuity: input.continuity.value,
    artifactBindings: [], preservedSpecialistTaskIds, materialGaps, planningDescriptors,
  });
}

function blocked(
  input: OutputTerminalRequest,
  workProducts: TerminalWorkProduct[], formats: TerminalDeliveryFormat[], deliverables: TerminalDeliverable[],
  preservedSpecialistTaskIds: string[], reason: z.infer<typeof blockedResolutionSchema>["reason"],
  materialGaps: Array<z.infer<typeof materialGapSchema>>,
  planningDescriptors: Array<z.infer<typeof terminalPlanningDescriptorSchema>>,
): OutputTerminalResolution {
  return parseWithFingerprint({
    schemaVersion: "output-terminal-resolution.v2" as const, status: "blocked" as const,
    reason, authorizationReceiptId: null, basePlanIdentity: input.basePlan.structuralIdentity,
    workProducts, formats, deliverables, audience: input.audience.value, continuity: input.continuity.value,
    artifactBindings: [], preservedSpecialistTaskIds, materialGaps, planningDescriptors,
  });
}

function parseWithFingerprint(core: Record<string, unknown>): OutputTerminalResolution {
  return deepFreeze(outputTerminalResolutionStructuralSchema.parse({...core, fingerprint: fingerprintOf(core)}));
}

function descriptor(
  workProduct: TerminalWorkProduct | null, format: TerminalDeliveryFormat | null,
  state: z.infer<typeof planningStateSchema>, detail: string,
) {
  return {workProduct, format, state, detail};
}

function planningFor(deliverables: readonly TerminalDeliverable[], state: z.infer<typeof planningStateSchema>, detail: string) {
  return deliverables.map(({workProduct, format}) => descriptor(workProduct, format, state, detail));
}

function planningForOrDefault(deliverables: readonly TerminalDeliverable[], state: z.infer<typeof planningStateSchema>, detail: string) {
  return deliverables.length > 0 ? planningFor(deliverables, state, detail) : [descriptor(null, null, state, detail)];
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function uniqueDeliverables(values: readonly TerminalDeliverable[]): TerminalDeliverable[] {
  const byKey = new Map(values.map((value) => [deliverableKey(value), {...value}]));
  return [...byKey.values()].sort((left, right) => deliverableKey(left).localeCompare(deliverableKey(right)));
}

function uniqueArtifactBindings(values: readonly ResolvedTerminalArtifactBinding[]): ResolvedTerminalArtifactBinding[] {
  return [...values].sort((left, right) => artifactBindingKey(left).localeCompare(artifactBindingKey(right)));
}

function deliverableKey(value: {workProduct: TerminalWorkProduct; format: TerminalDeliveryFormat}): string {
  return `${value.workProduct}:${value.format}`;
}

function artifactBindingKey(value: ResolvedTerminalArtifactBinding): string {
  return `${deliverableKey(value)}:${value.organizationId}:${value.projectId}:${value.artifactId}:${value.artifactVersionId}`;
}

function fingerprintOf(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => nested && typeof nested === "object" && !Array.isArray(nested)
    ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : nested);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
