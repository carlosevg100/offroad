import {describe, expect, it} from "vitest";

import enUS from "../../messages/en-US.json";
import ptBR from "../../messages/pt-BR.json";

interface MessageTree {
  [key: string]: string | MessageTree;
}

function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

describe("localized message catalogs", () => {
  it("keeps pt-BR and en-US structurally identical", () => {
    expect(flattenKeys(ptBR).sort()).toEqual(flattenKeys(enUS).sort());
  });

  it("does not contain blank copy", () => {
    for (const catalog of [ptBR, enUS]) {
      for (const value of Object.values(catalog.Home)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
