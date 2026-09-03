import {randomUUID} from "node:crypto";

import {
  createDcmDecisionRecord,
  dcmAgentAssessmentSchema,
  rankInformationRequests,
  type DcmAgentAssessment,
  type DcmDecisionRecord,
  type DcmEvidenceRef,
  type DcmInformationRequest,
  type DcmRequirementCoverage,
} from "@offroad/agent-contracts";
import {
  assessSufficiency,
  type ArchetypeId,
  type ClassifiedDocument,
  type InformationAnswers,
  type RequirementResponses,
  type RequirementStatus,
} from "@offroad/credit-playbook";
type Locale = "pt-BR" | "en-US";
type ClientQuestion = {
  findingId: string;
  severity: "critical" | "high" | "medium";
  pt: string;
  en: string;
};

export type RequestedInformation = {
  request: string;
  whyItMatters: string;
  decisionImpact: string;
  acceptableEvidence: string[];
};

export type DirectionalDecision = {
  decisionKey: string;
  question: string;
  status: "open" | "directional";
  recommendation: string | null;
  alternatives?: DcmDecisionRecord["alternatives"];
  rationaleSummary: string;
  evidence?: DcmEvidenceRef[];
  assumptions?: string[];
  unresolved?: string[];
  confidence: DcmDecisionRecord["confidence"];
  proposedBy: DcmDecisionRecord["proposedBy"];
};

/**
 * Projects the deterministic private-case sufficiency engine into the durable project work map.
 * Files and typed answers discharge requirements automatically; only the three highest-value
 * unresolved items become active client requests.
 */
export function buildPrivateCaseAssessment(input: {
  projectId: string;
  assessmentRef: string;
  locale: Locale;
  assessedAt: string;
  archetypeId: ArchetypeId;
  documents: readonly ClassifiedDocument[];
  answers?: InformationAnswers;
  responses?: RequirementResponses;
  clientQuestions?: readonly ClientQuestion[];
  decision?: DirectionalDecision;
}): DcmAgentAssessment {
  const report = assessSufficiency(
    input.archetypeId,
    input.documents,
    input.answers,
    input.responses,
  );
  const coverage = report.requirements.map((status) => requirementCoverage(input, status));
  const requirementRequests = report.missing
    .filter((status) => status.stage === "now" || status.stage === "structuring")
    .filter((status) => status.requirement.source !== "notice")
    .map((status) => requirementRequest(input, status));
  const findingRequests = (input.clientQuestions ?? []).map((question) => findingRequest(input, question));
  const findingCoverage = (input.clientQuestions ?? []).map((question) => findingRequirementCoverage(input, question));

  return assessment(input, [...coverage, ...findingCoverage], [
    ...findingRequests,
    ...requirementRequests,
  ], input.decision ? [input.decision] : []);
}

/** Public-only work starts with no document claims. Its output still becomes actionable: every
 * requested input is represented as a coverage gap tied to the decision it can change. */
export function buildPublicWorkAssessment(input: {
  projectId: string;
  assessmentRef: string;
  locale: Locale;
  assessedAt: string;
  requests: readonly RequestedInformation[];
  decision?: DirectionalDecision;
}): DcmAgentAssessment {
  const coverage = input.requests.map((request, index): DcmRequirementCoverage => ({
    schemaVersion: "dcm-requirement-coverage.v1",
    id: randomUUID(),
    projectId: input.projectId,
    requirementKey: publicRequirementKey(request.request, index),
    label: request.request.slice(0, 240),
    status: "missing",
    materiality: index === 0 ? "blocking" : "high",
    decisionIds: [],
    evidence: [],
    missingReason: request.whyItMatters.slice(0, 1_000),
    assessedAt: input.assessedAt,
    assessedBy: "deal_captain",
  }));
  const requests = input.requests.map((request, index) => makeRequest({
    projectId: input.projectId,
    requirementKey: coverage[index]!.requirementKey,
    createdAt: input.assessedAt,
    question: request.request,
    whyItMatters: request.whyItMatters,
    decisionImpact: request.decisionImpact,
    acceptableEvidence: request.acceptableEvidence,
    answerKind: "document",
    priority: index === 0 ? "blocking" : "high_value",
    informationGain: Math.max(0.65, 0.95 - (index * 0.08)),
    materiality: Math.max(0.7, 0.95 - (index * 0.06)),
    answerability: 0.9,
  }));
  return assessment(input, coverage, requests, input.decision ? [input.decision] : []);
}

/** Preliminary understanding can expose genuine unknowns before an archetype has been confirmed.
 * These are not converted into a long questionnaire; ranking still caps the active batch at three. */
