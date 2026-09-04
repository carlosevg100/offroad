import {describe, expect, it} from "vitest";

import {
  BASELINE_SYSTEM_PROMPT,
  baselineInformationBaseSchema,
  filterCsvRows,
  informationBaseHash,
  renderInformationBase,
  renderTurnMessage,
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
