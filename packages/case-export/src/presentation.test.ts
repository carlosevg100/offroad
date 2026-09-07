import {readFile} from "node:fs/promises";

import {buildDecisionArtifactContract, type DecisionArtifactContractInput} from "@offroad/case-understanding";
import JSZip from "jszip";
import {describe, expect, it, vi} from "vitest";

import {offroadHousePresentationTemplate, renderInstitutionalPresentation} from "./presentation";

const FP = "a".repeat(64);

function fixture(): DecisionArtifactContractInput {
  const blocks = [
    {id: "situation", kind: "headline" as const, title: "Situação e implicação", claimIds: ["claim-leverage", "claim-cash"], sourceIds: [], assumptionIds: [], gapIds: []},
    {id: "direction", kind: "decision" as const, title: "Alternativas para discussão", claimIds: ["claim-direction"], sourceIds: [], assumptionIds: ["assumption-rate"], gapIds: []},
    {id: "gaps", kind: "gap" as const, title: "O que ainda muda a decisão", claimIds: [], sourceIds: [], assumptionIds: [], gapIds: ["gap-budget"]},
    {id: "sources", kind: "source_register" as const, title: "Fontes e data-base", claimIds: [], sourceIds: ["source-release"], assumptionIds: [], gapIds: []},
  ];
  return {
    schemaVersion: "2026.09.07-v1",
    caseId: "case-camil-board",
    snapshotFingerprint: "b".repeat(64),
    asOf: "2026-06-30",
    status: "draft",
    release: {state: "internal_only", recipientIds: []},
    sources: [{id: "source-release", title: "Release de resultados 2T26", classification: "public", asOf: "2026-06-30", locator: "RI > resultados trimestrais > p. 12"}],
    assumptions: [{id: "assumption-rate", label: "CDI de referência", value: 14.9, unit: "% a.a.", basis: "Curva indicada pelo usuário para o cenário preliminar", sourceIds: [], editable: true, material: true}],
    gaps: [{id: "gap-budget", label: "Plano financeiro da administração", materiality: "high", impact: "Limita o dimensionamento e o headroom prospectivo", requestedInput: "Receita, margem, capital de giro, capex e caixa mínimo até 2029"}],
    claims: [
      {id: "claim-leverage", label: "Dívida líquida / EBITDA", value: 4.7, unit: "x", evidenceState: "calculated", object: {id: "obj-leverage", type: "credit_metric", fingerprint: FP, path: "metrics.net_leverage"}, sourceIds: ["source-release"], assumptionIds: [], gapIds: []},
      {id: "claim-cash", label: "Caixa e equivalentes", value: 1_250, unit: "R$ milhões", evidenceState: "observed_public", object: {id: "obj-cash", type: "financial_position", fingerprint: "c".repeat(64), path: "balance.cash"}, sourceIds: ["source-release"], assumptionIds: [], gapIds: []},
      {id: "claim-direction", label: "Direção analítica preliminar", value: "Comparar reperfilamento com solução de capex dedicada", unit: null, evidenceState: "mixed", object: {id: "obj-direction", type: "decision_option", fingerprint: "d".repeat(64), path: "ranking.leading"}, sourceIds: ["source-release"], assumptionIds: ["assumption-rate"], gapIds: ["gap-budget"]},
    ],
    views: [
      {surface: "conversation", artifactId: "chat-v1", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{...blocks[0]!, id: "chat-situation"}]},
      {surface: "workbook", artifactId: "model-v1", artifactKind: "xlsx", artifactFingerprint: null, blocks: [{...blocks[0]!, id: "model-situation"}]},
      {surface: "presentation", artifactId: "deck-v1", artifactKind: "pptx", artifactFingerprint: null, blocks},
    ],
    identityRequirements: [
      {claimId: "claim-leverage", surfaces: ["conversation", "workbook", "presentation"]},
      {claimId: "claim-cash", surfaces: ["conversation", "workbook", "presentation"]},
    ],
  };
}

