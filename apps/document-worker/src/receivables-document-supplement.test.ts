import {describe, expect, it} from "vitest";
import {
  applyReceivablesSupplementPatch,
  compileReceivablesSupplementDraft,
  newReceivablesSupplementDraft,
  receivablesDocumentSupplementContract,
  type ReceivablesEvidenceDocument,
  type ReceivablesPhaseOneInput,
} from "@offroad/receivables-analysis";

import {buildReceivablesDocumentSupplementPatch} from "./receivables-document-supplement";

const datasetHash = "a".repeat(64);
const fileHash = "b".repeat(64);
const phaseOne: ReceivablesPhaseOneInput = {
  datasetHash,
  universe: {
    id: "pool-1",
    currency: "BRL",
    dates: {reportingDate: "2026-08-31", latestOriginationDate: "2026-08-01", dataStartDate: "2026-01-01", dataEndDate: "2026-08-31"},
    receivables: [
      {id: "source-title-1", externalId: "T-001", currency: "BRL", faceValue: "1000.00", openValue: "800.00", issueDate: "2026-08-01", originalDueDate: "2026-09-30", currentDueDate: "2026-09-30", obligorId: "12345678000199", status: "open", source: {kind: "file", fileId: "room-1", fileHash, sheet: "CARTEIRA", row: 2}},
      {id: "source-title-2", externalId: "T-002", currency: "BRL", faceValue: "500.00", openValue: "500.00", issueDate: "2026-08-01", originalDueDate: "2026-10-31", currentDueDate: "2026-10-31", obligorId: "98765432000100", status: "open", source: {kind: "file", fileId: "room-1", fileHash, sheet: "CARTEIRA", row: 3}},
    ],
    settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [], economicGroups: [],
    eventCoverage: {
      settlements: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "fixture", limitations: []},
      dilutions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "fixture", limitations: []},
      extensions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "fixture", limitations: []},
      repurchases: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "fixture", limitations: []},
      assignmentsAndLiens: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "fixture", limitations: []},
    },
  },
};

function sheet(name: string, headers: string[], rows: Array<Array<string | number | boolean | null>>) {
  const columnName = (index: number) => String.fromCharCode(65 + index);
  return {
    name,
    cells: [
      ...headers.map((value, index) => ({ref: `${columnName(index)}1`, v: value})),
      ...rows.flatMap((values, rowIndex) => values.map((value, columnIndex) => ({ref: `${columnName(columnIndex)}${rowIndex + 2}`, v: value}))),
    ],
  };
}

function evidenceDocument(overrides: {titles?: Array<Array<string | number | boolean | null>>; duplicateAccounting?: boolean; assumptions?: "partial" | "complete"} = {}): ReceivablesEvidenceDocument {
  const titleHeaders = [
    "NUM_TITULO", "SETOR_SACADO", "VLR_RECEBIDO_PERIODO", "SALDO_INADIMPLENTE", "RECUPERADO_PERIODO",
    "DILUICAO_PERIODO", "RECOMPRA_PERIODO", "SUBSTITUICAO_PERIODO", "CEDIVEL", "LASTRO_VERIFICADO",
    "REGISTRO", "ONUS", "DISPUTADO", "PARTE_RELACIONADA",
  ];
  const titles = overrides.titles ?? [
    ["T-001", "varejo", "200,00", "0", "0", "0", "0", "0", "sim", "sim", "registrado", "livre", "não", "não"],
    ["T-002", "indústria", "50,00", "10,00", "2,00", "1,00", "0", "0", "sim", "sim", "registrado", "livre", "não", "não"],
  ];
  const accounting = sheet("CONTABIL", ["SALDO_CONTAS_A_RECEBER", "PROVISAO", "RECEBIMENTOS_PERIODO"], [["1300,00", "10,00", "250,00"]]);
  return {
    id: "document-1",
    fileName: "sala-de-dados.xlsx",
    fileHash,
    layer: {
      documentId: "document-1",
      sheets: [
        sheet("CEDENTE", ["CEDENTE_ID", "RAZAO_SOCIAL", "PAPEL_SERVICING"], [["cedent-1", "Cedente S.A.", "cedente"]]),
        sheet("CONTROLES_TITULO", titleHeaders, titles),
        sheet("RECEBIMENTOS", ["ID_RECEBIMENTO", "DATA_RECEBIMENTO", "VALOR_RECEBIMENTO", "NUM_TITULO", "CNPJ_SACADO", "CONTA_VINCULADA", "DUPLICADO_DE"], [
          ["R-001", "31/08/2026", "200,00", "T-001", "12.345.678/0001-99", "sim", ""],
          ["R-002", "2026-08-31", "50.00", "T-002", "98.765.432/0001-00", "sim", ""],
        ]),
        accounting,
        ...(overrides.assumptions ? [
          sheet("POLITICA", ["CAMPO", "VALOR"], overrides.assumptions === "complete"
            ? receivablesDocumentSupplementContract.sheets.policy.inputs.map(([key, path, kind]) => [
                key,
                kind === "boolean" ? "sim"
                  : kind === "registration_rule" ? "obrigatório"
                  : kind === "string_list" ? "todos"
                  : kind === "percentage" ? "10%"
                  : kind === "integer" ? path.endsWith("maxRemainingTermDays") ? "180" : "30"
                  : "100",
              ])
            : [
            ["MAX_ATRASO_DIAS", "30"],
            ["MAX_CONCENTRACAO_SACADO", "12,5%"],
            ["EXIGIR_CEDIVEL", "sim"],
            ["SETORES_PERMITIDOS", "varejo; indústria"],
            ["MAX_DILUICAO", ""],
          ]),
          sheet("ESTRUTURA", ["CAMPO", "VALOR"], overrides.assumptions === "complete"
            ? receivablesDocumentSupplementContract.sheets.structure.inputs.map(([key, , kind]) => [
                key,
                kind === "percentage" ? "10%" : kind === "multiple" ? "1,25x" : "100",
              ])
            : [
            ["VALOR_LINHA", "R$ 1.000.000,00"],
            ["ADVANCE_RATE", "72,5%"],
            ["OVERCOLLATERALIZATION_MIN", "1,25x"],
            ["WATERFALL_CAIXA_DISPONIVEL", ""],
          ]),
        ] : []),
        ...(overrides.duplicateAccounting ? [{...accounting, name: "CONTABIL_COPIA"}] : []),
      ],
    },
  };
}

