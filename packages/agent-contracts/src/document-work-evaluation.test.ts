import {createHash} from "node:crypto";

import {fingerprintJson} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";

import {
  advisorResponseLiveAudience,
  asksForPossiblyNone,
  advisorResponseLiveContentHashes,
  advisorResponseLiveSnapshotSchema,
  distinctEvaluationRoutes,
  documentWorkContinuationSnapshotSchema,
  documentWorkProductGoldInput,
  documentWorkProductLiveAudience,
  documentWorkProductLiveContentHashes,
  documentWorkProductLiveSnapshotSchema,
  evaluationGatewayRequestSchema,
  evaluationPolicyRoutes,
  evaluationTaskPolicy,
  executiveSynthesisLiveRoutes,
  executiveSynthesisLiveSnapshotSchema,
  type EvaluationModelRoute,
} from "./document-work-evaluation";
import {executionCanonicalText} from "./execution-contract";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const sonnet: EvaluationModelRoute = {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"};
const terra: EvaluationModelRoute = {provider: "openai", model: "gpt-5.6-terra", effort: "medium"};
const policy = evaluationTaskPolicy({primary: sonnet, shadow: terra, fallback: terra, maxOutputTokens: 8000, timeoutMs: 180_000});

/** A synthetic authored gold case and control in the fixture's shapes. */
const goldCase = () => ({id: "synthetic-comparison", job: "comparison", objective: "Compare the synthetic proposals.", expected: ["36 months"],
  passages: [{id: "alpha", documentName: "Synthetic Alpha.txt", text: "Proposal Alpha has a maturity of 36 months."}, {id: "beta", documentName: "Synthetic Beta.txt", text: "Proposal Beta is unsecured."}]});
const control = () => ({id: "synthetic-control", scope: "mixed_locale_review_controls",
  input: {job: "comparison", locale: "en-US", approvedRequest: {text: "Compare the terms.", fingerprint: "a".repeat(64)},
    passages: [{id: "alpha", documentId: "alpha", documentName: "Synthetic alpha.txt", version: "1", hash: sha("Alpha text."), anchor: "paragraph 1", text: "Alpha text."}],
    coverage: {documentsConsidered: 1, omittedPassages: 0, limitations: ["Synthetic."]}},
  narrative: {sections: (["terms", "differences", "clarifications"] as const).map((key) => ({key, title: key, observations: []})),
    hypotheses: [{text: "A synthetic hypothesis.", question: "A synthetic question?", basisPassageIds: ["alpha"]}], gaps: []},
  expectedIssueFieldId: "hypotheses.0.text", expectedIssueFieldIds: ["hypotheses.0.text"], expectedCleanFieldIds: []});
const documentary = (extra: Record<string, unknown> = {}) => ({schemaVersion: "document-work-product-live-snapshot.v1", policy, goldCases: [goldCase()], sourceReviewControls: [control()], ...extra});

describe("document work evaluation policies and routes", () => {
  it("reads a gateway policy into the snapshot form and names every route it may send to, once", () => {
    expect(policy).toEqual({primary: sonnet, shadow: terra, fallback: terra, maxOutputTokens: 8000, timeoutMs: 180_000});
    expect(evaluationTaskPolicy({primary: sonnet, maxOutputTokens: 100, timeoutMs: 1000})).toMatchObject({shadow: null, fallback: null});
    expect(evaluationPolicyRoutes(policy)).toEqual([sonnet, terra]);
    expect(evaluationPolicyRoutes({...policy, fallback: {...sonnet, effort: "high"}})).toEqual([sonnet]);
    expect(distinctEvaluationRoutes([sonnet, terra, {...sonnet, effort: "high"}])).toEqual([sonnet, terra]);
  });
});

describe("the documentary snapshot", () => {
  it("keeps the authored cases byte for byte, so their fingerprints survive the transport", () => {
    const snapshot = documentWorkProductLiveSnapshotSchema.parse(documentary());
    expect(fingerprintJson(snapshot.goldCases)).toBe(fingerprintJson([goldCase()]));
    expect(fingerprintJson(snapshot.sourceReviewControls)).toBe(fingerprintJson([control()]));
    expect(JSON.parse(executionCanonicalText(snapshot))).toEqual(snapshot);
  });

  it("builds each gold input exactly as the script did and declares every passage hash once", () => {
    const snapshot = documentWorkProductLiveSnapshotSchema.parse(documentary());
    const input = documentWorkProductGoldInput(snapshot.goldCases[0]!);
    expect(input).toEqual({job: "comparison", locale: "en-US", approvedRequest: {text: "Compare the synthetic proposals.", fingerprint: fingerprintJson({objective: "Compare the synthetic proposals."})},
      passages: goldCase().passages.map((passage) => ({...passage, documentId: passage.id, version: "1", hash: fingerprintJson(passage.text), anchor: "paragraph 1"})),
      coverage: {documentsConsidered: 2, omittedPassages: 0, limitations: ["Synthetic document-only case; no financial calculations or independent diligence."]}});
    const hashes = documentWorkProductLiveContentHashes(snapshot);
    expect(hashes).toEqual([...new Set([...input.passages.map((passage) => passage.hash), sha("Alpha text.")])].sort());
    expect(documentWorkProductLiveAudience(snapshot)).toEqual({caseId: "document-work-product-live",
      caseVersion: fingerprintJson({goldCases: snapshot.goldCases, sourceReviewControls: snapshot.sourceReviewControls})});
  });

  it.each([
    ["an unknown field", documentary({extra: true})],
    ["a repeated gold case", documentary({goldCases: [goldCase(), goldCase()]})],
    ["a repeated control", documentary({sourceReviewControls: [control(), control()]})],
    ["a pattern that does not compile", documentary({goldCases: [{...goldCase(), semanticAssertions: [{id: "a", rationale: "r", sourceId: "alpha", sourceQuote: "q", forbiddenClaims: [{id: "b", pattern: "("}]}]}]})],
    ["a gold case with no passage", documentary({goldCases: [{...goldCase(), passages: []}]})],
    ["four gold cases", documentary({goldCases: ["a", "b", "c", "d"].map((id) => ({...goldCase(), id}))})],
    ["a control with an unknown section", documentary({sourceReviewControls: [{...control(), narrative: {...control().narrative, sections: [{key: "other", title: "t", observations: []}]}}]})],
  ])("refuses %s", (_label, value) => {
    expect(documentWorkProductLiveSnapshotSchema.safeParse(value).success).toBe(false);
  });
});

describe("the continuation, advisor and executive synthesis snapshots", () => {
  const plan = {sourceRunId: "34467680287", sourceReceiptSha256: "b".repeat(64), caseId: "synthetic-control", remainingCalls: 1, maxCostUsd: 0.3, priorCalls: 25, priorCostUsd: 0.2};
  const continuation = (extra: Record<string, unknown> = {}) => ({schemaVersion: "document-work-product-continuation-snapshot.v1",
    policy: {...policy, shadow: null, fallback: null}, plan, control: control(), ...extra});

  it("keeps the continuation to its plan's control and a single route", () => {
    expect(documentWorkContinuationSnapshotSchema.safeParse(continuation()).success).toBe(true);
    expect(documentWorkContinuationSnapshotSchema.safeParse(continuation({control: {...control(), id: "other"}})).success).toBe(false);
    expect(documentWorkContinuationSnapshotSchema.safeParse(continuation({policy})).success).toBe(false);
    expect(documentWorkContinuationSnapshotSchema.safeParse(continuation({plan: {...plan, remainingCalls: 2}})).success).toBe(false);
    expect(documentWorkContinuationSnapshotSchema.safeParse(continuation({plan: {...plan, maxCostUsd: 0.6}})).success).toBe(false);
  });

  it("names the advisor's routes by provider and hashes its one input", () => {
    const value = {schemaVersion: "advisor-response-live-snapshot.v1", policy, routes: {anthropic: sonnet, openai: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}}, input: "{\"synthetic\":true}"};
    const snapshot = advisorResponseLiveSnapshotSchema.parse(value);
    expect(advisorResponseLiveContentHashes(snapshot)).toEqual([sha("{\"synthetic\":true}")]);
    expect(advisorResponseLiveAudience(snapshot)).toEqual({caseId: "advisor-response-live", caseVersion: sha("{\"synthetic\":true}")});
    expect(advisorResponseLiveSnapshotSchema.safeParse({...value, routes: {anthropic: terra, openai: terra}}).success).toBe(false);
  });

  it("declares every route the author and the reviewers may use", () => {
    const opus: EvaluationModelRoute = {provider: "anthropic", model: "claude-opus-5", effort: "high"};
    const sol: EvaluationModelRoute = {provider: "openai", model: "gpt-5.6-sol", effort: "high"};
    const value = {schemaVersion: "executive-synthesis-live-snapshot.v1", fixtureFingerprint: "c".repeat(64),
      policies: {case_brief: {...policy, primary: opus, shadow: sol, fallback: sol}, audit_evidence: {...policy, primary: sol, shadow: null, fallback: opus}},
      reviewers: {anthropic: opus, openai: sol},
      case: {archetypeId: "growth_expansion", referenceDate: "2026-08-24",
        candidates: [{fieldPath: "company.legal_name", normalizedValue: "Synthetic S.A.", valueType: "text", sourceDocument: "profile.md", evidenceRank: 4,
          informationClass: "company_document", confidence: 0.99, anchorVerified: true, anchor: {document: "profile.md"}}],
        documents: [{id: "doc-company", kind: "company_registration"}]}};
    const snapshot = executiveSynthesisLiveSnapshotSchema.parse(value);
    expect(executiveSynthesisLiveRoutes(snapshot)).toEqual([opus, sol]);
    expect(executiveSynthesisLiveSnapshotSchema.safeParse({...value, case: {...value.case, candidates: [{...value.case.candidates[0], extra: 1}]}}).success).toBe(false);
    expect(executiveSynthesisLiveSnapshotSchema.safeParse({...value, reviewers: {anthropic: sol, openai: sol}}).success).toBe(false);
  });
});

