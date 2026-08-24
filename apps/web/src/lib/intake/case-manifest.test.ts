import {describe, expect, it} from "vitest";

import {economicInputFingerprint, normalizeEconomicInput, parserVersionFingerprint, type EconomicInputSnapshot} from "./case-manifest";

const snapshot = (): EconomicInputSnapshot => ({
  session: {archetype: "growth_expansion", requested_amount: 50_000_000},
  sources: [
    {id: "doc-b", document_version: 1, sha256: "b".repeat(64)},
    {id: "doc-a", document_version: 2, sha256: "a".repeat(64)},
  ],
  candidates: [
    {id: "fact-b", field_path: "debt.total", normalized_value: "20"},
    {id: "fact-a", field_path: "revenue", normalized_value: "100"},
  ],
  answers: [{requirement_id: "purpose", response: "expansion", note: null}],
  layers: [{source_document_id: "doc-a", document_version: 2, parser_versions: {pdf: "1"}}],
  run: {id: "run-1", pipeline_version: "p1", versions: {}},
});

describe("case economic fingerprint", () => {
  it("is independent of database row ordering", () => {
    const first = snapshot();
    const second = snapshot();
    second.sources.reverse();
    second.candidates.reverse();
    expect(economicInputFingerprint(first)).toBe(economicInputFingerprint(second));
    expect(normalizeEconomicInput(first).sources).toEqual(normalizeEconomicInput(second).sources);
  });

  it("changes when an answer or an economic fact changes", () => {
    const first = snapshot();
    const changedAnswer = snapshot();
    changedAnswer.answers[0]!.response = "refinancing";
    const changedFact = snapshot();
    changedFact.candidates[0]!.normalized_value = "21";
    expect(economicInputFingerprint(first)).not.toBe(economicInputFingerprint(changedAnswer));
    expect(economicInputFingerprint(first)).not.toBe(economicInputFingerprint(changedFact));
  });

  it("does not change when the processing run moves from running to succeeded", () => {
    const before = snapshot();
    before.session.status = "processing";
    before.run = {...before.run, status: "running", model_calls: 4};
    const after = snapshot();
    after.session.status = "review_ready";
    after.run = {...after.run, status: "succeeded", model_calls: 5};
    expect(economicInputFingerprint(before)).toBe(economicInputFingerprint(after));
  });

  it("changes the parser fingerprint when a parser version changes", () => {
    const first = snapshot().layers;
    const second = snapshot().layers;
    second[0]!.parser_versions = {pdf: "2"};
    expect(parserVersionFingerprint(first)).not.toBe(parserVersionFingerprint(second));
  });
});
