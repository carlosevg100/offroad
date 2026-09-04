import {describe, expect, it} from "vitest";

import {autonomyLadder, autonomyRank, effectWithinAutonomy, minimumAutonomyForEffect} from "./autonomy";
import {benchmarkScorecardSchema, changeExplanationHolds, changeExplanationSchema, findingsLedgerEntrySchema, scorecardPasses} from "./findings";
import {intentEnvelopeSchema, namedCompositions, needsConfirmation, primaryWorkSchema, systemFieldViolations} from "./intent-envelope";
import {readingDebts, readingManifestSchema} from "./reading-manifest";

const uuid = "11111111-1111-4111-8111-111111111111";
const now = "2026-09-04T21:00:00.000Z";

function envelope(overrides: Record<string, unknown> = {}) {
  return intentEnvelopeSchema.parse({
    schemaVersion: "intent-envelope.v1",
    routingCore: {
      action: {value: ["levantar", "compreender"], state: "inferred", confidence: 0.8},
      object: {value: [{kind: "company", reference: "Camil"}], state: "explicit"},
      desiredOutcome: {value: "material revisável para o VP", state: "inferred", confidence: 0.7},
      decision: {value: "qual tese levar", state: "inferred", confidence: 0.6},
      audience: {value: ["vp"], state: "explicit"},
      depth: {value: "preliminary", state: "inferred", confidence: 0.7},
      continuity: {value: "new", state: "inferred", confidence: 0.9},
      workResponsibility: {value: ["producer"], state: "explicit"},
    },
    executionContext: {
      evidenceRegime: {value: "public", state: "system"},
      authority: {value: ["read"], state: "system"},
      organizationId: {value: uuid, state: "system"},
      projectId: {value: null, state: "system"},
      availableDocumentIds: {value: [], state: "system"},
      jurisdiction: {value: ["BR"], state: "inferred", confidence: 0.9},
      asOfDate: {value: null, state: "unknown"},
      currency: {value: "BRL", state: "inferred", confidence: 0.9},
      deadline: {value: "segunda-feira", state: "explicit"},
      sponsorInstruction: {value: "refinanciamento", state: "explicit"},
      constraints: {value: [], state: "unknown"},
      language: {value: "pt-BR", state: "system"},
      urgency: {value: "this_week", state: "inferred", confidence: 0.8},
      availableInputs: {value: ["conversa"], state: "explicit"},
    },
    primaryWorks: [{work: "understand", confidence: 0.8}, {work: "capital_strategy", confidence: 0.6}],
    composition: "prepare_meeting",
    effect: "none",
    createdAt: now,
    ...overrides,
  });
}

describe("intent envelope v1", () => {
  it("keeps the system-provided fields out of the model's hands", () => {
    expect(systemFieldViolations(envelope())).toEqual([]);
    expect(() => envelope({
      executionContext: {...envelope().executionContext, authority: {value: ["introduce"], state: "inferred", confidence: 0.9}},
    })).toThrow();
  });

  it("requires a confidence on anything inferred, so an inference stays corrigible", () => {
    expect(() => envelope({
      routingCore: {...envelope().routingCore, depth: {value: "institutional", state: "inferred"}},
    })).toThrow(/confidence/);
  });

  it("asks a person only for material fields that were neither stated nor confirmed", () => {
    expect(needsConfirmation({state: "inferred", confidence: 0.9}, true)).toBe(true);
    expect(needsConfirmation({state: "inferred", confidence: 0.9}, false)).toBe(false);
    expect(needsConfirmation({state: "explicit"}, true)).toBe(false);
    expect(needsConfirmation({state: "system"}, true)).toBe(false);
  });

  it("derives the twenty Atlas families from the nine primary works", () => {
    const works = new Set<string>(primaryWorkSchema.options);
    const atlasIds = new Set<string>();
    for (const composition of Object.values(namedCompositions)) {
      atlasIds.add(composition.atlas);
      for (const work of composition.primaryWorks) expect(works.has(work)).toBe(true);
    }
    expect(atlasIds.size).toBe(20);
    expect(namedCompositions.review_work.modifiers.workResponsibility).toBe("reviewer");
    expect(namedCompositions.introduce.modifiers.effect).toBe("external");
  });
});

