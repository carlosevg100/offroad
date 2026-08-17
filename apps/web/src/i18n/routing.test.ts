import {describe, expect, it} from "vitest";

import {routing} from "./routing";

describe("locale routing", () => {
  it("opens the unprefixed site in Brazilian Portuguese", () => {
    expect(routing.defaultLocale).toBe("pt-BR");
    expect(routing.localeDetection).toBe(false);
  });
});
