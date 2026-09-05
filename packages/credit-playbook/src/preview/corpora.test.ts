import {describe, expect, it} from "vitest";

import {normalizeMention, previewCorpora, resolvePreviewCorpus} from "./corpora";

describe("preview corpora", () => {
  it("resolves the Camil aliases to the Case 01 base, as whole words and without accents or case", () => {
    for (const mention of ["Camil", "camil alimentos", "CAMIL ALIMENTOS S.A.", "a Camil Alimentos SA", "CAML3"]) {
      const resolution = resolvePreviewCorpus([mention]);
      expect(resolution.kind).toBe("resolved");
      if (resolution.kind === "resolved") expect(resolution.corpus.caseId).toBe(previewCorpora[0]!.caseId);
    }
  });

  it("never resolves a company that only contains an alias as a fragment, nor an unknown company", () => {
    expect(resolvePreviewCorpus(["Camila Ferreira Participações"]).kind).toBe("unknown");
    expect(resolvePreviewCorpus(["Magazine Luiza"]).kind).toBe("unknown");
    expect(resolvePreviewCorpus([" ", ""]).kind).toBe("none");
  });

  it("resolves when one of several mentions is a known company", () => {
    const resolution = resolvePreviewCorpus(["Magazine Luiza", "Camil"]);
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind === "resolved") expect(resolution.mention).toBe("Camil");
  });

  it("normalizes mentions the way aliases are stored", () => {
    expect(normalizeMention("  Camil Alimentos S.A. ")).toBe("camil alimentos s a");
    expect(normalizeMention("Companhia Açúcar & Álcool")).toBe("companhia acucar alcool");
  });
});
