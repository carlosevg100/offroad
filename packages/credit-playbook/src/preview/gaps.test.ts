import {describe, expect, it} from "vitest";

import {extractPreviewGaps} from "./gaps";
import type {PreviewStepOutput} from "./run";

describe("preview gaps", () => {
  it("lists every declared gap of every object with an id a question can cite, and nothing from the brief", () => {
    const outputs = new Map<string, PreviewStepOutput>([
      ["C05", {state: "incomplete", incomplete_reasons: ["the interest bridge is not comparable"], ledger_rows: []} as unknown as PreviewStepOutput],
      ["C09", {state: "conditioned", unproven_conditions: [{id: "deb-11", condition: "the 4.00x tier requires proof of ordinary settlement"}], legal_conditions: []} as unknown as PreviewStepOutput],
      ["C08", {state: "blocked", block_reasons: [{id: "b1", reason: "no scenario declared"}]} as unknown as PreviewStepOutput],
      ["A01", {state: "planned", alignment_questions: [{id: "q", text: "?"}]} as unknown as PreviewStepOutput],
    ]);
    const gaps = extractPreviewGaps(outputs);
    expect(gaps.map((gap) => gap.id)).toEqual(["C05.incomplete_reasons[0]", "C09.unproven_conditions[0]", "C08.block_reasons[0]"]);
    expect(gaps[1]!.text).toBe("deb-11: the 4.00x tier requires proof of ordinary settlement");
    expect(gaps[1]!.objectLabel).toBe("Ler os covenants pelas escrituras");
  });

  it("names a degraded state without itemised reasons as a gap of its own", () => {
    const gaps = extractPreviewGaps(new Map([["C07", {state: "partial"} as unknown as PreviewStepOutput]]));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.id).toBe("C07.state");
  });
});
