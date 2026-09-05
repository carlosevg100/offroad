import {describe, expect, it} from "vitest";

import type {PreviewStepOutput} from "./run";
import {numberVocabulary, synthesisChangeNote, synthesisSkeleton, validateSynthesisNumbers} from "./synthesis";

const outputs = new Map<string, PreviewStepOutput>([
  ["C05", {state: "incomplete", gross_debt: "5670186", ledger_rows: [{id: "deb-11", amount: "1234567.5"}]} as unknown as PreviewStepOutput],
  ["C09", {state: "conditioned", covenants: [{id: "deb-11", ratio: "4.72"}]} as unknown as PreviewStepOutput],
  ["S10", {state: "compared", alternatives: [{id: "status-quo", rate: "0.155"}]} as unknown as PreviewStepOutput],
  ["A01", {state: "planned", deliverable: {blocks: [{id: "debt_by_instrument", headlines: [{text: "Dívida bruta de 5.670.186 (R$ mil).", objectPath: "c05.gross_debt"}]}]}} as unknown as PreviewStepOutput],
]);

describe("preview synthesis", () => {
  it("holds every number the objects state, in the forms prose writes them", () => {
    const vocabulary = numberVocabulary(outputs);
    for (const token of ["5670186", "5.670.186", "1234567.5", "1.234.567,5", "4.72", "4,72", "4,72x", "0.155", "15.5%", "15,5%"]) expect(vocabulary.has(token), token).toBe(true);
    expect(vocabulary.has("9.999")).toBe(false);
  });

  it("removes a sentence whose number the objects do not hold, and keeps the rest", () => {
    const vocabulary = numberVocabulary(outputs);
    const result = validateSynthesisNumbers([{id: "situation", title: "Situação", paragraphs: [{text: "A dívida bruta é de 5.670.186 mil. A alavancagem de 4,72x está no tier. O EBITDA cresceu 12,3% no ano.", references: ["c05.gross_debt"]}]}], vocabulary);
    expect(result.sections[0]!.paragraphs[0]!.text).toBe("A dívida bruta é de 5.670.186 mil. A alavancagem de 4,72x está no tier.");
    expect(result.removed).toEqual([{sectionId: "situation", sentence: "O EBITDA cresceu 12,3% no ano.", numbers: ["12,3%"]}]);
    expect(result.verified).toBe(2);
  });

  it("writes the skeleton from the objects' own headlines and names what changed since the previous version", () => {
    const fingerprints = {C05: "a".repeat(64), C09: "b".repeat(64), S10: "c".repeat(64), A01: "d".repeat(64)};
    const skeleton = synthesisSkeleton({outputs, request: {turn: 1, composition: "prepare_meeting", audience: {primary: "vp"}, form: "first_deliverable", pages: null, sponsorInstruction: null, undefinedAspects: []}, locale: "pt-BR", objectFingerprints: fingerprints, previous: null});
    expect(skeleton.state).toBe("skeleton");
    expect(skeleton.sections[0]!.paragraphs[0]!.text).toContain("Dívida bruta de 5.670.186");
    expect(skeleton.change_note).toEqual([]);
    const note = synthesisChangeNote(fingerprints, {...fingerprints, S10: "e".repeat(64), C07: "f".repeat(64)}, "pt-BR");
    expect(note).toEqual(["Comparar as alternativas antes e depois: objeto alterado", "Projetar juros e correção por série: objeto novo"]);
  });
});
