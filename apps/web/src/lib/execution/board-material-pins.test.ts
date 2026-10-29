import {describe, expect, it} from "vitest";
import {checkBoardMaterialPins} from "./board-material-pins";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pins = [{role: "tabela-divida", methodId: "build-company-debt-table", executionId: id(1), resultFingerprint: "1".repeat(64), moneyScale: "reais" as const},
  {role: "plano-2027", methodId: "evaluate-financing-paths", executionId: id(2), resultFingerprint: "2".repeat(64), moneyScale: "millions" as const}];

describe("board material pins (C47)", () => {
  it("confirms only over the very executions and packets the card showed", () => {
    expect(checkBoardMaterialPins({boardSources: pins}, pins)).toEqual({ok: true, pins});
    // A source executed after the card, not pinned by it, does not supersede it.
    expect(checkBoardMaterialPins({boardSources: pins}, [...pins, {role: "recebiveis", methodId: "monetize-receivables-for-working-capital", executionId: id(3), resultFingerprint: "3".repeat(64), moneyScale: "reais"}]).ok).toBe(true);
  });
  it("is superseded by a newer result, another packet, a missing role, a repeated role or a card without pins", () => {
    for (const latest of [[pins[0]!, {...pins[1]!, executionId: id(9)}], [pins[0]!, {...pins[1]!, resultFingerprint: "9".repeat(64)}], [pins[0]!], [...pins, pins[1]!],
      // Another scale recorded now for a method, or none, supersedes the card.
      [pins[0]!, {...pins[1]!, moneyScale: "reais" as const}], [pins[0]!, {...pins[1]!, moneyScale: null}]])
      expect(checkBoardMaterialPins({boardSources: pins}, latest)).toEqual({ok: false, error: "superseded"});
    expect(checkBoardMaterialPins({boardSources: [...pins, pins[0]!]}, pins).ok).toBe(false);
    expect(checkBoardMaterialPins({}, pins).ok).toBe(false);
    expect(checkBoardMaterialPins({boardSources: pins.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "moneyScale")))}, pins).ok).toBe(false);
  });
});
