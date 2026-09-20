import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {readGitEvidenceSummaries} from "./git-evidence-reader";

describe("bounded Git evidence reader", () => {
  let root: string; let commit: string;
  const binary = Buffer.from([0, 255, 10, 13, 32, 128]);
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "offroad-synthetic-evidence-"));
    const git = (...args: string[]) => execFileSync("git", args, {cwd: root, encoding: "utf8"});
    git("init", "--quiet"); mkdirSync(join(root, "folder"));
    writeFileSync(join(root, "folder/binary file.bin"), binary); writeFileSync(join(root, "empty"), "");
    writeFileSync(join(root, "large"), Buffer.alloc(20 * 1024 * 1024 + 1, 65));
    git("add", "."); git("-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "--quiet", "-m", "Synthetic byte reader fixtures");
    commit = git("rev-parse", "HEAD").trim();
  });
  afterAll(() => {rmSync(root, {recursive: true, force: true});});
  it("hashes exact binary and empty blobs including paths with spaces and deduplicated requests", async () => {
    const ref = `${commit}:folder/binary file.bin`; const empty = `${commit}:empty`;
    const r = await readGitEvidenceSummaries(root, [ref, empty, ref]);
    expect(r.size).toBe(2); expect(r.get(ref)).toEqual({fingerprint: `sha256:${createHash("sha256").update(binary).digest("hex")}`, byteLength: 6});
    expect(r.get(empty)).toEqual({fingerprint: `sha256:${createHash("sha256").update("").digest("hex")}`, byteLength: 0});
  });
  it("keeps missing trees and oversized blobs unresolved without substituting neighboring bytes", async () => {
    const refs = ["missing", "folder", "large", "empty"].map(p => `${commit}:${p}`);
    const r = await readGitEvidenceSummaries(root, refs);
    for (const ref of refs.slice(0, 3)) expect(r.get(ref)).toBeNull();
    expect(r.get(refs[3]!)).toMatchObject({byteLength: 0});
  });
  it("refuses line or null injection and revision expressions outside a pinned commit", async () => {
    for (const ref of [`${commit}:empty\n${commit}:folder/binary file.bin`, `${commit}:empty\0`, "HEAD:empty", "--help:empty"])
      expect((await readGitEvidenceSummaries(root, [ref])).get(ref)).toBeNull();
  });
  it("rereads the pinned object rather than changed working-tree content", async () => {
    const ref = `${commit}:empty`; const before = await readGitEvidenceSummaries(root, [ref]);
    writeFileSync(join(root, "empty"), "uncommitted changed content");
    expect(await readGitEvidenceSummaries(root, [ref])).toEqual(before);
  });
});
