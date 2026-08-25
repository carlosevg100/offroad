import {createHash} from "node:crypto";
import {z} from "zod";
import {documentKindSchema, type DocumentKind} from "@offroad/credit-ontology";

import {planClientRequests, type ClientRequest, type ClientRequestPriority} from "./client-requests";
import {
  assessSufficiency,
  type ClassifiedDocument,
  type InformationAnswers,
  type RequirementEvidence,
  type RequirementResponses,
  type SufficiencyReport,
} from "./sufficiency";
import {archetype} from "./archetypes";
import {archetypeIdSchema, type ArchetypeId, type RequirementPurpose, type RequirementResponse, type RequirementStage} from "./types";

const isoDateTime = z.iso.datetime({offset: true});

export const intakePolicySchema = z.object({
  version: z.string().trim().min(1),
  maxActiveRequests: z.number().int().min(1).max(5),
  source: z.object({
    title: z.string().trim().min(1),
    reference: z.string().trim().min(1),
  }).strict(),
  asOf: z.iso.date(),
  validUntil: z.iso.date(),
}).strict();
export type IntakePolicy = z.infer<typeof intakePolicySchema>;

/** The deployed M0 request policy. Changing it requires a new version and new replay evidence. */
export const M0_INTAKE_POLICY = Object.freeze({
  version: "m0-intake-2026.08.25-v1",
  maxActiveRequests: 5,
  source: {
    title: "House Playbook M0 Intake",
    reference: "IN-13, IN-14 and the M0 executable procedure contract",
  },
  asOf: "2026-08-25",
  validUntil: "2030-12-31",
} satisfies IntakePolicy);

export const urgencyBandSchema = z.enum(["up_to_3_months", "3_to_6_months", "6_to_12_months", "no_rush"]);
export type UrgencyBand = z.infer<typeof urgencyBandSchema>;

export const intakeActorRoleSchema = z.enum(["company", "advisor"]);
export type IntakeActorRole = z.infer<typeof intakeActorRoleSchema>;

export type CapitalNeedFrame = {
  /** The operation selected in the guided intake. This is the only day-zero fact required. */
  useOfProceeds: string;
  objective?: string;
  requestedAmount?: string;
  currency?: "BRL" | "USD" | "EUR";
  urgency?: UrgencyBand;
  requestedTermMonths?: number;
  requestedGraceMonths?: number;
  consequenceIfNotExecuted?: string;
  sector?: string;
  geography?: string;
  instrumentPreferences?: readonly string[];
  availableCollateral?: readonly string[];
  expectedRate?: string;
  /** Legacy declarations remain replayable while new sessions use the precise fields above. */
  cnpj?: string;
  amountBand?: string;
  desiredTenorBand?: string;
  currentLenders?: string;
  declaredBy: {actorId: string; role: IntakeActorRole};
  declaredAt: string;
  version: number;
};

export type ReceivedDocument = {
  id: string;
  originalName?: string;
  objectPath?: string;
  sha256?: string;
  byteSize?: number;
  mimeType?: string;
};

export type ArchetypeRoute = {
  archetypeId: ArchetypeId;
  confidence: "high" | "medium" | "low";
  rationale: string;
  retestTriggers: readonly string[];
  routedAt: string;
  version: number;
};

export type AnalysisEntity = {
  entityId: string;
  legalName: string;
  role: "borrower" | "operating_company" | "guarantor" | "holding" | "target" | "other";
  source: "member_organization" | "company_declaration" | "advisor_declaration" | "document";
  status: "declared" | "document_supported" | "confirmed";
  /** Required whenever the entity came from, or was confirmed against, documentary evidence. */
  evidenceReferences: readonly string[];
};

export type AnalysisScope = {
  entities: readonly AnalysisEntity[];
  reason: string;
  version: number;
  recordedAt: string;
};

export type AnalysisScopeSuggestion = {
  suggestionId: string;
  entityId: string;
  legalName: string;
  suggestedRole: Exclude<AnalysisEntity["role"], "borrower">;
  status: "pending" | "confirmed" | "dismissed";
  evidenceReferences: readonly string[];
  decisionReason?: string;
};

export type AnalysisScopeSuggestions = {
  items: readonly AnalysisScopeSuggestion[];
  version: number;
  recordedAt: string;
};

export type AdvisorAuthorization = {
  advisorOrganizationId: string;
  clientEntityId: string;
  authorityKind: "engagement_letter" | "mandate" | "power_of_attorney" | "board_resolution" | "company_confirmation" | "other";
  status: "declared" | "documented" | "verified" | "revoked";
  scopes: readonly ("prepare_case" | "market_sounding" | "qualified_introduction")[];
  declarationReference?: string;
  evidenceReferences: readonly string[];
  statusReason?: string;
  version: number;
  recordedAt: string;
};

export type IntakeRouteCheck = {
  check: "early_triage" | "urgency" | "disguised_liquidity" | "group_scope";
  outcome: "clear" | "review_required" | "routed" | "declined";
  rationale: string;
  evidenceIds: readonly string[];
  version: number;
  recordedAt: string;
};

export type IntakePreparationBlock =
  | "analysis_scope_missing"
  | "advisor_authorization_missing"
  | "advisor_authorization_revoked"
  | "route_declined"
  | "route_changed";

export type LadderSource = "classified_room" | "declared_derivation" | "registered_public_source";
export type LadderAttempt = {
  source: LadderSource;
  outcome: "found" | "not_found" | "not_permitted" | "not_applicable";
  detail: string;
  evidenceIds: readonly string[];
};