describe("institutional presentation renderer", () => {
  it("renders a deterministic, governed 16:9 deck without creating a second economic truth", async () => {
    const logo = new Uint8Array(await readFile(new URL("../../../apps/web/public/brand/offroad-symbol.png", import.meta.url)));
    const contract = buildDecisionArtifactContract(fixture());
    const template = {...offroadHousePresentationTemplate, logo: {data: logo, extension: "png" as const}};
    const input = {contract, title: "Camil · Estrutura de capital", subtitle: "Leitura preliminar para discussão com o conselho", companyName: "Camil Alimentos", audience: "Conselho de Administração", locale: "pt-BR" as const, template};
    let first: Awaited<ReturnType<typeof renderInstitutionalPresentation>>;
    let second: Awaited<ReturnType<typeof renderInstitutionalPresentation>>;
    // DOS ZIP timestamps have two-second granularity. Move a Date-only fake clock across a known
    // three-second boundary so this regression cannot pass merely because both renders landed in
    // the same timestamp bucket. Async scheduling remains real.
    vi.useFakeTimers({toFake: ["Date"]});
    try {
      vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
      first = await renderInstitutionalPresentation(input);
      vi.setSystemTime(new Date("2026-09-07T12:00:03.000Z"));
      second = await renderInstitutionalPresentation(input);
    } finally {
      vi.useRealTimers();
    }

    expect(Buffer.compare(first.bytes, second.bytes)).toBe(0);
    expect(first.audit).toMatchObject({slideCount: 5, renderedBlockIds: ["situation", "direction", "gaps", "sources"], renderedClaimIds: ["claim-cash", "claim-direction", "claim-leverage"], packageInspection: {valid: true, missingParts: []}, visualInspection: {state: "not_run", reviewedPageCount: 0}, releaseEligible: false});
    expect(first.audit.contractFingerprint).toBe(contract.contractFingerprint);
    expect(first.audit.fileSha256).toMatch(/^[a-f0-9]{64}$/);

    const archive = await JSZip.loadAsync(first.bytes);
    expect(Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(5);
    const presentation = await archive.file("ppt/presentation.xml")!.async("string");
    expect(presentation).toContain('type="screen16x9"');
    const custom = await archive.file("docProps/custom.xml")!.async("string");
    expect(custom).toContain(contract.contractFingerprint);
    expect(custom).toContain(contract.snapshotFingerprint);
    const joinedSlides = (await Promise.all(Array.from({length: 5}, (_, index) => archive.file(`ppt/slides/slide${index + 1}.xml`)!.async("string")))).join("\n");
    expect(joinedSlides).toContain("Dívida líquida / EBITDA");
    expect(joinedSlides).toContain("4,7x");
    expect(joinedSlides).toContain("Plano financeiro da administração");
    expect(joinedSlides).toContain("RI &gt; resultados trimestrais &gt; p. 12");
    expect(joinedSlides).toContain('r:embed="rId2"');
  });

  it("paginates dense governed blocks instead of silently shrinking professional content", async () => {
    const raw = fixture();
    raw.gaps = Array.from({length: 9}, (_, index) => ({id: `gap-${index}`, label: `Lacuna ${index}`, materiality: "high" as const, impact: "Muda o caso", requestedInput: "Enviar informação"}));
    raw.claims[2]!.gapIds = ["gap-0"];
    raw.views[2]!.blocks[2]!.gapIds = raw.gaps.map((gap) => gap.id);
    const contract = buildDecisionArtifactContract(raw);
    const result = await renderInstitutionalPresentation({contract, title: "Teste", locale: "pt-BR"});
    expect(result.audit.slideCount).toBe(6);
    const archive = await JSZip.loadAsync(result.bytes);
    expect(await archive.file("ppt/slides/slide5.xml")!.async("string")).toContain("PONTOS EM ABERTO · 2/2");
  });
});