describe("receivables document supplement adapter", () => {
  it("extracts the four core sections only from explicit contract columns", () => {
    const result = buildReceivablesDocumentSupplementPatch({phaseOne, documents: [evidenceDocument()]});
    expect(result.extractedSections).toEqual(["cedent", "titles", "cashReceipts", "accounting"]);
    expect(result.omittedSections).toEqual(["policy", "structure"]);
    expect(result.patch).toMatchObject({
      sourceDatasetHash: datasetHash,
      sections: {
        cedent: {value: {id: "cedent-1", legalName: "Cedente S.A.", servicingRole: "cedent"}},
        titles: {value: [
          {sourceReceivableId: "source-title-1", debtorSector: "varejo", collectedInPeriod: "200.00", assignable: true, disputed: false},
          {sourceReceivableId: "source-title-2", debtorSector: "indústria", defaultedBalance: "10.00", recoveredInPeriod: "2.00"},
        ]},
        accounting: {value: {grossReceivablesBalance: "1300.00", allowanceBalance: "10.00", reportedCollectionsInPeriod: "250.00"}},
      },
    });
    expect(result.patch?.sections.cashReceipts?.value).toHaveLength(2);
    expect(result.patch?.sections.cashReceipts?.value[0]).toMatchObject({id: "R-001", receivedAt: "2026-08-31", amount: "200.00", sourceReceivableId: "source-title-1"});
    expect(result.patch?.suppliedBy.evidence.every((item) => item.sourceClass === "provided_document")).toBe(true);
  });

  it("omits the entire title section when the title partition is partial", () => {
    const document = evidenceDocument({titles: [["T-001", "varejo", "200", "", "0", "0", "0", "0", "sim", "sim", "registrado", "livre", "não", "não"]]});
    const result = buildReceivablesDocumentSupplementPatch({phaseOne, documents: [document]});
    expect(result.extractedSections).not.toContain("titles");
    expect(result.omittedSections).toContain("titles");
    expect(result.patch?.sections.titles).toBeUndefined();
  });

  it("fails closed when two sheets satisfy the same accounting contract", () => {
    const result = buildReceivablesDocumentSupplementPatch({phaseOne, documents: [evidenceDocument({duplicateAccounting: true})]});
    expect(result.extractedSections).not.toContain("accounting");
    expect(result.omittedSections).toContain("accounting");
    expect(result.patch?.sections.accounting).toBeUndefined();
  });

  it("imports only populated governed policy and structure inputs without inventing blanks", () => {
    const result = buildReceivablesDocumentSupplementPatch({phaseOne, documents: [evidenceDocument({assumptions: "partial"})]});
    expect(result.extractedSections).toEqual(["cedent", "titles", "cashReceipts", "accounting", "policy", "structure"]);
    expect(result.patch?.fields).toEqual(expect.arrayContaining([
      {path: "/policy/maxDaysPastDue", value: 30},
      {path: "/policy/maxSingleDebtorShare", value: "0.125"},
      {path: "/policy/requireAssignable", value: true},
      {path: "/policy/allowedDebtorSectors", value: ["varejo", "indústria"]},
      {path: "/structure/requestedFacility", value: "1000000.00"},
      {path: "/structure/advanceRate", value: "0.725"},
      {path: "/structure/requiredOvercollateralization", value: "1.25"},
    ]));
    expect(result.patch?.fields.some((field) => field.path === "/policy/maximumDilutionShare")).toBe(false);
    expect(result.patch?.fields.some((field) => field.path === "/structure/waterfall/availableCash")).toBe(false);
    expect(result.patch?.evidence).toMatchObject({
      eligibilityPolicy: [expect.objectContaining({sourceId: "document-1"})],
      facilityAndWaterfall: [expect.objectContaining({sourceId: "document-1"})],
    });
  });

  it("completes the governed draft when one workbook supplies every required input", () => {
    const result = buildReceivablesDocumentSupplementPatch({phaseOne, documents: [evidenceDocument({assumptions: "complete"})]});
    expect(result.patch).not.toBeNull();
    const draft = applyReceivablesSupplementPatch({
      draft: newReceivablesSupplementDraft(datasetHash),
      patch: result.patch!,
    });
    expect(compileReceivablesSupplementDraft(draft)).toMatchObject({
      state: "complete",
      missingSections: [],
      openConflictIds: [],
    });
  });
});