describe("reading manifest", () => {
  const base = {
    schemaVersion: "reading-manifest.v1" as const,
    taskSpecId: "D06",
    strategies: ["structured_query", "version_reconciliation"],
    files: [{documentId: uuid, documentVersion: 1, pagesTotal: 40, pagesCovered: [{from: 1, to: 40}], exhaustive: true, sectionsCovered: []}],
    periodsCovered: ["2025-12-31"],
    dimensionsCovered: ["debt.instruments"],
    dimensionsNotCovered: [],
    completeness: "complete" as const,
  };

  it("refuses an exhaustive strategy that left a file partially read", () => {
    expect(() => readingManifestSchema.parse({
      ...base,
      strategies: ["exhaustive_corpus"],
      files: [{...base.files[0], exhaustive: false, pagesCovered: [{from: 1, to: 10}]}],
      completeness: "partial",
    })).toThrow(/exhaustive/);
  });

  it("names what a manifest still owes", () => {
    const manifest = readingManifestSchema.parse({
      ...base,
      files: [{...base.files[0], exhaustive: false, pagesCovered: []}],
      dimensionsNotCovered: [{key: "covenants", reason: " "}],
      completeness: "partial",
    });
    expect(readingDebts(manifest)).toEqual([`${uuid}@1: nothing read`, "covenants: not covered without a reason"]);
  });
});

describe("autonomy ladder", () => {
  it("climbs monotonically and keeps external effects at the top, behind a person", () => {
    const ranks = autonomyLadder.map((entry) => entry.rank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(minimumAutonomyForEffect("external")).toBe("share_or_introduce");
    expect(autonomyLadder.find((entry) => entry.level === "share_or_introduce")?.requiresHumanApproval).toBe(true);
    expect(effectWithinAutonomy("prepare_drafts", "commit")).toBe(false);
    expect(effectWithinAutonomy("apply_after_approval", "commit")).toBe(true);
    expect(autonomyRank("read_and_flag")).toBeLessThan(autonomyRank("propose_changes"));
  });
});

describe("findings ledger and change explanation", () => {
  const finding = {
    schemaVersion: "findings-ledger.v1" as const,
    id: uuid, runId: uuid, projectId: uuid,
    origin: "discovered" as const,
    producedBy: "monitor.maturity_wall",
    what: "A concentração de vencimentos em 2027 subiu.",
    whyNow: "Nova divulgação substituiu o cronograma anterior.",
    whyMaterial: "Pressiona o caixa no período do capex anunciado.",
    materiality: "high" as const,
    evidence: [],
    calculationTraceIds: ["calc:maturity_wall:2027"],
    confidence: 0.8,
    affectedDecisionIds: [], affectedArtifactIds: [],
    counterHypothesis: "O refinanciamento já contratado cobre o pico.",
    nextTest: "Conciliar o cronograma com a nota de dívida da nova divulgação.",
    reviewStatus: "pending" as const,
    reviewedBy: null,
    createdAt: now,
  };

  it("keeps a discovered finding pending until a person accepts it", () => {
    expect(() => findingsLedgerEntrySchema.parse(finding)).not.toThrow();
    expect(() => findingsLedgerEntrySchema.parse({...finding, reviewStatus: "accepted"})).toThrow(/person/);
    expect(() => findingsLedgerEntrySchema.parse({...finding, calculationTraceIds: []})).toThrow(/evidence or a calculation/);
  });

  it("holds only when every moved output has a cause", () => {
    const explained = changeExplanationSchema.parse({
      schemaVersion: "change-explanation.v1", fromRunId: uuid, toRunId: uuid,
      changes: [{kind: "assumption", reference: "assumption:cdi", before: "0.105", after: "0.12", affectedOutputs: ["dscr.2027"]}],
      unexplainedOutputs: [],
    });
    expect(changeExplanationHolds(explained)).toBe(true);
    expect(changeExplanationHolds({...explained, unexplainedOutputs: ["leverage.2026"]})).toBe(false);
  });

  it("does not pass a case that missed something material", () => {
    const card = benchmarkScorecardSchema.parse({
      schemaVersion: "benchmark-scorecard.v1", caseId: "gc01", caseVersion: "1.0", baselineModel: "generalist",
      alphaFindings: 3, materialOmissions: 0, falseAlerts: 1, numericErrors: 0, unanchoredMaterialClaims: 0,
      latencySeconds: 120, costUsd: 0.9, reviewedBy: [uuid],
    });
    expect(scorecardPasses(card)).toBe(true);
    expect(scorecardPasses({...card, materialOmissions: 1})).toBe(false);
    expect(scorecardPasses({...card, alphaFindings: 1})).toBe(false);
  });
});
