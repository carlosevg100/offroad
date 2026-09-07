import {intentEnvelopeSchema, type PrimaryWork} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {observeIntentObjectiveRoute, resolveIntentObjective} from "./intent-objective-resolution";

function envelope(input: {
  composition?: string | null;
  works: PrimaryWork[];
  depth?: "point" | "preliminary" | "institutional";
  objects?: Array<"company" | "document" | "decision" | "operation" | "market">;
  audience?: string[];
  documentIds?: string[];
}) {
  const explicit = <T>(value: T) => ({value, state: "explicit" as const});
  const system = <T>(value: T) => ({value, state: "system" as const});
  return intentEnvelopeSchema.parse({
    schemaVersion: "intent-envelope.v1",
    routingCore: {
      action: explicit(["analisar"]),
      object: explicit((input.objects ?? ["company"]).map((kind) => ({kind}))),
      desiredOutcome: explicit("produzir o resultado profissional pedido"),
      decision: explicit(null),
      audience: explicit(input.audience ?? ["usuário"]),
      depth: explicit(input.depth ?? "institutional"),
      continuity: explicit("new"),
      workResponsibility: explicit(["producer"]),
    },
    executionContext: {
      evidenceRegime: system(input.documentIds?.length ? "private_authorized" : "public"),
      authority: system(["read", "modify"]),
      organizationId: system("10000000-0000-4000-8000-000000000001"),
      projectId: system("20000000-0000-4000-8000-000000000001"),
      availableDocumentIds: system(input.documentIds ?? []),
      jurisdiction: explicit(["BR"]),
      asOfDate: explicit(null),
      currency: explicit("BRL"),
      deadline: explicit(null),
      sponsorInstruction: explicit(null),
      constraints: explicit([]),
      language: system("pt-BR"),
      urgency: explicit(null),
      availableInputs: explicit([]),
    },
    primaryWorks: input.works.map((work, index) => ({work, confidence: 0.95 - index * 0.05})),
    composition: input.composition ?? null,
    effect: "none",
    createdAt: "2026-09-07T12:00:00.000Z",
  });
}

describe("semantic intent to objective resolution", () => {
  it.each([
    ["answer_a_question", ["extract_and_reconcile"], "factual_question"],
    ["prepare_meeting", ["understand", "capital_strategy"], "meeting_preparation"],
    ["prepare_decision", ["capital_strategy", "model"], "board_decision"],
    ["design_indicative_structure", ["capital_strategy", "analyze"], "capital_strategy"],
    ["evaluate_received_opportunity", ["analyze", "read_documents"], "operation_review"],
    ["identify_capital", ["capital_match"], "capital_matching"],
  ] as const)("maps %s to the bounded objective %s", (composition, works, objectiveKind) => {
    expect(resolveIntentObjective(envelope({composition, works: [...works]}))).toMatchObject({
      status: "resolved",
      objectiveKind,
      reasonCode: "named_composition",
      composition,
    });
  });

  it.each([
    ["find_and_organize_information", "information_organization_objective_not_implemented", ["find_and_organize"]],
    ["map_market_and_precedents", "market_mapping_objective_not_implemented", ["market"]],
    ["monitor", "monitoring_objective_not_implemented", ["find_and_organize"]],
    ["new_model_composition", "unknown_named_composition", ["model"]],
  ] as const)("names the coverage gap for %s instead of inventing a generic plan", (composition, reasonCode, works) => {
    expect(resolveIntentObjective(envelope({composition, works: [...works]}))).toMatchObject({
      status: "coverage_gap",
      objectiveKind: "ambiguous",
      reasonCode,
      requiredContext: [],
    });
  });

  it("requires the effective document set for a document review without evidence", () => {
    expect(resolveIntentObjective(envelope({works: ["read_documents"], objects: ["document"]}))).toMatchObject({
      status: "needs_context",
      objectiveKind: "ambiguous",
      reasonCode: "document_review_evidence_required",
      requiredContext: ["effective_document_set"],
    });
  });

  it("lets classifier abstention override an otherwise resolvable composition", () => {
    expect(resolveIntentObjective(
      envelope({composition: "prepare_meeting", works: ["understand", "capital_strategy"]}),
      {abstain: true, abstainReason: "O resultado desejado não está claro."},
    )).toMatchObject({
      status: "needs_context",
      objectiveKind: "ambiguous",
      reasonCode: "classifier_abstained_with_reason",
      requiredContext: ["desired_outcome"],
    });
  });

  it("uses governed objects and audience to distinguish board work from capital strategy", () => {
    const board = resolveIntentObjective(envelope({works: ["capital_strategy"], objects: ["decision"], audience: ["conselho"]}));
    const strategy = resolveIntentObjective(envelope({works: ["capital_strategy"], objects: ["operation"], audience: ["equipe interna"]}));
    expect(board.objectiveKind).toBe("board_decision");
    expect(strategy.objectiveKind).toBe("capital_strategy");
    expect(board.resolutionFingerprint).not.toBe(strategy.resolutionFingerprint);
  });

  it("is deterministic and does not include authority in its decision vocabulary", () => {
    const input = envelope({composition: "prepare_meeting", works: ["understand", "capital_strategy"]});
    const first = resolveIntentObjective(input);
    const second = resolveIntentObjective(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/approve_internal|introduce|share/);
  });

  it("records agreement without allowing the semantic observation to govern execution", () => {
    const observation = observeIntentObjectiveRoute(
      envelope({composition: "prepare_meeting", works: ["understand", "capital_strategy"]}),
      {message: "Tenho reunião com a Camil e quero discutir alternativas de refinanciamento.", hasAttachments: false},
    );
    expect(observation).toMatchObject({
      schemaVersion: "objective-routing-observation.v1",
      semantic: {status: "resolved", objectiveKind: "meeting_preparation"},
      compatibility: {objectiveKind: "meeting_preparation"},
      objectiveKindAgreement: true,
      governsExecution: false,
    });
  });

  it("makes a semantic disagreement measurable without changing the compatibility plan", () => {
    const observation = observeIntentObjectiveRoute(
      envelope({composition: "prepare_decision", works: ["capital_strategy"], objects: ["decision"], audience: ["conselho"]}),
      {message: "Analise a companhia e o balanço.", hasAttachments: false},
    );
    expect(observation).toMatchObject({
      semantic: {objectiveKind: "board_decision"},
      compatibility: {objectiveKind: "company_analysis"},
      objectiveKindAgreement: false,
      governsExecution: false,
    });
  });
});
