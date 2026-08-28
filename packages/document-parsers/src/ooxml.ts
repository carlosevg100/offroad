import JSZip from "jszip";
import {XMLParser} from "fast-xml-parser";
import {ParserError, parserLimits, type ParserWarning} from "./types";

/**
 * Shared plumbing for the OOXML formats (DOCX, PPTX — XLSX goes through exceljs).
 *
 * DOCX and PPTX are zip archives of XML, which means two hostile-file surfaces the parser
 * closes before reading anything: a decompression bomb (a few KB that expand to gigabytes)
 * and an archive with an absurd number of entries. Both are refused with a named error
 * instead of being allowed to exhaust the worker (P1 plan §E0; R-005).
 *
 * The XML is parsed with entity processing disabled, which is what keeps XXE and billion
 * laughs out of the picture.
 */
export type OrderedNode = Record<string, unknown>;

export async function openSafeZip(bytes: Uint8Array, label = "package"): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (error) {
    throw new ParserError(`the file is not a readable ${label}: ${(error as Error).message}`);
  }

  const entries = Object.values(zip.files);
  if (entries.length > parserLimits.maxZipEntries) {
    throw new ParserError(`the package has ${entries.length} entries (limit ${parserLimits.maxZipEntries})`);
  }

  let compressed = 0;
  let uncompressed = 0;
  for (const entry of entries) {
    const data = (entry as unknown as {_data?: {compressedSize?: number; uncompressedSize?: number}})._data;
    if (!data) continue;
    compressed += data.compressedSize ?? 0;
    uncompressed += data.uncompressedSize ?? 0;
    if ((data.uncompressedSize ?? 0) > parserLimits.maxZipEntryBytes) {
      throw new ParserError(`entry "${entry.name}" expands to more than ${parserLimits.maxZipEntryBytes} bytes`);
    }
  }
  if (compressed > 0 && uncompressed / compressed > parserLimits.maxZipRatio) {
    throw new ParserError(
      `the package expands ${Math.round(uncompressed / compressed)}× (limit ${parserLimits.maxZipRatio}×), which is a decompression bomb`,
    );
  }

  return zip;
}

export async function openOoxml(bytes: Uint8Array): Promise<JSZip> {
  return openSafeZip(bytes, "OOXML package");
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Document order matters: a paragraph before a table must stay before it.
  preserveOrder: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
});

export async function readXml(zip: JSZip, path: string): Promise<OrderedNode[] | null> {
  const file = zip.file(path);
  if (!file) return null;
  const xml = await file.async("string");
  if (xml.length > parserLimits.maxZipEntryBytes) throw new ParserError(`"${path}" is too large to parse`);
  try {
    return xmlParser.parse(xml) as OrderedNode[];
  } catch (error) {
    throw new ParserError(`"${path}" is not valid XML: ${(error as Error).message}`);
  }
}

/** The tag of a preserve-order node (every node has exactly one, plus optional `:@` attrs). */
export function tagOf(node: OrderedNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@") return key;
  }
  return undefined;
}

/**
 * OOXML lets a package choose any namespace prefix: Word writes `<w:p>`, and the generator
 * behind the Rede Horizonte workbooks writes `<x:worksheet>` where most writers emit
 * `<worksheet>`. Both are valid and Excel reads both, so every lookup here compares local
 * names — matching a literal prefix would make the parser depend on which tool produced the
 * file.
 */
export function localName(tag: string | undefined): string {
  if (!tag) return "";
  const colon = tag.lastIndexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

export function isTag(node: OrderedNode, tag: string): boolean {
  return localName(tagOf(node)) === localName(tag);
}

/** Attribute lookup that ignores the namespace prefix (`r:id` and `id` both match `id`). */
export function attributeOf(node: OrderedNode, name: string): string | undefined {
  const attributes = attributesOf(node);
  const direct = attributes[`@_${name}`];
  if (direct !== undefined) return direct;
  const wanted = localName(name);
  for (const [key, value] of Object.entries(attributes)) {
    if (localName(key.slice(2)) === wanted) return value;
  }
  return undefined;
}

export function childrenOf(node: OrderedNode): OrderedNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  const value = node[tag];
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
}

export function attributesOf(node: OrderedNode): Record<string, string> {
  return (node[":@"] as Record<string, string> | undefined) ?? {};
}

/** Depth-first search for the first node with the given local name. */
export function findFirst(nodes: OrderedNode[], tag: string): OrderedNode | undefined {
  for (const node of nodes) {
    if (isTag(node, tag)) return node;
    const found = findFirst(childrenOf(node), tag);
    if (found) return found;
  }
  return undefined;
}

/** All nodes with the given local name, at any depth, in document order. */
export function findAll(nodes: OrderedNode[], tag: string): OrderedNode[] {
  const found: OrderedNode[] = [];
  for (const node of nodes) {
    if (isTag(node, tag)) found.push(node);
    found.push(...findAll(childrenOf(node), tag));
  }
  return found;
}

/** Direct children with the given local name (no recursion). */
export function childrenNamed(node: OrderedNode, tag: string): OrderedNode[] {
  return childrenOf(node).filter((child) => isTag(child, tag));
}

/**
 * Concatenates the text of a subtree. `textTag` is the element that actually holds glyphs
 * (`w:t` in Word, `a:t` in PowerPoint); `breakTags` become spaces so words do not weld
 * together across line breaks and table cells.
 */
export function textOf(node: OrderedNode, textTag: string, breakTags: readonly string[] = []): string {
  const parts: string[] = [];
  const wantedText = localName(textTag);
  const breaks = new Set(breakTags.map(localName));

  const walk = (current: OrderedNode) => {
    const tag = tagOf(current);
    if (!tag) return;
    if (tag === "#text") {
      parts.push(String(current["#text"] ?? ""));
      return;
    }
    const name = localName(tag);
    if (breaks.has(name)) parts.push(" ");
    for (const child of childrenOf(current)) {
      // Only the designated text element contributes characters; everything else is
      // structure, and its stray whitespace would pollute the quote the verifier checks.
      if (tagOf(child) === "#text" && name !== wantedText) continue;
      walk(child);
    }
  };

  walk(node);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function limitWarning(what: string, where?: string): ParserWarning {
  return where === undefined
    ? {code: "limit_reached", message: what}
    : {code: "limit_reached", message: what, where};
}
