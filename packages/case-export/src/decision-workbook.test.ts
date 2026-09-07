import JSZip from "jszip";
import {describe, expect, it} from "vitest";

import {buildDecisionArtifactContract} from "@offroad/case-understanding";

import {renderDecisionWorkbook} from "./decision-workbook";

const contract = () => buildDecisionArtifactContract({
  schemaVersion: "2026.09.07-v1",
  caseId: "case-camil-board",
  snapshotFingerprint: "b".repeat(64),
  asOf: "2026-06-30",
  status: "draft",
  release: {state: "internal_only", recipientIds: []},
  sources: [{id: "source-release", title: "Release de resultados 2T26", classification: "public", asOf: "2026-06-30", locator: "RI > resultados trimestrais > p. 12"}],
  assumptions: [{id: "assumption-rate", label: "Taxa anual da nova dívida", value: 0.149, unit: "decimal a.a.", basis: "Premissa para sensibilidade", sourceIds: [], editable: true, material: true}],
  gaps: [{id: "gap-budget", label: "Plano financeiro da administração", materiality: "blocker", impact: "Limita a cobertura prospectiva", requestedInput: "Receita, margem, capital de giro, capex e caixa mínimo"}],
  claims: [
    {id: "claim-leverage", label: "Dívida líquida / EBITDA", value: 4.7, unit: "x", evidenceState: "calculated", object: {id: "obj-leverage", type: "credit_metric", fingerprint: "a".repeat(64), path: "metrics.net_leverage"}, sourceIds: ["source-release"], assumptionIds: [], gapIds: ["gap-budget"]},
    {id: "claim-cash", label: "Caixa e equivalentes", value: 1_250, unit: "R$ milhões", evidenceState: "observed_public", object: {id: "obj-cash", type: "financial_position", fingerprint: "c".repeat(64), path: "balance.cash"}, sourceIds: ["source-release"], assumptionIds: [], gapIds: []},
  ],
  series: [{id: "series-maturities", label: "Vencimentos", unit: "R$ milhões", chartKind: "column", object: {id: "obj-maturities", type: "debt_schedule", fingerprint: "d".repeat(64), path: "walls"}, points: [
    {label: "2026", value: 900, evidenceState: "calculated", sourceIds: ["source-release"], assumptionIds: [], gapIds: []},
    {label: "2027", value: 1_200, evidenceState: "calculated", sourceIds: ["source-release"], assumptionIds: [], gapIds: []},
  ]}],
  views: [
    {surface: "conversation", artifactId: "chat", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "chat", kind: "metric", title: "Leitura", claimIds: ["claim-leverage", "claim-cash"], sourceIds: [], assumptionIds: [], gapIds: [], seriesIds: []}]},
    {surface: "workbook", artifactId: "workbook", artifactKind: "xlsx", artifactFingerprint: null, blocks: [{id: "workbook", kind: "metric", title: "Controle", claimIds: ["claim-leverage", "claim-cash"], sourceIds: ["source-release"], assumptionIds: ["assumption-rate"], gapIds: ["gap-budget"], seriesIds: ["series-maturities"]}]},
    {surface: "presentation", artifactId: "deck", artifactKind: "pptx", artifactFingerprint: null, blocks: [{id: "deck", kind: "metric", title: "Leitura", claimIds: ["claim-leverage", "claim-cash"], sourceIds: [], assumptionIds: [], gapIds: [], seriesIds: []}]},
  ],
  identityRequirements: [
    {claimId: "claim-leverage", surfaces: ["conversation", "workbook", "presentation"]},
    {claimId: "claim-cash", surfaces: ["conversation", "workbook", "presentation"]},
  ],
});

describe("governed decision workbook", () => {
  it("renders deterministic formula-linked bytes from one fingerprinted contract without claiming an integrated model", async () => {
    const input = {contract: contract(), locale: "pt-BR" as const, title: "Camil · Workbook de decisão", companyName: "Camil Alimentos"};
    const first = await renderDecisionWorkbook(input);
    const second = await renderDecisionWorkbook(input);

    expect(first.bytes).toEqual(second.bytes);
    expect(first.audit).toMatchObject({
      decisionContractFingerprint: input.contract.contractFingerprint,
      renderedClaimIds: ["claim-leverage", "claim-cash"],
      renderedSourceIds: ["source-release"],
      renderedAssumptionIds: ["assumption-rate"],
      renderedGapIds: ["gap-budget"],
      renderedSeriesIds: ["series-maturities"],
      hardcodeViolations: [],
      formulaCoveragePassed: true,
      visualInspection: "not_run",
      releaseEligible: false,
    });
    expect(first.audit.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    const archive = await JSZip.loadAsync(first.bytes);
    const workbook = await archive.file("xl/workbook.xml")!.async("string");
    const custom = await archive.file("docProps/custom.xml")!.async("string");
    const control = await archive.file("xl/worksheets/sheet2.xml")!.async("string");
    const allSheetXml = (await Promise.all(Object.entries(archive.files)
      .filter(([path, entry]) => path.startsWith("xl/worksheets/") && !entry.dir)
      .map(([, entry]) => entry.async("string")))).join("\n");
    expect(workbook).toContain("Controle");
    expect(custom).toContain(input.contract.contractFingerprint);
    expect(allSheetXml).toContain("Não é um modelo financeiro integrado");
    expect(control).toMatch(/Claims(?:&apos;|')?!B2/);
  });
});