const ladderOrder = ["classified_room", "declared_derivation", "registered_public_source"] as const;

export type RequestLadderTrace = {
  requirementId: string;
  attempts: readonly LadderAttempt[];
  /** Revision of the evidence-bearing event stream searched by these attempts. */
  basisRevision: number;
  recordedAt: string;
  traceVersion: number;
};

export type RequestLadderDraft = Pick<RequestLadderTrace, "requirementId" | "attempts">;

type EventBase = {eventId: string; caseId: string; sequence: number; occurredAt: string};

export type IntakeEvent =
  | (EventBase & {type: "capital_need_declared"; frame: Omit<CapitalNeedFrame, "declaredAt">})
  | (EventBase & {type: "archetype_routed"; route: Omit<ArchetypeRoute, "routedAt">})
  | (EventBase & {type: "document_received"; document: ReceivedDocument; actorId: string})
  | (EventBase & {type: "document_classified"; document: ClassifiedDocument; classificationVersion: number})
  | (EventBase & {type: "document_removed"; documentId: string; actorId: string})
  | (EventBase & {
      type: "information_answered";
      requirementId: string;
      answer: string;
      response: Extract<RequirementResponse, "provided" | "partial">;
      note?: string;
      actorId: string;
    })
  | (EventBase & {type: "information_cleared"; requirementId: string; actorId: string})
  | (EventBase & {
      type: "absence_recorded";
      requirementId: string;
      response: Extract<RequirementResponse, "partial" | "unavailable" | "not_applicable" | "after_nda">;
      note?: string;
      actorId: string;
    })
  | (EventBase & {type: "request_ladder_recorded"; trace: Omit<RequestLadderTrace, "recordedAt">})
  | (EventBase & {type: "analysis_scope_recorded"; scope: Omit<AnalysisScope, "recordedAt">})
  | (EventBase & {type: "analysis_scope_suggestions_recorded"; suggestions: Omit<AnalysisScopeSuggestions, "recordedAt">})
  | (EventBase & {type: "advisor_authorization_recorded"; authorization: Omit<AdvisorAuthorization, "recordedAt">})
  | (EventBase & {type: "route_check_recorded"; routeCheck: Omit<IntakeRouteCheck, "recordedAt">});

const eventBaseShape = {
  eventId: z.string().trim().min(1),
  caseId: z.string().trim().min(1),
  sequence: z.number().int().positive(),
  occurredAt: isoDateTime,
};

const capitalNeedFrameSchema = z.object({
  useOfProceeds: z.string().trim().min(1),
  objective: z.string().trim().min(1).max(4000).optional(),
  requestedAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(),
  currency: z.enum(["BRL", "USD", "EUR"]).optional(),
  urgency: urgencyBandSchema.optional(),
  requestedTermMonths: z.number().int().min(1).max(360).optional(),
  requestedGraceMonths: z.number().int().min(0).max(120).optional(),
  consequenceIfNotExecuted: z.string().trim().min(1).max(4000).optional(),
  sector: z.string().trim().min(1).max(120).optional(),
  geography: z.string().regex(/^[A-Z]{2}$/).optional(),
  instrumentPreferences: z.array(z.string().trim().min(1)).optional(),
  availableCollateral: z.array(z.string().trim().min(1)).optional(),
  expectedRate: z.string().trim().min(1).max(80).optional(),
  cnpj: z.string().refine((value) => value.replace(/\D/g, "").length === 14, "CNPJ must have 14 digits").optional(),
  amountBand: z.string().trim().min(1).optional(),
  desiredTenorBand: z.string().trim().min(1).optional(),
  currentLenders: z.string().trim().min(1).optional(),
  declaredBy: z.object({actorId: z.string().trim().min(1), role: intakeActorRoleSchema}).strict(),
  version: z.number().int().positive(),
}).strict().superRefine((frame, context) => {
  if (
    frame.requestedGraceMonths !== undefined &&
    frame.requestedTermMonths !== undefined &&
    frame.requestedGraceMonths >= frame.requestedTermMonths
  ) {
    context.addIssue({code: "custom", path: ["requestedGraceMonths"], message: "grace period must be shorter than term"});
  }
});

const ladderAttemptSchema = z.object({
  source: z.enum(ladderOrder),
  outcome: z.enum(["found", "not_found", "not_permitted", "not_applicable"]),
  detail: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
}).strict();

