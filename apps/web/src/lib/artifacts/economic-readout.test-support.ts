import {inflateSync} from "node:zlib";

import {compileMaterials, financialModelMaterial, institutionalFinancialModelMaterial, type Material, type MaterialBlock} from "@offroad/case-materials";
import {deskEvidence, type CaseBrief, type ReadinessReport} from "@offroad/case-understanding";
import {analyzeCreditPosition, buildDeskInputs, judgeOperation, projectLeverageTrajectory, rateCredit, stressTable, type Fact} from "@offroad/credit-analysis";
import {instrumentVerdicts} from "@offroad/credit-playbook";
import {dataRoomIndex, planDataRoom} from "@offroad/data-room";
import {assessCapacity, buildTermSheet, designCollateralPackage} from "@offroad/deal-structure";
import {indicativePrice} from "@offroad/market-reference";
import {buildContext, computeCalculations, type ReconciledFact} from "@offroad/reconciliation";
import {syntheticCreditMaterialsCase as fixture} from "@offroad/testing-fixtures/credit-materials-case";
import * as XLSX from "xlsx";

/**
 * Test support for the economic rendering tests: the synthetic Aurora case compiled through the
 * functions the case engine calls (the same data case-materials pins), and readers that take the
 * text back out of each file format: the paragraphs of a docx, the slides and the native chart
 * caches of a pptx, the text layer of a pdf, the visible text of the html and the cells of an xlsx.
 */

// The synthetic case ----------------------------------------------------------------------------

const periodOf = (fieldPath: string): string | undefined => {
  const year = fieldPath.match(/^historical_financials\.(\d{4})\./)?.[1];
  if (year) return `${year}-12-31`;
  const interim = fieldPath.match(/^interim_financials\.(\d{4})_(\d{2})\./);
  if (!interim) return undefined;
  return `${interim[1]}-${interim[2]}-${String(new Date(Date.UTC(Number(interim[1]), Number(interim[2]), 0)).getUTCDate()).padStart(2, "0")}`;
};

function reconciled(facts: readonly Fact[]): ReconciledFact[] {
  return facts.map((fact) => {
    const periodEnd = periodOf(fact.fieldPath);
    const numeric = /^-?\d+(?:\.\d+)?$/.test(fact.value);
    return {
      key: {fieldPath: fact.fieldPath, ...(periodEnd ? {periodEnd} : {})}, value: fact.value, valueType: numeric ? "number" : "text",
      accepted: {fieldPath: fact.fieldPath, normalizedValue: fact.value, valueType: numeric ? "number" : "text", sourceDocument: "sintetico.pdf",
        evidenceRank: 1, informationClass: "audited", confidence: 0.99, anchorVerified: true, ...(periodEnd ? {periodEnd} : {})},
      conflicts: [], disputed: false,
    };
  });
}

const claims = [
  {id: "c1", text: "Receita líquida de R$ 191,2 milhões em 2025.", material: true, kind: "fact" as const, supportIds: ["historical_financials.2025.revenue"]},
  {id: "c2", text: "Distribuição atacadista e varejista de materiais de construção para construtoras e redes de franquia.", material: false, kind: "fact" as const, supportIds: []},
  {id: "c3", text: "A concentração de clientes é relevante para a base de recebíveis oferecida em garantia.", material: false, kind: "judgment" as const, supportIds: []},
];
const brief: CaseBrief = {
  executiveSummary: `${claims[0]!.text}\n\n${claims[1]!.text}`,
  sections: [
    {id: "history", heading: "Histórico", claims: [claims[0]!]},
    {id: "business", heading: "Negócio", claims: [claims[1]!, claims[2]!]},
    {id: "current_position", heading: "Posição atual", claims: []},
  ],
};
const readiness: ReadinessReport = {state: "in_progress", score: 0.8, components: [], blockers: []};

/** Every material kind of the synthetic case, as the package publishes them. */
export function syntheticPackage(): {materials: Material[]; desk: ReturnType<typeof analyzeCreditPosition>; trajectory: ReturnType<typeof projectLeverageTrajectory>} {
  const facts: Fact[] = fixture.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value}));
  const inputs = buildDeskInputs(facts, {referenceDate: fixture.referenceDate, indexLevels: fixture.indexLevels, statedRequest: fixture.statedRequest});
  if (!inputs.desk || !inputs.trajectory) throw new Error("synthetic desk inputs are incomplete");
  const desk = analyzeCreditPosition(inputs.desk);
  const trajectory = projectLeverageTrajectory(inputs.trajectory);
  const capacity = assessCapacity(fixture.capacity);
  const price = indicativePrice(fixture.price);
  if (!price) throw new Error("synthetic price band is missing");
  const room = reconciled(facts);
  const compiled = compileMaterials({
    brief, facts: room, calculations: [...computeCalculations(buildContext(room)).calculations, ...deskEvidence(desk, trajectory).calculations],
    exceptions: [], readiness, desk, trajectory, termSheet: buildTermSheet({...fixture.termSheet, capacity, blockers: []}), companyName: fixture.companyName,
    rating: rateCredit({desk, trajectory, ...fixture.rating}), stress: stressTable({desk, ...fixture.stress}),
    instruments: instrumentVerdicts({...fixture.instruments, archetypeId: fixture.capacity.archetypeId}),
    collateral: designCollateralPackage(fixture.collateral), price, verdict: judgeOperation({desk, trajectory, operation: fixture.operation}),
  });
  if (!compiled.ok) throw new Error(`synthetic materials refused: ${compiled.reason} ${compiled.detail.join("; ")}`);
  const scenario = {name: fixture.institutionalScenario.name, currency: fixture.institutionalScenario.currency, periods: fixture.institutionalScenario.periods};
  const materials = [
    ...compiled.materials,
    financialModelMaterial(fixture.financialModel),
    institutionalFinancialModelMaterial({artifactFingerprint: "6".repeat(64), supportIds: ["synthetic-approved-review"], scenarios: [scenario]}),
  ];
  const plan = planDataRoom({materials, materialsBlockedBy: [], documents: [], exceptions: [], readiness});
  return {materials: [...materials, dataRoomIndex(plan)], desk, trajectory};
}

