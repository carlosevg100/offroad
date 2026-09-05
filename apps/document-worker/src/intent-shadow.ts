import {
  intentContinuitySchema,
  intentDepthSchema,
  intentEnvelopeSchema,
  intentObjectKindSchema,
  primaryWorkSchema,
  workResponsibilitySchema,
  type IntentEnvelope,
} from "@offroad/agent-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {z} from "zod";

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
// Prompted JSON is not grammar-bound: a null basis or an omitted confidence must not sink the turn.
const inferred = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  state: z.enum(["explicit", "inferred", "ambiguous", "unknown", "not_applicable"]),
  confidence: z.number().min(0).max(1).nullish(),
  basis: z.string().max(200).nullish(),
});

// A prompted model is not grammar-bound: it writes longer strings and longer lists than the
// envelope contract allows. The classifier accepts them here and `stampIntentEnvelope` clamps
// every value to the contract's limits, so a long phrase never sinks the turn.
export const shadowRoutingOutputSchema = z.object({
  routingCore: z.object({
    action: inferred(z.array(z.string().min(1).max(400)).min(1).max(16)),
    object: inferred(z.array(z.object({kind: intentObjectKindSchema, reference: z.string().max(400).nullish()})).min(1).max(24)),
    desiredOutcome: inferred(z.string().min(1).max(1_200)),
    decision: inferred(z.string().max(1_200).nullable()),
    audience: inferred(z.array(z.string().min(1).max(200)).min(1).max(12)),
    depth: inferred(intentDepthSchema),
    continuity: inferred(intentContinuitySchema),
    workResponsibility: inferred(z.array(workResponsibilitySchema).min(1).max(8)),
  }),
  inferableContext: z.object({
    jurisdiction: inferred(z.array(z.string().min(1).max(40)).max(8)),
    asOfDate: inferred(z.string().max(40).nullable()),
    currency: inferred(z.string().max(12).nullable()),
    deadline: inferred(z.string().max(300).nullable()),
    sponsorInstruction: inferred(z.string().max(2_000).nullable()),
    constraints: inferred(z.array(z.string().max(600)).max(40)),
    urgency: inferred(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
    availableInputs: inferred(z.array(z.string().max(400)).max(80)),
  }),
  primaryWorks: z.array(z.object({work: primaryWorkSchema, confidence: z.number().min(0).max(1)})).min(1).max(6),
  composition: z.string().max(120).nullable(),
  /** The one question the classifier would ask first, if it were allowed to ask. Recorded, never asked. */
  firstQuestion: z.string().max(600).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(600).nullable(),
});
export type ShadowRoutingOutput = z.infer<typeof shadowRoutingOutputSchema>;

export const SHADOW_ROUTING_SYSTEM = `You classify one turn of a debt capital markets conversation into an intent envelope. You do
not answer the request and you do not plan work.

Fill only what the turn, the recent conversation and the listed inputs support. Every field carries
a state and a confidence: "explicit" when the person said it, "inferred" when it follows from what
they said, "ambiguous" when two readings remain, "unknown" when nothing supports a value. Never
guess authority, evidence regime, permissions or documents: they are not yours to fill.

Primary works (choose one to three, most likely first): find_and_organize, extract_and_reconcile,
understand, analyze, model, capital_strategy, read_documents, market, capital_match.
Work responsibility describes the person's role in this work, never their job title: producer,
coordinator, reviewer, decision_maker, sponsor, recipient, external_authorizer.
Depth: point (a delimited question), preliminary, institutional. Continuity: new, refresh,
monitor, comparison, resume.

If the turn is too ambiguous to name a primary work, set abstain to true and say why. If one
question would change the plan, put it in firstQuestion; otherwise leave it null.
Return the requested JSON only.`;

export type ShadowRoutingContext = {
  locale: "pt-BR" | "en-US";
  message: string;
  recentMessages: Array<{role: string; content: string}>;
  organizationId: string;
  projectId: string | null;
  entryJob: string | null;
  accessBasis: string | null;
  documentIds: string[];
  professionalContext: {useForms: string[]; professionalRoles: string[]; practiceAreas: string[]; primaryObjectives: string[]} | null;
};

function evidenceRegime(accessBasis: string | null, documentCount: number): "public" | "private_authorized" | "hybrid" | "received" {
  if (accessBasis === "authorized_private" || accessBasis === "private_authorized") return documentCount > 0 ? "private_authorized" : "hybrid";
  return "public";
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

/** Stamps the system fields around a classifier output and clamps every value to the envelope contract; the model never writes the system fields. */
export function stampIntentEnvelope(output: ShadowRoutingOutput, context: ShadowRoutingContext, now: () => Date = () => new Date()): IntentEnvelope {
  const core = output.routingCore;
  const ctx = output.inferableContext;
  return intentEnvelopeSchema.parse({
    schemaVersion: "intent-envelope.v1",
    routingCore: {
      action: asSystemOrInferred(clampField(core.action, (items) => clampList(items.map((item) => clampText(item, 60)).filter(Boolean), 8))),
      object: asSystemOrInferred(clampField(core.object, (items) => clampList(items.map((item) => ({kind: item.kind, ...(item.reference ? {reference: clampText(item.reference, 200)} : {})})), 12))),
      desiredOutcome: asSystemOrInferred(clampField(core.desiredOutcome, (value) => clampText(value, 300))),
      decision: asSystemOrInferred(clampField(core.decision, (value) => (value === null ? null : clampText(value, 300)))),
      audience: asSystemOrInferred(clampField(core.audience, (items) => clampList(items.map((item) => clampText(item, 80)).filter(Boolean), 6))),
      depth: asSystemOrInferred(core.depth),
      continuity: asSystemOrInferred(core.continuity),
      workResponsibility: asSystemOrInferred(clampField(core.workResponsibility, (items) => clampList([...new Set(items)], 4))),
    },
    executionContext: {
      evidenceRegime: {value: evidenceRegime(context.accessBasis, context.documentIds.length), state: "system"},
      authority: {value: context.projectId ? ["read", "modify"] : ["read"], state: "system"},
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
    composition: output.composition === null ? null : clampText(output.composition, 60),
    effect: "none",
    createdAt: now().toISOString(),
  });
}

/** Runs the classifier and stamps the system fields. Throws only on model or schema failure. */
export async function shadowIntentEnvelope(input: {
  gateway: ModelGateway;
  context: ShadowRoutingContext;
  now?: () => Date;
}): Promise<{envelope: IntentEnvelope; output: ShadowRoutingOutput; model: string; costUsd: number}> {
  const {context} = input;
  const spentBefore = input.gateway.spent().costUsd;
  const completion = await input.gateway.complete({
    task: "route_intent",
    system: SHADOW_ROUTING_SYSTEM,
    input: [{
      type: "text",
      text: JSON.stringify({
        locale: context.locale,
        latestUserMessage: context.message,
        recentConversation: context.recentMessages.slice(-8),
        entryJob: context.entryJob,
        documentCount: context.documentIds.length,
        professionalContext: context.professionalContext,
      }),
    }],
    schema: shadowRoutingOutputSchema,
    schemaName: "shadow_routing_output",
    // The envelope schema is too large for the provider's compiled grammar; the schema travels in the prompt.
    outputMode: "prompted_json",
    thinking: "off",
    metadata: {surface: "shadow_router"},
  });
  const output = completion.output;
  const envelope = stampIntentEnvelope(output, context, input.now);
  return {envelope, output, model: completion.model, costUsd: Math.max(0, input.gateway.spent().costUsd - spentBefore)};
}
