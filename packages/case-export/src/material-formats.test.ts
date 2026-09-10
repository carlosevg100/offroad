import {mkdir, writeFile} from "node:fs/promises";
import {institutionalFinancialModelMaterial, type Material} from "@offroad/case-materials";
import JSZip from "jszip";
import {PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream} from "pdf-lib";
import {describe, expect, it} from "vitest";
import {materialToDocx} from "./docx";
import {materialToPdf} from "./pdf";
import {materialToPptx} from "./presentation";

const local = (pt: string, en = pt) => ({pt, en});
const material: Material = {
  kind: "teaser", title: local("Estrutura de capital · Companhia sintética", "Capital structure · Synthetic company"), dependsOn: [],
  blocks: [
    {type: "heading", text: local("Alternativas de refinanciamento", "Refinancing alternatives")},
    {type: "paragraph", text: local("Amostra fictícia para avaliação do renderizador. A alternativa A concentra amortizações no vencimento; a alternativa B distribui o serviço da dívida. A decisão depende da geração de caixa, do custo total e das condições contratuais.", "Fictional sample for renderer evaluation. Alternative A concentrates repayments at maturity; alternative B distributes debt service. The decision depends on cash generation, total cost and contractual terms.")},
    {type: "metrics", items: [{label: local("Fluxo de caixa", "Cash flow"), value: "-12500000.25", formatted: local("R$ (12.500.000,25)", "BRL (12,500,000.25)"), supportIds: []}, {label: local("Cobertura do serviço da dívida", "Debt service coverage"), value: "1.25", formatted: local("1,25x", "1.25x"), supportIds: []}]},
    {type: "table", caption: local("Cenários · valores fictícios", "Scenarios · fictional values"), head: [local("Cenário", "Scenario"), local("2027"), local("2028"), local("2029")], rows: [["Base", "100,00", "110,00", "121,00"], ["Adverso", "(12,50)", "0,00", "87,00"]]},
    {type: "heading", text: local("Condições e diligência", "Conditions and diligence")},
    {type: "kv", rows: [{label: local("Descrição integral", "Complete description"), value: local(Array.from({length: 30}, (_, index) => `Condição ${index + 1}: confirmar vencimentos, garantias e restrições contratuais antes de concluir a análise.`).join(" "))}]},
    {type: "table", caption: local("Registro de documentos", "Document register"), head: [local("Documento", "Document"), local("Observação", "Observation")], rows: Array.from({length: 28}, (_, index) => [`Fonte ${index + 1}`, `Documento sintético ${index + 1}. Verificar período, unidade e versão; preservar histórico de revisão.`])},
    {type: "callout", title: local("Próxima decisão", "Next decision"), items: [{label: local("Conselho", "Board"), value: local("Validar premissas e condições antes da abordagem de mercado.", "Validate assumptions and terms before approaching the market.")}]},
    {type: "disclaimer", text: local("Somente dados sintéticos. Não representa uma recomendação ou operação real.", "Synthetic data only. This is not a recommendation or a real transaction.")},
  ],
};

