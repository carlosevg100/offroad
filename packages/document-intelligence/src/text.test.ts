import {describe, expect, it} from "vitest";

import {parseNumber} from "./text";

describe("a lone leading zero", () => {
  it("makes the separator decimal in any locale", () => {
    expect(parseNumber("0.181", "pt-BR")?.value.toFixed()).toBe("0.181");
    expect(parseNumber("0,181", "en-US")?.value.toFixed()).toBe("0.181");
    expect(parseNumber("1.181", "pt-BR")?.value.toFixed()).toBe("1181");
  });
});
