import {XMLParser, XMLValidator} from "fast-xml-parser";

import {openSafeZip} from "./ooxml";

const officeNamespace = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const xml = new XMLParser({ignoreAttributes: false, processEntities: false, parseTagValue: false});

/** Refine generic ZIP/XML/unknown signatures by their actual structure, never the filename. */
export async function detectStructuredSpreadsheet(bytes: Uint8Array, mime: string): Promise<{mime: string; extension: string} | null> {
  if (mime === "application/zip") {
    const zip = await openSafeZip(bytes);
    const types = zip.file("[Content_Types].xml");
    if (!types || !zip.file("xl/workbook.bin") || !Object.keys(zip.files).some((name) => /^xl\/worksheets\/[^/]+\.bin$/.test(name))) return null;
    const source = await types.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) return null;
    const parsed = xml.parse(source) as {Types?: {Override?: Record<string, string> | Record<string, string>[]}};
    const entries = parsed.Types?.Override;
    if (!entries) return null;
    const overrides = Array.isArray(entries) ? entries : [entries];
    return overrides.some((entry) => entry["@_PartName"] === "/xl/workbook.bin" && entry["@_ContentType"] === "application/vnd.ms-excel.sheet.binary.macroEnabled.main")
      ? {mime: "application/vnd.ms-excel.sheet.binary.macroenabled.12", extension: "xlsb"} : null;
  }
  if (mime === "application/xml" || mime === "text/xml") {
    let source: string;
    try { source = new TextDecoder("utf-8", {fatal: true}).decode(bytes); } catch { return null; }
    if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) return null;
    const parsed = xml.parse(source) as Record<string, Record<string, unknown>>;
    // An OpenDocument root declares its own namespace prefix; that prefix is not fixed.
    const rootName = Object.keys(parsed).find((name) => /(?:^|:)document$/.test(name));
    if (!rootName) return null;
    const root = parsed[rootName]!;
    const prefix = rootName.includes(":") ? rootName.split(":")[0]! : "";
    const attribute = prefix ? `@_xmlns:${prefix}` : "@_xmlns";
    const tag = (name: string) => prefix ? `${prefix}:${name}` : name;
    const body = root[tag("body")] as Record<string, unknown> | undefined;
    return root[attribute] === officeNamespace && root[`@_${tag("mimetype")}`] === "application/vnd.oasis.opendocument.spreadsheet" && body && Object.hasOwn(body, tag("spreadsheet"))
      ? {mime: "application/vnd.oasis.opendocument.spreadsheet-flat-xml", extension: "fods"} : null;
  }
  if (mime === "application/octet-stream" && isDbf(bytes)) return {mime: "application/x-dbf", extension: "dbf"};
  return null;
}

/** dBASE III/FoxPro: header, field descriptors, terminator and record area must agree. */
function isDbf(bytes: Uint8Array): boolean {
  if (bytes.length < 65 || ![0x03, 0x83, 0x8b, 0xf5, 0x30, 0x31, 0x32].includes(bytes[0]!)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint16(8, true), recordLength = view.getUint16(10, true), records = view.getUint32(4, true);
  if (headerLength < 65 || headerLength > bytes.length || recordLength < 2) return false;
  let offset = 32, width = 1, fields = 0;
  for (; offset < headerLength && bytes[offset] !== 0x0d; offset += 32) {
    if (offset + 32 >= headerLength || !bytes[offset] || !"CNLD FMIBTY@+O0GPVQW".replaceAll(" ", "").includes(String.fromCharCode(bytes[offset + 11]!)) || !bytes[offset + 16]) return false;
    width += bytes[offset + 16]!;
    fields += 1;
  }
  if (!fields || bytes[offset] !== 0x0d || width !== recordLength) return false;
  const end = headerLength + records * recordLength;
  return end === bytes.length || (end + 1 === bytes.length && bytes[end] === 0x1a);
}
