import {buildDecisionArtifactContract, fingerprintJson, type DecisionArtifactContract, type DecisionArtifactContractInput} from "@offroad/case-understanding";

import {buildGc02ReferenceSnapshot} from "./gc02-reference-snapshot";

type Snapshot = ReturnType<typeof buildGc02ReferenceSnapshot>;
type ArtifactFingerprints = {workbook: string | null; presentation: string | null};

const referenceFiles = {
  workbook: "GC02_Camil_Modelo_Conselho_v1.xlsx",
  presentation: "GC02_Camil_Estrutura_Capital_Conselho_v1.pptx",
} as const;

export function buildGc02DecisionArtifactContract(
  snapshot: Snapshot = buildGc02ReferenceSnapshot(),
  artifactFingerprints: ArtifactFingerprints = {workbook: null, presentation: null},
): DecisionArtifactContract {
  const sourceIds = snapshot.sources.map((source) => source.id);
  const gapIds = snapshot.coverageGaps.map((gap) => gap.id);
  const rollover2030 = snapshot.projections.rollover.find((period) => period.period === "2030/31");
  const peakIndex = snapshot.debt.grossContractualSchedule.reduce((selected, row, index, rows) => row.amount > rows[selected]!.amount ? index : selected, 0);
  const peak = snapshot.debt.grossContractualSchedule[peakIndex]!;
  const rollover2030Index = snapshot.projections.rollover.findIndex((period) => period.period === "2030/31");
  if (!rollover2030) throw new Error("GC02 reference snapshot lacks 2030/31 rollover projection");
  const liquidity2030 = requiredNumber(rollover2030.liquidityCoverage, "2030/31 liquidity coverage");
  const closingCash2030 = requiredNumber(rollover2030.closingCash, "2030/31 closing cash");
  const leverage2030 = requiredNumber(rollover2030.leverage, "2030/31 leverage");

  const assumptions: DecisionArtifactContractInput["assumptions"] = [
    {
      id: "ASM-REV-GROWTH",
      label: "Crescimento nominal de receita após orçamento",
      value: snapshot.assumptions.base.revenueGrowth[1]!,
      unit: "decimal a.a. (1 = 100%)",
      basis: basisFor(snapshot, "Crescimento de receita"),
      sourceIds: ["SRC-04"],
      editable: true,
      material: true,
    },
    {
      id: "ASM-EBITDA-MARGIN",
      label: "Margem EBITDA base",
      value: snapshot.assumptions.base.ebitdaMargin[0]!,
      unit: "decimal (1 = 100%)",
      basis: basisFor(snapshot, "Margem EBITDA"),
      sourceIds: ["SRC-04"],
      editable: true,
      material: true,
    },
    {
      id: "ASM-REFI-SHARE",
      label: "Parcela do principal refinanciada",
      value: snapshot.assumptions.base.refinancingShare[0]!,
      unit: "decimal (1 = 100%)",
      basis: basisFor(snapshot, "Refinanciamento"),
      sourceIds: [],
      editable: true,
      material: true,
    },
    {
      id: "ASM-ROLLOVER-RATE",
      label: "Custo anual da rolagem",
      value: Number((snapshot.assumptions.base.cdi[0]! + 0.015).toFixed(8)),
      unit: "decimal a.a. (1 = 100%)",
      basis: basisFor(snapshot, "Custo da rolagem"),
      sourceIds: ["SRC-08"],
      editable: true,
      material: true,
    },
    {
      id: "ASM-IPCA-CURVE",
      label: "Curva de IPCA aplicada ao principal indexado",
      value: snapshot.assumptions.base.ipca.join(","),
      unit: "decimais a.a. por período (1 = 100%)",
      basis: basisFor(snapshot, "IPCA"),
      sourceIds: ["SRC-08"],
      editable: true,
      material: true,
    },
  ];

  const gaps = snapshot.coverageGaps.map((gap) => ({
    id: gap.id,
    label: gap.topic,
    materiality: gap.materiality === "blocking" ? "blocker" as const : "high" as const,
    impact: gap.consequence,
    requestedInput: gap.missing,
  }));

  const snapshotObject = (path: string) => ({id: "OBJ-GC02-SNAPSHOT", type: "gc02_reference_snapshot", fingerprint: snapshot.fingerprint, path});
  const ledgerObject = (path: string) => ({id: "OBJ-DEBT-LEDGER", type: "debt_ledger", fingerprint: snapshot.currentEvidence.ledgerFingerprint, path});
  const wallObject = (path: string) => ({id: "OBJ-MATURITY-WALL", type: "maturity_wall", fingerprint: snapshot.currentEvidence.maturityWallFingerprint, path});
  const covenantObject = (path: string) => ({id: "OBJ-COVENANT", type: "covenant_reconciliation", fingerprint: snapshot.currentEvidence.covenantFingerprint, path});

  const claims = [
    claim("CLM-GROSS-DEBT", "Dívida bruta contábil", snapshot.economicIdentity.accountingGrossDebt, snapshot.unit, "calculated", ledgerObject("gross_debt"), ["SRC-01"], [], []),
    claim("CLM-CONTRACTUAL-PRINCIPAL", "Principal contratual bruto", snapshot.economicIdentity.contractualGrossPrincipal, snapshot.unit, "calculated", ledgerObject("contractual_gross_principal"), ["SRC-01", "SRC-03"], [], []),
    claim("CLM-CASH", "Caixa e equivalentes contábeis", snapshot.economicIdentity.accountingCashAndEquivalents, snapshot.unit, "observed_public", snapshotObject("economicIdentity.accountingCashAndEquivalents"), ["SRC-01"], [], []),
    claim("CLM-REPORTED-LEVERAGE", "Alavancagem pro forma reportada pela companhia", snapshot.economicIdentity.companyReportedProFormaLeverage, "x", "observed_public", snapshotObject("economicIdentity.companyReportedProFormaLeverage"), ["SRC-02"], [], ["GAP-01"]),
    claim("CLM-PEAK-MATURITY", `Maior vencimento contratual (${peak.period})`, peak.amount, snapshot.unit, "calculated", wallObject(`debt.grossContractualSchedule[${peakIndex}].amount`), ["SRC-01", "SRC-07"], [], []),
    claim("CLM-2030-LIQUIDITY", "Cobertura de liquidez em 2030/31", liquidity2030, "x", "mixed", snapshotObject(`projections.rollover[${rollover2030Index}].liquidityCoverage`), ["SRC-01", "SRC-04", "SRC-05", "SRC-06", "SRC-07", "SRC-08"], ["ASM-REV-GROWTH", "ASM-EBITDA-MARGIN", "ASM-REFI-SHARE", "ASM-ROLLOVER-RATE", "ASM-IPCA-CURVE"], ["GAP-03", "GAP-04", "GAP-05", "GAP-06"]),
    claim("CLM-2030-CLOSING-CASH", "Caixa final em 2030/31", closingCash2030, snapshot.unit, "mixed", snapshotObject(`projections.rollover[${rollover2030Index}].closingCash`), ["SRC-01", "SRC-04", "SRC-05", "SRC-06", "SRC-07", "SRC-08"], ["ASM-REV-GROWTH", "ASM-EBITDA-MARGIN", "ASM-REFI-SHARE", "ASM-ROLLOVER-RATE", "ASM-IPCA-CURVE"], ["GAP-03", "GAP-04", "GAP-05", "GAP-06"]),
    claim("CLM-2030-LEVERAGE", "Dívida líquida / EBITDA em 2030/31", leverage2030, "x", "mixed", snapshotObject(`projections.rollover[${rollover2030Index}].leverage`), ["SRC-01", "SRC-04", "SRC-05", "SRC-07", "SRC-08"], ["ASM-REV-GROWTH", "ASM-EBITDA-MARGIN", "ASM-REFI-SHARE", "ASM-ROLLOVER-RATE", "ASM-IPCA-CURVE"], ["GAP-03", "GAP-04"]),
    claim("CLM-COVENANT-HEADROOM", "Headroom prospectivo de covenant", null, "x", "not_computable", covenantObject("prospective_headroom"), ["SRC-03"], [], ["GAP-01"]),
  ];

  const projectionClaims = ["CLM-2030-LIQUIDITY", "CLM-2030-CLOSING-CASH", "CLM-2030-LEVERAGE"];
  const currentClaims = ["CLM-GROSS-DEBT", "CLM-CONTRACTUAL-PRINCIPAL", "CLM-CASH", "CLM-REPORTED-LEVERAGE", "CLM-PEAK-MATURITY"];
  const assumptionIds = assumptions.map((assumption) => assumption.id);
  const conversationBlocks = [
    block("CHAT-CURRENT", "headline", "Onde a companhia está hoje", currentClaims, [], [], []),
    block("CHAT-FORWARD", "decision", "O que o cenário prospectivo altera", projectionClaims, [], assumptionIds, ["GAP-03", "GAP-04", "GAP-05", "GAP-06"]),
    block("CHAT-BOUNDARY", "gap", "O que ainda não pode ser concluído", ["CLM-COVENANT-HEADROOM"], [], [], gapIds),
  ];
  const workbookBlocks = [
    block("MODEL-SUMMARY", "metric", "Resumo executivo", [...currentClaims, ...projectionClaims], [], [], []),
    block("MODEL-DEBT", "table", "Dívida e vencimentos", ["CLM-GROSS-DEBT", "CLM-CONTRACTUAL-PRINCIPAL", "CLM-PEAK-MATURITY"], [], [], []),
    block("MODEL-FORWARD", "chart", "Liquidez e alavancagem prospectivas", projectionClaims, [], assumptionIds, ["GAP-03", "GAP-04", "GAP-05", "GAP-06"]),
    block("MODEL-GAPS", "gap", "Checks e lacunas", ["CLM-COVENANT-HEADROOM"], [], [], gapIds),
    block("MODEL-SOURCES", "source_register", "Fontes", [], sourceIds, [], []),
  ];
  const presentationBlocks = [
    block("DECK-STRUCTURE", "metric", "Estrutura de capital atual", currentClaims, [], [], []),
    block("DECK-MATURITY", "chart", "Vencimentos contratuais", ["CLM-PEAK-MATURITY"], [], [], []),
    block("DECK-FORWARD", "chart", "Liquidez e alavancagem", projectionClaims, [], assumptionIds, ["GAP-03", "GAP-04", "GAP-05", "GAP-06"]),
    block("DECK-GAPS", "gap", "Informação necessária antes de decidir", ["CLM-COVENANT-HEADROOM"], [], [], gapIds),
  ];

  return buildDecisionArtifactContract({
    schemaVersion: "2026.09.07-v1",
    caseId: snapshot.caseId,
    snapshotFingerprint: snapshot.fingerprint,
    asOf: snapshot.asOf,
    status: "reference",
    release: {state: "internal_only", recipientIds: []},
    sources: snapshot.sources.map((source) => ({
      id: source.id,
      title: source.title,
      classification: source.class === "synthetic_management" ? "synthetic" : source.class === "public_market" ? "market" : "public",
      asOf: source.asOf,
      locator: `${source.file} · ${source.anchor}`,
    })),
    assumptions: [...assumptions],
    gaps,
    claims,
    views: [
      {surface: "conversation", artifactId: "GC02_CHAT_READOUT_v1", artifactKind: "chat_readout", artifactFingerprint: fingerprintJson({snapshot: snapshot.fingerprint, blocks: conversationBlocks}), blocks: conversationBlocks},
      {surface: "workbook", artifactId: referenceFiles.workbook, artifactKind: "xlsx", artifactFingerprint: artifactFingerprints.workbook, blocks: workbookBlocks},
      {surface: "presentation", artifactId: referenceFiles.presentation, artifactKind: "pptx", artifactFingerprint: artifactFingerprints.presentation, blocks: presentationBlocks},
    ],
    identityRequirements: ["CLM-GROSS-DEBT", "CLM-PEAK-MATURITY", "CLM-2030-LIQUIDITY", "CLM-2030-CLOSING-CASH", "CLM-2030-LEVERAGE"].map((claimId) => ({claimId, surfaces: ["conversation", "workbook", "presentation"]})),
  });
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`GC02 reference snapshot lacks ${label}`);
  return value;
}

function basisFor(snapshot: Snapshot, driver: string): string {
  const rationale = snapshot.assumptions.rationale.find((item) => item.driver === driver);
  if (!rationale) throw new Error(`GC02 assumption rationale is missing: ${driver}`);
  return `${rationale.base}; ${rationale.basis}`;
}

function claim(
  id: string,
  label: string,
  value: string | number | boolean | null,
  unit: string | null,
  evidenceState: "observed_public" | "observed_private" | "calculated" | "assumption" | "mixed" | "not_computable",
  object: {id: string; type: string; fingerprint: string; path: string},
  sourceIds: string[],
  assumptionIds: string[],
  gapIds: string[],
) {
  return {id, label, value, unit, evidenceState, object, sourceIds, assumptionIds, gapIds};
}

function block(
  id: string,
  kind: "headline" | "metric" | "table" | "chart" | "narrative" | "decision" | "gap" | "source_register",
  title: string,
  claimIds: string[],
  sourceIds: string[],
  assumptionIds: string[],
  gapIds: string[],
) {
  return {id, kind, title, claimIds, sourceIds, assumptionIds, gapIds};
}
