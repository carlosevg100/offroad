/**
 * `pnpm --filter @offroad/evals baseline [--case rede-horizonte] [--out <dir>]`
 * Runs the current production extractor (the hash-matched fixture) against a
 * gold case and writes JSON + Markdown reports. Exit code 0 always: the
 * baseline is informational; thresholds gate the P1 pipeline, not the fixture.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {goldDocumentPath, loadGoldCase} from "./gold";
import {evaluateSnapshot} from "./metrics";
import {checkThresholds, renderMarkdownReport} from "./report";
import {snapshotFromFixture} from "./snapshot";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args[0] ?? "baseline";
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
};

if (command !== "baseline") {
  console.error(`unknown command "${command}". Available: baseline`);
  process.exit(2);
}

const caseId = option("case", "rede-horizonte");
const goldDir = resolve(here, "..", "..", "testing-fixtures", "gold", caseId);
const outDir = resolve(option("out", join(here, "..", "reports")));
const gold = loadGoldCase(goldDir);

const documents = gold.manifest.documents.map((document, index) => ({
  id: `doc-${index}`,
  original_name: document.name,
  sha256: createHash("sha256").update(readFileSync(goldDocumentPath(gold, document.name))).digest("hex"),
}));
const snapshot = snapshotFromFixture(documents);
const report = evaluateSnapshot(gold, snapshot);
const markdown = renderMarkdownReport(report);

mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, `${caseId}.baseline.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(outDir, `${caseId}.baseline.md`), markdown, "utf8");
console.log(markdown);
console.log(`thresholds: ${JSON.stringify(checkThresholds(report))}`);
console.log(`reports written to ${outDir}`);
