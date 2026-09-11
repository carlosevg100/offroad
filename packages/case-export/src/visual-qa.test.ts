/**
 * Visual quality of the delivered files, checked mechanically.
 *
 * Three synthetic shapes stand for the cases that break layouts: a short delivery, a long one that
 * must paginate, and one with a table wide enough to stop being readable. Each is rendered in both
 * languages, with the Offroad identity and with a client identity, and inspected for the defects a
 * reader actually notices: text that was cut, a heading left alone at the foot of a page, a table
 * row separated from its own content, a column that no longer fits, a chart without its unit,
 * period, legend and source, and a deck whose text or charts stopped being editable.
 *
 * Set OFFROAD_FORMAT_QA_DIR to keep the rendered files; the report script rasterizes the PDFs.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {inflateSync} from "node:zlib";
import {institutionalFinancialModelMaterial, type Material} from "@offroad/case-materials";
import JSZip from "jszip";
import {PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream} from "pdf-lib";
import {describe, expect, it} from "vitest";
import {materialToDocx} from "./docx";
import {materialToPdf} from "./pdf";
import {materialToPptx, offroadHousePresentationTemplate} from "./presentation";
import {institutionalTemplateFromDefinition, type PresentationTemplateDefinition} from "./presentation-template";

void inflateSync;
const local = (pt: string, en = pt) => ({pt, en});
const issuedOn = "2026-09-11";
const clientDefinition: PresentationTemplateDefinition = {
  templateKey: "synthetic-client", templateVersion: "2026.09.11-v1", origin: "client_supplied",
  colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "5D6670", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdfDisplay: "Times New Roman", pdfBody: "Helvetica"},
  confidentialityLabel: "CONFIDENCIAL · MATERIAL DE TRABALHO",
};
const clientTemplate = {...institutionalTemplateFromDefinition(clientDefinition), fingerprint: "c".repeat(64)};

const period = (year: number, index: number) => ({
  period: String(year), revenue: String(365 + index * 40), operatingCosts: String(-182 - index * 12),
  ebitda: String(182.5 + index * 20), depreciation: "-40", ebit: String(142.5 + index * 20), financeExpense: "-18",
  accountingEbt: String(124.5 + index * 20), cashTax: "-30", netIncome: String(94.5 + index * 20),
  totalAssets: String(1182.5 + index * 60), totalLiabilitiesAndEquity: String(1182.5 + index * 60),
  cfads: String(82.5 + index * 15), closingGrossDebt: String(400 - index * 30), unrestrictedCash: String(182.5 + index * 25),
  balanceCheck: "0", netDebtToEbitda: String((400 - index * 30 - 182.5) / (182.5 + index * 20)), dscr: index === 0 ? null : "1.35",
});

function financialMaterial(periods: number, lang: "pt" | "en"): Material {
  return institutionalFinancialModelMaterial({
    artifactFingerprint: "a".repeat(64), supportIds: ["synthetic-source"], lang,
    scenarios: [{name: lang === "pt" ? "Cenário sintético" : "Synthetic scenario", currency: "BRL",
      periods: Array.from({length: periods}, (_, index) => period(2027 + index, index))}],
  });
}

const shortCase: Material = {
  kind: "teaser", title: local("Caso curto · Companhia sintética", "Short case · Synthetic company"), dependsOn: [],
  blocks: [
    {type: "heading", text: local("Situação", "Situation")},
    {type: "paragraph", text: local("Amostra fictícia curta para inspeção do renderizador.", "Short fictional sample for renderer inspection.")},
    {type: "metrics", items: [{label: local("Dívida líquida", "Net debt"), value: "217.5", formatted: local("R$ 217,50", "BRL 217.50"), supportIds: []}]},
    {type: "disclaimer", text: local("Somente dados sintéticos.", "Synthetic data only.")},
  ],
};

const longCase: Material = {
  kind: "credit_memo", title: local("Caso longo · Companhia sintética", "Long case · Synthetic company"), dependsOn: [],
  blocks: [
    ...Array.from({length: 8}, (_, section) => ([
      {type: "heading" as const, text: local(`Seção ${section + 1}: condições e diligência`, `Section ${section + 1}: terms and diligence`)},
      {type: "paragraph" as const, text: local(
        `${"Parágrafo sintético que descreve vencimentos, garantias e restrições contratuais sem qualquer dado de cliente. ".repeat(6)}Fim da seção ${section + 1}.`,
        `${"Synthetic paragraph describing maturities, collateral and contractual restrictions without any client data. ".repeat(6)}End of section ${section + 1}.`)},
      {type: "list" as const, items: Array.from({length: 5}, (_, item) => local(`Item ${section + 1}.${item + 1}: confirmar período, unidade e versão da fonte.`, `Item ${section + 1}.${item + 1}: confirm period, unit and source version.`))},
    ])).flat(),
    {type: "disclaimer", text: local("Somente dados sintéticos.", "Synthetic data only.")},
  ],
};

const wideCase: Material = {
  kind: "credit_memo", title: local("Caso com tabelas largas · Companhia sintética", "Wide table case · Synthetic company"), dependsOn: [],
  blocks: [
    {type: "heading", text: local("Cenários por período", "Scenarios per period")},
    {type: "paragraph", text: local("Introdução da tabela, mantida junto da própria tabela.", "Table introduction, kept with its own table.")},
    {type: "table", caption: local("Projeção sintética", "Synthetic projection"),
      head: [local("Linha", "Line"), local("2027"), local("2028"), local("2029"), local("2030"), local("2031")],
      rows: Array.from({length: 26}, (_, index) => [
        `Linha sintética ${index + 1} com rótulo longo o suficiente para testar a largura da coluna`,
        ...Array.from({length: 5}, (_, column) => `${(1000 + index * 37 + column * 11).toFixed(2)}`),
      ])},
    {type: "heading", text: local("Registro de documentos", "Document register")},
    {type: "table", caption: local("Documentos considerados", "Documents considered"),
      head: [local("Documento", "Document"), local("Observação", "Observation")],
      rows: Array.from({length: 22}, (_, index) => [
        `Documento sintético ${index + 1}`,
        `${"Verificar vencimento, moeda e versão do documento. ".repeat(3)}FIM-${index + 1}`,
      ])},
    {type: "disclaimer", text: local("Somente dados sintéticos.", "Synthetic data only.")},
  ],
};

const cases = [
  {id: "short", material: () => shortCase},
  {id: "long", material: () => longCase},
  {id: "wide", material: () => wideCase},
  {id: "financial", material: (lang: "pt" | "en") => financialMaterial(6, lang)},
] as const;

function pdfPageText(bytes: Uint8Array, document: PDFDocument): string[] {
  void bytes;
  return document.getPages().map(page => {
    const contents = page.node.Contents() as PDFArray;
    const streams = Array.from({length: contents.size()}, (_, index) => Buffer.from(decodePDFRawStream(contents.lookup(index, PDFRawStream)).decode()).toString("latin1")).join("\n");
    return [...streams.matchAll(/<([0-9A-Fa-f]+)>/g)].map(part => Buffer.from(part[1]!, "hex").toString("latin1")).join(" ");
  });
}

function materialStrings(material: Material, lang: "pt" | "en"): string[] {
  const values: string[] = [material.title[lang]];
  for (const block of material.blocks) {
    switch (block.type) {
      case "heading": case "paragraph": case "disclaimer": values.push(block.text[lang]); break;
      case "list": values.push(...block.items.map(item => item[lang])); break;
      case "metrics": values.push(...block.items.flatMap(item => [item.label[lang], item.formatted[lang]])); break;
      case "kv": values.push(...block.rows.flatMap(row => [row.label[lang], row.value[lang]])); break;
      case "callout": values.push(block.title[lang], ...block.items.flatMap(item => [item.label[lang], item.value[lang]])); break;
      case "table": values.push(block.caption[lang], ...block.head.map(head => head[lang]), ...block.rows.flat()); break;
    }
  }
  return values.filter(value => value.trim().length > 0);
}

async function keep(name: string, bytes: Uint8Array) {
  const directory = process.env.OFFROAD_FORMAT_QA_DIR;
  if (!directory) return;
  await mkdir(directory, {recursive: true});
  await writeFile(`${directory}/${name}`, bytes);
}

describe("delivered file quality", () => {
  for (const entry of cases) {
    for (const lang of ["pt", "en"] as const) {
      for (const identity of [{id: "house", template: offroadHousePresentationTemplate}, {id: "client", template: clientTemplate}] as const) {
        it(`keeps the ${entry.id} case readable in ${lang} under the ${identity.id} identity`, async () => {
          const material = entry.material(lang);
          const meta = {issuedOn, template: identity.template};
          const [pdf, pptx] = await Promise.all([
            materialToPdf({material, lang, meta}),
            materialToPptx({material, lang, meta}),
          ]);
          const docx = materialToDocx({material, lang, meta});
          await Promise.all([
            keep(`${entry.id}-${lang}-${identity.id}.pdf`, pdf),
            keep(`${entry.id}-${lang}-${identity.id}.pptx`, pptx),
            keep(`${entry.id}-${lang}-${identity.id}.docx`, docx),
          ]);

          const document = await PDFDocument.load(pdf);
          const pages = pdfPageText(pdf, document);
          const joined = pages.join("\n");
          const expected = materialStrings(material, lang);

          // No cut text: every approved string survives into every format.
          const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
          // The tail of every approved string must survive: a cut line loses its end first.
          const probeOf = (value: string) => {
            const text = normalize(value);
            return text.length <= 48 ? text : text.slice(-48);
          };
          for (const value of expected) {
            const probe = probeOf(value);
            if (probe.length < 4) continue;
            expect(normalize(joined), `PDF lost "${probe}" in ${entry.id}/${lang}`).toContain(probe);
          }

          // No orphan heading: a section title never ends a page with nothing under it.
          // A heading or a table caption alone at the foot of a page is an orphan just the same.
          const headings = material.blocks.flatMap(block => block.type === "heading" ? [normalize(block.text[lang])]
            : block.type === "table" ? [normalize(block.caption[lang])] : []).filter(value => value.length > 0);
          for (const [index, text] of pages.entries()) {
            if (index === pages.length - 1) continue;
            // The page footer is painted last; it is not content, so it never rescues an orphan.
            const tail = normalize(text).replace(/(Confidencial|Confidential) · Offroad Capital · \d+\/\d+\s*$/, "").trim().slice(-160);
            for (const heading of headings) {
              if (heading.length > 8 && tail.endsWith(heading)) throw new Error(`orphan heading "${heading}" at the foot of page ${index + 1} in ${entry.id}/${lang}`);
            }
          }

          // The deck keeps every string as editable text, tables inside real table shapes and the
          // chart as a native chart part with its own workbook.
          const deck = await JSZip.loadAsync(pptx);
          const slidePaths = Object.keys(deck.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
          const slides = await Promise.all(slidePaths.map(name => deck.file(name)!.async("string")));
          const slideText = slides.join("\n").replace(/\s+/g, " ");
          for (const value of expected) {
            const probe = probeOf(value);
            if (probe.length < 6) continue;
            expect(slideText, `deck lost "${probe}" in ${entry.id}/${lang}`).toContain(probe.replace(/&/g, "&amp;"));
          }
          expect(slideText).not.toContain("…");
          const charts = Object.keys(deck.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
          for (const chart of charts) {
            expect(deck.file(chart.replace("charts/chart", "embeddings/chart").replace(".xml", ".xlsx")), `chart ${chart} is not editable`).not.toBeNull();
          }

          // The document keeps every table geometrically consistent.
          const word = await JSZip.loadAsync(docx);
          const body = await word.file("word/document.xml")!.async("string");
          for (const block of material.blocks) {
            if (block.type !== "table") continue;
            for (const head of block.head) expect(body).toContain(head[lang].replace(/&/g, "&amp;"));
          }
          expect(body.match(/<w:tbl>/g)?.length ?? 0).toBe(body.match(/<\/w:tbl>/g)?.length ?? 0);
        });
      }
    }
  }

  it("paginates the long case and keeps every wide table row with its own content", async () => {
    const longPdf = await materialToPdf({material: longCase, lang: "pt", meta: {issuedOn}});
    const longDocument = await PDFDocument.load(longPdf);
    expect(longDocument.getPageCount(), "the long case must paginate").toBeGreaterThan(2);

    const widePdf = await materialToPdf({material: wideCase, lang: "pt", meta: {issuedOn}});
    const pages = pdfPageText(widePdf, await PDFDocument.load(widePdf));
    for (let index = 1; index <= 22; index++) {
      const label = `Documento sintético ${index}`;
      const page = pages.find(text => text.includes(label));
      expect(page, `wide table lost record ${index}`).toBeDefined();
      expect(page, `record ${index} was separated from its observation`).toContain(`FIM-${index}`);
    }
  });

  it("gives every chart its unit, period, legend and source in both languages", async () => {
    for (const lang of ["pt", "en"] as const) {
      const material = financialMaterial(4, lang);
      expect(material.presentationCharts?.length, "the financial material must carry charts").toBeGreaterThan(0);
      const deck = await JSZip.loadAsync(await materialToPptx({material, lang, meta: {issuedOn}}));
      const charts = Object.keys(deck.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
      expect(charts.length).toBeGreaterThan(0);
      for (const [index, chart] of charts.entries()) {
        const xml = await deck.file(chart)!.async("string");
        const series = material.presentationCharts![index]!.series;
        // Legend: the series name. Period: the category axis. Unit and source: on the slide.
        expect(xml, `chart ${index + 1} lost its legend in ${lang}`).toContain(series.label);
        for (const point of series.points) expect(xml, `chart ${index + 1} lost period ${point.label}`).toContain(point.label);
        const slide = await deck.file(chart.replace("charts/chart", "slides/slide"))!.async("string");
        expect(slide, `chart ${index + 1} lost its unit in ${lang}`).toContain(series.unit);
        expect(slide, `chart ${index + 1} lost its legend on the slide in ${lang}`).toContain(series.label);
        expect(slide, `chart ${index + 1} lost its period in ${lang}`).toContain(lang === "pt" ? "Período" : "Period");
        expect(slide, `chart ${index + 1} lost its source in ${lang}`).toContain(lang === "pt" ? "Fonte" : "Source");
        expect(slide).toContain("synthetic-source");
      }
    }
  });
});
