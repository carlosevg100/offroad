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
});
