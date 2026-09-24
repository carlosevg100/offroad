import {spawnSync} from "node:child_process";
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * Each script of the document work product family, run as a child process the way its workflow
 * runs it, on the protected run it requires and with neither a provider key nor the evaluator's
 * credential in its environment: it assembles its snapshot offline, then fails closed, by name,
 * before anything is claimed, requested or written. The continuation derives its plan from the
 * pinned receipt of its source run, kept as a fixture byte for byte (its sha256 is pinned in the
 * script).
 */
const evalsDir = resolve(import.meta.dirname, "..");
const tsxPackage = JSON.parse(readFileSync(resolve(evalsDir, "node_modules", "tsx", "package.json"), "utf8")) as {bin: string};
const tsxCli = resolve(evalsDir, "node_modules", "tsx", tsxPackage.bin);
const receipt = resolve(evalsDir, "fixtures", "document-work-product-live-34467680287-evidence.json");
const transportNames = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "OFFROAD_EVALUATOR_EMAIL", "OFFROAD_EVALUATOR_PASSWORD", "OFFROAD_EVALUATION_ORGANIZATION_ID"];
/** The child never sees a provider key or an evaluator credential, whatever the parent environment holds. */
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.endsWith("_API_KEY") && !transportNames.includes(name) && !name.startsWith("GITHUB_")));
const protectedRun = (workflow: string, runnerTemp: string) => ({...inherited, RUNNER_TEMP: runnerTemp, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "carlosevg100/offroad",
 GITHUB_REF: "refs/heads/main", GITHUB_RUN_ATTEMPT: "1", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "1",
 GITHUB_WORKFLOW_REF: `carlosevg100/offroad/.github/workflows/${workflow}@refs/heads/main`});

describe("document work scripts without the evaluator's credential", () => {
 it.each([
  ["run-document-work-product-live.ts", "document-work-product-live.yml", "document-work-product-live"],
  ["run-advisor-response-live.ts", "document-work-product-live.yml", "advisor-response-live"],
  ["run-executive-synthesis-live.ts", "document-work-product-live.yml", "executive-synthesis-live"],
  ["continue-document-work-product-live.ts", "document-work-product-continuation.yml", "documentary-continuation"],
 ])("%s builds its snapshot and fails closed before anything is claimed or requested", (script, workflow, output) => {
  const runnerTemp = mkdtempSync(resolve(tmpdir(), "offroad-document-work-governed-"));
  try {
   if (script.startsWith("continue-")) {
    mkdirSync(resolve(runnerTemp, "documentary-parent/document-work-product-live"), {recursive: true});
    copyFileSync(receipt, resolve(runnerTemp, "documentary-parent/document-work-product-live/evidence.json"));
   }
   const result = spawnSync(process.execPath, [tsxCli, resolve(evalsDir, "scripts", script), "--poll-seconds", "1"], {
    cwd: evalsDir, env: protectedRun(workflow, runnerTemp), encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
   });
   expect(result.error).toBeUndefined();
   expect(result.status, result.stderr).toBe(1);
   expect(result.stderr.trim()).toBe(`governed_transport_environment_missing: ${transportNames.join(", ")}`);
   expect(result.stdout).not.toMatch(/^evaluation (requested|committed)/m);
   // Nothing was claimed, requested or recorded.
   const written = readdirSync(runnerTemp, {recursive: true}).map(String).filter((name) => !name.startsWith("documentary-parent")).sort();
   expect(written).toEqual(script.startsWith("run-document") || script.startsWith("run-executive") ? [output] : []);
  } finally {
   rmSync(runnerTemp, {recursive: true, force: true});
  }
 }, 120_000);

 it("refuses to run outside the protected workflow, before reading anything", () => {
  const runnerTemp = mkdtempSync(resolve(tmpdir(), "offroad-document-work-governed-"));
  try {
   const result = spawnSync(process.execPath, [tsxCli, resolve(evalsDir, "scripts", "run-document-work-product-live.ts")], {
    cwd: evalsDir, env: {...protectedRun("document-work-product-live.yml", runnerTemp), GITHUB_RUN_ATTEMPT: "2"}, encoding: "utf8",
   });
   expect([result.status, result.stderr.trim()]).toEqual([1, "document_work_product_live_setup_failed"]);
   expect(readdirSync(runnerTemp)).toEqual([]);
  } finally {
   rmSync(runnerTemp, {recursive: true, force: true});
  }
 }, 120_000);
});
