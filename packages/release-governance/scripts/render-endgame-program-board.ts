import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {currentEndgameProgramBoard} from "../src/current-endgame-program.ts";
import {renderEndgameProgramBoard} from "../src/endgame-program-markdown.ts";

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

const fingerprint = createHash("sha256").update(stableJson(currentEndgameProgramBoard)).digest("hex");
const outputPath = fileURLToPath(new URL("../../../docs/build/ENDGAME_PROGRAM_BOARD.md", import.meta.url));
await writeFile(outputPath, renderEndgameProgramBoard(currentEndgameProgramBoard, fingerprint), "utf8");