export function buildPreliminaryAssessment(input: {
  projectId: string;
  assessmentRef: string;
  locale: Locale;
  assessedAt: string;
  openPoints: readonly string[];
}): DcmAgentAssessment {
  const publicRequests = input.openPoints.map((point): RequestedInformation => ({
    request: point,
    whyItMatters: input.locale === "pt-BR"
      ? "Este ponto altera o entendimento da companhia, da necessidade de capital ou do escopo da análise."
      : "This point changes the understanding of the company, capital need, or analysis scope.",
    decisionImpact: input.locale === "pt-BR"
      ? "A resposta define quais análises e alternativas devem ser priorizadas na próxima etapa."
      : "The answer determines which analyses and alternatives should be prioritized next.",
    acceptableEvidence: input.locale === "pt-BR"
      ? ["Resposta no chat", "Documento de suporte"]
      : ["Chat response", "Supporting document"],
  }));
  return buildPublicWorkAssessment({...input, requests: publicRequests});
}

function assessment(
  input: {projectId: string; assessmentRef: string; assessedAt: string},
  coverage: DcmRequirementCoverage[],
  requests: DcmInformationRequest[],
  decisions: DirectionalDecision[],
): DcmAgentAssessment {
  const uniqueCoverage = uniqueBy(coverage, (item) => item.requirementKey);
  const uniqueRequests = uniqueBy(requests, (item) => item.requirementKey);
  const selectedRequests = rankInformationRequests(uniqueRequests, 3);
  const decisionRecords = decisions.map((decision) => createDcmDecisionRecord({
    id: randomUUID(),
    projectId: input.projectId,
    decisionKey: decision.decisionKey,
    question: decision.question,
    status: decision.status,
    recommendation: decision.recommendation,
    alternatives: decision.alternatives ?? [],
    rationaleSummary: decision.rationaleSummary,
    evidence: decision.evidence ?? [],
    assumptions: decision.assumptions ?? [],
    unresolved: decision.unresolved ?? [],
    confidence: decision.confidence,
    proposedBy: decision.proposedBy,
    reviewedBy: null,
    createdAt: input.assessedAt,
    supersedesDecisionId: null,
  }));
  return dcmAgentAssessmentSchema.parse({
    schemaVersion: "dcm-agent-assessment.v1",
    projectId: input.projectId,
    assessmentRef: input.assessmentRef,
    coverage: uniqueCoverage,
    requests: selectedRequests,
    decisions: decisionRecords,
  });
}

function requirementCoverage(
  input: {projectId: string; archetypeId: ArchetypeId; locale: Locale; assessedAt: string},
  status: RequirementStatus,
): DcmRequirementCoverage {
  const language = input.locale === "pt-BR" ? "pt" : "en";
  const evidence: DcmEvidenceRef[] = status.satisfiedBy.map((id) => ({
    type: "private_document_anchor",
    id: `document:${id}`,
    accessBasis: "authorized_private",
  }));
  if (status.answer) {
    evidence.push({type: "user_message", id: `answer:${status.requirement.id}`, accessBasis: "authorized_private"});
  }
  const coverageStatus: DcmRequirementCoverage["status"] = status.satisfied
    ? status.response === "not_applicable" ? "not_applicable" : "verified"
    : status.response === "partial" || status.response === "after_nda" ? "partial"
      : status.response === "unavailable" ? "unavailable" : "missing";
  return {
    schemaVersion: "dcm-requirement-coverage.v1",
    id: randomUUID(),
    projectId: input.projectId,
    requirementKey: `playbook.${input.archetypeId}.${keyPart(status.requirement.id)}`,
    label: status.requirement.labels[language].slice(0, 240),
    status: coverageStatus,
    materiality: status.requirement.level === "minimum" ? "blocking"
      : status.stage === "structuring" ? "high" : "medium",
    decisionIds: [],
    evidence,
    missingReason: coverageStatus === "missing"
      ? status.requirement.rationale[language].slice(0, 1_000)
      : null,
    assessedAt: input.assessedAt,
    assessedBy: status.requirement.source === "information" ? "deal_captain" : "document_intelligence",
  };
}

function requirementRequest(
  input: {projectId: string; archetypeId: ArchetypeId; locale: Locale; assessedAt: string},
  status: RequirementStatus,
): DcmInformationRequest {
  const language = input.locale === "pt-BR" ? "pt" : "en";
  const requirement = status.requirement;
  const accepted = requirement.accepts?.map((entry) => entry[language])
    ?? requirement.satisfiedBy.map((kind) => kind.replaceAll("_", " "));
  const evidence = accepted.length > 0 ? accepted : [input.locale === "pt-BR" ? "Resposta no chat" : "Chat response"];
  const period = requirement.period?.[language];
  const question = requirement.question?.[language]
    ?? (input.locale === "pt-BR"
      ? `Envie ${requirement.labels.pt.toLocaleLowerCase("pt-BR")}${period ? `, ${period}` : ""}.`
      : `Please provide ${requirement.labels.en.toLocaleLowerCase("en-US")}${period ? `, ${period}` : ""}.`);
  return makeRequest({
    projectId: input.projectId,
    requirementKey: `playbook.${input.archetypeId}.${keyPart(requirement.id)}`,
    createdAt: input.assessedAt,
    question,
    whyItMatters: requirement.rationale[language],
    decisionImpact: decisionImpact(requirement.purposes, input.locale),
    acceptableEvidence: evidence,
    answerKind: requirement.source === "information" ? answerKind(requirement.answerFormat) : "document",
    priority: requirement.level === "minimum" ? "blocking" : "high_value",
    informationGain: requirement.level === "minimum" ? 0.95 : 0.78,
    materiality: requirement.level === "minimum" ? 1 : 0.8,
    answerability: 0.9,
  });
}

