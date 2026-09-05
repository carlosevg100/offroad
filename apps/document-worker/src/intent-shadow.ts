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
  confidence: z.number().min(0).max(1).nullable().optional().transform((confidence) => confidence ?? null),
  basis: z.string().max(200).nullable().optional(),
});

export const shadowRoutingOutputSchema = z.object({
  routingCore: z.object({
    action: inferred(z.array(z.string().min(1).max(60)).min(1).max(8)),
    object: inferred(z.array(z.object({kind: intentObjectKindSchema, reference: z.string().max(200).optional()})).min(1).max(12)),
    desiredOutcome: inferred(z.string().min(1).max(300)),
    decision: inferred(z.string().max(300).nullable()),
    audience: inferred(z.array(z.string().min(1).max(80)).min(1).max(6)),
    depth: inferred(intentDepthSchema),
    continuity: inferred(intentContinuitySchema),
    workResponsibility: inferred(z.array(workResponsibilitySchema).min(1).max(4)),
  }),
  inferableContext: z.object({
    jurisdiction: inferred(z.array(z.string().min(2).max(8)).max(4)),
    asOfDate: inferred(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    currency: inferred(z.string().length(3).nullable()),
    deadline: inferred(z.string().max(80).nullable()),
    sponsorInstruction: inferred(z.string().max(500).nullable()),
    constraints: inferred(z.array(z.string().max(200)).max(20)),
    urgency: inferred(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
    availableInputs: inferred(z.array(z.string().max(120)).max(40)),
  }),
  primaryWorks: z.array(z.object({work: primaryWorkSchema, confidence: z.number().min(0).max(1)})).min(1).max(3),
  composition: z.string().max(60).nullable(),
  /** The one question the classifier would ask first, if it were allowed to ask. Recorded, never asked. */
  firstQuestion: z.string().max(300).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
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

const asSystemOrInferred = <T>(field: {value: T; state: string; confidence: number | null; basis?: string | null | undefined}) => ({
  value: field.value,
  state: field.state as "explicit" | "inferred" | "ambiguous" | "unknown" | "not_applicable",
  // An inferred field the model left without a confidence is recorded at even odds, never as certain.
  ...(field.state === "inferred" || field.state === "ambiguous" ? {confidence: field.confidence ?? 0.5} : {}),
  ...(field.basis ? {basis: field.basis} : {}),
});

/** Stamps the system fields around a classifier output: the model never writes them. */
export function stampIntentEnvelope(output: ShadowRoutingOutput, context: ShadowRoutingContext, now: () => Date = () => new Date()): IntentEnvelope {
  const core = output.routingCore;
  return intentEnvelopeSchema.parse({
    schemaVersion: "intent-envelope.v1",
    routingCore: {
      action: asSystemOrInferred(core.action),
      object: asSystemOrInferred(core.object),
      desiredOutcome: asSystemOrInferred(core.desiredOutcome),
      decision: asSystemOrInferred(core.decision),
      audience: asSystemOrInferred(core.audience),
      depth: asSystemOrInferred(core.depth),
      continuity: asSystemOrInferred(core.continuity),
      workResponsibility: asSystemOrInferred(core.workResponsibility),
    },
    executionContext: {
      evidenceRegime: {value: evidenceRegime(context.accessBasis, context.documentIds.length), state: "system"},
      authority: {value: context.projectId ? ["read", "modify"] : ["read"], state: "system"},
      organizationId: {value: context.organizationId, state: "system"},
      projectId: {value: context.projectId, state: "system"},
      availableDocumentIds: {value: context.documentIds.slice(0, 500), state: "system"},
      jurisdiction: asSystemOrInferred(output.inferableContext.jurisdiction),
      asOfDate: asSystemOrInferred(output.inferableContext.asOfDate),
      currency: asSystemOrInferred(output.inferableContext.currency),
      deadline: asSystemOrInferred(output.inferableContext.deadline),
      sponsorInstruction: asSystemOrInferred(output.inferableContext.sponsorInstruction),
      constraints: asSystemOrInferred(output.inferableContext.constraints),
      language: {value: context.locale, state: "system"},
      urgency: asSystemOrInferred(output.inferableContext.urgency),
      availableInputs: asSystemOrInferred(output.inferableContext.availableInputs),
    },
    primaryWorks: output.primaryWorks,
    composition: output.composition,
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
