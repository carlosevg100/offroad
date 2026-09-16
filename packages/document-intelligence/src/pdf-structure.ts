import {inflateSync} from "node:zlib";
import {PDFArray, PDFDict, PDFName, PDFNumber, PDFObject, PDFParser, PDFRawStream, PDFRef} from "pdf-lib";

const name = (value: PDFObject | undefined) => value instanceof PDFName ? value.decodeText() : null;
const maxObjects = 50_000;
const maxDepth = 64;

/** Inspect PDF objects, never image/content stream bytes as if they were dictionary tokens. */
export async function inspectPdfStructure(bytes: Uint8Array, inspectionBudget: number) {
  const parser = new BoundedPdfParser(bytes, inspectionBudget);
  try {
    const context = await parser.parseDocument();
    const root = context.lookup(context.trailerInfo.Root);
    if (!(root instanceof PDFDict) || name(root.get(PDFName.of("Type"))) !== "Catalog") throw new Error("pdf_catalog_missing");
    const pending: PDFObject[] = [...context.enumerateIndirectObjects().map(([, object]) => object), ...parser.streamDictionaries];
    const visited = new Set<PDFObject>();
    let encrypted = !!context.trailerInfo.Encrypt; let script = false; let embedded = false;
    const inspectName = (value: PDFName) => {
      const key = value.decodeText();
      encrypted ||= key === "Encrypt";
      script ||= ["JavaScript", "JS", "Launch", "OpenAction", "AA"].includes(key);
      embedded ||= ["EmbeddedFile", "Filespec"].includes(key);
    };
    while (pending.length) {
      const object = pending.pop()!;
      if (visited.has(object) || object instanceof PDFRef) continue;
      visited.add(object);
      if (visited.size > maxObjects) return {limited: true, malformed: false, encrypted: false, script: false, embedded: false};
      if (object instanceof PDFName) inspectName(object);
      else if (object instanceof PDFRawStream) pending.push(object.dict);
      else if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {inspectName(key); pending.push(value);}
      } else if (object instanceof PDFArray) pending.push(...object.asArray());
    }
    return {limited: false, malformed: false, encrypted, script, embedded};
  } catch {
    return {limited: parser.limited, malformed: !parser.limited, encrypted: false, script: false, embedded: false};
  }
}

/** Cap decompression before pdf-lib expands object/xref streams, as well as nesting/count. */
class BoundedPdfParser extends PDFParser {
  limited = false;
  readonly streamDictionaries: PDFDict[] = [];
  private depth = 0;
  private objects = 0;
  private compressedObjects = 0;
  private expanded = 0;
  constructor(bytes: Uint8Array, private readonly budget: number) {super(bytes, 100, true);}
  private limit(): never {this.limited = true; throw new Error("pdf_inspection_budget_exceeded");}
  override parseObject(): PDFObject {
    this.depth += 1; this.objects += 1;
    try {
      if (this.depth > maxDepth || this.objects > maxObjects) this.limit();
      const object = super.parseObject();
      if (!(object instanceof PDFRawStream)) return object;
      this.streamDictionaries.push(object.dict);
      const type = object.dict.get(PDFName.of("Type"));
      if (type instanceof PDFRef) throw new Error("indirect_pdf_stream_type_unsupported");
      if (!["ObjStm", "XRef"].includes(name(type) ?? "")) return object;
      const count = object.dict.get(PDFName.of(name(type) === "ObjStm" ? "N" : "Size"));
      if (!(count instanceof PDFNumber) || !Number.isSafeInteger(count.asNumber()) || count.asNumber() < 0 || count.asNumber() > maxObjects) this.limit();
      this.compressedObjects += count.asNumber();
      if (this.compressedObjects + this.objects > maxObjects) this.limit();
      const index = object.dict.get(PDFName.of("Index"));
      if (name(type) === "XRef" && index !== undefined) {
        if (!(index instanceof PDFArray) || index.size() % 2 !== 0) throw new Error("invalid_xref_index");
        let entries = 0;
        for (let i = 0; i < index.size(); i++) {
          const value = index.get(i);
          if (!(value instanceof PDFNumber) || !Number.isSafeInteger(value.asNumber()) || value.asNumber() < 0) throw new Error("invalid_xref_index");
          if (i % 2) entries += value.asNumber();
        }
        if (entries > maxObjects) this.limit();
      }
      const remaining = this.budget - this.expanded;
      if (remaining <= 0) this.limit();
      let contents: Uint8Array = object.getContents();
      const filter = object.dict.get(PDFName.of("Filter"));
      const filters = filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : [];
      if (filters.length > 4) this.limit();
      for (const value of filters) {
        if (name(value) !== "FlateDecode") throw new Error("pdf_object_stream_filter_unsupported");
        try {contents = inflateSync(contents, {maxOutputLength: remaining});}
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") this.limit();
          throw error;
        }
      }
      if (contents.byteLength > remaining) this.limit();
      this.expanded += contents.byteLength;
      const dictionary = object.dict.clone();
      dictionary.delete(PDFName.of("Filter")); dictionary.delete(PDFName.of("DecodeParms"));
      dictionary.set(PDFName.of("Length"), PDFNumber.of(contents.byteLength));
      return PDFRawStream.of(dictionary, contents);
    } finally {this.depth -= 1;}
  }
}
