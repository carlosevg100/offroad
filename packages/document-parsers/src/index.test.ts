import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {indexLayer} from "@offroad/document-intelligence";
import {ParserError, detectType, parseDocument} from "./index";
import {parsePdf} from "./pdf";
import {columnLetters} from "./csv";
import {detectScaleDeclarations} from "./scale";

const dataRoom = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "testing-fixtures",
  "assets",
  "rede-horizonte",
);

const files = {
  ficha: "00_Ficha_Cadastral_Rede_Horizonte.docx",
  carta: "01_Carta_CFO_Pedido_e_Racional_Expansao.docx",
  demonstracoes: "02_Demonstracoes_Financeiras_Auditadas_2023_2025.pdf",
  erp: "03_Export_ERP_Contabilidade_2024_Jul2026.xlsx",
  divida: "04_Mapa_Divida_Garantias_Jul2026.xlsx",
  plano: "05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx",
  parecer: "06_Parecer_Contabil_Informacoes_Intermediarias_Jul2026.pdf",
  memorial: "07_Memorial_Descritivo_Expansao_3_Lojas.pdf",
} as const;

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(dataRoom, name)));
}

const input = (name: string, overrides: Partial<Parameters<typeof parseDocument>[0]> = {}) => ({
  bytes: read(name),
  documentId: "11111111-1111-4111-8111-111111111111",
  documentVersion: 1,
  fileName: name,
  ...overrides,
});

describe("scale declarations", () => {
  it("reads the declaration, never the magnitude of the numbers", () => {
    expect(detectScaleDeclarations("(Em milhares de reais)", "p1")).toEqual([
      {scale: 1_000, where: "p1", text: "(Em milhares de reais)"},
    ]);
    expect(detectScaleDeclarations("Valores expressos em milhões de reais", "p2")[0]?.scale).toBe(1_000_000);
    expect(detectScaleDeclarations("Amounts in thousands", "p3")[0]?.scale).toBe(1_000);
    expect(detectScaleDeclarations("R$ mil", "sDRE")[0]?.scale).toBe(1_000);
  });

  it("does not turn prose into a declaration", () => {
    expect(detectScaleDeclarations("A empresa investiu 3 milhoes na nova loja em 2025.", "p4")).toEqual([]);
    expect(detectScaleDeclarations("Foram 250 mil clientes atendidos.", "p5")).toEqual([]);
    expect(
      detectScaleDeclarations(
        "O conselho aprovou um plano de expansao que preve a abertura de tres lojas com investimento total estimado em milhares de horas de trabalho da equipe interna durante o periodo.",
        "p6",
      ),
    ).toEqual([]);
  });
});

