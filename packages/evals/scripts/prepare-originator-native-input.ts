import {createHash} from "node:crypto";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {resolve, basename} from "node:path";
import {parseDocument} from "@offroad/document-parsers";

// Input is the native-inputs manifest, never the authoring oracle or the structured case.
const [manifestPath, outputDirectory] = process.argv.slice(2);
if (!manifestPath || !outputDirectory) throw new Error("usage: prepare-originator-native-input manifest.json output-directory");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.synthetic !== true || manifest.kind !== "native-inputs-only" || !Array.isArray(manifest.documents) || manifest.documents.length > 200) throw new Error("native_input_manifest_required");
const inputDirectory = resolve(manifestPath, ".."), output = resolve(outputDirectory);
await mkdir(output, {recursive: true});
const files: Array<{fileName: string; sha256: string; documentId: string; stage: string; duplicateOf: string | null; pages: number; characters: number; warnings: string[]; layerFile: string}> = [];
const seen = new Map<string, string>();
for (const document of manifest.documents) {
  if (typeof document.file !== "string" || basename(document.file) !== document.file || !document.file.endsWith(".pdf")) throw new Error("native_input_path_refused");
  const bytes = await readFile(resolve(inputDirectory, document.file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== document.sha256) throw new Error("native_input_hash_changed");
  // UUID syntax without SHA-1: identities are opaque and independent of calibration identifiers.
  const digest = createHash("sha256").update("offroad:synthetic-native-input:" + sha256).digest("hex");
  const documentId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const duplicateOf = seen.get(sha256) ?? null;
  const parsed = await parseDocument({bytes: new Uint8Array(bytes), documentId, documentVersion: 1, fileName: document.file, mimeType: "application/pdf", localeHint: "pt-BR"});
  const layerFile = `${documentId}.layer.json`;
  await writeFile(resolve(output, layerFile), JSON.stringify(parsed, null, 2) + "\n");
  const text = (parsed.layer.pages ?? []).map(p => [...p.blocks.map(b => b.text), ...p.tables.flatMap(t => t.rows.map(r => r.cells.map(c => c.text).join(" | ")))].join("\n")).join("\n");
  files.push({fileName: document.file, sha256, documentId, stage: String(document.stage), duplicateOf, pages: parsed.layer.pages?.length ?? 0, characters: text.length, warnings: parsed.warnings.map(w => w.code), layerFile});
  seen.set(sha256, documentId);
}
const receipt = {schemaVersion: "originator-native-parser-receipt.v1", synthetic: true, executedAt: new Date().toISOString(), manifestSha256: createHash("sha256").update(await readFile(manifestPath)).digest("hex"),
  files, totals: {arrivals: files.length, uniqueFiles: new Set(files.map(f => f.sha256)).size, pages: files.reduce((n, f) => n + f.pages, 0), characters: files.reduce((n, f) => n + f.characters, 0)},
  acceptance: {nativeParserExecuted: true, modelExecuted: false, uploadExecuted: false, extractionMeasured: false, productJourneyExecuted: false, productionReady: false}, providerCalls: 0, providerCostUsd: "0"};
await writeFile(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify({receipt: resolve(output, "receipt.json"), totals: receipt.totals, providerCalls: 0}) + "\n");
