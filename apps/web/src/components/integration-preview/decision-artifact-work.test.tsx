import {buildDecisionArtifactContract} from "@offroad/case-understanding";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {DecisionArtifactWork} from "./decision-artifact-work";

const fingerprint = "a".repeat(64);

function contract(workbookFingerprint: string | null = null) {
  const blocks = [{id: "metrics", kind: "metric" as const, title: "Leitura", claimIds: ["gross"], sourceIds: [], assumptionIds: [], gapIds: []}];
  return buildDecisionArtifactContract({
    schemaVersion: "2026.09.07-v1",
    caseId: "gc02",
    snapshotFingerprint: "b".repeat(64),
    asOf: "2026-05-31",
    status: "draft",
    release: {state: "internal_only", recipientIds: []},
    sources: [{id: "itr", title: "ITR", classification: "public", asOf: "2026-05-31", locator: "ITR · p. 39"}],
    assumptions: [{id: "rate", label: "Taxa", value: "0.145", unit: "decimal a.a.", basis: "Indicativa", sourceIds: ["itr"], editable: true, material: true}],
    gaps: [{id: "cfads", label: "CFADS aberto", materiality: "blocker", impact: "Impede dimensionar.", requestedInput: "Plano financeiro."}],
    claims: [{id: "gross", label: "Dívida bruta", value: "5670186", unit: "BRL thousand", evidenceState: "calculated", object: {id: "c05", type: "debt-ledger", fingerprint, path: "gross_debt"}, sourceIds: ["itr"], assumptionIds: ["rate"], gapIds: ["cfads"]}],
    views: [
      {surface: "conversation", artifactId: "chat", artifactKind: "chat_readout", artifactFingerprint: null, blocks},
      {surface: "workbook", artifactId: "model", artifactKind: "xlsx", artifactFingerprint: workbookFingerprint, blocks},
      {surface: "presentation", artifactId: "deck", artifactKind: "pptx", artifactFingerprint: null, blocks},
    ],
    identityRequirements: [{claimId: "gross", surfaces: ["conversation", "workbook", "presentation"]}],
  });
}

describe("DecisionArtifactWork", () => {
  it("shows decision-grade facts and lineage but withholds an unsigned workbook", () => {
    const html = renderToStaticMarkup(<DecisionArtifactWork contract={contract()} locale="pt-BR" materialHref="/material" />);
    expect(html).toContain("O que a análise sustenta agora");
    expect(html).toContain("R$ 5,67 bi");
    expect(html).toContain("Como chegamos aqui");
    expect(html).toContain("ITR · p. 39");
    expect(html).toContain("CFADS aberto");
    expect(html).not.toContain("href=\"/material?format=xlsx\"");
  });

  it("offers the workbook only after the contract carries its immutable fingerprint", () => {
    const html = renderToStaticMarkup(<DecisionArtifactWork contract={contract("c".repeat(64))} locale="pt-BR" materialHref="/material" />);
    expect(html).toContain("href=\"/material?format=xlsx\"");
  });
});
