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

  it("offers the presentation only after the contract carries its immutable stored fingerprint", () => {
    const ready = contract();
    ready.views.find((view) => view.surface === "presentation")!.artifactFingerprint = "d".repeat(64);
    const html = renderToStaticMarkup(<DecisionArtifactWork contract={ready} locale="pt-BR" materialHref="/material" />);
    expect(html).toContain("href=\"/material?format=pptx\"");
    expect(html).toContain("Baixar apresentação");
  });
});


describe("decision readout exact values and file availability", () => {
  for (const locale of ["pt-BR", "en-US"] as const) {
    it(`${locale}: preserves decimal scale and integers beyond floating-point precision in the trace`, () => {
      const values = [
        ["9007199254740993.216893770123", locale === "pt-BR" ? "9.007.199.254.740.993,216893770123" : "9,007,199,254,740,993.216893770123"],
        ["0.0000000001234500", locale === "pt-BR" ? "0,0000000001234500" : "0.0000000001234500"],
        ["-0.216893770", locale === "pt-BR" ? "-0,216893770" : "-0.216893770"],
      ];
      for (const [value, expected] of values) {
        const ready = contract();
        ready.claims[0]!.value = value!;
        ready.claims[0]!.unit = "declared unit";
        const html = renderToStaticMarkup(<DecisionArtifactWork contract={ready} locale={locale} />);
        expect(html).toContain(`<dd>${expected} declared unit</dd>`);
        expect(ready.claims[0]!.value).toBe(value);
      }
    });
  }
  it("withholds both downloads when their views do not exist", () => {
    const ready = contract();
    ready.views = ready.views.filter((view) => view.surface === "conversation");
    ready.identityRequirements = [];
    const validated = buildDecisionArtifactContract(ready);
    const html = renderToStaticMarkup(<DecisionArtifactWork contract={validated} locale="pt-BR" materialHref="/material" />);
    expect(html).not.toContain("?format=xlsx");
    expect(html).not.toContain("?format=pptx");
    expect(html).not.toContain('class="decision-work__materials"');
  });
  it("fails closed on empty or malformed stored fingerprints for either format", () => {
    for (const invalid of ["", " ", "a".repeat(63), "g".repeat(64)]) {
      const ready = contract();
      for (const view of ready.views.filter((item) => item.surface !== "conversation")) view.artifactFingerprint = invalid;
      const html = renderToStaticMarkup(<DecisionArtifactWork contract={ready} locale="en-US" materialHref="/material" />);
      expect(html).not.toContain("?format=xlsx");
      expect(html).not.toContain("?format=pptx");
    }
  });
  it("keeps the valid workbook available when the presentation view is absent", () => {
    const ready = contract("c".repeat(64));
    ready.views = ready.views.filter((view) => view.surface !== "presentation");
    ready.identityRequirements = [{claimId: "gross", surfaces: ["conversation", "workbook"]}];
    const validated = buildDecisionArtifactContract(ready);
    const html = renderToStaticMarkup(<DecisionArtifactWork contract={validated} locale="en-US" materialHref="/material" />);
    expect(html).toContain("?format=xlsx");
    expect(html).not.toContain("?format=pptx");
  });
});
