import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {buildMethodManifest} from "./build-method-manifest";
import {compileMethodDocument} from "./procedure-markdown";
import type {CompiledProcedureManifest} from "./procedure-compiler";

vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {...fs, readFileSync: vi.fn(fs.readFileSync)};
});
const root = resolve(import.meta.dirname, "../../..");
const procedure = "packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md";
const candidate = () => {
  const result = buildMethodManifest(root).provenance.find(p => p.procedure.id === "prepare-capital-structure-decision")!;
  if (!("components" in result)) throw new Error("Expected composed method");
  return result as CompiledProcedureManifest;
};
afterEach(() => vi.mocked(readFileSync).mockClear());

describe("composed method test provenance", () => {
  it("pins every declared unit test to its exact source bytes", () => {
    const document = compileMethodDocument(readFileSync(resolve(root, procedure), "utf8"), "capital/prepare-capital-structure-decision.md");
    const pins = candidate().components.flatMap(c => c.executor?.sources ?? []);
    const paths = document.procedure.implementation!.evaluation.unitTestFiles;
    expect(paths.length).toBe(8);
    for (const path of paths) {
      const hash = createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
      expect(pins).toContainEqual({path, hash});
    }
  });

  it("changes executor and manifest identity when only a declared test changes", async () => {
    const original = await vi.importActual<typeof import("node:fs")>("node:fs");
    const before = candidate();
    const target = resolve(root, "packages/financial-model/src/capital-procedure-packet.test.ts");
    vi.mocked(readFileSync).mockImplementation(((file: unknown, options: unknown) => {
      if (file === target) return original.readFileSync(target, "utf8") + "\n// Independent mutation proof\n";
      return original.readFileSync(file as string, options as "utf8");
    }) as typeof readFileSync);
    try {
      const after = candidate();
      expect(after.manifestHash).not.toBe(before.manifestHash);
      expect(after.components.find(c => c.component.id === "capital.procedure-packet")!.executor!.hash)
        .not.toBe(before.components.find(c => c.component.id === "capital.procedure-packet")!.executor!.hash);
      expect(after.source).toEqual(before.source);
    } finally { vi.mocked(readFileSync).mockImplementation(original.readFileSync); }
  });

  it("refuses a declared test path that escapes the repository", async () => {
    const original = await vi.importActual<typeof import("node:fs")>("node:fs");
    const target = resolve(root, procedure);
    vi.mocked(readFileSync).mockImplementation(((file: unknown, options: unknown) => {
      if (file === target) return original.readFileSync(target, "utf8").replace(
        "packages/financial-model/src/capital-procedure-packet.test.ts", "packages/../../outside.test.ts");
      return original.readFileSync(file as string, options as "utf8");
    }) as typeof readFileSync);
    try { expect(() => candidate()).toThrow("invalid_method_test_source"); }
    finally { vi.mocked(readFileSync).mockImplementation(original.readFileSync); }
  });
});