describe("approved material delivery formats", () => {
  it("puts native editable financial charts before the complete statement tables",async()=>{
    const report=institutionalFinancialModelMaterial({artifactFingerprint:"a".repeat(64),supportIds:["synthetic-source"],lang:"en",scenarios:[{name:"Synthetic",currency:"BRL",periods:[{period:"2027",revenue:"365",ebitda:"182.5",netIncome:"132.5",totalAssets:"1182.5",totalLiabilitiesAndEquity:"1182.5",cfads:"82.5",closingGrossDebt:"100",unrestrictedCash:"182.5",balanceCheck:"0"}]}]});
    const archive=await JSZip.loadAsync(await materialToPptx({material:report,lang:"en",meta:{issuedOn:"2026-09-10"}}));
    const charts=Object.keys(archive.files).filter(name=>/^ppt\/charts\/chart\d+\.xml$/.test(name));expect(charts).toHaveLength(4);
    expect(await archive.file("ppt/charts/chart2.xml")!.async("string")).toContain("182.5");
    expect(archive.file("ppt/embeddings/chart2.xlsx")).not.toBeNull();
    expect(await archive.file("ppt/slides/slide2.xml")!.async("string")).toContain("Operating earnings");
  });
  it("embeds Unicode for mathematical symbols, Greek and Cyrillic without lossy substitution", async () => {
    const unicodeMaterial = {...material, title: local("Δ EBITDA ≥ 0 · Компания"), blocks: [{type:"paragraph" as const, text:local("α = 0,35; Δ dívida ≤ € 1.000. Компания Ω. Custo − receita ≠ lucro.")}]};
    const bytes = await materialToPdf({material:unicodeMaterial,lang:"pt",meta:{issuedOn:"2026-09-10"}});
    const document=await PDFDocument.load(bytes);expect(document.getTitle()).toBe(unicodeMaterial.title.pt);
    const directory=process.env.OFFROAD_FORMAT_QA_DIR;if(directory){await mkdir(directory,{recursive:true});await writeFile(`${directory}/unicode.pdf`,bytes);}
    expect(Buffer.compare(bytes,await materialToPdf({material:unicodeMaterial,lang:"pt",meta:{issuedOn:"2026-09-10"}}))).toBe(0);
  });
  it("rejects unsupported script glyphs explicitly instead of emitting missing characters",async()=>{
    await expect(materialToPdf({material:{...material,title:local("漢字")},lang:"pt",meta:{issuedOn:"2026-09-10"}})).rejects.toThrow("Unicode font coverage");
  });
  it.each(["pt", "en"] as const)("preserves the approved content and fixed issuance date in %s", async (lang) => {
    const input = {material, lang, meta: {issuedOn: "2026-09-10"}};
    const pdf = await materialToPdf(input);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getTitle()).toBe(material.title[lang]);
    expect(parsed.getCreationDate()?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(parsed.getPageCount()).toBeGreaterThan(2);
    expect(Buffer.compare(pdf, await materialToPdf(input))).toBe(0);
    const pptx = await materialToPptx(input);
    expect(Buffer.compare(pptx, await materialToPptx(input))).toBe(0);
    const archive = await JSZip.loadAsync(pptx);
    const slides = await Promise.all(Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map((name) => archive.file(name)!.async("string")));
    const joined = slides.join("\n");
    expect(joined).toContain("Condição 30:");
    expect(joined).toContain("Fonte 28");
    expect(joined).toContain(lang === "pt" ? "R$ (12.500.000,25)" : "BRL (12,500,000.25)");
    expect(joined).toContain(lang === "pt" ? "CONFIDENCIAL · MATERIAL DE TRABALHO" : "CONFIDENTIAL · WORKING MATERIAL");
    if (lang === "en") expect(joined).not.toContain("CONFIDENCIAL");
    const docx = materialToDocx(input);
    const word = await JSZip.loadAsync(docx);
    expect(await word.file("word/document.xml")!.async("string")).toContain("Condição 30:");
    const directory = process.env.OFFROAD_FORMAT_QA_DIR;
    if (directory) {
      await mkdir(directory, {recursive: true});
      await Promise.all([["pdf", pdf], ["pptx", pptx], ["docx", docx]].map(([extension, bytes]) => writeFile(`${directory}/material-${lang}.${extension}`, bytes as Uint8Array)));
    }
  });
  it.each(["pt", "en"] as const)("rounds displayed ratios and keeps table introductions with evidence in %s", async lang => {
    const period = {period:"2027",revenue:"365",ebitda:"182.5",netIncome:"132.5",totalAssets:"1182.5",totalLiabilitiesAndEquity:"1182.5",cfads:"82.5",closingGrossDebt:"100",unrestrictedCash:"182.5",balanceCheck:"0",netDebtToEbitda:"-0.45205479",dscr:null};
    const report = institutionalFinancialModelMaterial({artifactFingerprint:"a".repeat(64),supportIds:[],lang,scenarios:[{name:"Reviewed",currency:"BRL",periods:[period]}]});
    const ratioTable = report.blocks.find(block => block.type === "table" && block.rows.some(row => row[0]?.includes("EBITDA (x)")));
    expect(ratioTable?.type === "table" && ratioTable.rows[0]?.[1]).toBe(lang === "pt" ? "-0,45" : "-0.45");
    expect(period.netDebtToEbitda).toBe("-0.45205479");
    const intro = {pt:"Premissas aprovadas para este cenário.",en:"Reviewed assumptions for this scenario."};
    const appendix: Material = {...report,blocks:[{type:"heading",text:local("Assumptions")},{type:"paragraph",text:intro},{type:"table",caption:local("Assumptions"),head:[local("Name"),local("Value")],rows:[["Growth","5%"],["Tax","34%"]]}],presentationCharts:[]};
    const archive = await JSZip.loadAsync(await materialToPptx({material:appendix,lang,meta:{issuedOn:"2026-09-10"}}));
    const paths=Object.keys(archive.files).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path));
    expect(paths).toHaveLength(2);
    const xml=await archive.file("ppt/slides/slide2.xml")!.async("string");
    expect(xml).toContain(intro[lang]); expect(xml).toContain("<a:tbl>");
  });
  it("rejects inconsistent table geometry instead of dropping cells", async () => {
    await expect(materialToPdf({material: {...material, blocks: [{type: "table", caption: local("Teste"), head: [local("A")], rows: [["1", "2"]]}]}, lang: "pt", meta: {issuedOn: "2026-09-10"}})).rejects.toThrow("column mismatch");
  });
  it("keeps each ordinary document record and its complete observation on one PDF page", async () => {
    const rows = Array.from({length: 35}, (_, index) => [`Record-${index}`, `Observation ${index}: ${"Verify contractual restrictions and the reporting period. ".repeat(3)}END-${index}`]);
    const bytes = await materialToPdf({material: {...material, blocks: [{type: "table", caption: local("Register"), head: [local("Document"), local("Observation")], rows}]}, lang: "en", meta: {issuedOn: "2026-09-10"}});
    const document = await PDFDocument.load(bytes);
    const pages = document.getPages().map(page => {
      const contents = page.node.Contents() as PDFArray;
      return Array.from({length: contents.size()}, (_, index) => Buffer.from(decodePDFRawStream(contents.lookup(index, PDFRawStream)).decode()).toString()).join("\n");
    });
    expect(pages.length).toBeGreaterThan(1);
    for (let index = 0; index < rows.length; index++) {
      const record = Buffer.from(`Record-${index}`).toString("hex").toUpperCase();
      const tail = Buffer.from(`END-${index}`).toString("hex").toUpperCase();
      const page = pages.find(content => content.includes(`<${record}>`));
      expect(page, `missing record ${index}`).toBeDefined();
      expect(page, `record ${index} split from its observation`).toContain(tail);
    }
  });
});
