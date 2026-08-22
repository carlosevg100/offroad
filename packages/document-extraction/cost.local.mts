import {readFileSync} from "node:fs";
import {parseDocument} from "../document-parsers/src/index";
import {indexLayer} from "../document-intelligence/src/index";
import {renderEvidence} from "./src/evidence";
import {targetFields, buildExtractionPrompt, EXTRACTOR_SYSTEM} from "./src/prompt";
import {tableCues, tableRowPasses} from "./src/rows";
const file = process.argv[2]!;
const kind = process.argv[3] as never;
const parsed = await parseDocument({bytes: new Uint8Array(readFileSync(file)), documentId: "d", documentVersion: 1, fileName: "x", localeHint: "pt-BR"});
const index = indexLayer(parsed.layer);
const chunks = renderEvidence(index, (parsed.layer.sheets?.length ?? 0) > 1 ? {oneContainerPerChunk: true} : {});
const fields = targetFields(kind);
const cues = tableCues(fields);
const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
let withCue = 0, chars = 0;
for (const c of chunks) { chars += c.text.length; if (cues.some((cue) => fold(c.text).includes(cue))) withCue++; }
const rows = tableRowPasses(index, {fields});
const prefix = buildExtractionPrompt({profile: {kind, scale: 1000, informationClass: "reviewed"} as never, fileName: "x", fields, evidence: {text: "", index: 1, total: 1}}).length + EXTRACTOR_SYSTEM.length;
const tok = (c: number) => Math.round(c / 3.6);
const calls = chunks.length + rows.length;
const stable = calls * tok(prefix), variable = tok(chars), outTok = calls * 550;
const share = withCue / Math.max(1, chunks.length);
console.log(JSON.stringify({file: file.split("/").pop(), chunks: chunks.length, withCue, sharePct: Math.round(100*share), rowPasses: rows.length, calls, prefixTok: tok(prefix), evidenceTok: variable,
  usd_now: +((stable + variable) * 3 / 1e6 + outTok * 15 / 1e6).toFixed(2),
  usd_cached_prefix: +((stable * 0.3 + variable * 3) / 1e6 + outTok * 15 / 1e6).toFixed(2),
  usd_cached_and_gated: +(((stable * share) * 0.3 + variable * share * 3) / 1e6 + outTok * share * 15 / 1e6).toFixed(2)}));
