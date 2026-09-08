import {buildDecisionArtifactContract} from "@offroad/case-understanding";
import {NextIntlClientProvider} from "next-intl";
import type {ReactElement} from "react";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {DecisionArtifactWork} from "./decision-artifact-work";

function render(element: ReactElement<{locale: "pt-BR" | "en-US"}>) {
  const locale = element.props.locale;
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}>{element}</NextIntlClientProvider>);
}

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
    const html = render(<DecisionArtifactWork contract={contract()} locale="pt-BR" materialHref="/material" />);
    expect(html).toContain("O que a análise sustenta agora");
    expect(html).toContain("R$ 5,67 bi");
    expect(html).toContain("Como chegamos aqui");
    expect(html).toContain("ITR · p. 39");
    expect(html).toContain('<details class="decision-work__source-register"><summary>');
    expect(html).not.toContain('class="decision-work__source-register" open');
    expect(html).toContain("CFADS aberto");
    expect(html).not.toContain("href=\"/material?format=xlsx\"");
  });

  it.each(["pt-BR", "en-US"] as const)("shows annual assumption as exact percentage and preserves raw decimal in %s", (locale) => {
    const value = contract();
    value.assumptions[0]!.value = "0.15500000000000000001";
    const html = render(<DecisionArtifactWork contract={value} locale={locale} materialHref="/material" />);
    expect(html).toContain(locale === "pt-BR" ? "15,500000000000000001% a.a." : "15.500000000000000001% a.a.");
    expect(html).toContain(locale === "pt-BR" ? "0,15500000000000000001 decimal a.a." : "0.15500000000000000001 decimal a.a.");
    value.assumptions[0]!.value = "0.1550";
    const normal = render(<DecisionArtifactWork contract={value} locale={locale} materialHref="/material" />);
    expect(normal).toContain(locale === "pt-BR" ? "15,5% a.a." : "15.5% a.a.");
    expect(normal).toContain(locale === "pt-BR" ? "0,1550 decimal a.a." : "0.1550 decimal a.a.");
  });

  it("offers the workbook only after the contract carries its immutable fingerprint", () => {
    const html = render(<DecisionArtifactWork contract={contract("c".repeat(64))} locale="pt-BR" materialHref="/material" />);
    expect(html).toContain("href=\"/material?format=xlsx\"");
  });

  it("offers the presentation only after the contract carries its immutable stored fingerprint", () => {
    const ready = contract();
    ready.views.find((view) => view.surface === "presentation")!.artifactFingerprint = "d".repeat(64);
    const html = render(<DecisionArtifactWork contract={ready} locale="pt-BR" materialHref="/material" />);
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
        const html = render(<DecisionArtifactWork contract={ready} locale={locale} />);
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
    const html = render(<DecisionArtifactWork contract={validated} locale="pt-BR" materialHref="/material" />);
    expect(html).not.toContain("?format=xlsx");
    expect(html).not.toContain("?format=pptx");
    expect(html).not.toContain('class="decision-work__materials"');
  });
  it("fails closed on empty or malformed stored fingerprints for either format", () => {
    for (const invalid of ["", " ", "a".repeat(63), "g".repeat(64)]) {
      const ready = contract();
      for (const view of ready.views.filter((item) => item.surface !== "conversation")) view.artifactFingerprint = invalid;
      const html = render(<DecisionArtifactWork contract={ready} locale="en-US" materialHref="/material" />);
      expect(html).not.toContain("?format=xlsx");
      expect(html).not.toContain("?format=pptx");
    }
  });
  it("keeps the valid workbook available when the presentation view is absent", () => {
    const ready = contract("c".repeat(64));
    ready.views = ready.views.filter((view) => view.surface !== "presentation");
    ready.identityRequirements = [{claimId: "gross", surfaces: ["conversation", "workbook"]}];
    const validated = buildDecisionArtifactContract(ready);
    const html = render(<DecisionArtifactWork contract={validated} locale="en-US" materialHref="/material" />);
    expect(html).toContain("?format=xlsx");
    expect(html).not.toContain("?format=pptx");
  });
});

