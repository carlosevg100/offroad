/**
 * A material as a Word document a lawyer can mark up.
 *
 * The print-ready HTML is how a PDF is produced; the term sheet and the covenant definitions
 * are negotiated in tracked changes, and that happens in .docx. The document is built directly
 * from the material's blocks: the same decimal strings, the same order, the same support ids.
 * Nothing is restyled per language beyond the words themselves.
 */

import type {Material, MaterialBlock} from "@offroad/case-materials";

import {zipStored} from "./zip";

export type DocxLang = "pt" | "en";

export type DocxMeta = {
  /** Redacted upstream when the company has not authorised disclosure. */
  companyName?: string;
  /** ISO date the document was produced. */
  issuedOn: string;
  /** Shown in the footer of every page. */
  preparedBy?: string;
};

const copy = {
  issued: {pt: "Emitido em", en: "Issued on"},
  confidential: {pt: "Confidencial", en: "Confidential"},
  prepared: {pt: "Preparado por", en: "Prepared by"},
};

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const run = (text: string, options: {bold?: boolean; italic?: boolean; size?: number; color?: string} = {}) => {
  const props = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.color ? `<w:color w:val="${options.color}"/>` : "",
    options.size ? `<w:sz w:val="${options.size}"/>` : "",
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
};

const paragraph = (runs: string, options: {style?: string; spacingAfter?: number; keepNext?: boolean} = {}) => {
  const props = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
    options.keepNext ? "<w:keepNext/>" : "",
    options.spacingAfter !== undefined ? `<w:spacing w:after="${options.spacingAfter}"/>` : "",
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
};

const cell = (content: string, options: {width?: number; shade?: boolean} = {}) =>
  `<w:tc><w:tcPr>${options.width ? `<w:tcW w:w="${options.width}" w:type="dxa"/>` : ""}${options.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF0F2"/>' : ""}</w:tcPr>${content}</w:tc>`;

const table = (rows: string[], columns: number) => {
  const width = Math.floor(9000 / Math.max(1, columns));
  const grid = Array.from({length: columns}, () => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFC5CA"/><w:bottom w:val="single" w:sz="4" w:color="BFC5CA"/><w:insideH w:val="single" w:sz="4" w:color="D9DDE0"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>${paragraph("", {spacingAfter: 120})}`;
};

const row = (cells: string[], header = false) => `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.join("")}</w:tr>`;

function blockXml(block: MaterialBlock, lang: DocxLang): string {
  switch (block.type) {
    case "heading":
      return paragraph(run(block.text[lang]), {style: "Heading2", keepNext: true});
    case "paragraph":
      return paragraph(run(block.text[lang]) + (block.supportIds?.length ? run(` [${block.supportIds.join(", ")}]`, {size: 16, color: "6B7780"}) : ""), {spacingAfter: 160});
    case "metrics":
      return table(
        block.items.map((item) => row([cell(paragraph(run(item.label[lang]))), cell(paragraph(run(item.formatted[lang], {bold: true}))), cell(paragraph(run(item.supportIds.join(", "), {size: 16, color: "6B7780"})))])),
        3,
      );
    case "table": {
      const columns = Math.max(block.head.length, ...block.rows.map((cells) => cells.length));
      return (
        paragraph(run(block.caption[lang], {italic: true, size: 18}), {keepNext: true, spacingAfter: 60}) +
        table(
          [
            row(block.head.map((head) => cell(paragraph(run(head[lang], {bold: true, size: 18})), {shade: true})), true),
            ...block.rows.map((cells) => row(cells.map((text) => cell(paragraph(run(text, {size: 18})))))),
          ],
          columns,
        )
      );
    }
    case "list":
      return block.items.map((item) => paragraph(run(`• ${item[lang]}`), {spacingAfter: 60})).join("");
    case "disclaimer":
      return paragraph(run(block.text[lang], {italic: true, size: 18, color: "6B7780"}), {spacingAfter: 160});
    case "kv":
      return (
        (block.caption ? paragraph(run(block.caption[lang], {bold: true}), {keepNext: true, spacingAfter: 60}) : "") +
        table(
          block.rows.map((entry) =>
            row([
              cell(paragraph(run(entry.label[lang], {bold: true, size: 20})), {shade: true, width: 2800}),
              cell(paragraph(run(entry.value[lang], {size: 20})) + (entry.note ? paragraph(run(entry.note[lang], {size: 16, color: "6B7780"})) : ""), {width: 6200}),
            ]),
          ),
          2,
        )
      );
    case "callout":
      return (
        paragraph(run(block.title[lang], {bold: true}), {keepNext: true, spacingAfter: 60}) +
        table(
          block.items.map((item) => row([cell(paragraph(run(item.label[lang], {size: 20})), {shade: true, width: 3600}), cell(paragraph(run(item.value[lang], {bold: true, size: 20})), {width: 5400})])),
          2,
        )
      );
  }
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="253743"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="253743"/></w:rPr></w:style></w:styles>`;

const footer = (text: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run(text, {size: 16, color: "6B7780"})}</w:p></w:ftr>`;

const core = (title: string, issuedOn: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>Offroad Capital</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${issuedOn}T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${issuedOn}T00:00:00Z</dcterms:modified></cp:coreProperties>`;

/** The document.xml body, exported for tests that read the XML rather than the archive. */
export function materialDocumentXml(input: {material: Material; lang: DocxLang; meta: DocxMeta}): string {
  const {material, lang, meta} = input;
  const head = [
    paragraph(run(material.title[lang]), {style: "Title"}),
    paragraph(
      run(`${meta.companyName ? `${meta.companyName} · ` : ""}${copy.issued[lang]} ${meta.issuedOn} · ${copy.confidential[lang]}`, {size: 18, color: "6B7780"}),
      {spacingAfter: 240},
    ),
  ].join("");
  const body = material.blocks.map((block) => blockXml(block, lang)).join("");
  const sectionProps = `<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${head}${body}${sectionProps}</w:body></w:document>`;
}

export function materialToDocx(input: {material: Material; lang: DocxLang; meta: DocxMeta}): Uint8Array {
  const {material, lang, meta} = input;
  const footerText = `${copy.confidential[lang]} · ${copy.prepared[lang]} ${meta.preparedBy ?? "Offroad Capital"} · ${copy.issued[lang]} ${meta.issuedOn}`;
  return zipStored([
    {name: "[Content_Types].xml", data: contentTypes},
    {name: "_rels/.rels", data: rootRels},
    {name: "word/_rels/document.xml.rels", data: documentRels},
    {name: "word/document.xml", data: materialDocumentXml(input)},
    {name: "word/styles.xml", data: styles},
    {name: "word/footer1.xml", data: footer(footerText)},
    {name: "docProps/core.xml", data: core(material.title[lang], meta.issuedOn)},
  ]);
}
