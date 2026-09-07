import {
  INTENT_CLASSIFIER_SYSTEM,
  SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
  applySemanticObjectCompilation,
  buildSemanticObjectExtractorInput,
  buildIntentClassifierInput,
  canonicalizeIntentClassifierOutput,
  compileSemanticObjects,
  intentClassifierOutputSchema,
  intentEnvelopeSchema,
  semanticObjectExtractorOutputSchema,
  validateSemanticObjectOutput,
  compositionPolicy,
  authorityGrantSchema,
  type ActiveWorkContext,
  type AuthorityGrant,
  type IntentEnvelope,
  type IntentClassifierOutput,
  type SemanticObjectCompilation,
  type SemanticObjectExtractorOutput,
} from "@offroad/agent-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {fingerprintJson} from "@offroad/case-understanding";

import {governedModelRoute, safeModelTurnTelemetry, safeSuccessfulModelCall} from "./model-call-log";

/**
 * Shadow routing. The classifier reads a turn and writes an Intent Envelope beside the
 * production route without touching it. Nothing here decides anything: the envelope is stored
 * so that, turn by turn, we can measure whether it recognises composite intent, corrects itself
 * and abstains, before it is ever allowed to route. The production router stays untouched.
 *
 * The model fills only the routing core and the inferable execution fields. Evidence regime,
 * authority, organization, project and documents come from the job's context and are stamped
 * as system fields after the model has answered.
 */
// Compatibility exports for the preview router. Runtime and evals now consume one canonical
// contract from agent-contracts, so a prompt or schema change cannot bypass the gold gate.
export const shadowRoutingOutputSchema = intentClassifierOutputSchema;
export type ShadowRoutingOutput = IntentClassifierOutput;
export const SHADOW_ROUTING_SYSTEM = INTENT_CLASSIFIER_SYSTEM;

export type ShadowRoutingContext = {
  locale: "pt-BR" | "en-US";
  message: string;
  recentMessages: Array<{role: string; content: string}>;
  organizationId: string;
  projectId: string | null;
  entryJob: string | null;
  accessBasis: "public_information" | "authorized_private" | null;
  /** Granted by the control plane for this turn. Project membership is not a grant. */
  authorityGrants: readonly AuthorityGrant[];
  documentIds: string[];
  professionalContext: {useForms: string[]; professionalRoles: string[]; practiceAreas: string[]; primaryObjectives: string[]} | null;
  /** Governed work memory. Assistant prose and profile inference may never populate this object. */
  activeWorkContext?: ActiveWorkContext | null;
  /** Independent control-plane binding used to reject a structurally valid but stale context. */
  activeWorkContextBinding?: {
    objectiveId: string;
    objectiveRevision: number;
    objectiveFingerprint: string;
    sourceManifestId: string;
    sourceManifestFingerprint: string;
    /** Control-plane allowlist, independent from the model-visible context payload. */
    sourceManifestDocumentIds: string[];
    sourceManifestEvidenceObjectIds: string[];
    sourceManifestMembershipFingerprint: string;
    /** Per-object allowlist authored by the control plane, never by the extractor. */
    activeWorkObjectBindings: Array<{id: string; fingerprint: string}>;
  } | null;
};

export function activeWorkSourceManifestMembershipFingerprint(manifest: {
  id: string;
  documentIds: readonly string[];
  evidenceObjectIds: readonly string[];
}): string {
  return fingerprintJson({
    schemaVersion: "active-work-source-membership.v1",
    sourceManifestId: manifest.id,
    documentIds: [...manifest.documentIds].sort(),
    evidenceObjectIds: [...manifest.evidenceObjectIds].sort(),
  });
}

export function activeWorkObjectFingerprint(object: ActiveWorkContext["objects"][number]): string {
  return fingerprintJson({
    schemaVersion: "active-work-object-binding.v1",
    id: object.id,
    ordinal: object.ordinal,
    kind: object.kind,
    slots: [...object.slots].sort((left, right) => `${left.key}:${left.value}`.localeCompare(`${right.key}:${right.value}`)),
    label: object.label,
    governance: {
      state: object.governance.state,
      sourceIds: [...object.governance.sourceIds].sort(),
    },
  });
}

