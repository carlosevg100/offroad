/**
 * Reads every generated file with the product's own parsers.
 *
 * The point of a fixture is that the system can actually read it. A data room that only looks
 * realistic teaches nothing, and a generator is perfectly capable of writing a spreadsheet no
 * parser here accepts. This is the check that the room is a room.
 *
 *   pnpm --filter @offroad/evals fakeco:verify            # Aurora
 *   pnpm --filter @offroad/evals verify:case camil        # any case under assets/
 */
import {readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {parseDocument} from "@offroad/document-parsers";

const caseId = process.argv[2] ?? "fakeco";
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "testing-fixtures", "assets", caseId);
const files = readdirSync(dir).filter((f) => !f.startsWith("."));

for (const name of files.sort()) {
  const bytes = new Uint8Array(readFileSync(join(dir, name)));
  try {
    const parsed = await parseDocument({bytes, documentId: name, documentVersion: 1, fileName: name, localeHint: "pt-BR"});
    const l = parsed.layer;
    const shape = l.sheets ? `${l.sheets.length} planilha(s), ${l.sheets.reduce((s, x) => s + x.cells.length, 0)} celulas`
      : l.pages ? `${l.pages.length} pagina(s)${l.pages.some((p) => p.scanned) ? " (OCR)" : ""}`
      : l.sections ? `${l.sections.length} secao(oes)`
      : l.kind;
    const scales = l.scaleDeclarations.map((s) => `${s.scale}x`).join(",") || "nenhuma";
    console.log(`ok   ${name.padEnd(44)} ${parsed.detected.mime.padEnd(58)} ${shape}  escala: ${scales}`);
  } catch (error) {
    console.log(`ERRO ${name.padEnd(44)} ${(error as Error).message}`);
  }
}