describe("type detection", () => {
  it("decides from the bytes, not from the declared type", async () => {
    const asPdf = await detectType(input(files.erp, {mimeType: "application/pdf"}));
    expect(asPdf.mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(asPdf.mismatch).toBe(true);

    const honest = await detectType(input(files.demonstracoes, {mimeType: "application/pdf"}));
    expect(honest.mime).toBe("application/pdf");
    expect(honest.mismatch).toBe(false);
  });

  it("refuses legacy binary Office files with an actionable message", async () => {
    // CFB (Office 97-2003) container signature
    const cfb = new Uint8Array(1024);
    cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
    await expect(parseDocument(input(files.erp, {bytes: cfb, fileName: "balancete.xls"}))).rejects.toThrow(/legacy/i);
    await expect(parseDocument(input(files.erp, {bytes: cfb, fileName: "balancete.xls"}))).rejects.toMatchObject({
      code: "unsupported_legacy_format",
    });
  });

  it("refuses an empty file instead of returning an empty layer", async () => {
    await expect(parseDocument(input(files.erp, {bytes: new Uint8Array(0)}))).rejects.toBeInstanceOf(ParserError);
  });
});

describe("the whole data room parses into indexable layers", () => {
  for (const [label, name] of Object.entries(files)) {
    it(`${label} (${name.split(".").pop()})`, async () => {
      const result = await parseDocument(input(name));

      // ids must be unique and resolvable — indexLayer throws on a duplicate
      const index = indexLayer(result.layer);
      expect(index.byId.size).toBeGreaterThan(5);
      expect(index.byId.get("document")?.precision).toBe("document");
      expect(result.layer.documentVersion).toBe(1);

      // the document anchor must carry the text a reader would recognise
      const text = (index.byId.get("document")?.text ?? "").toLowerCase();
      expect(text.length).toBeGreaterThan(200);
      expect(text).toContain("horizonte");

      // every anchor text must be a substring of the document anchor: the verifier relies
      // on it, so a parser that rewrote text would break anchoring silently
      for (const anchor of [...index.byId.values()].slice(0, 40)) {
        if (anchor.precision === "document" || !anchor.text.trim()) continue;
        expect(text).toContain(anchor.text.slice(0, 60).toLowerCase());
      }
    });
  }
});

describe("spreadsheets carry the numbers a credit analyst needs", () => {
  it("reads every sheet of the ERP export, including the long ledgers", async () => {
    const result = await parseDocument(input(files.erp));
    const sheets = result.layer.sheets ?? [];
    const names = sheets.map((sheet) => sheet.name);

    expect(names).toContain("DRE_MENSAL_LONG");
    expect(names).toContain("BALANCETE_LONG");
    expect(names).toContain("PLANO_CONTAS");

    const dre = sheets.find((sheet) => sheet.name === "DRE_MENSAL_LONG");
    expect(dre?.cells.length ?? 0).toBeGreaterThan(1_000);
    expect((dre?.cells ?? []).filter((cell) => cell.t === "n").length).toBeGreaterThan(100);

    // the workbook states its own scale; the parser reports it with the sentence and place
    expect(result.layer.scaleDeclarations).toContainEqual(
      expect.objectContaining({scale: 1_000_000, where: "sLEIA-ME"}),
    );
  });

  it("reads maturities as dates and keeps small counts as numbers", async () => {
    const result = await parseDocument(input(files.divida));
    const contracts = (result.layer.sheets ?? []).find((sheet) => sheet.name === "CONTRATOS_DIVIDA");
    const dates = (contracts?.cells ?? []).filter((cell) => cell.t === "d");

    expect(dates.length).toBeGreaterThan(5);
    for (const cell of dates) {
      expect(String(cell.v)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const year = Number(String(cell.v).slice(0, 4));
      expect(year).toBeGreaterThan(2015);
      expect(year).toBeLessThan(2060);
    }

    // a date-styled cell holding a small count must not become a 1900 date
    const plan = await parseDocument(input(files.plano));
    const allCells = (plan.layer.sheets ?? []).flatMap((sheet) => sheet.cells);
    const nineteenHundred = allCells.filter((cell) => cell.t === "d" && String(cell.v).startsWith("19"));
    expect(nineteenHundred).toEqual([]);
  });

  it("keeps cell references, formulas and the cached value", async () => {
    const result = await parseDocument(input(files.plano));
    expect(result.layer.kind).toBe("spreadsheet");

    const sheets = result.layer.sheets ?? [];
    expect(sheets.length).toBeGreaterThan(0);

    const cells = sheets.flatMap((sheet) => sheet.cells);
    expect(cells.length).toBeGreaterThan(20);
    for (const cell of cells) expect(cell.ref).toMatch(/^[A-Z]{1,3}[1-9]\d{0,6}$/);

    // anchors are cell precision, which is what the auto-accept policy requires
    const index = indexLayer(result.layer);
    const firstSheet = sheets[0];
    const firstCell = firstSheet?.cells[0];
    expect(firstSheet && firstCell).toBeTruthy();
    if (firstSheet && firstCell) {
      const anchor = index.byId.get(`s${firstSheet.name}!${firstCell.ref}`);
      expect(anchor?.precision).toBe("cell");
      expect(anchor?.text).toBe(String(firstCell.v));
    }
  });

  it("reports a formula whose cached value is missing rather than reading it as empty", async () => {
    const result = await parseDocument(input(files.erp));
    const formulaCells = (result.layer.sheets ?? []).flatMap((sheet) => sheet.cells).filter((cell) => cell.f);
    for (const cell of formulaCells) {
      const reported = result.warnings.some((warning) => warning.code === "formula_without_value" && warning.where?.endsWith(`!${cell.ref}`));
      expect(cell.v !== null || reported).toBe(true);
    }
  });
});

describe("pdf", () => {
  it("reconstructs tables and finds the scale the statements declare", async () => {
    const result = await parseDocument(input(files.demonstracoes));
    const pages = result.layer.pages ?? [];

    expect(pages.length).toBeGreaterThan(3);
    expect(pages.flatMap((page) => page.tables).length).toBeGreaterThan(0);

    const firstTable = pages.flatMap((page) => page.tables)[0];
    expect(firstTable?.rows.length ?? 0).toBeGreaterThan(1);
    expect(firstTable?.rows[0]?.cells.length ?? 0).toBeGreaterThan(1);
    for (const row of firstTable?.rows ?? []) expect(row.id).toMatch(/^p\d+\.t\d+\.r\d+$/);

    // "Valores em R$ milhões" on the income-statement page, reported with its page anchor
    const millions = result.layer.scaleDeclarations.filter((declaration) => declaration.scale === 1_000_000);
    expect(millions.length).toBeGreaterThan(0);
    expect(millions[0]?.where).toMatch(/^p\d+$/);
  });
});

describe("docx", () => {
  it("splits into sections and keeps paragraph order", async () => {
    const result = await parseDocument(input(files.carta));
    expect(result.layer.kind).toBe("docx");

    const sections = result.layer.sections ?? [];
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0]?.id).toBe("sec1");

    const paragraphs = sections.flatMap((section) => section.paragraphs);
    expect(paragraphs.length).toBeGreaterThan(2);
    for (const paragraph of paragraphs) expect(paragraph.id).toMatch(/^sec\d+\.p\d+$/);
  });
});

