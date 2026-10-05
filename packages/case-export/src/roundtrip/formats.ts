import {createHash} from "node:crypto";
import type JSZip from "jszip";
import {PDFDocument, PDFName, PDFString} from "pdf-lib";
import {canonicalRoundtripJson, roundtripManifestSchema, type RoundtripFormat, type RoundtripManifest} from "@offroad/domain-contracts";
import {openSafeZip, readXml, findAll, findFirst, attributeOf, childrenOf, textOf, type OrderedNode} from "@offroad/document-parsers/ooxml";
import type {RoundtripEntry, RoundtripSnapshot} from "../artifact-roundtrip";

const fixed = new Date("1980-01-01T00:00:00.000Z");
const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const esc = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const MANIFEST = "customXml/offroadRoundtrip.xml";
async function safePackage(bytes: Uint8Array, format: string): Promise<JSZip> {
  if (bytes.byteLength === 0 || bytes.byteLength > 100 * 1024 * 1024) throw new Error("roundtrip_byte_limit");
  const zip = await openSafeZip(bytes, format);
  let total = 0;
  for (const file of Object.values(zip.files)) {
    const data = (file as unknown as {_data?: {uncompressedSize?: number}})._data;
    total += data?.uncompressedSize ?? 0;
    if (total > 200 * 1024 * 1024) throw new Error("roundtrip_expansion_limit");
  }
  return zip;
}
const manifestXml = (manifest: RoundtripManifest): string => `<?xml version="1.0" encoding="UTF-8"?><offroadRoundtrip xmlns="urn:offroad:artifact-roundtrip">${esc(canonicalRoundtripJson(manifest))}</offroadRoundtrip>`;
function put(zip: JSZip, path: string, value: string): void {zip.file(path, value, {date: fixed, createFolders: false});}
async function xml(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path); if (!file) throw new Error("roundtrip_package_part_missing"); return file.async("string");
}
async function addRelationships(zip: JSZip, manifest: RoundtripManifest): Promise<void> {
  let types = await xml(zip, "[Content_Types].xml");
  const addType = (part: string, content: string): void => {
    if (!types.includes(`PartName="/${part}"`)) types = types.replace("</Types>", `<Override PartName="/${part}" ContentType="${content}"/></Types>`);
  };
  addType("docProps/custom.xml", "application/vnd.openxmlformats-officedocument.custom-properties+xml");
  addType(MANIFEST, "application/xml"); put(zip, "[Content_Types].xml", types);
  let rels = await xml(zip, "_rels/.rels");
  if (!rels.includes('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties"'))
    rels = rels.replace("</Relationships>", '<Relationship Id="rIdOffroadRoundtripProperties" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>');
  put(zip, "_rels/.rels", rels);
  const main = manifest.format === "xlsx" ? "xl" : manifest.format === "docx" ? "word" : "ppt";
  const part = `${main}/_rels/${manifest.format === "xlsx" ? "workbook" : manifest.format === "docx" ? "document" : "presentation"}.xml.rels`;
  let mainRels = zip.file(part) ? await xml(zip, part) : '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  if (!mainRels.includes('Id="rIdOffroadRoundtripManifest"')) mainRels = mainRels.replace("</Relationships>", `<Relationship Id="rIdOffroadRoundtripManifest" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${MANIFEST}"/></Relationships>`);
  put(zip, part, mainRels);
  let custom = zip.file("docProps/custom.xml") ? await xml(zip, "docProps/custom.xml") : '<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
  let pid = Math.max(1, ...[...custom.matchAll(/\bpid="(\d+)"/g)].map(match => Number(match[1])));
  for (const [name, value] of Object.entries({OffroadArtifactId: manifest.artifactId, OffroadRevisionId: manifest.revisionId,
    OffroadManifestFingerprint: manifest.logicalManifestFingerprint})) {
    custom = custom.replace(new RegExp(`<property\\b[^>]*\\bname="${name}"[^>]*>[\\s\\S]*?</property>`, "g"), "");
    custom = custom.replace("</Properties>", `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${++pid}" name="${name}"><vt:lpwstr>${esc(value)}</vt:lpwstr></property></Properties>`);
  }
  put(zip, "docProps/custom.xml", custom);
}
const plainText = (node: OrderedNode): string => childrenOf(node).filter(child => "#text" in child).map(child => String(child["#text"])).join("");
function resolvePart(parent: string, target: string): string {
  if (target.startsWith("/")) target = target.slice(1);
  else target = `${parent}/${target}`;
  const segments: string[] = [];
  for (const segment of target.split("/")) {
    if (segment === "..") {if (!segments.length) throw new Error("roundtrip_relationship_invalid"); segments.pop();}
    else if (segment !== "." && segment !== "") segments.push(segment);
  }
  return segments.join("/");
}
async function xlsxSheets(zip: JSZip): Promise<{name: string; path: string; id: number}[]> {
  const workbook = await readXml(zip, "xl/workbook.xml") ?? [];
  const rels = await readXml(zip, "xl/_rels/workbook.xml.rels") ?? [];
  return findAll(workbook, "sheet").map(sheet => {
    const rel = findAll(rels, "Relationship").find(item => attributeOf(item, "Id") === attributeOf(sheet, "id"));
    if (!rel || attributeOf(rel, "TargetMode") === "External") throw new Error("roundtrip_relationship_invalid");
    return {name: attributeOf(sheet, "name") ?? "", path: resolvePart("xl", attributeOf(rel, "Target") ?? ""), id: Number(attributeOf(sheet, "sheetId"))};
  });
}
function quoteSheet(sheet: string): string {return `'${sheet.replace(/'/g, "''")}'`;}
async function embedXlsx(zip: JSZip, manifest: RoundtripManifest): Promise<void> {
  const sheets = await xlsxSheets(zip);
  if (sheets.some(sheet => sheet.name === "_offroad_manifest")) throw new Error("roundtrip_manifest_already_embedded");
  let workbook = await xml(zip, "xl/workbook.xml");
  const existingNames = await readXml(zip, "xl/workbook.xml") ?? [];
  const names = new Map(findAll(existingNames, "definedName").filter(node => attributeOf(node, "localSheetId") === undefined).map(node => [decodeXml(attributeOf(node, "name") ?? ""), decodeXml(plainText(node))]));
  const additions = new Map<string, string>();
  for (const block of manifest.blocks) if (block.region.kind === "cell") {
    const region = block.region;
    if (!sheets.some(sheet => sheet.name === region.sheet)) throw new Error("roundtrip_sheet_missing");
    const ref = `${quoteSheet(block.region.sheet)}!${block.region.ref}`;
    if (!names.has(block.region.definedName)) {names.set(block.region.definedName, ref); additions.set(block.region.definedName, ref);}
  }
  for (const binding of [...manifest.inputs, ...manifest.outputs, ...manifest.formulas]) {
    const block = "blockKey" in binding ? manifest.blocks.find(item => item.blockKey === binding.blockKey)
      : manifest.blocks.find(item => item.region.kind === "cell" && item.region.ref.replace(/\$/g, "") === binding.cellRef.replace(/\$/g, ""));
    if (names.has(binding.name)) continue;
    if (!block || block.region.kind !== "cell") throw new Error("roundtrip_cell_binding_missing");
    const ref = `${quoteSheet(block.region.sheet)}!${binding.cellRef}`;
    names.set(binding.name, ref); additions.set(binding.name, ref);
  }
  const newNames = [...additions].map(([name, ref]) => `<definedName name="${esc(name)}">${esc(ref)}</definedName>`).join("");
  if (/<definedNames\b[^>]*\/>/.test(workbook)) workbook = workbook.replace(/<definedNames\b[^>]*\/>/, `<definedNames>${newNames}</definedNames>`);
  else if (/<definedNames\b/.test(workbook)) workbook = workbook.replace("</definedNames>", `${newNames}</definedNames>`);
  else if (/<calcPr\b/.test(workbook)) workbook = workbook.replace(/<calcPr\b/, `<definedNames>${newNames}</definedNames><calcPr`);
  else workbook = workbook.replace("</workbook>", `<definedNames>${newNames}</definedNames></workbook>`);
  const id = Math.max(0, ...sheets.map(sheet => sheet.id)) + 1;
  const path = "xl/worksheets/offroad_manifest.xml";
  workbook = workbook.replace("</sheets>", `<sheet name="_offroad_manifest" sheetId="${id}" state="veryHidden" r:id="rIdOffroadManifestSheet"/></sheets>`);
  put(zip, "xl/workbook.xml", workbook);
  let rels = await xml(zip, "xl/_rels/workbook.xml.rels");
  rels = rels.replace("</Relationships>", '<Relationship Id="rIdOffroadManifestSheet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/offroad_manifest.xml"/></Relationships>');
  put(zip, "xl/_rels/workbook.xml.rels", rels);
  const json = canonicalRoundtripJson(manifest);
  const chunks = json.match(/[\s\S]{1,20000}/g) ?? [];
  put(zip, path, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${chunks.map((chunk, index) => `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(chunk)}</t></is></c></row>`).join("")}</sheetData></worksheet>`);
  let types = await xml(zip, "[Content_Types].xml");
  types = types.replace("</Types>", `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  put(zip, "[Content_Types].xml", types);
}
/** Generated files only. Callers establish exact revision identity before rendering. */
export async function embedRoundtripManifest(bytes: Uint8Array, supplied: RoundtripManifest): Promise<Uint8Array> {
  const manifest = roundtripManifestSchema.parse(supplied);
  if (manifest.format === "pdf") {
    const pdf = await PDFDocument.load(bytes, {updateMetadata: false});
    const json = canonicalRoundtripJson(manifest);
    const xmlValue = `<?xpacket begin="\uFEFF"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:offroad="urn:offroad:artifact-roundtrip" offroad:revisionId="${manifest.revisionId}" offroad:fingerprint="${manifest.logicalManifestFingerprint}"><offroad:manifest>${esc(json)}</offroad:manifest></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(pdf.context.stream(xmlValue, {Type: "Metadata", Subtype: "XML"})));
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
    if (info && "set" in info) (info as {set: (name: PDFName, value: PDFString) => void}).set(PDFName.of("OffroadRoundtripManifest"), PDFString.of(json));
    pdf.setKeywords([...(pdf.getKeywords()?.split(/;\s*/) ?? []), `OffroadRevisionId=${manifest.revisionId}`, `OffroadManifestFingerprint=${manifest.logicalManifestFingerprint}`]);
    return pdf.save({useObjectStreams: false});
  }
  const zip = await safePackage(bytes, manifest.format);
  if (zip.file(MANIFEST)) throw new Error("roundtrip_manifest_already_embedded");
  put(zip, MANIFEST, manifestXml(manifest));
  if (manifest.format === "xlsx") await embedXlsx(zip, manifest);
  await addRelationships(zip, manifest);
  for (const entry of Object.values(zip.files)) entry.date = fixed;
  return zip.generateAsync({type: "uint8array", compression: "DEFLATE", compressionOptions: {level: 9}, platform: "UNIX"});
}
export type ManifestExtraction = {manifest: RoundtripManifest | null; issue: string | null};
async function extractFromZip(zip: JSZip, format: RoundtripFormat): Promise<ManifestExtraction> {
  try {
    const nodes = await readXml(zip, MANIFEST);
    const root = nodes && findFirst(nodes, "offroadRoundtrip");
    if (!root) return {manifest: null, issue: "roundtrip_manifest_missing"};
    const manifest = roundtripManifestSchema.parse(JSON.parse(decodeXml(plainText(root))));
    if (manifest.format !== format) return {manifest: null, issue: "roundtrip_manifest_format_mismatch"};
    const props = await readXml(zip, "docProps/custom.xml") ?? [];
    for (const [name, expected] of Object.entries({OffroadArtifactId: manifest.artifactId, OffroadRevisionId: manifest.revisionId, OffroadManifestFingerprint: manifest.logicalManifestFingerprint})) {
      const matches = findAll(props, "property").filter(node => attributeOf(node, "name") === name);
      if (matches.length !== 1 || textOf(matches[0]!, "lpwstr") !== expected) return {manifest: null, issue: "roundtrip_properties_mismatch"};
    }
    if (format === "xlsx") {
      const sheets = await xlsxSheets(zip); const hidden = sheets.find(sheet => sheet.name === "_offroad_manifest");
      if (!hidden) return {manifest: null, issue: "roundtrip_manifest_sheet_missing"};
      const worksheet = await readXml(zip, hidden.path) ?? [];
      const json = findAll(worksheet, "c").map(cell => decodeXml(textOf(cell, "t"))).join("");
      if (canonicalRoundtripJson(JSON.parse(json)) !== canonicalRoundtripJson(manifest)) return {manifest: null, issue: "roundtrip_manifest_sheet_mismatch"};
    }
    return {manifest, issue: null};
  } catch {return {manifest: null, issue: "roundtrip_manifest_invalid"};}
}
export async function extractRoundtripManifest(bytes: Uint8Array, format: RoundtripFormat): Promise<ManifestExtraction> {
  if (format === "pdf") {
    try {
      const pdf = await PDFDocument.load(bytes, {updateMetadata: false});
      const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
      const value = info && "get" in info ? (info as {get: (name: PDFName) => unknown}).get(PDFName.of("OffroadRoundtripManifest")) : null;
      if (!(value instanceof PDFString)) return {manifest: null, issue: "roundtrip_manifest_missing"};
      const manifest = roundtripManifestSchema.parse(JSON.parse(value.decodeText()));
      return manifest.format === "pdf" ? {manifest, issue: null} : {manifest: null, issue: "roundtrip_manifest_format_mismatch"};
    } catch {return {manifest: null, issue: "roundtrip_manifest_invalid"};}
  }
  return extractFromZip(await safePackage(bytes, format), format);
}
function entry(key: string, blockKey: string | null, role: RoundtripEntry["role"], value: string | null, locator: string, claims: readonly string[] = [], formula: string | null = null): RoundtripEntry {
  return {key, blockKey, role, value, locator, claimIds: claims, formula};
}
function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, entity => {
    const named: Record<string, string> = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"};
    if (named[entity] !== undefined) return named[entity]!;
    const numeric = entity.startsWith("&#x") ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return numeric > 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff) ? String.fromCodePoint(numeric) : "";
  });
}
/** Expand scientific notation without a floating-point conversion. */
function exactNumber(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:[Ee]([+-]?\d+))?$/.exec(value);
  if (!match) return value;
  const exponent = Number(match[4] ?? "0");
  if (Math.abs(exponent) > 10000) throw new Error("roundtrip_numeric_limit");
  const digits = `${match[2]}${match[3] ?? ""}`; const point = match[2]!.length + exponent;
  const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const clean = expanded.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${match[1]}${clean}`;
}
function parseDefinedRef(value: string): {sheet: string; ref: string} | null {
  const match = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})(?::\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6}))?$/.exec(decodeXml(value));
  return match ? {sheet: match[1]?.replace(/''/g, "'") ?? match[2]!, ref: `${match[3]}${match[4]}${match[5] ? `:${match[5]}${match[6]}` : ""}`} : null;
}
const cellPosition = (ref: string): {column: number; row: number} => {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)!;
  return {column: [...match[1]!].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0), row: Number(match[2])};
};
function inRange(ref: string, range: string): boolean {
  const [start, end] = range.replace(/\$/g, "").split(":"); const s = cellPosition(start!); const e = cellPosition(end ?? start!); const p = cellPosition(ref);
  return p.column >= s.column && p.column <= e.column && p.row >= s.row && p.row <= e.row;
}
async function readXlsx(zip: JSZip, manifest: RoundtripManifest | null): Promise<Pick<RoundtripSnapshot, "entries" | "unmatched">> {
  const sheets = await xlsxSheets(zip);
  const shared = (await readXml(zip, "xl/sharedStrings.xml")) ?? [];
  const sharedValues = findAll(shared, "si").map(node => decodeXml(textOf(node, "t")));
  const data = new Map<string, Map<string, {value: string | null; formula: string | null}>>();
  for (const sheet of sheets) {
    if (sheet.name === "_offroad_manifest") continue;
    const cells = new Map<string, {value: string | null; formula: string | null}>();
    for (const cell of findAll(await readXml(zip, sheet.path) ?? [], "c")) {
      const ref = attributeOf(cell, "r") ?? "";
      if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(ref)) continue;
      const type = attributeOf(cell, "t");
      const raw = plainText(findFirst(childrenOf(cell), "v") ?? {});
      const value = type === "s" ? sharedValues[Number(raw)] ?? null : type === "inlineStr" ? decodeXml(textOf(cell, "t"))
        : raw === "" ? null : type === "str" || type === "e" || type === "b" ? decodeXml(raw) : exactNumber(raw);
      const f = findFirst(childrenOf(cell), "f");
      // Shared/array formulas have indirect authority not supported by an import candidate.
      const formula = f ? attributeOf(f, "t") ? `unsupported:${attributeOf(f, "t")}:${decodeXml(plainText(f))}` : decodeXml(plainText(f)) : null;
      cells.set(ref, {value, formula});
    }
    data.set(decodeXml(sheet.name), cells);
  }
  const entries: RoundtripEntry[] = []; const used = new Set<string>();
  const names = findAll(await readXml(zip, "xl/workbook.xml") ?? [], "definedName");
  const named = (name: string): {sheet: string; ref: string}[] => names.filter(node => decodeXml(attributeOf(node, "name") ?? "") === name)
    .map(node => parseDefinedRef(plainText(node))).filter((value): value is {sheet: string; ref: string} => value !== null);
  const scalar = (binding: {name: string}, key: string, blockKey: string | null, role: RoundtripEntry["role"], claims: readonly string[] = []): void => {
    for (const reference of named(binding.name)) {
      if (reference.ref.includes(":")) continue;
      const value = data.get(reference.sheet)?.get(reference.ref);
      if (!value) continue;
      const locator = `${reference.sheet}!${reference.ref}`; used.add(locator);
      entries.push(entry(key, blockKey, role, role === "formula" ? null : value.value, locator, claims, value.formula));
    }
  };
  if (manifest) {
    for (const input of manifest.inputs) scalar(input, `in:${input.name}`, input.blockKey, "input");
    for (const output of manifest.outputs) scalar(output, `out:${output.name}`, null, "recorded");
    for (const formula of manifest.formulas) scalar(formula, `formula:${formula.name}`, null, "formula");
    for (const block of manifest.blocks) {
      if (block.region.kind !== "cell") continue;
      for (const reference of named(block.region.definedName)) {
        const cells = [...(data.get(reference.sheet)?.entries() ?? [])].filter(([ref]) => inRange(ref, reference.ref));
        const content = cells.filter(([ref]) => !used.has(`${reference.sheet}!${ref}`));
        for (const [ref] of cells) used.add(`${reference.sheet}!${ref}`);
        if (!content.length) continue;
        entries.push(entry(`block:${block.blockKey}`, block.blockKey, "recorded",
          canonicalRoundtripJson(content.map(([_ref, value]) => ({value: value.formula ? null : value.value, formula: value.formula}))), `${reference.sheet}!${reference.ref}`, block.claimIds));
      }
    }
  }
  const unmatched: {locator: string; value: string}[] = [];
  for (const [sheet, cells] of data) for (const [ref, value] of cells) {
    if (!used.has(`${sheet}!${ref}`) && (value.value !== null || value.formula !== null)) unmatched.push({locator: `${sheet}!${ref}`, value: value.formula ?? value.value ?? ""});
  }
  return {entries, unmatched};
}
async function readDocx(zip: JSZip, manifest: RoundtripManifest | null): Promise<Pick<RoundtripSnapshot, "entries" | "unmatched">> {
  const nodes = await readXml(zip, "word/document.xml") ?? [];
  const entries: RoundtripEntry[] = []; const unmatched: {locator: string; value: string}[] = [];
  const tracked = new Set<OrderedNode>();
  for (const [index, sdt] of findAll(nodes, "sdt").entries()) {
    const tag = attributeOf(findFirst(childrenOf(sdt), "tag") ?? {}, "val");
    const block = manifest?.blocks.find(candidate => candidate.region.kind === "word" && candidate.region.tag === decodeXml(tag ?? ""));
    if (!block) continue;
    for (const p of findAll(childrenOf(sdt), "p")) tracked.add(p);
    entries.push(entry(`block:${block.blockKey}`, block.blockKey, block.recorded ? "recorded" : "text",
      decodeXml(textOf(sdt, "t", ["p", "br", "tab"])), `word:sdt:${index}`, block.claimIds));
  }
  for (const [index, paragraph] of findAll(nodes, "p").entries()) {
    if (tracked.has(paragraph)) continue;
    const value = decodeXml(textOf(paragraph, "t", ["br", "tab"]));
    if (value) unmatched.push({locator: `word:paragraph:${index}`, value});
  }
  return {entries, unmatched};
}
async function readPptx(zip: JSZip, manifest: RoundtripManifest | null): Promise<Pick<RoundtripSnapshot, "entries" | "unmatched">> {
  const entries: RoundtripEntry[] = []; const unmatched: {locator: string; value: string}[] = [];
  const physical: {slideName: string; shapeName: string; value: string; locator: string}[] = [];
  const paths = Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  for (const path of paths) {
    const nodes = await readXml(zip, path) ?? []; const slide = findFirst(nodes, "cSld");
    const slideName = decodeXml(attributeOf(slide ?? {}, "name") ?? "");
    const tracked = new Set<OrderedNode>();
    const groups = findAll(nodes, "grpSp");
    for (const group of groups) for (const child of [...findAll(childrenOf(group), "sp"), ...findAll(childrenOf(group), "graphicFrame")]) tracked.add(child);
    const shapes = [...groups, ...findAll(nodes, "sp").filter(shape => !tracked.has(shape)), ...findAll(nodes, "graphicFrame").filter(shape => !tracked.has(shape))];
    for (const [index, shape] of shapes.entries()) {
      const shapeName = decodeXml(attributeOf(findFirst(childrenOf(shape), "cNvPr") ?? {}, "name") ?? "");
      const value = decodeXml(textOf(shape, "t", ["p", "br"]));
      physical.push({slideName, shapeName, value, locator: `${path}:shape:${index}`});
    }
  }
  const used = new Set<string>();
  for (const block of manifest?.blocks ?? []) {
    if (block.region.kind !== "slide") continue;
    const parts = block.region.parts?.length ? block.region.parts : [{partKey: "1", slideName: block.region.slideName, shapeName: block.region.shapeName}];
    const matched = parts.map(part => physical.filter(shape => shape.slideName === part.slideName && shape.shapeName === part.shapeName));
    if (matched.some(shapes => shapes.length === 0)) continue;
    const first = matched.map(shapes => shapes[0]!);
    for (const shape of first) used.add(shape.locator);
    entries.push(entry(`block:${block.blockKey}`, block.blockKey, block.recorded ? "recorded" : "text", first.map(shape => shape.value).join("\n"), first.map(shape => shape.locator).join("|"), block.claimIds));
    for (const shapes of matched) for (const duplicate of shapes.slice(1)) {used.add(duplicate.locator); unmatched.push({locator: duplicate.locator, value: duplicate.value});}
  }
  for (const shape of physical) if (!used.has(shape.locator) && shape.value) unmatched.push({locator: shape.locator, value: shape.value});
  return {entries, unmatched};
}
/** Input bytes must have passed the upload quarantine; safe ZIP/XML limits are enforced again here. */
export async function readRoundtripSnapshot(bytes: Uint8Array, format: RoundtripFormat): Promise<RoundtripSnapshot> {
  if (format === "pdf") throw new Error("roundtrip_pdf_import_unsupported");
  const zip = await safePackage(bytes, format);
  const extracted = await extractFromZip(zip, format);
  const content = format === "xlsx" ? await readXlsx(zip, extracted.manifest) : format === "docx" ? await readDocx(zip, extracted.manifest) : await readPptx(zip, extracted.manifest);
  return {manifest: extracted.manifest, manifestIssue: extracted.issue, sha256: digest(bytes), ...content};
}
