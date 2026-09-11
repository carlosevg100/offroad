import fontkit from "@pdf-lib/fontkit";
import {unicodeFontBase64} from "./fonts/dejavu";
import type {Material} from "@offroad/case-materials";
import {PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage} from "pdf-lib";

import {houseDocumentTemplate, type DocxLang, type DocxMeta} from "./docx";
import {presentationTemplateManifest, type InstitutionalPresentationTemplate, type PdfRenderableFont} from "./presentation-template";

/** The three families this renderer embeds. A template always names one explicitly. */
const embeddedFonts: Record<PdfRenderableFont, {regular: StandardFonts; bold: StandardFonts}> = {
  "Helvetica": {regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold},
  "Times New Roman": {regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold},
  "Courier New": {regular: StandardFonts.Courier, bold: StandardFonts.CourierBold},
};

/** A colour the PDF can carry, or a refusal. A wrong colour is worse than a stopped export. */
function templateRgb(value: string) {
  const normalized = value.replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) throw new Error(`invalid template color ${value}`);
  const channel = (start: number) => Number.parseInt(normalized.slice(start, start + 2), 16) / 255;
  return rgb(channel(0), channel(2), channel(4));
}

function pdfFonts(template: InstitutionalPresentationTemplate) {
  const chosen = template.pdfFonts ?? {display: "Times New Roman" as const, body: "Helvetica" as const};
  const body = embeddedFonts[chosen.body];
  const display = embeddedFonts[chosen.display];
  // The database refuses an unknown family, so an absent entry here is a contract break, not input.
  if (!body || !display) throw new Error("template names a PDF font this renderer does not embed");
  return {body, display};
}

export const materialPdfRendererVersion = "2026.09.10-v2";