/** Runtime boundary for events loaded from storage or received from an application command. */
export const intakeEventSchema = z.discriminatedUnion("type", [
  z.object({...eventBaseShape, type: z.literal("capital_need_declared"), frame: capitalNeedFrameSchema}).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("archetype_routed"),
    route: z.object({
      archetypeId: archetypeIdSchema,
      confidence: z.enum(["high", "medium", "low"]),
      rationale: z.string().trim().min(1),
      retestTriggers: z.array(z.string().trim().min(1)),
      version: z.number().int().positive(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("document_received"),
    document: z.object({
      id: z.string().trim().min(1),
      originalName: z.string().trim().min(1).max(500).optional(),
      objectPath: z.string().trim().min(1).max(1024).optional(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      byteSize: z.number().int().min(0).max(52_428_800).optional(),
      mimeType: z.string().trim().min(1).max(255).optional(),
    }).strict(),
    actorId: z.string().trim().min(1),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("document_classified"),
    document: z.object({id: z.string().trim().min(1), kind: documentKindSchema}).strict(),
    classificationVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("document_removed"),
    documentId: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("information_answered"),
    requirementId: z.string().trim().min(1),
    answer: z.string().trim().min(1),
    response: z.enum(["provided", "partial"]),
    note: z.string().trim().min(1).optional(),
    actorId: z.string().trim().min(1),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("information_cleared"),
    requirementId: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("absence_recorded"),
    requirementId: z.string().trim().min(1),
    response: z.enum(["partial", "unavailable", "not_applicable", "after_nda"]),
    note: z.string().trim().min(1).optional(),
    actorId: z.string().trim().min(1),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("request_ladder_recorded"),
    trace: z.object({
      requirementId: z.string().trim().min(1),
      attempts: z.array(ladderAttemptSchema).min(1).max(3),
      basisRevision: z.number().int().nonnegative(),
      traceVersion: z.number().int().positive(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("analysis_scope_recorded"),
    scope: z.object({
      entities: z.array(z.object({
        entityId: z.string().trim().min(1),
        legalName: z.string().trim().min(1),
        role: z.enum(["borrower", "operating_company", "guarantor", "holding", "target", "other"]),
        source: z.enum(["member_organization", "company_declaration", "advisor_declaration", "document"]),
        status: z.enum(["declared", "document_supported", "confirmed"]),
        evidenceReferences: z.array(z.string().trim().min(1)).default([]),
      }).strict().superRefine((entity, context) => {
        if (
          (entity.source === "document" || entity.status === "document_supported" || entity.status === "confirmed") &&
          entity.evidenceReferences.length === 0
        ) {
          context.addIssue({code: "custom", message: "document-supported scope entity requires evidence"});
        }
      })).min(1),
      reason: z.string().trim().min(1),
      version: z.number().int().positive(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("analysis_scope_suggestions_recorded"),
    suggestions: z.object({
      items: z.array(z.object({
        suggestionId: z.string().trim().min(1),
        entityId: z.string().trim().min(1),
        legalName: z.string().trim().min(2),
        suggestedRole: z.enum(["operating_company", "guarantor", "holding", "target", "other"]),
        status: z.enum(["pending", "confirmed", "dismissed"]),
        evidenceReferences: z.array(z.string().trim().min(1)).min(1),
        decisionReason: z.string().trim().min(1).max(1000).optional(),
      }).strict().superRefine((suggestion, context) => {
        if (suggestion.status !== "pending" && !suggestion.decisionReason) {
          context.addIssue({code: "custom", message: "decided scope suggestion requires a reason"});
        }
      })).max(50),
      version: z.number().int().positive(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("advisor_authorization_recorded"),
    authorization: z.object({
      advisorOrganizationId: z.string().trim().min(1),
      clientEntityId: z.string().trim().min(1),
      authorityKind: z.enum(["engagement_letter", "mandate", "power_of_attorney", "board_resolution", "company_confirmation", "other"]),
      status: z.enum(["declared", "documented", "verified", "revoked"]),
      scopes: z.array(z.enum(["prepare_case", "market_sounding", "qualified_introduction"])).max(3),
      declarationReference: z.string().trim().min(1).optional(),
      evidenceReferences: z.array(z.string().trim().min(1)),
      statusReason: z.string().trim().min(1).max(1000).optional(),
      version: z.number().int().positive(),
    }).strict().superRefine((authorization, context) => {
      if (["documented", "verified"].includes(authorization.status) && authorization.evidenceReferences.length === 0) {
        context.addIssue({code: "custom", message: "documented authorization requires evidence"});
      }
      if (authorization.status !== "revoked" && authorization.scopes.length === 0) {
        context.addIssue({code: "custom", message: "active authorization requires at least one scope"});
      }
      if (authorization.status === "revoked" && (authorization.scopes.length > 0 || !authorization.statusReason)) {
        context.addIssue({code: "custom", message: "revoked authorization requires empty scopes and a reason"});
      }
    }),
  }).strict(),
  z.object({
    ...eventBaseShape,
    type: z.literal("route_check_recorded"),
    routeCheck: z.object({
      check: z.enum(["early_triage", "urgency", "disguised_liquidity", "group_scope"]),
      outcome: z.enum(["clear", "review_required", "routed", "declined"]),
      rationale: z.string().trim().min(1),
      evidenceIds: z.array(z.string().trim().min(1)),
      version: z.number().int().positive(),
    }).strict(),
  }).strict(),
]);

export type InformationCoverage = {
  archetypeId: ArchetypeId;
  minimum: SufficiencyReport["minimum"];
  ideal: SufficiencyReport["ideal"];
  requirements: SufficiencyReport["requirements"];
  missing: SufficiencyReport["missing"];
  unmatchedDocuments: readonly string[];
  acknowledgedAbsences: readonly {
    requirementId: string;
    response: RequirementResponse;
    note?: string;
  }[];
};

export type RequestRoadmap = {
  stages: Record<RequirementStage, {open: number; satisfied: number; total: number}>;
  awaitingLadder: readonly string[];
  acknowledgedAbsence: readonly string[];
  queuedAfterActiveBatch: readonly string[];
};

export type ActiveRequest = {
  requirementId: string;
  priority: ClientRequestPriority;
  unlocks: readonly RequirementPurpose[];
  label: {pt: string; en: string};
  whyItMatters: {pt: string; en: string};
  question?: {pt: string; en: string};
  acceptedArtifacts: readonly {pt: string; en: string}[];
  responseOptions: readonly ("text" | "upload_existing" | "not_available" | "not_applicable" | "after_nda")[];
  ladderTrace: RequestLadderTrace;
};

export type ActiveRequestBatch = {
  batchId: string;
  caseId: string;
  generatedAt: string;
  policyVersion: string;
  maxItems: number;
  requests: readonly ActiveRequest[];
};

export type IntakeDecisionLogEntry = {
  decisionId: string;
  occurredAt: string;
  type:
    | "capital_need_recorded"
    | "archetype_selected"
    | "document_received"
    | "document_classification_changed"
    | "document_removed"
    | "requirement_answered"
    | "requirement_cleared"
    | "absence_acknowledged"
    | "request_ladder_completed"
    | "analysis_scope_changed"
    | "analysis_scope_suggestions_changed"
    | "advisor_authorized"
    | "route_check_completed"
    | "request_suppressed";
  summary: string;
  evidenceIds: readonly string[];
};

export type IntakeState = {
  caseId: string;
  status: "framing" | "routing" | "collecting";
  revision: number;
  /** Changes only when facts or evidence change, never when another ladder trace is appended. */
  evidenceRevision: number;
  eventsFingerprint: string;
  capitalNeedFrame: CapitalNeedFrame | null;
  archetypeRoute: ArchetypeRoute | null;
  analysisScope: AnalysisScope | null;
  analysisScopeSuggestions: AnalysisScopeSuggestions | null;
  advisorAuthorization: AdvisorAuthorization | null;
  routeChecks: readonly IntakeRouteCheck[];
  preparationBlocks: readonly IntakePreparationBlock[];
  receivedDocuments: readonly ReceivedDocument[];
  documents: readonly (ClassifiedDocument & {classificationVersion: number})[];
  ladderTraces: readonly RequestLadderTrace[];
  informationCoverage: InformationCoverage | null;
  requestRoadmap: RequestRoadmap | null;
  activeRequestBatch: ActiveRequestBatch | null;
  decisionLog: readonly IntakeDecisionLogEntry[];
};

type MutableReplay = {
  evidenceRevision: number;
  frame: CapitalNeedFrame | null;
  route: ArchetypeRoute | null;
  scope: AnalysisScope | null;
  scopeSuggestions: AnalysisScopeSuggestions | null;
  authorization: AdvisorAuthorization | null;
  routeChecks: IntakeRouteCheck[];
  receivedDocuments: Map<string, ReceivedDocument>;
  documents: Map<string, ClassifiedDocument & {classificationVersion: number}>;
  answers: Record<string, string | undefined>;
  responses: Record<string, {response: RequirementResponse; note?: string} | undefined>;
  ladders: Map<string, RequestLadderTrace>;
  log: IntakeDecisionLogEntry[];
};

/**
 * Rebuilds the intake from immutable domain events.
 *
 * Screens are projections of this state. They do not decide whether an item was satisfied,
 * whether it can be asked, or which request comes next. Replaying the same events with the
 * same dated policy always produces the same state and fingerprint.
 */
export function replayIntake(caseId: string, policyInput: IntakePolicy, events: readonly IntakeEvent[]): IntakeState {
  const policy = intakePolicySchema.parse(policyInput);
  const parsedEvents = events.map((event) => intakeEventSchema.parse(event)) as IntakeEvent[];
  assertEventStream(caseId, policy, parsedEvents);

  const replay: MutableReplay = {
    evidenceRevision: 0,
    frame: null,
    route: null,
    scope: null,
    scopeSuggestions: null,
    authorization: null,
    routeChecks: [],
    receivedDocuments: new Map(),
    documents: new Map(),
    answers: {},
    responses: {},
    ladders: new Map(),
    log: [],
  };

  for (const event of parsedEvents) applyEvent(replay, event);

  const generatedAt = parsedEvents.at(-1)?.occurredAt ?? `${policy.asOf}T00:00:00.000Z`;
  const receivedDocuments = [...replay.receivedDocuments.values()].sort((left, right) => left.id.localeCompare(right.id));
  const documents = [...replay.documents.values()].sort((left, right) => left.id.localeCompare(right.id));
  const ladderTraces = [...replay.ladders.values()].sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  const preparationBlocks = preparationBlocksFor(replay);
  const fingerprint = hash({caseId, policy, events: parsedEvents});

  if (!replay.route) {
    return {
      caseId,
      status: replay.frame ? "routing" : "framing",
      revision: parsedEvents.length,
      evidenceRevision: replay.evidenceRevision,
      eventsFingerprint: fingerprint,
      capitalNeedFrame: replay.frame,
      archetypeRoute: null,
      analysisScope: replay.scope,
      analysisScopeSuggestions: replay.scopeSuggestions,
      advisorAuthorization: replay.authorization,
      routeChecks: replay.routeChecks,
      preparationBlocks,
      receivedDocuments,
      documents,
      ladderTraces,
      informationCoverage: null,
      requestRoadmap: null,
      activeRequestBatch: null,
      decisionLog: replay.log,
    };
  }

  const requirementEvidence = evidenceFromLadders(replay.ladders, replay.evidenceRevision);
  const report = assessSufficiency(replay.route.archetypeId, documents, replay.answers, replay.responses, requirementEvidence);
  const absenceIds = new Set(
    report.requirements
      .filter((status) => !status.satisfied && ["unavailable", "after_nda", "not_applicable"].includes(status.response ?? ""))
      .map((status) => status.requirement.id),
  );
  const eligibleReport = withoutAcknowledgedAbsences(report, absenceIds);
  const fullPlan = planClientRequests(eligibleReport, {batchSize: 5});
  const eligibleRequests = fullPlan.current.filter(({status}) =>
    ladderPermitsRequest(replay.ladders.get(status.requirement.id), replay.evidenceRevision)
  );
  const selected = preparationBlocks.length === 0
    ? eligibleRequests.slice(0, policy.maxActiveRequests)
    : [];
  const activeIds = new Set(selected.map(({status}) => status.requirement.id));
  const pendingAtActiveStage = fullPlan.current
    .filter(({status}) => !activeIds.has(status.requirement.id))
    .map(({status}) => status.requirement.id);
  const openNow = report.byStage.now.filter((status) => !status.satisfied && !absenceIds.has(status.requirement.id));
  const allOpenClientStage = openNow.length > 0
    ? openNow
    : report.byStage.structuring.filter((status) => !status.satisfied && !absenceIds.has(status.requirement.id));
  const awaitingLadder = preparationBlocks.length === 0
    ? allOpenClientStage
        .filter((status) => !ladderPermitsRequest(replay.ladders.get(status.requirement.id), replay.evidenceRevision))
        .map((status) => status.requirement.id)
    : [];

  addSuppressionLog(replay, report, generatedAt);

  const informationCoverage: InformationCoverage = {
    archetypeId: report.archetypeId,
    minimum: report.minimum,
    ideal: report.ideal,
    requirements: report.requirements,
    missing: report.missing,
    unmatchedDocuments: report.unmatchedDocuments,
    acknowledgedAbsences: report.requirements
      .filter((status) => absenceIds.has(status.requirement.id))
      .map((status) => ({
        requirementId: status.requirement.id,
        response: status.response!,
        ...(status.note ? {note: status.note} : {}),
      })),
  };

  const requestRoadmap: RequestRoadmap = {
    stages: {
      now: stageCounts(report, "now"),
      structuring: stageCounts(report, "structuring"),
      diligence: stageCounts(report, "diligence"),
      closing: stageCounts(report, "closing"),
    },
    awaitingLadder,
    acknowledgedAbsence: [...absenceIds].sort(),
    queuedAfterActiveBatch: pendingAtActiveStage,
  };

  const activeRequestBatch: ActiveRequestBatch | null = selected.length > 0 ? {
    batchId: hash({caseId, generatedAt, policyVersion: policy.version, requirementIds: selected.map(({status}) => status.requirement.id)}),
    caseId,
    generatedAt,
    policyVersion: policy.version,
    maxItems: policy.maxActiveRequests,
    requests: selected.map((request) => activeRequest(request, replay.ladders.get(request.status.requirement.id)!)),
  } : null;

  return {
    caseId,
    status: "collecting",
    revision: parsedEvents.length,
    evidenceRevision: replay.evidenceRevision,
    eventsFingerprint: fingerprint,
    capitalNeedFrame: replay.frame,
    archetypeRoute: replay.route,
    analysisScope: replay.scope,
    analysisScopeSuggestions: replay.scopeSuggestions,
    advisorAuthorization: replay.authorization,
    routeChecks: replay.routeChecks,
    preparationBlocks,
    receivedDocuments,
    documents,
    ladderTraces,
    informationCoverage,
    requestRoadmap,
    activeRequestBatch,
    decisionLog: replay.log,
  };
}

function applyEvent(state: MutableReplay, event: IntakeEvent): void {
  if (event.type !== "request_ladder_recorded") state.evidenceRevision += 1;
  switch (event.type) {
    case "capital_need_declared": {
      if (event.frame.version !== (state.frame?.version ?? 0) + 1) throw new Error("capital need versions must be sequential");
      state.frame = {...event.frame, declaredAt: event.occurredAt};
      pushLog(state, event, "capital_need_recorded", `Capital need version ${event.frame.version} recorded.`);
      break;
    }
    case "archetype_routed": {
      if (!state.frame) throw new Error("capital need must be recorded before archetype routing");
      if (event.route.version !== (state.route?.version ?? 0) + 1) throw new Error("archetype route versions must be sequential");
      archetype(event.route.archetypeId);
      state.route = {...event.route, routedAt: event.occurredAt};
      pushLog(state, event, "archetype_selected", `Archetype ${event.route.archetypeId} selected at ${event.route.confidence} confidence.`);
      break;
    }
    case "document_received": {
      if (state.receivedDocuments.has(event.document.id)) throw new Error("document receipt must be unique");
      state.receivedDocuments.set(event.document.id, event.document);
      pushLog(state, event, "document_received", `Document ${event.document.id} received from ${event.actorId}.`, [event.document.id]);
      break;
    }
    case "document_classified": {
      const prior = state.documents.get(event.document.id);
      if (event.classificationVersion !== (prior?.classificationVersion ?? 0) + 1) throw new Error("document classification versions must be sequential");
      // Streams created before receipt events remain replayable without manufacturing metadata.
      if (!state.receivedDocuments.has(event.document.id)) state.receivedDocuments.set(event.document.id, {id: event.document.id});
      state.documents.set(event.document.id, {...event.document, classificationVersion: event.classificationVersion});
      pushLog(state, event, "document_classification_changed", `Document ${event.document.id} classified as ${event.document.kind}.`, [event.document.id]);
      break;
    }
    case "document_removed": {
      const received = state.receivedDocuments.delete(event.documentId);
      const classified = state.documents.delete(event.documentId);
      if (!received && !classified) throw new Error("removed document must exist in the event stream");
      pushLog(state, event, "document_removed", `Document ${event.documentId} removed by ${event.actorId}.`, [event.documentId]);
      break;
    }
    case "information_answered": {
      if (!event.answer.trim()) throw new Error("information answer cannot be blank");
      assertKnownRequirement(state, event.requirementId);
      state.answers[event.requirementId] = event.answer.trim();
      state.responses[event.requirementId] = {
        response: event.response,
        ...(event.note?.trim() ? {note: event.note.trim()} : {}),
      };
      pushLog(state, event, "requirement_answered", `Requirement ${event.requirementId} answered by ${event.actorId}.`);
      break;
    }
    case "information_cleared": {
      assertKnownRequirement(state, event.requirementId);
      delete state.answers[event.requirementId];
      delete state.responses[event.requirementId];
      pushLog(state, event, "requirement_cleared", `Requirement ${event.requirementId} cleared by ${event.actorId}.`);
      break;
    }
    case "absence_recorded": {
      assertKnownRequirement(state, event.requirementId);
      if (event.response === "not_applicable" && !event.note?.trim()) throw new Error("not applicable requires a reason");
      delete state.answers[event.requirementId];
      state.responses[event.requirementId] = {response: event.response, ...(event.note?.trim() ? {note: event.note.trim()} : {})};
      pushLog(state, event, "absence_acknowledged", `Requirement ${event.requirementId} recorded as ${event.response} by ${event.actorId}.`);
      break;
    }
    case "request_ladder_recorded": {
      assertKnownRequirement(state, event.trace.requirementId);
      validateLadder(event.trace.attempts);
      if (event.trace.basisRevision !== state.evidenceRevision) {
        throw new Error("request ladder basis revision does not match the evidence stream");
      }
      const prior = state.ladders.get(event.trace.requirementId);
      if (event.trace.traceVersion !== (prior?.traceVersion ?? 0) + 1) throw new Error("request ladder versions must be sequential");
      state.ladders.set(event.trace.requirementId, {...event.trace, recordedAt: event.occurredAt});
      pushLog(state, event, "request_ladder_completed", `Request ladder completed for ${event.trace.requirementId}.`, event.trace.attempts.flatMap((attempt) => attempt.evidenceIds));
      break;
    }
    case "analysis_scope_recorded": {
      if (event.scope.version !== (state.scope?.version ?? 0) + 1) throw new Error("analysis scope versions must be sequential");
      if (new Set(event.scope.entities.map((entity) => entity.entityId)).size !== event.scope.entities.length) throw new Error("analysis scope contains duplicate entities");
      state.scope = {...event.scope, recordedAt: event.occurredAt};
      pushLog(state, event, "analysis_scope_changed", `Analysis scope version ${event.scope.version} recorded with ${event.scope.entities.length} entities.`);
      break;
    }
    case "analysis_scope_suggestions_recorded": {
      if (event.suggestions.version !== (state.scopeSuggestions?.version ?? 0) + 1) {
        throw new Error("analysis scope suggestion versions must be sequential");
      }
      if (new Set(event.suggestions.items.map((item) => item.suggestionId)).size !== event.suggestions.items.length) {
        throw new Error("analysis scope suggestions contain duplicate ids");
      }
      assertScopeSuggestionTransition(state, event.suggestions.items);
      state.scopeSuggestions = {...event.suggestions, recordedAt: event.occurredAt};
      pushLog(
        state,
        event,
        "analysis_scope_suggestions_changed",
        `Analysis scope suggestion version ${event.suggestions.version} recorded with ${event.suggestions.items.length} items.`,
        event.suggestions.items.flatMap((item) => item.evidenceReferences),
      );
      break;
    }
    case "advisor_authorization_recorded": {
      if (event.authorization.version !== (state.authorization?.version ?? 0) + 1) {
        throw new Error("advisor authorization versions must be sequential");
      }
      const scope = state.scope?.entities.find((entity) => entity.entityId === event.authorization.clientEntityId);
      if (!scope) throw new Error("advisor authorization client must belong to the analysis scope");
      assertAuthorizationTransition(state.authorization, event.authorization);
      state.authorization = {...event.authorization, recordedAt: event.occurredAt};
      pushLog(
        state,
        event,
        "advisor_authorized",
        `Advisor authorization version ${event.authorization.version} recorded for client entity ${event.authorization.clientEntityId} as ${event.authorization.status}.`,
        event.authorization.evidenceReferences,
      );
      break;
    }
    case "route_check_recorded": {
      const priorVersion = state.routeChecks
        .filter((check) => check.check === event.routeCheck.check)
        .at(-1)?.version ?? 0;
      if (event.routeCheck.version !== priorVersion + 1) throw new Error("route check versions must be sequential");
      state.routeChecks.push({...event.routeCheck, recordedAt: event.occurredAt});
      pushLog(state, event, "route_check_completed", `${event.routeCheck.check} completed with ${event.routeCheck.outcome}.`, event.routeCheck.evidenceIds);
      break;
    }
  }
}

function assertScopeSuggestionTransition(state: MutableReplay, nextItems: readonly AnalysisScopeSuggestion[]): void {
  const priorItems = new Map((state.scopeSuggestions?.items ?? []).map((item) => [item.suggestionId, item]));
  const nextById = new Map(nextItems.map((item) => [item.suggestionId, item]));

  for (const [suggestionId, prior] of priorItems) {
    const next = nextById.get(suggestionId);
    if (!next) throw new Error("analysis scope suggestions cannot disappear from history");
    if (
      next.entityId !== prior.entityId || next.legalName !== prior.legalName ||
      next.suggestedRole !== prior.suggestedRole
    ) {
      throw new Error("analysis scope suggestion identity is immutable");
    }
    if (prior.status !== "pending" && next.status !== prior.status) {
      throw new Error("decided analysis scope suggestion is terminal");
    }
    if (!prior.evidenceReferences.every((reference) => next.evidenceReferences.includes(reference))) {
      throw new Error("analysis scope suggestion evidence cannot be removed");
    }
  }

  for (const item of nextItems) {
    if (item.status === "confirmed") {
      const entity = state.scope?.entities.find((entry) => entry.entityId === item.entityId);
      if (!entity || entity.status !== "confirmed" || entity.source !== "document") {
        throw new Error("confirmed scope suggestion requires a confirmed documentary scope entity");
      }
    }
  }
}

function assertAuthorizationTransition(
  prior: AdvisorAuthorization | null,
  next: Omit<AdvisorAuthorization, "recordedAt">,
): void {
  if (!prior) return;
  if (
    next.advisorOrganizationId !== prior.advisorOrganizationId ||
    next.clientEntityId !== prior.clientEntityId ||
    next.authorityKind !== prior.authorityKind
  ) {
    throw new Error("advisor authorization identity is immutable");
  }
  const allowed: Record<AdvisorAuthorization["status"], readonly AdvisorAuthorization["status"][]> = {
    declared: ["documented", "revoked"],
    documented: ["documented", "verified", "revoked"],
    verified: ["verified", "revoked"],
    revoked: [],
  };
  if (!allowed[prior.status].includes(next.status)) {
    throw new Error(`invalid advisor authorization transition from ${prior.status} to ${next.status}`);
  }
  if (!next.scopes.every((scope) => prior.scopes.includes(scope))) {
    throw new Error("advisor authorization lifecycle cannot broaden scope");
  }
  if (!prior.evidenceReferences.every((reference) => next.evidenceReferences.includes(reference))) {
    throw new Error("advisor authorization evidence cannot be removed");
  }
}

function assertEventStream(caseId: string, policy: IntakePolicy, events: readonly IntakeEvent[]): void {
  if (policy.validUntil < policy.asOf) throw new Error("intake policy expires before it becomes effective");
  const ids = new Set<string>();
  events.forEach((event, index) => {
    if (event.caseId !== caseId) throw new Error("intake event belongs to another case");
    if (event.sequence !== index + 1) throw new Error("intake event sequence must be continuous and start at one");
    if (ids.has(event.eventId)) throw new Error("duplicate intake event id");
    ids.add(event.eventId);
    isoDateTime.parse(event.occurredAt);
    if (index > 0 && event.occurredAt < events[index - 1]!.occurredAt) throw new Error("intake events must be chronological");
    if (event.occurredAt.slice(0, 10) < policy.asOf || event.occurredAt.slice(0, 10) > policy.validUntil) {
      throw new Error("intake policy is not valid at event time");
    }
  });
}

function assertKnownRequirement(state: MutableReplay, requirementId: string): void {
  if (!state.route) throw new Error("archetype must be routed before requirement events");
  if (!archetype(state.route.archetypeId).requirements.some((requirement) => requirement.id === requirementId)) {
    throw new Error(`unknown requirement ${requirementId} for ${state.route.archetypeId}`);
  }
}

function validateLadder(attempts: readonly LadderAttempt[]): void {
  if (attempts.length < 1 || attempts.length > ladderOrder.length) throw new Error("request ladder must contain one to three attempts");
  attempts.forEach((attempt, index) => {
    if (attempt.source !== ladderOrder[index]) throw new Error("request ladder attempts are out of order");
    if (!attempt.detail.trim()) throw new Error("request ladder attempt requires detail");
    if (attempt.outcome === "found" && attempt.evidenceIds.length === 0) throw new Error("found ladder attempt requires evidence");
    if (attempt.outcome !== "found" && attempt.evidenceIds.length > 0) throw new Error("unsuccessful ladder attempt cannot claim evidence");
  });
  const foundAt = attempts.findIndex((attempt) => attempt.outcome === "found");
  if (foundAt >= 0 && foundAt !== attempts.length - 1) throw new Error("request ladder must stop when evidence is found");
}

/**
 * Facts that must exist before a client request can be issued.
 *
 * A review-required check remains visible to the desk but does not halt collection. `routed` and
 * `declined` do halt this route: continuing to ask against a path the system has already changed
 * or refused would be operationally misleading.
 */
function preparationBlocksFor(state: MutableReplay): IntakePreparationBlock[] {
  const blocks: IntakePreparationBlock[] = [];
  if (!state.scope) blocks.push("analysis_scope_missing");

  if (state.frame?.declaredBy.role === "advisor") {
    if (!state.authorization) blocks.push("advisor_authorization_missing");
    else if (state.authorization.status === "revoked") blocks.push("advisor_authorization_revoked");
  }

  const latestChecks = new Map<IntakeRouteCheck["check"], IntakeRouteCheck>();
  for (const check of state.routeChecks) latestChecks.set(check.check, check);
  if ([...latestChecks.values()].some((check) => check.outcome === "declined")) blocks.push("route_declined");
  if ([...latestChecks.values()].some((check) => check.outcome === "routed")) blocks.push("route_changed");
  return blocks;
}

function ladderPermitsRequest(trace: RequestLadderTrace | undefined, evidenceRevision: number): trace is RequestLadderTrace {
  return Boolean(
    trace &&
    trace.basisRevision === evidenceRevision &&
    trace.attempts.length === ladderOrder.length &&
    trace.attempts.every((attempt) => attempt.outcome !== "found")
  );
}

/**
 * Compiles the next missing requirements into honest request-ladder drafts.
 *
 * At M0 the classified-room check is document-kind based, declared derivation is limited to
 * explicit answers, and no public source is registered as a substitute. The wording preserves
 * those limits instead of claiming that document contents or the internet were searched.
 */
export function buildPendingRequestLadders(state: IntakeState): RequestLadderDraft[] {
  if (!state.archetypeRoute || !state.requestRoadmap || state.preparationBlocks.length > 0) return [];
  const requirements = new Map(
    archetype(state.archetypeRoute.archetypeId).requirements.map((requirement) => [requirement.id, requirement]),
  );

  return state.requestRoadmap.awaitingLadder.map((requirementId) => {
    const requirement = requirements.get(requirementId);
    if (!requirement) throw new Error(`unknown requirement ${requirementId} for request ladder`);
    return {
      requirementId,
      attempts: [
        {
          source: "classified_room",
          outcome: "not_found",
          detail: "No classified document kind currently discharges this requirement.",
          evidenceIds: [],
        },
        {
          source: "declared_derivation",
          outcome: requirement.source === "information" ? "not_found" : "not_applicable",
          detail: requirement.source === "information"
            ? "No current structured answer resolves this requirement."
            : "This document requirement cannot be replaced by a declared answer.",
          evidenceIds: [],
        },
        {
          source: "registered_public_source",
          outcome: "not_permitted",
          detail: "No governed public source is registered as a substitute for this requirement.",
          evidenceIds: [],
        },
      ],
    };
  });
}

function evidenceFromLadders(
  ladders: ReadonlyMap<string, RequestLadderTrace>,
  evidenceRevision: number,
): RequirementEvidence {
  return Object.fromEntries(
    [...ladders.values()]
      .filter((trace) => trace.basisRevision === evidenceRevision)
      .map((trace) => [trace.requirementId, trace.attempts.find((attempt) => attempt.outcome === "found")?.evidenceIds ?? []] as const)
      .filter(([, evidenceIds]) => evidenceIds.length > 0)
      .map(([requirementId, evidenceIds]) => [requirementId, {evidenceIds}]),
  );
}

function withoutAcknowledgedAbsences(report: SufficiencyReport, absenceIds: ReadonlySet<string>): SufficiencyReport {
  if (absenceIds.size === 0) return report;
  return {
    ...report,
    byStage: {
      now: report.byStage.now.filter((status) => !absenceIds.has(status.requirement.id)),
      structuring: report.byStage.structuring.filter((status) => !absenceIds.has(status.requirement.id)),
      diligence: report.byStage.diligence,
      closing: report.byStage.closing,
    },
  };
}

function activeRequest(request: ClientRequest, ladderTrace: RequestLadderTrace): ActiveRequest {
  const requirement = request.status.requirement;
  return {
    requirementId: requirement.id,
    priority: request.priority,
    unlocks: request.unlocks,
    label: requirement.labels,
    whyItMatters: requirement.rationale,
    ...(requirement.question ? {question: requirement.question} : {}),
    acceptedArtifacts: requirement.accepts ?? [],
    responseOptions: requirement.source === "information"
      ? ["text", "not_available", "not_applicable", "after_nda"]
      : ["upload_existing", "not_available", "not_applicable", "after_nda"],
    ladderTrace,
  };
}

function stageCounts(report: SufficiencyReport, stage: RequirementStage) {
  const statuses = report.byStage[stage];
  const satisfied = statuses.filter((status) => status.satisfied).length;
  return {open: statuses.length - satisfied, satisfied, total: statuses.length};
}

function addSuppressionLog(state: MutableReplay, report: SufficiencyReport, occurredAt: string): void {
  for (const status of report.requirements.filter((entry) => entry.satisfied)) {
    const evidenceIds = status.satisfiedBy;
    const decisionId = hash({type: "request_suppressed", requirementId: status.requirement.id, evidenceIds});
    if (state.log.some((entry) => entry.decisionId === decisionId)) continue;
    state.log.push({
      decisionId,
      occurredAt,
      type: "request_suppressed",
      summary: `Request ${status.requirement.id} suppressed because current evidence resolves it.`,
      evidenceIds,
    });
  }
}

function pushLog(
  state: MutableReplay,
  event: EventBase,
  type: IntakeDecisionLogEntry["type"],
  summary: string,
  evidenceIds: readonly string[] = [],
): void {
  state.log.push({decisionId: hash({eventId: event.eventId, type}), occurredAt: event.occurredAt, type, summary, evidenceIds});
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Type helper used by event producers without importing the ontology package directly. */
export type IntakeDocumentKind = DocumentKind;