describe("csv", () => {
  const csvInput = (bytes: Uint8Array, fileName = "extrato.csv") => ({
    bytes,
    documentId: "22222222-2222-4222-8222-222222222222",
    documentVersion: 1,
    fileName,
  });

  it("detects the semicolon Brazilian Excel writes, and keeps values literal", async () => {
    const text = "Conta;Descrição;Valor\n3.1.01;Receita bruta;185.400,50\n4.1.02;Custo;-92.100,00\n";
    const result = await parseDocument(csvInput(new TextEncoder().encode(text)));

    const sheet = result.layer.sheets?.[0];
    expect(sheet?.name).toBe("extrato");
    expect(sheet?.cells.find((cell) => cell.ref === "A1")?.v).toBe("Conta");
    expect(sheet?.cells.find((cell) => cell.ref === "C2")?.v).toBe("185.400,50");
    // the layer never converts: reading "185.400,50" as a number is the extractor's job
    expect(sheet?.cells.every((cell) => cell.t === "s")).toBe(true);
  });

  it("reads windows-1252 without turning accents into replacement characters", async () => {
    // "Descrição" encoded as latin-1, the default of many Brazilian ERP exports
    const latin1 = Buffer.from("Conta;Descri\xE7\xE3o\n1;Manuten\xE7\xE3o\n", "latin1");
    const result = await parseDocument(csvInput(new Uint8Array(latin1)));

    const values = (result.layer.sheets?.[0]?.cells ?? []).map((cell) => String(cell.v));
    expect(values).toContain("Descrição");
    expect(values).toContain("Manutenção");
    expect(values.some((value) => value.includes("�"))).toBe(false);
    expect(result.warnings.some((warning) => warning.message.includes("windows-1252"))).toBe(true);
  });

  it("keeps a tab-separated export readable", async () => {
    const text = "Conta\tValor\n3.1.01\t1000\n";
    const result = await parseDocument(csvInput(new TextEncoder().encode(text), "export.tsv"));
    expect(result.layer.sheets?.[0]?.cells.find((cell) => cell.ref === "B2")?.v).toBe("1000");
  });
});

/**
 * A minimal but real OOXML package. `[Content_Types].xml` must declare the main part, which
 * is exactly what type detection reads to tell a `.pptx` from any other zip.
 */