describe("the content-free record of one gateway request", () => {
  const request = {partition: "gold", task: "preliminary_understanding", schemaName: "document_work_selection_v1", providerCallRange: {start: 0, end: 1}, outcome: "ok",
    attempts: [{provider: "anthropic", model: "claude-sonnet-5", outcome: "ok", retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false}],
    answer: {provider: "anthropic", model: "claude-sonnet-5", effort: "medium", usage: {inputTokens: 10, outputTokens: 2, cachedInputTokens: 0}, costUsd: 0.0001, latencyMs: 5,
      stopReason: "end", fromCassette: false},
    spent: {calls: 1, costUsd: 0.0001, unknownCostCalls: 0, budgetExposureUsd: 0.0001}};

  it("carries identities, outcomes and spend, and nothing else", () => {
    expect(evaluationGatewayRequestSchema.parse(request)).toEqual(request);
    for (const altered of [{...request, prompt: "text"}, {...request, answer: {...request.answer, output: {}}}, {...request, attempts: [{...request.attempts[0], message: "raw provider text"}]},
      {...request, outcome: "evaluation_stopped"}, {...request, partition: "Gold Partition"}]) {
      expect(evaluationGatewayRequestSchema.safeParse(altered).success).toBe(false);
    }
  });
});

describe("the possibly-none question of the absence rule", () => {
  it("accepts what the replaced expression accepted and refuses what it refused", () => {
    for (const text of ["What other financial protections, if any, apply?", "  what additional covenants, IF ANY, are documented?  ", "What other x, if any, , if any, y?"]) expect(asksForPossiblyNone(text), text).toBe(true);
    for (const text of ["What other protections, if any, apply", "What other protections apply?", "What other, if any, apply?", "What other protections, if any, ?",
      "What other protections. If any, apply?", "Which other protections, if any, apply?", "What protections, if any, apply?"]) expect(asksForPossiblyNone(text), text).toBe(false);
  });

  it("answers in linear time on a long run of the marker", () => {
    const adversarial = "what other " + ", if any, ".repeat(50_000);
    const started = performance.now();
    expect(asksForPossiblyNone(adversarial)).toBe(false);
    expect(asksForPossiblyNone(adversarial + "x?")).toBe(true);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