describe("ordered executive blocks and trace navigation", () => {
  it("uses block order and titles without generating narrative, and gives repeated claims unique destinations", () => {
    const ready = contract();
    const view = ready.views[0]!;
    view.blocks = [
      {...view.blocks[0]!, id: "decision", kind: "decision", title: "Decisão condicionada"},
      {...view.blocks[0]!, id: "narrative", kind: "narrative", title: "Síntese registrada", claimIds: []},
      {...view.blocks[0]!, id: "facts", title: "Evidências", claimIds: ["gross", "gross"]},
    ];
    const html = render(<DecisionArtifactWork contract={ready} locale="pt-BR" />);
    expect(html.indexOf("Decisão condicionada")).toBeLessThan(html.indexOf("Síntese registrada"));
    expect(html.indexOf("Síntese registrada")).toBeLessThan(html.indexOf(">Evidências<"));
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(5);
    for (const target of targets) expect(ids).toContain(target);
    expect(html).toContain("Voltar ao achado: Dívida bruta");
    expect(html).toContain(fingerprint);
    expect(html).toContain("gross_debt");
  });
  it("renders all series points with exact values, nulls and references, plus actual status and release", () => {
    const ready = contract();
    ready.status = "reviewable";
    ready.release.state = "approved_for_named_recipients";
    ready.series = [{id: "maturity", label: "Vencimentos", unit: "BRL thousand", chartKind: "column", object: ready.claims[0]!.object,
      points: [{label: "2027", value: 0.21689377, evidenceState: "calculated", sourceIds: ["itr"], assumptionIds: ["rate"], gapIds: []},
        {label: "2028", value: null, evidenceState: "not_computable", sourceIds: [], assumptionIds: [], gapIds: ["cfads"]}]}];
    ready.views[0]!.blocks[0]!.seriesIds = ["maturity"];
    const html = render(<DecisionArtifactWork contract={ready} locale="en-US" />);
    expect(html).toContain("Ready for review");
    expect(html).toContain("Approved for named recipients");
    expect(html).not.toContain("Internal draft");
    expect(html).toContain("0.21689377 BRL thousand</td>");
    expect(html).toContain("<td>—</td>");
    expect(html).toContain('scope="row">2028');
    expect(html).toContain("Back to finding: Vencimentos · 2027");
    expect(html).toContain("Revisable assumption");
    expect(html).toContain("Public");
  });
  it("preserves locator text without turning arbitrary anchors into outgoing links", () => {
    const ready = contract();
    ready.sources[0]!.locator = "javascript:invalid()";
    const html = render(<DecisionArtifactWork contract={ready} locale="pt-BR" />);
    expect(html).toContain("javascript:invalid()");
    expect(html).not.toContain('href="javascript:');
  });
});

 it("preserves opaque nonnumeric identifiers literally in headline and trace", () => {
    const ready = contract();
    ready.claims[0]!.value = "CRA-2026-01-A";
    ready.claims[0]!.unit = null;
    const html = render(<DecisionArtifactWork contract={ready} locale="pt-BR" />);
    expect(html).toContain("<strong>CRA-2026-01-A</strong>");
    expect(html).toContain("<dd>CRA-2026-01-A</dd>");
    expect(html).not.toContain("CRA 2026 01 A");
  });

it("keeps Unicode and punctuation anchor targets valid after native fragment decoding", () => {
  const ready = contract();
  const claimId = "dívida:α/%?#";
  const sourceId = "fonte:á/%?#";
  ready.claims[0]!.id = claimId;
  ready.claims[0]!.sourceIds = [sourceId];
  ready.sources[0]!.id = sourceId;
  ready.assumptions[0]!.sourceIds = [sourceId];
  for (const view of ready.views) view.blocks[0]!.claimIds = [claimId];
  ready.identityRequirements[0]!.claimId = claimId;
  const html = render(<DecisionArtifactWork contract={buildDecisionArtifactContract(ready)} locale="pt-BR" />);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]!);
  expect(fragments.length).toBeGreaterThan(0);
  for (const fragment of fragments) {
    expect(fragment).not.toContain("%");
    expect(ids).toContain(decodeURIComponent(new URL(`#${fragment}`, "https://example.test/").hash.slice(1)));
  }
});
