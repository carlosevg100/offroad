import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {sha256Hex} from "./gold-baseline";

/**
 * `run-gold-baseline.ts --dry-run` must assemble the complete information base (turns, documents
 * and sources) and reach its offline return without touching a model. The script runs here as a
 * child process, the way the workflow runs it, in an environment stripped of every provider key.
 * Case gc01 uses public CVM filings and synthetic turns, so no client data is involved.
 */
const evalsDir = resolve(import.meta.dirname, "..");
const script = resolve(evalsDir, "scripts", "run-gold-baseline.ts");
const tsxPackage = JSON.parse(readFileSync(resolve(evalsDir, "node_modules", "tsx", "package.json"), "utf8")) as {bin: string};
const tsxCli = resolve(evalsDir, "node_modules", "tsx", tsxPackage.bin);
/** The child never sees a provider key, whatever the parent environment holds. */
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.endsWith("_API_KEY")));

const documentLine = /^document (\S+): (\d+) pages, (\d+) chars$/;
const summaryLine = /^information base: (\d+) chars \(~\d+ tokens\), sha256 ([a-f0-9]{16})$/m;

describe("gold baseline dry run", () => {
  it("assembles and hashes the complete information base of gc01 without calling a model", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "offroad-gold-baseline-dry-run-"));
    try {
      const runDir = resolve(dir, "run");
      const dump = resolve(dir, "information-base.md");
      const result = spawnSync(process.execPath, [tsxCli, script, "--case", "gc01", "--dry-run", "--out", runDir, "--dump", dump], {
        cwd: evalsDir, env: environment, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);

      const lines = result.stdout.split("\n");
      expect(lines).toContain("dry run: no model called");
      // Nothing of the live path ran: no turn output, no run record, no run directory.
      expect(lines.some((line) => line.startsWith("turn ") || line.startsWith("run record:"))).toBe(false);
      expect(existsSync(runDir)).toBe(false);

      const documents = lines.flatMap((line) => {
        const match = documentLine.exec(line);
        return match ? [{id: match[1] ?? "", pages: Number(match[2]), chars: Number(match[3])}] : [];
      });
      expect(documents.map((document) => document.id).sort()).toEqual(["itr_1t26", "proposta_agoe_2026"]);
      for (const document of documents) {
        expect(document.pages).toBeGreaterThan(0);
        expect(document.chars).toBeGreaterThan(0);
      }
      const documentChars = documents.reduce((sum, document) => sum + document.chars, 0);

      const summary = summaryLine.exec(result.stdout);
      if (!summary) throw new Error(`information base line missing from:\n${result.stdout}`);
      const informationBaseChars = Number(summary[1]);
      const hashPrefix = summary[2] ?? "";
      expect(informationBaseChars).toBeGreaterThan(documentChars);

      // The reported hash is the hash of the rendered base, and that text carries every document.
      const rendered = readFileSync(dump, "utf8");
      expect(rendered.length).toBe(informationBaseChars);
      expect(sha256Hex(rendered).slice(0, 16)).toBe(hashPrefix);
      expect(rendered).toContain("## Documentos anexados (2)");
      for (const document of documents) {
        const start = rendered.indexOf(`### Documento ${document.id}:`);
        expect(start).toBeGreaterThan(-1);
        const next = rendered.indexOf("\n### ", start + 1);
        const section = rendered.slice(start, next === -1 ? undefined : next);
        expect(section.length).toBeGreaterThan(document.chars);
      }
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  // Parses two fixture PDFs and forty-odd source files; the CI runner is slower than a laptop.
  }, 120_000);
});