export function activeWorkObjectBindings(objects: ActiveWorkContext["objects"]): Array<{id: string; fingerprint: string}> {
  return objects.map((object) => ({id: object.id, fingerprint: activeWorkObjectFingerprint(object)}))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function governedShadowAccessBasis(value: string | null | undefined): ShadowRoutingContext["accessBasis"] {
  if (value === "public_information" || value === "authorized_private") return value;
  return null;
}

function evidenceRegime(accessBasis: ShadowRoutingContext["accessBasis"]): "unresolved" | "public" | "private_authorized" {
  if (accessBasis === "public_information") return "public";
  if (accessBasis === "authorized_private") return "private_authorized";
  return "unresolved";
}

const asSystemOrInferred = <T>(field: {value: T; state: string; confidence?: number | null | undefined; basis?: string | null | undefined}) => ({
  value: field.value,
  state: field.state as "explicit" | "inferred" | "ambiguous" | "unknown" | "not_applicable",
  // An inferred field the model left without a confidence is recorded at even odds, never as certain.
  ...(field.state === "inferred" || field.state === "ambiguous" ? {confidence: field.confidence ?? 0.5} : {}),
  ...(field.basis ? {basis: field.basis} : {}),
});

/** Stamps the system fields around a classifier output: the model never writes them. */
const clampText = (value: string, max: number) => value.trim().slice(0, max);
const clampList = <T>(values: T[], max: number) => values.slice(0, max);
const clampField = <T, U>(field: {value: T; state: string; confidence?: number | null | undefined; basis?: string | null | undefined}, map: (value: T) => U) => ({...field, value: map(field.value), ...(field.basis ? {basis: clampText(field.basis, 300)} : {})});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const decisionLabel = {
  none: null,
  capital: "capital decision",
  credit: "credit decision",
  material: "material decision",
  market: "market decision",
  external: "external action decision",
  workflow: "workflow decision",
  document: "document decision",
} as const;
const audienceLabel = {
  self: "requester",
  internal_senior: "internal senior",
  company_management: "company management",
  board_or_committee: "board or committee",
  capital_provider: "capital provider",
  market: "market",
  unspecified: "unspecified",
} as const;

/** Stamps the system fields around a classifier output and clamps every value to the envelope contract; the model never writes the system fields. */
export function stampIntentEnvelope(output: ShadowRoutingOutput, context: ShadowRoutingContext, now: () => Date = () => new Date()): IntentEnvelope {
  const core = output.routingCore;
  const ctx = output.inferableContext;
  return intentEnvelopeSchema.parse({
    schemaVersion: "intent-envelope.v1",
    routingCore: {
      action: asSystemOrInferred(clampField(core.action, (items) => clampList(items.map((item) => clampText(item, 60)).filter(Boolean), 8))),
      object: asSystemOrInferred(clampField(core.object, (items) => items.map((item) => ({
        kind: item.kind,
        ...(item.slots.length ? {reference: clampText(item.slots.map(({key, value}) => `${key}:${value}`).join("; "), 200)} : {}),
      })))),
      desiredOutcome: asSystemOrInferred({value: output.composition ? compositionPolicy(output.composition).classifierGuidance : "clarify request", state: "inferred", confidence: 0.99, basis: "deterministic composition renderer"}),
      decision: asSystemOrInferred({...core.decisionType, value: decisionLabel[core.decisionType.value]}),
      audience: asSystemOrInferred({...core.audienceType, value: [audienceLabel[core.audienceType.value]]}),
      depth: asSystemOrInferred(core.depth),
      continuity: asSystemOrInferred(core.continuity),
      workResponsibility: asSystemOrInferred(clampField(core.workResponsibility, (items) => clampList([...new Set(items)], 4))),
    },
    executionContext: {
      evidenceRegime: {value: evidenceRegime(context.accessBasis), state: "system"},
      authority: {value: [...new Set(context.authorityGrants.map((grant) => authorityGrantSchema.parse(grant)))], state: "system"},
      organizationId: {value: context.organizationId, state: "system"},
      projectId: {value: context.projectId, state: "system"},
      availableDocumentIds: {value: context.documentIds.slice(0, 500), state: "system"},
      jurisdiction: asSystemOrInferred(clampField(ctx.jurisdiction, (items) => clampList(items.map((item) => clampText(item, 8)).filter((item) => item.length >= 2), 4))),
      // A date the model wrote in another form is unknown, never a guess.
      asOfDate: asSystemOrInferred(ctx.asOfDate.value && ISO_DATE.test(ctx.asOfDate.value) ? ctx.asOfDate : {...ctx.asOfDate, value: null, state: "unknown"}),
      currency: asSystemOrInferred(ctx.currency.value && /^[A-Z]{3}$/.test(ctx.currency.value.trim().toUpperCase()) ? {...ctx.currency, value: ctx.currency.value.trim().toUpperCase()} : {...ctx.currency, value: null, state: "unknown"}),
      deadline: asSystemOrInferred(clampField(ctx.deadline, (value) => (value === null ? null : clampText(value, 80)))),
      sponsorInstruction: asSystemOrInferred(clampField(ctx.sponsorInstruction, (value) => (value === null ? null : clampText(value, 500)))),
      constraints: asSystemOrInferred(clampField(ctx.constraints, (items) => clampList(items.map((item) => clampText(item, 200)).filter(Boolean), 20))),
      language: {value: context.locale, state: "system"},
      urgency: asSystemOrInferred(ctx.urgency),
      availableInputs: asSystemOrInferred(clampField(ctx.availableInputs, (items) => clampList(items.map((item) => clampText(item, 120)).filter(Boolean), 40))),
    },
    primaryWorks: clampList(output.primaryWorks, 3),
    composition: output.composition,
    effect: output.composition === null ? "none" : compositionPolicy(output.composition).effect,
    createdAt: now().toISOString(),
  });
}

/** Runs the classifier and stamps the system fields. Throws only on model or schema failure. */
export async function shadowIntentEnvelope(input: {
  gateway: ModelGateway;
  context: ShadowRoutingContext;
  now?: () => Date;
}): Promise<{
  envelope: IntentEnvelope;
  output: ShadowRoutingOutput;
  rawIntentOutput: ShadowRoutingOutput;
  routingAttempt: ReturnType<typeof safeSuccessfulModelCall>;
  semanticObjects: {
    rawOutput: SemanticObjectExtractorOutput;
    compilation: SemanticObjectCompilation;
    modelRoute: typeof governedModelRoute;
    successfulAttempt: {costUsd: number; latencyMs: number};
    attemptCount: number;
    routingAttempt: ReturnType<typeof safeSuccessfulModelCall>;
  };
  modelRoute: typeof governedModelRoute;
  costUsd: number;
  calls: number;
  latencyMs: number;
}> {
  const {context} = input;
  const activeWorkContext = validateActiveWorkContextBinding(context);
  const spentBefore = input.gateway.spent();
  const startedAt = Date.now();
  const userConversation = context.recentMessages
    .filter((message): message is {role: "user" | "assistant"; content: string} => message.role === "user" || message.role === "assistant")
    .slice(-8);
  const classifierInput = buildIntentClassifierInput({
    locale: context.locale,
    latestUserMessage: context.message,
    recentConversation: userConversation,
    entryJob: context.entryJob,
    documentCount: context.documentIds.length,
    professionalContext: context.professionalContext,
  });
  const objectInput = buildSemanticObjectExtractorInput({
    locale: context.locale,
    latestUserMessage: context.message,
    recentConversation: userConversation,
    activeWorkContext,
  });
  const [intentCompletion, objectCompletion] = await Promise.all([
    input.gateway.complete({
      task: "route_intent",
      system: SHADOW_ROUTING_SYSTEM,
      input: [{type: "text", text: JSON.stringify(classifierInput)}],
      schema: shadowRoutingOutputSchema,
      schemaName: "shadow_routing_output",
      // The envelope schema is too large for the provider's compiled grammar; the schema travels in the prompt.
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {surface: "shadow_router"},
    }),
    input.gateway.complete({
      task: "extract_semantic_objects",
      system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
      input: [{type: "text", text: JSON.stringify(objectInput)}],
      schema: semanticObjectExtractorOutputSchema,
      schemaName: "semantic_object_extractor_output",
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {surface: "shadow_semantic_object_extractor"},
      validateOutput: (output) => validateSemanticObjectOutput(objectInput, output),
    }),
  ]);
  const compilation = compileSemanticObjects(objectInput, objectCompletion.output);
  const compiledIntent = applySemanticObjectCompilation(intentCompletion.output, compilation);
  const output = canonicalizeIntentClassifierOutput(compiledIntent, classifierInput);
  const envelope = stampIntentEnvelope(output, context, input.now);
  const telemetry = safeModelTurnTelemetry(spentBefore, input.gateway.spent(), Date.now() - startedAt);
  return {
    envelope,
    output,
    rawIntentOutput: intentCompletion.output,
    routingAttempt: safeSuccessfulModelCall(intentCompletion),
    semanticObjects: {
      rawOutput: objectCompletion.output,
      compilation,
      modelRoute: governedModelRoute,
      successfulAttempt: {costUsd: objectCompletion.costUsd, latencyMs: objectCompletion.latencyMs},
      attemptCount: objectCompletion.attempts.length,
      routingAttempt: safeSuccessfulModelCall(objectCompletion),
    },
    modelRoute: governedModelRoute,
    ...telemetry,
  };
}

/**
 * The active-work registry is accepted only when its tenant, project and source manifest agree
 * with this capability-scoped turn. A caller cannot smuggle an object from another project by
 * presenting a structurally valid context object.
 */
export function validateActiveWorkContextBinding(context: ShadowRoutingContext): ActiveWorkContext | null {
  if (!context.activeWorkContext) return null;
  const active = context.activeWorkContext;
  if (active.organizationId !== context.organizationId || active.projectId !== context.projectId) {
    throw new Error("active_work_context_scope_mismatch");
  }
  const binding = context.activeWorkContextBinding;
  if (!binding
    || active.objective.id !== binding.objectiveId
    || active.objective.revision !== binding.objectiveRevision
    || active.objective.fingerprint !== binding.objectiveFingerprint
    || active.sourceManifest.id !== binding.sourceManifestId
    || active.sourceManifest.fingerprint !== binding.sourceManifestFingerprint) {
    throw new Error("active_work_context_revision_mismatch");
  }
  const boundMembershipFingerprint = activeWorkSourceManifestMembershipFingerprint({
    id: binding.sourceManifestId,
    documentIds: binding.sourceManifestDocumentIds,
    evidenceObjectIds: binding.sourceManifestEvidenceObjectIds,
  });
  const activeMembershipFingerprint = activeWorkSourceManifestMembershipFingerprint(active.sourceManifest);
  if (binding.sourceManifestMembershipFingerprint !== boundMembershipFingerprint
    || activeMembershipFingerprint !== boundMembershipFingerprint) {
    throw new Error("active_work_context_manifest_membership_mismatch");
  }
  const boundObjects = [...binding.activeWorkObjectBindings].sort((left, right) => left.id.localeCompare(right.id));
  const activeObjects = activeWorkObjectBindings(active.objects);
  if (new Set(boundObjects.map(({id}) => id)).size !== boundObjects.length
    || fingerprintJson(boundObjects) !== fingerprintJson(activeObjects)) {
    throw new Error("active_work_context_object_binding_mismatch");
  }
  const availableDocuments = new Set(context.documentIds);
  if (active.sourceManifest.documentIds.some((id) => !availableDocuments.has(id))) {
    throw new Error("active_work_context_document_mismatch");
  }
  return active;
}