/** The texts the materials quote as written from the case: the brief's claims and the text facts, Portuguese in both languages. */
export const syntheticQuotes: readonly string[] = [
  brief.executiveSummary, ...claims.map((claim) => claim.text),
  ...fixture.facts.filter((fact) => !/^-?\d+(?:\.\d+)?$/.test(fact.value)).map((fact) => fact.value),
];

export const syntheticIssuedOn = fixture.issuedOn;
export const syntheticCompanyName = fixture.companyName;
export const syntheticStatements = fixture.institutionalScenario;

// What the revision prints ------------------------------------------------------------------------

/** The figures a material states in one language: metrics, key-value and callout values, table cells and captions, claims in prose. */
export function materialFigureTexts(material: Material, lang: "pt" | "en"): string[] {
  const texts: string[] = [];
  const add = (block: MaterialBlock) => {
    switch (block.type) {
      case "metrics": for (const item of block.items) texts.push(item.formatted[lang]); break;
      case "kv": for (const row of block.rows) texts.push(row.value[lang], ...(row.note ? [row.note[lang]] : [])); if (block.caption) texts.push(block.caption[lang]); break;
      case "callout": texts.push(block.title[lang]); for (const item of block.items) texts.push(item.value[lang]); break;
      case "table": texts.push(block.caption[lang], ...block.rows.flat().map((cell) => (typeof cell === "string" ? cell : cell[lang]))); break;
      case "paragraph": case "list": case "disclaimer":
        if (block.type === "list") texts.push(...block.items.map((item) => item[lang])); else texts.push(block.text[lang]);
        break;
      case "heading": break;
    }
  };
  for (const block of material.blocks) add(block);
  return texts;
}

/** Numbers as written: digits with their separators, so 42.300.000 and 62,7 compare as the reader sees them. */
export function numberTokens(text: string): string[] {
  return text.match(/\d(?:[\d.,]*\d)?/g) ?? [];
}

/** The tokens of `expected` that `actual` lacks, counting repetitions (multiset difference). */
export function missingTokens(expected: readonly string[], actual: readonly string[]): string[] {
  const available = new Map<string, number>();
  for (const token of actual) available.set(token, (available.get(token) ?? 0) + 1);
  const missing: string[] = [];
  for (const token of expected) {
    const left = available.get(token) ?? 0;
    if (left === 0) missing.push(token); else available.set(token, left - 1);
  }
  return missing;
}

// Reading the files ----------------------------------------------------------------------------------

const entities: Record<string, string> = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " "};
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return entities[name.toLowerCase()] ?? match;
  });
}

