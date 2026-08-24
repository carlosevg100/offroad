import {createHash} from "node:crypto";

import type {DealRequest, ResolvedMandate} from "@offroad/fund-mandate";
import {assessMandateFit} from "@offroad/fund-mandate";

import {
  governedChunkSchema,
  retrievalRequestSchema,
  type GovernedChunk,
  type RetrievalRequest,
  type RetrievalResult,
  type RetrievedChunk,
} from "./schema";

export function retrieveGoverned(
  rawRequest: RetrievalRequest,
  rawChunks: readonly GovernedChunk[],
): RetrievalResult {
  const request = retrievalRequestSchema.parse(rawRequest);
  if (!request.intakeSessionId && !request.opportunityId) {
    return emptyResult(request, "scope_not_established");
  }

  const excluded = {scope: 0, version: 0, mandate: 0, governance: 0, relevance: 0};
  const allowedFunds = new Set(request.allowedFundIds);
  const tokens = tokenize(request.query);
  const candidates: RetrievedChunk[] = [];

  for (const raw of rawChunks) {
    const parsed = governedChunkSchema.safeParse(raw);
    if (!parsed.success) {
      excluded.governance += 1;
      continue;
    }
    const chunk = parsed.data;
    if (contentHash(chunk.content) !== chunk.contentHash) {
      excluded.governance += 1;
      continue;
    }
    if (chunk.source === "case") {
      const wrongOpportunity = request.opportunityId !== undefined
        && chunk.opportunityId !== request.opportunityId;
      const wrongSession = request.intakeSessionId !== undefined
        && chunk.intakeSessionId !== request.intakeSessionId;
      if (chunk.organizationId !== request.organizationId || wrongOpportunity || wrongSession) {
        excluded.scope += 1;
        continue;
      }
    } else if (chunk.source === "house_playbook") {
      if (chunk.playbookVersion !== request.playbookVersion) {
        excluded.version += 1;
        continue;
      }
    } else if (chunk.source === "mandate_note") {
      if (!allowedFunds.has(chunk.fundId)) {
        excluded.mandate += 1;
        continue;
      }
    } else {
      if (!request.precedentPurpose || !chunk.authorizedPurposes.includes(request.precedentPurpose)) {
        excluded.governance += 1;
        continue;
      }
    }

    const lexical = lexicalScore(tokens, tokenize(chunk.content));
    const semantic = chunk.source === "mandate_note" && request.queryEmbedding && chunk.embedding
      ? cosine(request.queryEmbedding, chunk.embedding)
      : 0;
    const score = chunk.source === "mandate_note" && semantic > 0
      ? clamp(lexical * 0.35 + semantic * 0.65)
      : lexical;
    if (score < request.minScore) {
      excluded.relevance += 1;
      continue;
    }
    candidates.push({chunk, score, citation: chunk.citation});
  }

  candidates.sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id));
  const retrieved = candidates.slice(0, request.limit);
  return {
    requestFingerprint: fingerprintRequest(request),
    retrieved,
    citations: retrieved.map((entry) => entry.citation),
    abstained: retrieved.length === 0,
    ...(retrieved.length === 0 ? {abstentionReason: "no_governed_evidence" as const} : {}),
    excluded,
  };
}

export function mandateIdsPassingHardFilters(
  mandates: readonly ResolvedMandate[],
  request: DealRequest,
): string[] {
  return mandates
    .map((mandate) => assessMandateFit(mandate, request))
    .filter((fit) => fit.verdict === "fits")
    .map((fit) => fit.fundId)
    .sort();
}

export function validateGroundedStatements(
  statements: readonly {text: string; citationKeys: readonly string[]}[],
  result: RetrievalResult,
): {status: "grounded"; statements: typeof statements} | {status: "abstained"; reason: string} {
  if (result.abstained) return {status: "abstained", reason: result.abstentionReason ?? "no_governed_evidence"};
  const allowed = new Set(result.citations.map((citation) => citation.key));
  for (const statement of statements) {
    if (!statement.text.trim()) continue;
    if (statement.citationKeys.length === 0) {
      return {status: "abstained", reason: "uncited_statement"};
    }
    if (statement.citationKeys.some((key) => !allowed.has(key))) {
      return {status: "abstained", reason: "citation_outside_retrieval"};
    }
  }
  return {status: "grounded", statements};
}

function emptyResult(request: RetrievalRequest, reason: "scope_not_established"): RetrievalResult {
  return {
    requestFingerprint: fingerprintRequest(request),
    retrieved: [],
    citations: [],
    abstained: true,
    abstentionReason: reason,
    excluded: {scope: 0, version: 0, mandate: 0, governance: 0, relevance: 0},
  };
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  );
}

function lexicalScore(query: Set<string>, content: Set<string>): number {
  if (query.size === 0 || content.size === 0) return 0;
  const overlap = [...query].filter((token) => content.has(token)).length;
  if (overlap === 0) return 0;
  const recall = overlap / query.size;
  const precision = overlap / Math.min(content.size, Math.max(query.size * 4, 1));
  return clamp(recall * 0.8 + precision * 0.2);
}

function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clamp(dot / Math.sqrt(leftNorm * rightNorm));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function fingerprintRequest(request: RetrievalRequest): string {
  return createHash("sha256").update(JSON.stringify({
    ...request,
    allowedFundIds: [...request.allowedFundIds].sort(),
    queryEmbedding: request.queryEmbedding ? "present" : "absent",
  })).digest("hex");
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "que", "the", "and", "for", "from", "in", "of", "or", "to", "with",
]);
