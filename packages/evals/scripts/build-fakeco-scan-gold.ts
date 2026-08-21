/**
 * The answer key for the scanned room: Aurora's gold, restricted to the three documents that
 * arrive as images, with the file names the scans carry. Same truth, same numbers; the only
 * thing that changes is that every one of them has to come through OCR.
 *
 *   pnpm --filter @offroad/evals fakeco-scan:gold
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "..", "testing-fixtures");
const source = join(fixtures, "gold", "fakeco");
const assets = join(fixtures, "assets", "fakeco-scan");
const goldDir = join(fixtures, "gold", "fakeco-scan");
mkdirSync(join(goldDir, "expected"), {recursive: true});

const read = (relative: string) => JSON.parse(readFileSync(join(source, relative), "utf8")) as unknown;
const write = (relative: string, value: unknown) => writeFileSync(join(goldDir, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const renamed: Record<string, string> = {
  "02_Demonstracoes_Auditadas_2023_2025.pdf": "02_Demonstracoes_Auditadas_2023_2025_digitalizado.pdf",
  "04_Mapa_Divida_Jul2026.xlsx": "04_Mapa_Divida_Jul2026_digitalizado.pdf",
  "07_Contrato_Social_Consolidado.png": "07_Contrato_Social_Consolidado.png",
};

const manifest = read("manifest.json") as {version: string};
const documents = readdirSync(assets).filter((name) => !name.startsWith(".")).sort()
  .map((name) => ({name, sha256: createHash("sha256").update(readFileSync(join(assets, name))).digest("hex")}));
write("manifest.json", {
  caseId: "fakeco-scan",
  title: "Aurora Distribuidora, a sala digitalizada: demonstrações, mapa de dívida e contrato social como imagens (sintética)",
  synthetic: true,
  archetypeId: "growth_expansion",
  language: "pt",
  documentsDir: "../../assets/fakeco-scan",
  documents,
  provenance: "Derivada do gabarito fakeco: os mesmos números, lidos dos mesmos documentos renderizados como imagem por packages/testing-fixtures/scripts/render-fakeco-scan.sh. Mede o caminho de OCR.",
  version: `${manifest.version}-scan`,
});

type Profile = {document: string; scale?: number} & Record<string, unknown>;
const profiles = (read("expected/profiles.json") as Profile[])
  .filter((profile) => profile.document in renamed)
  .map((profile) => {
    const {document, ...rest} = profile;
    const scanned = renamed[document]!;
    // The debt map is a printed page now, not a sheet: it is read as a scanned debt schedule.
    return {document: scanned, ...rest, ...(document.endsWith(".xlsx") ? {} : {})};
  });
write("expected/profiles.json", profiles);

type Field = {sourceDocument?: string} & Record<string, unknown>;
const fields = (read("expected/fields.json") as Field[])
  .filter((field) => field.sourceDocument !== undefined && field.sourceDocument in renamed)
  .map((field) => ({...field, sourceDocument: renamed[field.sourceDocument!]!}));
write("expected/fields.json", fields);
write("expected/exceptions.json", []);
write("expected/calculations.json", []);
console.log(`${fields.length} campos, ${profiles.length} perfis, ${documents.length} documentos`);
