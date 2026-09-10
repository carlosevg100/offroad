import {readFileSync} from "node:fs";
import {
  applyReceivablesSupplementPatch,
  assessReceivablesPoolMethodReadiness,
  buildReceivablesRawUniverse,
  compileReceivablesSupplementDraft,
  newReceivablesSupplementDraft,
  receivablesSupplementPatchSchema,
  type ReceivablesEvidenceDocument,
  type ReceivablesRawDetectionReport,
} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {buildReceivablesDocumentSupplementPatch, prepareReceivablesDocumentSupplement} from "./receivables-document-supplement";
import {
  buildReceivablesMethodEvidenceRequestProjection,
  buildReceivablesMethodFieldRequestProjection,
} from "./receivables-information-requests";
import {resolveReceivablesMethodInput} from "./receivables-method-input-resolution";
import {executeReceivablesSpecialistShadow} from "./specialist-method-runtime";

const datasetHash = "d".repeat(64);
const fileHash = "e".repeat(64);

function sheet(name: string, headers: string[], rows: string[][]) {
  const columnName = (index: number) => {
    let result = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    return result;
  };
  return {name, cells: [
    ...headers.map((value, index) => ({ref: `${columnName(index)}1`, v: value})),
    ...rows.flatMap((values, rowIndex) => values.map((value, columnIndex) => ({ref: `${columnName(columnIndex)}${rowIndex + 2}`, v: value}))),
  ]};
}

const portfolioHeaders = [
  "NUM_TITULO", "CNPJ_SACADO", "NOME_SACADO", "DT_EMISSAO", "DT_VENCIMENTO", "VLR_TITULO", "SITUACAO", "DT_PAGAMENTO", "VLR_PAGO",
  "SETOR_SACADO", "VLR_RECEBIDO_PERIODO", "SALDO_INADIMPLENTE", "RECUPERADO_PERIODO", "DILUICAO_PERIODO", "RECOMPRA_PERIODO", "SUBSTITUICAO_PERIODO",
  "CEDIVEL", "LASTRO_VERIFICADO", "REGISTRO", "ONUS", "DISPUTADO", "PARTE_RELACIONADA",
];

const document: ReceivablesEvidenceDocument = {
  id: "room-document",
  fileName: "modelo-offroad-r01.xlsx",
  fileHash,
  layer: {documentId: "room-document", sheets: [
    sheet("CEDENTE", ["CEDENTE_ID", "RAZAO_SOCIAL", "PAPEL_SERVICING"], [["cedent-1", "Cedente Teste S.A.", "cedente"]]),
    sheet("CARTEIRA", portfolioHeaders, [
      ["T-001", "11222333000144", "Comprador A", "2026-06-01", "2026-09-30", "1000000", "ABERTO", "", "0", "varejo", "250000", "0", "0", "0", "0", "0", "sim", "sim", "registrado", "livre", "não", "não"],
      ["T-002", "22333444000155", "Comprador B", "2026-07-01", "2026-10-31", "1000000", "ABERTO", "", "0", "indústria", "200000", "0", "0", "0", "0", "0", "sim", "sim", "registrado", "livre", "não", "não"],
    ]),
    sheet("RECEBIMENTOS", ["ID_RECEBIMENTO", "DATA_RECEBIMENTO", "VALOR_RECEBIMENTO", "NUM_TITULO", "CNPJ_SACADO", "CONTA_VINCULADA", "DUPLICADO_DE"], [
      ["R-001", "2026-07-31", "250000", "T-001", "11222333000144", "sim", ""],
      ["R-002", "2026-07-31", "200000", "T-002", "22333444000155", "sim", ""],
    ]),
    sheet("CONTABIL", ["SALDO_CONTAS_A_RECEBER", "PROVISAO", "RECEBIMENTOS_PERIODO"], [["2000000", "0", "450000"]]),
  ]},
};

const detection: ReceivablesRawDetectionReport = {
  version: "2026.08.28-v1",
  defects: [], questions: [], routeFacts: [],
  evidenceCoverage: {deliveredEvidenceIds: [document.id], searchedEvidenceIds: [document.id], complete: true, warnings: []},
};

const policy = {
  maxDaysPastDue: 30, maxRemainingTermDays: 180, minSeasoningDays: 0,
  requireAssignable: true, requireEvidenceVerified: true, registrationRule: "required",
  excludeDisputed: true, excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [],
  maxSingleDebtorShare: "0.60", maxDebtorGroupShare: "0.60", minimumEligibleShare: "0.80",
  minimumEvidenceCoverage: "1", minimumRegistrationCoverage: "1", maximumDelinquency30Share: "0.05",
  maximumDilutionShare: "0.05", maximumRepurchaseShare: "0.05", minimumRecoveryRate: "0",
  maximumAccountingMismatchShare: "0.01", maximumCashMismatchShare: "0.01",
  minimumMappedCashShare: "1", minimumLinkedAccountCashShare: "1",
};
const structure = {
  requestedFacility: "1000000", advanceRate: "0.50", requiredOvercollateralization: "1.20",
  requiredSubordinationRate: "0.10", actualSeniorAmount: "1000000", actualMezzanineAmount: "0",
  actualSubordinatedAmount: "1000000", reserveRate: "0.02",
  waterfall: {availableCash: "450000", servicingFeeDue: "5000", seniorInterestDue: "20000", seniorPrincipalDue: "200000", reserveOpening: "20000", mezzanineDue: "0"},
};

