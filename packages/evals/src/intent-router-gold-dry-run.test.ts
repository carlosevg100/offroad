import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {executionCanonicalText} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {buildIntentRouterGoldSnapshot} from "./intent-router-gold-transport";

/**
 * `run-intent-router-gold.ts --dry-run` assembles the family snapshot and the budget and returns
 * before the trusted-workflow check, the evaluator's environment and any request. The script runs
 * here as a child process with no provider key, no evaluator credential and no GitHub context.
 */
const evalsDir = resolve(import.meta.dirname, "..");
const script = resolve(evalsDir, "scripts", "run-intent-router-gold.ts");
const tsxPackage = JSON.parse(readFileSync(resolve(evalsDir, "node_modules", "tsx", "package.json"), "utf8")) as {bin: string};
const tsxCli = resolve(evalsDir, "node_modules", "tsx", tsxPackage.bin);
const environment = Object.fromEntries(Object.entries(process.env)
  .filter(([name]) => !name.endsWith("_API_KEY") && !name.startsWith("GITHUB_") && !name.startsWith("OFFROAD_EVALUAT") && !name.startsWith("SUPABASE_")));

describe("intent router gold dry run", () => {
  it("assembles the snapshot of the 52 observations and the budget without requesting anything", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "offroad-intent-router-dry-run-"));
    try {
      const out = resolve(dir, "run");
      const result = spawnSync(process.execPath, [tsxCli, script, "--dry-run", "--out", out], {cwd: evalsDir, env: environment, encoding: "utf8"});
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const text = executionCanonicalText(buildIntentRouterGoldSnapshot());
      const lines = result.stdout.trim().split("\n");
      expect(lines).toEqual([
        `evaluation snapshot: ${Buffer.byteLength(text, "utf8")} bytes, sha256 ${createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16)}, 52 observations, audience ${buildIntentRouterGoldSnapshot().audience.caseVersion}`,
        `evaluation budget: 3000000 microusd, 320 calls, ${320 * 60_000} ms of work`,
        "dry run: no model called",
      ]);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);

  it("refuses the live request outside the trusted post-merge workflow before reading any credential", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "offroad-intent-router-untrusted-"));
    try {
      const out = resolve(dir, "run");
      const result = spawnSync(process.execPath, [tsxCli, script, "--out", out], {cwd: evalsDir, env: environment, encoding: "utf8"});
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("paid_gate_requires_github_actions");
      expect(result.stderr).not.toContain("governed_transport_environment_missing");
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