function zipXml(bytes: Uint8Array): Map<string, string> {
  const archive = XLSX.CFB.read(Buffer.from(bytes), {type: "buffer"});
  const files = new Map<string, string>();
  archive.FullPaths.forEach((path: string, index: number) => {
    const entry = archive.FileIndex[index] as {content?: Uint8Array} | undefined;
    if (/\.xml$/.test(path) && entry?.content) files.set(path.replace(/^Root Entry\//, ""), Buffer.from(entry.content).toString("utf8"));
  });
  return files;
}

const paragraphsOf = (xml: string, paragraph: string, run: string) => [...xml.matchAll(new RegExp(`<${paragraph}[ >][\\s\\S]*?</${paragraph}>`, "g"))]
  .map((match) => [...match[0].matchAll(new RegExp(`<${run}(?: [^>]*)?>([^<]*)</${run}>`, "g"))].map((part) => decodeXml(part[1]!)).join(""));

/** The paragraphs of a Word document, runs joined. */
export function docxText(bytes: Uint8Array): string {
  const xml = [...zipXml(bytes).entries()].filter(([path]) => /word\/document\.xml$/.test(path)).map(([, content]) => content).join("");
  return paragraphsOf(xml, "w:p", "w:t").join("\n");
}

/** The slides of a presentation, runs joined per paragraph, and the values cached in its native charts. */
export function pptxContent(bytes: Uint8Array): {text: string; chartValues: number[][]} {
  const files = zipXml(bytes);
  const slides = [...files.entries()].filter(([path]) => /ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort(([a], [b]) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const charts = [...files.entries()].filter(([path]) => /ppt\/charts\/chart\d+\.xml$/.test(path))
    .sort(([a], [b]) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  return {
    text: slides.map(([, xml]) => paragraphsOf(xml, "a:p", "a:t").join("\n")).join("\n"),
    chartValues: charts.map(([, xml]) => {
      const values = xml.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0] ?? "";
      return [...values.matchAll(/<c:v>([^<]*)<\/c:v>/g)].map((match) => Number(match[1]));
    }),
  };
}

/**
 * The visible text of the printable HTML, read with a small scanner rather than tag-stripping
 * expressions: markup becomes a line break, the content of style and script elements is skipped
 * (CSS carries its own percentages), and entities are decoded. Test support only; it reads what our
 * own renderer wrote and sanitizes nothing.
 */
export function htmlText(html: string): string {
  const lower = html.toLowerCase();
  let text = "";
  let index = 0;
  while (index < html.length) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const end = next < 0 ? html.length : next;
      text += html.slice(index, end);
      index = end;
      continue;
    }
    const rawElement = ["style", "script"].find((name) => lower.startsWith(`<${name}`, index));
    const markupEnd = rawElement ? lower.indexOf(`</${rawElement}`, index) : index;
    const close = markupEnd < 0 ? -1 : html.indexOf(">", markupEnd);
    index = close < 0 ? html.length : close + 1;
    text += "\n";
  }
  return decodeXml(text);
}

/**
 * The text layer of a PDF written by pdf-lib: every content stream inflated, every string shown by
 * a text operator decoded with the font's ToUnicode map when the document embeds a Unicode font
 * (two-byte glyph codes), and as WinAnsi bytes otherwise.
 */
export function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const streams: string[] = [];
  // Each stream is read for exactly the /Length its dictionary declares: compressed bytes may end in
  // a carriage return, which a pattern up to "endstream" would take for the line break before it.
  for (const match of raw.matchAll(/(?<!end)stream\r?\n/g)) {
    const start = match.index! + match[0].length;
    const length = Number(raw.slice(raw.lastIndexOf("obj", match.index!), match.index!).match(/\/Length (\d+)/)?.[1]);
    if (!Number.isSafeInteger(length)) continue;
    try { streams.push(inflateSync(Buffer.from(raw.slice(start, start + length), "latin1")).toString("latin1")); } catch { /* not a Flate stream: an image or a font program */ }
  }
  const unicode = new Map<number, string>();
  for (const cmap of streams.filter((stream) => stream.includes("begincmap"))) {
    for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of section[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) unicode.set(Number.parseInt(pair[1]!, 16), hexUtf16(pair[2]!));
    }
    for (const section of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const range of section[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
        const start = Number.parseInt(range[1]!, 16), end = Number.parseInt(range[2]!, 16);
        if (range[3]) {
          const base = Number.parseInt(range[3], 16);
          for (let code = start; code <= end; code++) unicode.set(code, String.fromCodePoint(base + code - start));
        } else {
          [...range[4]!.matchAll(/<([0-9a-fA-F]+)>/g)].forEach((target, offset) => unicode.set(start + offset, hexUtf16(target[1]!)));
        }
      }
    }
  }
  const decode = (hex: string) => unicode.size > 0 && hex.length % 4 === 0
    ? (hex.match(/.{4}/g) ?? []).map((code) => unicode.get(Number.parseInt(code, 16)) ?? "").join("")
    : Buffer.from(hex, "hex").toString("latin1");
  return streams.filter((stream) => /\b(?:Tj|TJ)\b/.test(stream))
    // A shown string (`<hex> Tj`) or an array of strings and kerning numbers (`[...] TJ`); the
    // array body is read without nesting quantifiers, then its strings are taken one by one.
    .map((stream) => [...stream.matchAll(/<([0-9a-fA-F]*)>\s*Tj|\[([^\]]*)\]\s*TJ/g)]
      .map((op) => op[1] !== undefined ? decode(op[1]) : [...op[2]!.matchAll(/<([0-9a-fA-F]*)>/g)].map((part) => decode(part[1]!)).join(""))
      .join("\n"))
    .join("\n");
}

function hexUtf16(hex: string): string {
  const units = hex.match(/.{1,4}/g)!.map((unit) => Number.parseInt(unit, 16));
  return String.fromCharCode(...units);
}

/** Every cell of every sheet: its value and the text Excel shows for it. */
export function xlsxCells(bytes: Uint8Array): Array<{sheet: string; address: string; value: unknown; shown: string}> {
  const workbook = XLSX.read(bytes, {type: "buffer", cellFormula: true, cellNF: true, cellText: true});
  return workbook.SheetNames.flatMap((sheet) => Object.entries(workbook.Sheets[sheet]!)
    .filter(([address]) => !address.startsWith("!"))
    .map(([address, cell]) => ({sheet, address, value: (cell as XLSX.CellObject).v, shown: String((cell as XLSX.CellObject).w ?? (cell as XLSX.CellObject).v ?? "")})));
}