function fields() {
  return [
    ...Object.entries(policy).map(([key, value]) => ({path: `/policy/${key}`, value})),
    ...Object.entries(structure).filter(([key]) => key !== "waterfall").map(([key, value]) => ({path: `/structure/${key}`, value})),
    ...Object.entries(structure.waterfall).map(([key, value]) => ({path: `/structure/waterfall/${key}`, value})),
  ];
}

describe("R01 deterministic in-memory assembly lifecycle", () => {
  it("advances from documents to premises to a traced specialist result without parallel truth paths", () => {
    const built = buildReceivablesRawUniverse({universeId: "pool-1", datasetHash, reportingDate: "2026-08-31", documents: [document]});
    expect(built.phaseOne).not.toBeNull();
    const extracted = buildReceivablesDocumentSupplementPatch({phaseOne: built.phaseOne!, documents: [document]});
    expect(extracted.extractedSections).toEqual(["cedent", "titles", "cashReceipts", "accounting"]);

    const documentDraft = applyReceivablesSupplementPatch({
      draft: newReceivablesSupplementDraft(datasetHash),
      patch: extracted.patch,
    });
    const documentStatus = compileReceivablesSupplementDraft(documentDraft);
    expect(documentStatus.state).toBe("incomplete");
    expect(documentStatus.missingSections.every((section) => section.startsWith("policy.") || section.startsWith("structure.") || section === "evidence.eligibilityPolicy" || section === "evidence.facilityAndWaterfall")).toBe(true);

    const blocked = assessReceivablesPoolMethodReadiness({phaseOne: built.phaseOne!, detection});
    const evidenceQuestions = buildReceivablesMethodEvidenceRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001",
      processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "pt-BR", readiness: blocked, missingDraftSections: documentStatus.missingSections,
    });
    // Document-backed sections suppress duplicate assembly requests; raw event
    // completeness still requires evidence and is never inferred from absent rows.
    expect(evidenceQuestions.requests).toHaveLength(1);
    const historyGap = blocked.gaps.find((gap) => gap.code === "performance_history_incomplete");
    expect(historyGap).toBeDefined();
    expect(evidenceQuestions.requests[0]).toMatchObject({
      requirementKey: expect.stringMatching(/^receivables\.r01\.evidence\.[a-f0-9]{64}$/),
      question: historyGap!.question.pt,
    });
    const premiseQuestions = buildReceivablesMethodFieldRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001",
      processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "pt-BR", sourceDatasetHash: datasetHash, activeGroups: ["structure", "policy"],
      missingSections: documentStatus.missingSections,
    });
    expect(premiseQuestions.requests).toHaveLength(3);
    expect(premiseQuestions.requests.every((request) => request.producerBinding?.methodId === "R01")).toBe(true);

    const premiseEvidence = [
      {sourceClass: "house_method" as const, sourceId: "R01-policy", anchor: "policy:approved-for-test"},
      {sourceClass: "user_confirmation" as const, sourceId: "answer-set-1", anchor: "conversation:turn-2"},
    ];
    const premisePatch = receivablesSupplementPatchSchema.parse({
      schemaVersion: "2026.09.07-v1", patchId: "premise-set-1", sourceDatasetHash: datasetHash,
      suppliedBy: {actorType: "user", actorId: "credit-analyst-1", suppliedAt: "2026-09-07T03:00:00.000Z", evidence: premiseEvidence},
      sections: {}, fields: fields(),
      evidence: {eligibilityPolicy: [premiseEvidence[0]], facilityAndWaterfall: [premiseEvidence[1]]},
    });
    const completeDraft = applyReceivablesSupplementPatch({draft: documentDraft, patch: premisePatch});
    expect(compileReceivablesSupplementDraft(completeDraft)).toMatchObject({state: "complete", missingSections: []});

    const persistedFixture = JSON.parse(readFileSync(new URL("../../../supabase/tests/support/receivables_document_adapter.json", import.meta.url), "utf8"));
    expect({patch: extracted.patch, draft: documentDraft, premisePatch, completeDraft}).toEqual(persistedFixture);
    const refreshed = prepareReceivablesDocumentSupplement({phaseOne: built.phaseOne!, documents: [document], storedDraft: completeDraft});
    expect(refreshed.patch).toBeNull();
    expect(refreshed.nextDraft).toEqual(completeDraft);
    const resolved = resolveReceivablesMethodInput({phaseOne: built.phaseOne!, supplementDraft: completeDraft});
    expect(resolved).toMatchObject({origin: "compiled_draft", draftState: "complete"});
    const ready = assessReceivablesPoolMethodReadiness({phaseOne: built.phaseOne!, detection, assembly: resolved.assembly});
    expect(ready).toMatchObject({state: "ready", methodExecutionAllowed: true, gaps: []});

    const result = executeReceivablesSpecialistShadow({
      taskId: "R01",
      executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
      executorVersion: "2026.09.06-v1",
      phaseOne: built.phaseOne!, detection, assembly: resolved.assembly!,
    });
    expect(result).toMatchObject({taskId: "R01", mode: "internal_shadow", externalEffectAllowed: false, artifact: {artifactType: "receivables_pool_underwriting", status: "draft"}});
    expect(result.artifact.evidenceRefs).toHaveLength(7);
    expect(result.artifact.outputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
