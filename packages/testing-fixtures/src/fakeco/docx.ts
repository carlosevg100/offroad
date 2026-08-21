import JSZip from "jszip";

/**
 * A minimal, valid .docx, written by hand.
 *
 * There is no Word here and no library that writes one, so the package is assembled directly:
 * a `.docx` is a zip holding `[Content_Types].xml`, a relationship part and
 * `word/document.xml`. That is enough for `parseDocx`, which reads exactly those, and it keeps
 * the fixture honest: the file a company uploads is a real OOXML package rather than something
 * shaped to be easy to parse.
 *
 * Headings carry `w:pStyle w:val="Heading1"`, because that is what the parser looks for when
 * it splits a document into sections, and the section is what an anchor like `sec3.p7` names.
 */

export type DocxBlock =
  | {kind: "heading"; text: string}
  | {kind: "paragraph"; text: string}
  | {kind: "table"; rows: string[][]};

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const paragraph = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}` +
  `<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;

const table = (rows: string[][]) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>` +
  rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => `<w:tc><w:tcPr/>${paragraph(cell)}</w:tc>`)
          .join("")}</w:tr>`,
    )
    .join("") +
  `</w:tbl>`;

export async function writeDocx(blocks: readonly DocxBlock[]): Promise<Uint8Array> {
  const body = blocks
    .map((block) => {
      if (block.kind === "heading") return paragraph(block.text, "Heading1");
      if (block.kind === "table") return table(block.rows);
      return paragraph(block.text);
    })
    .join("");

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", document);

  // A fixed date on every entry, so the same input produces the same bytes and the manifest's
  // hashes survive a regeneration. JSZip stamps the current time otherwise, which would make
  // every rebuild look like a content change and quietly break the fixture match.
  const fixed = new Date("2026-08-21T12:00:00Z");
  for (const entry of Object.values(zip.files)) entry.date = fixed;

  return await zip.generateAsync({type: "uint8array", compression: "DEFLATE"});
}
