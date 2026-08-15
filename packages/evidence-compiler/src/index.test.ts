import {describe, expect, it} from "vitest";

import {assertEconomicIdentity, compileClaims} from "./index";

describe("evidence compiler", () => {
  it("blocks material claims without support", () => {
    const result = compileClaims([{id: crypto.randomUUID(), kind: "fact", material: true, text: "Revenue grew", supportIds: [], approved: false}]);
    expect(result.status).toBe("blocked");
    expect(result.coverage).toBe(0);
  });

  it("keeps localized outputs economically identical", () => {
    expect(() => assertEconomicIdentity({amount: "54", dscr: "1.74"}, {dscr: "1.74", amount: "54"})).not.toThrow();
    expect(() => assertEconomicIdentity({amount: "54"}, {amount: "55"})).toThrow();
  });
});