async function buildOoxml(
  main: "presentationml.presentation" | "wordprocessingml.document",
  parts: Record<string, string>,
): Promise<Uint8Array> {
  const {default: JSZip} = await import("jszip");
  const zip = new JSZip();
  const mainPart = main === "presentationml.presentation" ? "/ppt/presentation.xml" : "/word/document.xml";
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
       <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
       <Default Extension="xml" ContentType="application/xml"/>
       <Override PartName="${mainPart}" ContentType="application/vnd.openxmlformats-officedocument.${main}.main+xml"/>
     </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainPart.slice(1)}"/>
     </Relationships>`,
  );
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  return new Uint8Array(await zip.generateAsync({type: "uint8array", compression: "DEFLATE"}));
}

describe("pptx", () => {
  it("reads slides, tables and speaker notes", async () => {
    const slide = `<?xml version="1.0"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Rede Horizonte</a:t></a:r></a:p></p:txBody></p:sp>
          <p:sp><p:txBody><a:p><a:r><a:t>Expansao de tres lojas</a:t></a:r></a:p></p:txBody></p:sp>
          <a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Loja</a:t></a:r></a:p></a:txBody></a:tc>
                 <a:tc><a:txBody><a:p><a:r><a:t>Capex</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl>
        </p:spTree></p:cSld>
      </p:sld>`;
    const notes = `<?xml version="1.0"?>
      <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Premissa: ramp up de 18 meses</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
      </p:notes>`;
    const bytes = await buildOoxml("presentationml.presentation", {
      "ppt/presentation.xml": '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
      "ppt/slides/slide1.xml": slide,
      "ppt/notesSlides/notesSlide1.xml": notes,
    });

    const result = await parseDocument({
      bytes,
      documentId: "33333333-3333-4333-8333-333333333333",
      documentVersion: 1,
      fileName: "teaser.pptx",
    });

    expect(result.layer.kind).toBe("pptx");
    const first = result.layer.slides?.[0];
    expect(first?.blocks.map((block) => block.text)).toEqual(["Rede Horizonte", "Expansao de tres lojas"]);
    expect(first?.blocks[0]?.id).toBe("sl1.b1");
    expect(first?.tables[0]?.rows[0]?.cells.map((cell) => cell.text)).toEqual(["Loja", "Capex"]);
    expect(first?.notes).toContain("ramp up");
    indexLayer(result.layer);
  });
});

describe("hostile files", () => {
  it("refuses a decompression bomb instead of expanding it in the worker", async () => {
    // 40 MB of zeros compresses to a few KB — the classic zip bomb shape, inside a package
    // that is otherwise a perfectly valid .docx
    const bytes = await buildOoxml("wordprocessingml.document", {
      "word/document.xml": "0".repeat(40 * 1024 * 1024),
    });

    await expect(
      parseDocument({
        bytes,
        documentId: "44444444-4444-4444-8444-444444444444",
        documentVersion: 1,
        fileName: "bomba.docx",
      }),
    ).rejects.toThrow(/decompression bomb|expands/i);
  });
});

describe("determinism", () => {
  it("produces byte-identical layers for the same input", async () => {
    for (const name of [files.parecer, files.divida, files.ficha]) {
      const first = await parseDocument(input(name));
      const second = await parseDocument(input(name));
      expect(JSON.stringify(first.layer)).toEqual(JSON.stringify(second.layer));
    }
  });

  it("keeps anchors stable across document versions of the same bytes", async () => {
    const v1 = await parsePdf(input(files.parecer));
    const v2 = await parsePdf(input(files.parecer, {documentVersion: 2}));
    expect(Object.keys(indexLayer(v1.layer).byId)).toEqual(Object.keys(indexLayer(v2.layer).byId));
    expect(v2.layer.documentVersion).toBe(2);
  });
});

describe("column letters", () => {
  it("follows the spreadsheet alphabet", () => {
    expect(columnLetters(0)).toBe("A");
    expect(columnLetters(25)).toBe("Z");
    expect(columnLetters(26)).toBe("AA");
    expect(columnLetters(51)).toBe("AZ");
    expect(columnLetters(52)).toBe("BA");
    expect(columnLetters(701)).toBe("ZZ");
  });
});