function findingRequirementCoverage(
  input: {projectId: string; assessedAt: string; locale: Locale},
  question: ClientQuestion,
): DcmRequirementCoverage {
  const text = input.locale === "pt-BR" ? question.pt : question.en;
  return {
    schemaVersion: "dcm-requirement-coverage.v1",
    id: randomUUID(),
    projectId: input.projectId,
    requirementKey: `finding.${keyPart(question.findingId)}`,
    label: text.slice(0, 240),
    status: "missing",
    materiality: question.severity === "critical" ? "blocking" : question.severity,
    decisionIds: [],
    evidence: [],
    missingReason: input.locale === "pt-BR"
      ? "A análise identificou uma divergência ou condição que exige confirmação antes da decisão."
      : "The analysis identified a divergence or condition that requires confirmation before the decision.",
    assessedAt: input.assessedAt,
    assessedBy: "financial_analysis",
  };
}

function findingRequest(
  input: {projectId: string; assessedAt: string; locale: Locale},
  question: ClientQuestion,
): DcmInformationRequest {
  return makeRequest({
    projectId: input.projectId,
    requirementKey: `finding.${keyPart(question.findingId)}`,
    createdAt: input.assessedAt,
    question: input.locale === "pt-BR" ? question.pt : question.en,
    whyItMatters: input.locale === "pt-BR"
      ? "A resposta resolve um ponto levantado pela análise financeira e evita estruturar sobre uma premissa incorreta."
      : "The answer resolves a point raised by the financial analysis and prevents structuring on an incorrect assumption.",
    decisionImpact: input.locale === "pt-BR"
      ? "Pode alterar capacidade, sizing, prazo, garantias, covenants ou a própria viabilidade da alternativa."
      : "It can change capacity, sizing, tenor, collateral, covenants, or the viability of the alternative itself.",
    acceptableEvidence: input.locale === "pt-BR"
      ? ["Resposta fundamentada no chat", "Documento ou planilha de suporte"]
      : ["Supported chat response", "Supporting document or spreadsheet"],
    answerKind: "text",
    priority: question.severity === "critical" ? "blocking" : "high_value",
    informationGain: question.severity === "critical" ? 1 : question.severity === "high" ? 0.92 : 0.76,
    materiality: question.severity === "critical" ? 1 : question.severity === "high" ? 0.9 : 0.7,
    answerability: 0.85,
  });
}

function makeRequest(input: {
  projectId: string;
  requirementKey: string;
  createdAt: string;
  question: string;
  whyItMatters: string;
  decisionImpact: string;
  acceptableEvidence: string[];
  answerKind: DcmInformationRequest["answerKind"];
  priority: DcmInformationRequest["priority"];
  informationGain: number;
  materiality: number;
  answerability: number;
}): DcmInformationRequest {
  return {
    schemaVersion: "dcm-information-request.v1",
    id: randomUUID(),
    projectId: input.projectId,
    requirementKey: input.requirementKey,
    question: input.question.slice(0, 1_000),
    whyItMatters: input.whyItMatters.slice(0, 1_000),
    decisionImpact: input.decisionImpact.slice(0, 1_000),
    acceptableEvidence: input.acceptableEvidence.slice(0, 12).map((value) => value.slice(0, 200)),
    answerKind: input.answerKind,
    choices: [],
    priority: input.priority,
    informationGain: input.informationGain,
    materiality: input.materiality,
    answerability: input.answerability,
    redundancyPenalty: 0,
    status: "open",
    createdAt: input.createdAt,
  };
}

function publicRequirementKey(request: string, index: number): string {
  return `requested_input.${keyPart(request).slice(0, 72) || "item"}.${index + 1}`;
}

function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function keyPart(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "unknown";
}

function answerKind(format: string | undefined): DcmInformationRequest["answerKind"] {
  if (format === "number" || format === "currency" || format === "percentage") return "number";
  if (format === "date") return "date";
  return "text";
}

function decisionImpact(purposes: readonly string[], locale: Locale): string {
  const joined = purposes.join(", ");
  return locale === "pt-BR"
    ? `Completa a base necessária para ${joined} e pode alterar a análise, a estrutura ou a forma de apresentação do caso.`
    : `It completes the evidence needed for ${joined} and can change the analysis, structure, or presentation of the case.`;
}
