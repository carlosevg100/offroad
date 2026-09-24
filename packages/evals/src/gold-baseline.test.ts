import {describe, expect, it} from "vitest";

import {
  BASELINE_SYSTEM_PROMPT,
  baselineGeneralistSnapshotSchema,
  baselineInformationBaseSchema,
  filterCsvRows,
  informationBaseHash,
  readBaselineGovernedResult,
  renderInformationBase,
  renderTurnMessage,
  runBaselineGeneralist,
  sha256Hex,
  type BaselineGateway,
  type BaselineGeneralistSnapshot,
  type BaselineInformationBase,
} from "./gold-baseline";

const base = (): BaselineInformationBase => baselineInformationBaseSchema.parse({
  caseId: "gc01-analista-ib-camil",
  caseVersion: "1.0",
  language: "pt-BR",
  asOfDate: "2026-09-04",
  professionalContext: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["dcm"], primaryObjectives: ["prepare_meetings"]},
  turns: [{id: "gc01-t01", text: "Meu VP pediu material para uma reunião com a Camil sobre refinanciamento."}],
  documents: [
    {id: "doc-b", title: "Proposta AGOE", fileName: "02.pdf", sha256: "b".repeat(64), pages: 3, text: "texto b"},
    {id: "doc-a", title: "ITR", fileName: "01.pdf", sha256: "a".repeat(64), pages: 2, text: "texto a"},
  ],
  sources: [
    {id: "src-2", title: "Release", url: "https://x/2", asOfDate: "2026-05-31", version: "1T26", licencePolicy: "public_reusable", contentType: "application/pdf", sha256: "c".repeat(64), text: "release", rendering: "full_text"},
    {id: "src-1", title: "ANBIMA Data", url: "https://x/1", asOfDate: "2026-09-04", version: "manual", licencePolicy: "manual_only", contentType: "manual", sha256: null, text: null, rendering: "not_retained"},
  ],
});

describe("gold baseline information base", () => {
  it("renders deterministically and orders documents and sources by id", () => {
    const rendered = renderInformationBase(base());
    expect(rendered.indexOf("Documento doc-a")).toBeLessThan(rendered.indexOf("Documento doc-b"));
    expect(rendered.indexOf("Fonte src-1")).toBeLessThan(rendered.indexOf("Fonte src-2"));
    expect(rendered).toContain("Conteúdo não retido por licença");
    expect(informationBaseHash(base())).toBe(informationBaseHash(base()));
  });

  it("changes its hash when any input byte changes", () => {
    const changed = base();
    changed.documents[0]!.text = "texto b alterado";
    expect(informationBaseHash(changed)).not.toBe(informationBaseHash(base()));
  });

  it("asks the person's message and nothing else, and keeps the rubric out of the instructions", () => {
    expect(renderTurnMessage(base().turns[0]!, 0)).toBe("## Turno 1\n\nMeu VP pediu material para uma reunião com a Camil sobre refinanciamento.");
    for (const word of ["rubrica", "alpha", "covered", "insufficient_evidence", "gabarito", "adversarial"]) {
      expect(BASELINE_SYSTEM_PROMPT.toLowerCase()).not.toContain(word);
    }
  });

  it("filters a registry to the company's rows and keeps the header", () => {
    const csv = "CNPJ;NOME\n1;ACME\n2;CAMIL ALIMENTOS S/A\n3;CAMIL X\n";
    const result = filterCsvRows(csv, /CAMIL/i, 1);
    expect(result).toEqual({text: "CNPJ;NOME\n2;CAMIL ALIMENTOS S/A", kept: 1, total: 3});
  });
});

describe("gold baseline governed result", () => {
  const snapshot = (): BaselineGeneralistSnapshot => baselineGeneralistSnapshotSchema.parse({
    schemaVersion: "gold-baseline-snapshot.v1",
    informationBase: {caseId: "gc01-synthetic", caseVersion: "1.0", language: "pt-BR", asOfDate: "2026-09-04",
      turns: [{id: "gc01-t01", text: "Pedido sintético do primeiro turno."}, {id: "gc01-t02", text: "Pedido sintético do segundo turno."}],
      documents: [{id: "doc-a", title: "Documento sintético", fileName: "a.pdf", sha256: "a".repeat(64), pages: 1, text: "texto sintético"}],
      sources: []},
    model: {primary: {provider: "anthropic", model: "claude-opus-5", effort: "high"}, fallback: null, maxOutputTokens: 2000},
    caveats: ["Caveat sintético."],
  });
  type Published = {
    record: {informationBaseSha256: string; caveats: string[]; turns: Array<{outputFile: string; outputSha256: string}>};
    outputs: Array<{turnId: string; file: string; deliverable: string}>;
  };
  /** The result the worker's family publishes for this snapshot, from a synthetic gateway. */
  const published = async (s: BaselineGeneralistSnapshot): Promise<Published> => {
    let call = 0;
    const gateway: BaselineGateway = {
      complete: async () => ({output: {deliverable: `Entrega sintética ${++call}`}, provider: "anthropic", model: "claude-opus-5", effort: "high",
        usage: {inputTokens: 100, outputTokens: 10, cachedInputTokens: 0}, costUsd: 0.01, stopReason: "end"}),
      spent: () => ({costUsd: 0.02}),
    };
    return JSON.parse(JSON.stringify({schemaVersion: "gold-baseline-result.v1", ...await runBaselineGeneralist(s, gateway)})) as Published;
  };

  it("reads the committed run of exactly these inputs", async () => {
    const s = snapshot();
    const run = readBaselineGovernedResult(await published(s), s);
    expect(run.outputs.map((output) => [output.file, output.deliverable])).toEqual([["gc01-t01.output.md", "Entrega sintética 1"], ["gc01-t02.output.md", "Entrega sintética 2"]]);
    expect(run.record.informationBaseSha256).toBe(informationBaseHash(s.informationBase));
    expect(run.record.turns.map((turn) => turn.outputSha256)).toEqual(["Entrega sintética 1", "Entrega sintética 2"].map((text) => sha256Hex(text)));
  });

  it.each<[string, (result: Published) => void]>([
    ["another information base", (result) => { result.record.informationBaseSha256 = "f".repeat(64); }],
    ["other caveats", (result) => { result.record.caveats = ["Outro caveat."]; }],
    ["a deliverable its hash does not name", (result) => { result.outputs[0]!.deliverable = "Entrega alterada"; }],
    ["turns out of order", (result) => { result.outputs.reverse(); }],
    ["a missing turn", (result) => { result.outputs.pop(); }],
    ["a file named after another turn", (result) => { result.outputs[0]!.file = "gc01-t02.output.md"; }],
    ["a file outside the run", (result) => { result.outputs[0]!.file = "../gc01-t01.output.md"; result.record.turns[0]!.outputFile = "../gc01-t01.output.md"; }],
  ])("refuses %s", async (_label, change) => {
    const s = snapshot(), result = await published(s);
    change(result);
    expect(() => readBaselineGovernedResult(result, s)).toThrow();
  });
});
