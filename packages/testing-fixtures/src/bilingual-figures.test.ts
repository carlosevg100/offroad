import {describe, expect, it} from "vitest";

import {bilingualDivergences, bilingualFigureDivergence, readFigures} from "./bilingual-figures";

describe("reading figures as a reader of each language reads them", () => {
  it("parses each number with the separators of its language only", () => {
    expect(readFigures("R$ 17,4M e 62,7% da receita; alavancagem de 2,19x; R$ 42.300.000", "pt-BR"))
      .toEqual({figures: ["amount:17400000", "amount:42300000", "multiple:2.19", "percent:62.7"], foreign: []});
    expect(readFigures("R$ 17.4M and 62.7% of revenue; leverage of 2.19x; R$ 42,300,000", "en-US"))
      .toEqual({figures: ["amount:17400000", "amount:42300000", "multiple:2.19", "percent:62.7"], foreign: []});
    // The other language's separators are not a figure of this one.
    expect(readFigures("leverage to 4,70x at 15,0% a.a.", "en-US")).toEqual({figures: [], foreign: ["4,70", "15,0"]});
    expect(readFigures("DSO 90.3 dias", "pt-BR")).toEqual({figures: [], foreign: ["90.3"]});
    // Ambiguous grouping reads as each language reads it.
    expect(readFigures("R$ 1.229", "pt-BR").figures).toEqual(["amount:1229"]);
    expect(readFigures("R$ 1.229", "en-US").figures).toEqual(["amount:1.229"]);
  });

  it("reads amounts at full value, whatever the unit word, and keeps dates, spreads, fractions and counts", () => {
    expect(readFigures("R$ 45 mil; R$ 1,0M; R$ 191,2 milhões; R$ -8.420.000", "pt-BR").figures)
      .toEqual(["amount:-8420000", "amount:1000000", "amount:191200000", "amount:45000"]);
    expect(readFigures("R$ 45 thousand; R$ 1.0M; R$ 191.2 million; R$ -8,420,000", "en-US").figures)
      .toEqual(["amount:-8420000", "amount:1000000", "amount:191200000", "amount:45000"]);
    expect(readFigures("venc. 2027-11-20; step-up de 50 bps; quórum de 2/3; 48 meses", "pt-BR").figures)
      .toEqual(["bps:50", "date:2027-11-20", "fraction:2/3", "number:48"]);
    expect(readFigures("due 2027-11-20; a 50 bps step-up; a two-thirds quorum; 48 months", "en-US").figures)
      .toEqual(["bps:50", "date:2027-11-20", "fraction:2/3", "number:48"]);
    // Ordinals and identifiers are prose; a range is two numbers; a hyphen after a space is a sign.
    expect(readFigures("Covenant proposto (1º teste), LC-07, 2026-2030, -0,26x", "pt-BR").figures)
      .toEqual(["multiple:-0.26", "number:2026", "number:2030"]);
  });

  it("finds the English item that drops a figure or writes Portuguese decimals", () => {
    // Q&A question 20 as case-materials 2026.09.26-v5 published it.
    const pt = "A empresa pede 14,9% a.a. (com CDI a 10,5% a.a.) para dinheiro novo que leva a alavancagem a 4,70x, enquanto o stack atual, contratado à alavancagem menor de 2,19x, já custa 15,0% a.a. na média.";
    const before = bilingualFigureDivergence({pt, en: "The company asks 14,9% a.a. (CDI at 10,5% a.a.) for new money that takes leverage to 4,70x, while the current stack, written at lower leverage, already averages 15,0% a.a.."});
    expect(before?.pt.figures).toContain("multiple:2.19");
    expect(before?.en.foreign).toEqual(["14,9", "10,5", "4,70", "15,0"]);
    expect(bilingualFigureDivergence({pt, en: "The company asks 14.9% p.a. (CDI at 10.5% p.a.) for new money that takes leverage to 4.70x, while the current stack, written at the lower leverage of 2.19x, already averages 15.0% p.a."})).toBeNull();
    // A missing figure, a figure written in words, a different value.
    expect(bilingualFigureDivergence({pt: "vencem em 12 meses", en: "due within twelve months"})).not.toBeNull();
    expect(bilingualFigureDivergence({pt: "R$ 0,6M de ajustes", en: "R$ 0.7M of adjustments"})).not.toBeNull();
  });

  it("reads a text quoted as written from the case as Portuguese on both sides, and only where it stands alone", () => {
    const quote = "CDI + 4,00% a.a.";
    expect(bilingualFigureDivergence({pt: `A companhia pediu ${quote}.`, en: `The company asked for ${quote}.`}, [quote])).toBeNull();
    expect(bilingualFigureDivergence({pt: `A companhia pediu ${quote}.`, en: `The company asked for ${quote}.`})).not.toBeNull();
    // "9% a.a." quoted from a fact is not the tail of "14,9% a.a.".
    expect(bilingualFigureDivergence({pt: "pede 14,9% a.a.", en: "asks 14,9% a.a."}, ["9% a.a."])?.en.foreign).toEqual(["14,9"]);
  });

  it("walks every item of a material, a table cell in one string printed in both languages", () => {
    const material = {
      title: {pt: "Memorando", en: "Memorandum"},
      blocks: [
        {type: "table" as const, caption: {pt: "Fontes e usos", en: "Sources and uses"}, head: [{pt: "Valor", en: "Amount"}], rows: [["R$ 42.300.000"], [{pt: "R$ 42.300.000", en: "R$ 42,300,000"}]]},
        {type: "kv" as const, rows: [{label: {pt: "Condição 1", en: "Condition 1"}, value: {pt: "cobre 0,59x", en: "covers 0,59x"}}]},
      ],
    };
    expect(bilingualDivergences(material).map((divergence) => [divergence.path, divergence.foreign])).toEqual([
      ["1.table.1.1", ["en:42.300.000"]],
      ["2.kv.1.value", ["en:0,59"]],
    ]);
  });
});
