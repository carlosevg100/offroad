import {bilingualFigureDivergence} from "@offroad/testing-fixtures/bilingual-figures";
import {describe, expect, it} from "vitest";

import {deskRuns} from "./verdict-cases.test-support";

/**
 * Invariant 9 on the desk's own sentences (stage 19, increment 6C): every finding of the battery,
 * every finding of the trajectory and every note of the operation verdict states in English the
 * same figures it states in Portuguese, each read with the separators of its language, over the
 * twelve runs the verdict pins use. These sentences reach the credit memo, the term sheet, the
 * risk table of the profile and the package, and the Q&A.
 */
describe("the desk states the same figures in both languages", () => {
  const runs = deskRuns();

  it("reaches findings, trajectory findings and every kind of verdict note", () => {
    const all = Object.values(runs);
    expect(all.flatMap((run) => run.desk.findings).length).toBeGreaterThan(20);
    expect(all.flatMap((run) => run.trajectory?.findings ?? []).length).toBeGreaterThan(10);
    const ids = new Set(all.flatMap((run) => [...run.verdict.conditions, ...run.verdict.solves, ...run.verdict.leaves].map((note) => note.id)));
    expect([...ids].sort()).toEqual(["later-wall-untouched", "near-wall-not-fully-covered", "near-wall-termed-out", "new-money", "price", "waiver-before-anything"]);
    // The desk finding question 20 of the Q&A answers from.
    expect(all.some((run) => run.desk.findings.some((finding) => finding.id === "rate-ask-vs-stack"))).toBe(true);
  });

  for (const [key, run] of Object.entries(runs)) {
    it(key, () => {
      const {verdict} = run;
      const texts = [
        ...run.desk.findings.map((finding) => ({id: `finding.${finding.id}`, pt: finding.pt, en: finding.en})),
        ...(run.trajectory?.findings ?? []).map((finding) => ({id: `trajectory.${finding.id}`, pt: finding.pt, en: finding.en})),
        {id: "verdict.headline", ...verdict.headline},
        ...[...verdict.conditions, ...verdict.solves, ...verdict.leaves].map((note) => ({id: `verdict.${note.id}`, pt: note.pt, en: note.en})),
        ...verdict.alternatives.flatMap((alternative) => [{id: `verdict.${alternative.id}.why`, ...alternative.why}, {id: `verdict.${alternative.id}.tradeoff`, ...alternative.tradeoff}]),
      ];
      expect(texts.filter((text) => bilingualFigureDivergence(text) !== null).map((text) => text.id)).toEqual([]);
    });
  }
});
