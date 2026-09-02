import {describe, expect, it} from "vitest";

import {materialNumericTokens} from "./material-numeric-tokens";

describe("material numeric evidence tokens", () => {
  it("treats optional currency spacing as presentation rather than new evidence", () => {
    expect(materialNumericTokens("Oferta de R$ 1,0 bilhão.")).toContain("r$1,0");
    expect(materialNumericTokens("Oferta de R$1,0 bilhão.")).toContain("r$1,0");
  });

  it("keeps different amounts distinct", () => {
    expect(materialNumericTokens("R$ 1,0 bilhão")).not.toEqual(materialNumericTokens("R$ 1,1 bilhão"));
  });

  it("preserves fully formatted BRL values and negative cash-flow facts", () => {
    expect(materialNumericTokens("BRL 1.141,63 milhões")).toContain("brl1.141,63");
    expect(materialNumericTokens("BRL -756,955 milhões")).toContain("brl-756,955");
  });
});
