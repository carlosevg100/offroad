import {describe, expect, it} from "vitest";
import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildMethodManifest} from "./build-method-manifest";
import {readReleasedMethodLock} from "./released-method-lock";
const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
function withCopy(test: (copy: string) => void) {
  const copy = mkdtempSync(join(tmpdir(), "offroad-release-isolation-"));
  try {
    mkdirSync(join(copy, "packages"));
    for (const name of readdirSync(join(root, "packages"))) {
      if (["credit-playbook", "financial-core"].includes(name)) cpSync(join(root, "packages", name), join(copy, "packages", name), {recursive: true, filter: path => !/\/(node_modules|dist)(\/|$)/.test(path)});
      else symlinkSync(join(root, "packages", name), join(copy, "packages", name));
    }
    for (const name of ["pnpm-lock.yaml", "tsconfig.base.json"]) cpSync(join(root, name), join(copy, name));
    test(copy);
  } finally {rmSync(copy, {recursive: true, force: true});}
}
const r01 = (copy: string) => buildMethodManifest(copy).provenance.find(p => p.procedure.id === "underwrite-receivables-pool");
describe("published method isolation", () => {
  it("does not change R01 when an unrelated calculation is added to the authoring package", () => withCopy(copy => {
    const before = r01(copy);
    writeFileSync(join(copy, "packages/financial-core/src/isolation-probe-only.ts"), "export const isolationProbe = true;\n");
    expect(r01(copy)).toEqual(before);
    expect(r01(copy)?.manifestHash).toBe("17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090");
  }));
  it("does not replace a published compiler when the authoring compiler changes", () => withCopy(copy => {
    const before = r01(copy);
    const file = join(copy, "packages/credit-playbook/src/procedure-compiler.ts");
    writeFileSync(file, readFileSync(file, "utf8") + "\n// new compiler revision\n");
    expect(r01(copy)).toEqual(before);
  }));
  it("requires a new identity for material edits of the published method", () => withCopy(copy => {
    const file = join(copy, "packages/credit-playbook/knowledge/procedures/receivables/underwrite-receivables-pool.md");
    writeFileSync(file, readFileSync(file, "utf8") + "\nMaterial revision.\n");
    expect(() => r01(copy)).toThrow("published_method_requires_new_version");
  }));
  it("denies duplicate versions and changed pinned snapshots", () => withCopy(copy => {
    const file = join(copy, "packages/credit-playbook/knowledge/releases/method-release-lock.json");
    const lock = JSON.parse(readFileSync(file, "utf8"));
    lock.releases.push(lock.releases[0]); writeFileSync(file, JSON.stringify(lock));
    expect(() => readReleasedMethodLock(copy)).toThrow("duplicate_published_method_identity");
    lock.releases.pop(); writeFileSync(file, JSON.stringify(lock));
    const snapshot = join(copy, `packages/credit-playbook/knowledge/releases/${lock.releases[0].snapshotHash}.sources.json`);
    writeFileSync(snapshot, readFileSync(snapshot, "utf8") + " ");
    expect(() => readReleasedMethodLock(copy)).toThrow("published_method_snapshot_mismatch");
  }));
});