/** Render the approved blocks directly. Never calculate or summarize financial values here. */
export async function materialToPdf(input: {material: Material; lang: DocxLang; meta: DocxMeta}): Promise<Uint8Array> {
  const {material, lang, meta} = input;
  const template = meta.template ?? houseDocumentTemplate;
  const families = pdfFonts(template);
  const document = await PDFDocument.create();
  const issued = new Date(`${meta.issuedOn.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(issued.getTime())) throw new Error("PDF requires a persisted issuance date");
  document.setCreationDate(issued);
  document.setModificationDate(issued);
  document.setTitle(material.title[lang]);
  document.setAuthor("Offroad Capital");
  document.setCreator(`Offroad ${materialPdfRendererVersion}`);
  document.setProducer("Offroad Capital");
  document.setLanguage(lang === "pt" ? "pt-BR" : "en-US");
  // The identity that produced this file travels inside it.
  document.setKeywords(presentationTemplateManifest(template, template.fingerprint ?? "").map((entry) => `${entry.name}=${entry.value}`));
  let regular = await document.embedFont(families.body.regular);
  let bold = await document.embedFont(families.body.bold);
  let display = await document.embedFont(families.display.regular);
  const allText = JSON.stringify({material, companyName: meta.companyName});
  const supported = new Set(regular.getCharacterSet());
  if ([...allText].some(char => !supported.has(char.codePointAt(0)!))) {
    document.registerFontkit(fontkit);
    const unicode = await document.embedFont(Buffer.from(unicodeFontBase64, "base64"), {subset: true});
    const glyphs = new Set(unicode.getCharacterSet());
    // Never silently replace a company name, amount, identifier or quotation with a missing glyph.
    if ([...allText].some(char => !glyphs.has(char.codePointAt(0)!))) throw new Error("PDF contains characters outside the bundled Unicode font coverage");
    regular = unicode; bold = unicode; display = unicode;
  }
  const ink = templateRgb(template.colors.ink);
  const muted = templateRgb(template.colors.muted);
  const accent = templateRgb(template.colors.accent);
  const width = 595.28, height = 841.89, margin = 48, bodyWidth = width - margin * 2;
  let page: PDFPage;
  let y = 0;
  const mark = template.logo
    ? await (template.logo.extension === "png" ? document.embedPng(template.logo.data) : document.embedJpg(template.logo.data))
    : null;
  const markHeight = 18;
  const markWidth = mark ? (mark.width / mark.height) * markHeight : 0;
  const newPage = () => {
    page = document.addPage([width, height]);
    if (mark) page.drawImage(mark, {x: margin, y: height - 35 - markHeight + 9, width: markWidth, height: markHeight});
    else if (template.origin === "offroad_house") page.drawText("OFFROAD", {x: margin, y: height - 35, size: 9, font: bold, color: accent});
    else if (template.confidentialityLabel) page.drawText(template.confidentialityLabel, {x: margin, y: height - 35, size: 9, font: bold, color: accent});
    y = height - 64;
  };
  newPage();
  const wrap = (text: string, font: PDFFont, size: number, maxWidth: number) => {
    const lines: string[] = [];
    for (const segment of text.split(/\r?\n/)) {
      let line = "";
      for (const word of segment.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {line = candidate; continue;}
        if (line) {lines.push(line); line = "";}
        // Split overlong identifiers without truncating source locators or numbers.
        for (const char of word) {
          if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {lines.push(line); line = "";}
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const ensure = (space: number) => {if (y - space < 58) newPage();};
  const text = (value: string, size = 10, font = regular, spaceAfter = 8, color = ink) => {
    const lines = wrap(value, font, size, bodyWidth);
    for (const line of lines) {
      ensure(size * 1.4);
      page.drawText(line, {x: margin, y: y - size, size, font, color});
      y -= size * 1.4;
    }
    y -= spaceAfter;
  };
  const table = (head: string[], rows: string[][], caption?: string) => {
    if (!head.length) return;
    if (rows.some((row) => row.length !== head.length)) throw new Error("PDF table column mismatch");
    // A financial statement is a table, not a list of records. Only a table too wide to stay
    // readable at the smallest type size falls back to labeled records.
    if (head.length > 9) {
      if (caption) {ensure(74); text(caption, 11, bold, 7);}
      rows.forEach((row, index) => {
        ensure(40);
        text(`${lang === "pt" ? "Registro" : "Record"} ${index + 1}`, 10, bold, 6);
        row.forEach((cell, column) => text(`${head[column]}: ${cell}`));
      });
      return;
    }
    const size = head.length > 6 ? 7.5 : head.length > 4 ? 8.5 : 9;
    const lineHeight = size + 4, pad = head.length > 6 ? 5 : 7;
    // Columns share the width by what they actually carry. Each one first gets enough room for its
    // widest indivisible word, so a number never breaks in half, and the rest is distributed
    // towards the columns with the most text, so a label column stops being squeezed.
    // A cell may carry its own line breaks; a standard font cannot measure one, so both measures
    // work on the pieces a line can actually hold.
    const wordWidth = (value: string, font: PDFFont) => Math.max(0, ...value.split(/\s+/).filter(Boolean).map((word) => font.widthOfTextAtSize(word, size)));
    const lineWidth = (value: string, font: PDFFont) => Math.max(0, ...value.split(/\r?\n/).map((part) => font.widthOfTextAtSize(part, size)));
    const column = (index: number) => [head[index]!, ...rows.map((row) => row[index]!)];
    const need = head.map((_, index) => Math.min(bodyWidth / 2, Math.max(wordWidth(head[index]!, bold), ...rows.map((row) => wordWidth(row[index]!, regular))) + pad * 2 + 1));
    const want = head.map((_, index) => Math.max(...column(index).map((cell, position) => lineWidth(cell, position === 0 ? bold : regular))) + pad * 2 + 1);
    const needed = need.reduce((sum, value) => sum + value, 0);
    let widths: number[];
    if (needed >= bodyWidth) {
      const scale = bodyWidth / needed;
      widths = need.map((value) => value * scale);
    } else {
      const appetite = want.map((value, index) => Math.max(0, value - need[index]!));
      const total = appetite.reduce((sum, value) => sum + value, 0);
      const spare = bodyWidth - needed;
      widths = need.map((value, index) => value + (total > 0 ? spare * appetite[index]! / total : spare / head.length));
    }
    const offsets = widths.reduce<number[]>((positions, value, index) => [...positions, (positions[index - 1] ?? 0) + (widths[index - 1] ?? 0)], []);
    // Figures line up on their last digit, the way a statement is read.
    const numeric = head.map((_, index) => {
      const values = rows.map((row) => row[index]!.trim()).filter((value) => value.length > 0);
      return values.length > 0 && values.every((value) => /^[-+(]?[\d.,\s]+[)%x]?$/.test(value));
    });
    const paint = (cells: string[][], offset: number, count: number, header: boolean) => {
      const rowHeight = count * lineHeight + pad * 2;
      page.drawRectangle({x: margin, y: y - rowHeight, width: bodyWidth, height: rowHeight, color: header ? ink : rgb(0.965, 0.969, 0.957)});
      cells.forEach((lines, column) => lines.slice(offset, offset + count).forEach((line, index) => {
        const font = header ? bold : regular;
        const left = margin + offsets[column]! + pad;
        const x = numeric[column] ? margin + offsets[column]! + widths[column]! - pad - font.widthOfTextAtSize(line, size) : left;
        page.drawText(line, {x: Math.max(left, x), y: y - pad - size - index * lineHeight, size, font, color: header ? rgb(1, 1, 1) : ink});
      }));
      y -= rowHeight + 2;
    };
    const header = head.map((cell, column) => wrap(cell, bold, size, widths[column]! - pad * 2));
    const headerLines = Math.max(...header.map((lines) => lines.length));
    if (headerLines > 12) throw new Error("PDF table header exceeds readable page capacity");
    const headerHeight = headerLines * lineHeight + pad * 2 + 2;
    // A caption and a header alone at the foot of a page are an orphan. Reserve the caption, the
    // header and the first row together, so a table never starts on the page before its content.
    const firstRowLines = rows.length === 0 ? 0 : Math.max(...rows[0]!.map((cell, column) => wrap(cell, regular, size, widths[column]! - pad * 2).length));
    const captionHeight = caption ? 11 * 1.4 * wrap(caption, bold, 11, bodyWidth).length + 7 : 0;
    ensure(captionHeight + headerHeight + firstRowLines * lineHeight + pad * 2 + 12);
    if (caption) text(caption, 11, bold, 7);
    paint(header, 0, headerLines, true);
    for (const row of rows) {
      const cells = row.map((cell, column) => wrap(cell, regular, size, widths[column]! - pad * 2));
      const lineCount = Math.max(...cells.map((lines) => lines.length));
      // Keep ordinary records together; split only a row taller than a fresh page.
      const freshCapacity = Math.floor((height - 64 - headerHeight - 58 - pad * 2 - 2) / lineHeight);
      const remainingCapacity = Math.floor((y - 58 - pad * 2 - 2) / lineHeight);
      if (lineCount <= freshCapacity && lineCount > remainingCapacity) {
        newPage();
        paint(header, 0, headerLines, true);
      }
      let offset = 0;
      while (offset < lineCount) {
        let capacity = Math.floor((y - 58 - pad * 2 - 2) / lineHeight);
        if (capacity < 1) {newPage(); paint(header, 0, headerLines, true); capacity = Math.floor((y - 58 - pad * 2 - 2) / lineHeight);}
        const count = Math.min(capacity, lineCount - offset);
        paint(cells, offset, count, false);
        offset += count;
      }
    }
    y -= 10;
  };
  text(material.title[lang], 27, display, 12);
  if (meta.companyName) text(meta.companyName, 12, bold, 8);
  text(`${lang === "pt" ? "Emitido em" : "Issued on"} ${meta.issuedOn.slice(0, 10)}`, 9, regular, 20, muted);
  for (const [blockIndex, block] of material.blocks.entries()) {
    switch (block.type) {
      // A heading keeps company with what follows it. A table needs its caption, its header and
      // its first row, so the heading above reserves that much before it is drawn at all.
      case "heading": ensure(material.blocks[blockIndex + 1]?.type === "table" ? 150 : 84); text(block.text[lang], 17, display, 10); break;
      case "paragraph": text(block.text[lang]); break;
      case "disclaimer": text(block.text[lang], 9, regular, 10, muted); break;
      case "list": block.items.forEach((item) => text(`• ${item[lang]}`)); break;
      case "metrics": table([lang === "pt" ? "Indicador" : "Metric", lang === "pt" ? "Valor" : "Value"], block.items.map((item) => [item.label[lang], item.formatted[lang]])); break;
      case "table": table(block.head.map((cell) => cell[lang]), block.rows, block.caption[lang]); break;
      case "kv":
        if (block.rows.some(row => row.value[lang].length > 600)) {
          if (block.caption) {ensure(58); text(block.caption[lang], 11, bold, 7);}
          block.rows.forEach(row => {ensure(40); text(row.label[lang], 11, bold, 6); text(row.value[lang]); if (row.note) text(row.note[lang], 9, regular, 8, muted);});
          break;
        }
        table([lang === "pt" ? "Item" : "Item", lang === "pt" ? "Descrição" : "Description"], block.rows.map((row) => [row.label[lang], `${row.value[lang]}${row.note ? `\n${row.note[lang]}` : ""}`]), block.caption?.[lang]); break;
      case "callout": ensure(58); text(block.title[lang], 13, bold, 8); block.items.forEach((item) => text(`${item.label[lang]}: ${item.value[lang]}`)); break;
    }
  }
  document.getPages().forEach((sheet, index, pages) => {
    sheet.drawLine({start: {x: margin, y: 42}, end: {x: width - margin, y: 42}, thickness: 0.5, color: accent});
    sheet.drawText(`${lang === "pt" ? "Confidencial" : "Confidential"} · Offroad Capital · ${index + 1}/${pages.length}`, {x: margin, y: 28, font: regular, size: 8, color: muted});
  });
  return document.save({useObjectStreams: false});
}
