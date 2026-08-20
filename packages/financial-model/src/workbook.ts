import * as XLSX from "xlsx";

import {columnLetter, type Cell, type FinancialModel} from "./model";

/**
 * The model as a file somebody opens in Excel and starts arguing with.
 *
 * Formulas are written as formulas (`cell.f`), not as their computed results. That is the
 * whole point: an analyst who disagrees with the revenue growth changes one cell and watches
 * the DSCR, the leverage, and the covenant status move. A workbook of frozen numbers would
 * look identical on screen and be worth nothing — exactly the failure the intake playbook
 * warns companies about when it asks them not to send a PDF of their model.
 *
 * No cached values are written, so Excel and LibreOffice both recalculate on open. Computing
 * them here would mean a second implementation of every formula, and two implementations
 * eventually disagree.
 *
 * **On formatting.** SheetJS's community build writes number formats and column widths but
 * silently drops fonts, fills, and frozen panes — measured, not assumed. So this file does not
 * carry style objects that would be quietly discarded; the reader would see none of it and the
 * next person to touch this code would believe styling worked. The banking convention of blue
 * for inputs is replaced by a structural one that survives any writer: **every editable cell
 * in the model is on the Assumptions sheet, and nowhere else.** Every other sheet is formulas
 * and labels. That is a stronger guarantee than colour — a hardcoded number buried three
 * sheets deep is the classic way a model lies — and the cover sheet states it.
 */

const numberFormats: Record<string, string> = {
  money: "#,##0;[Red]-#,##0",
  percent: "0.0%",
  multiple: '0.00"x"',
  integer: "#,##0",
  years: '0" a"',
  text: "@",
};

function toCell(cell: Cell): XLSX.CellObject | undefined {
  const format = numberFormats[cell.format ?? "text"] ?? "@";

  if (cell.formula) {
    // The cached value is not optional. A formula cell handed to this writer without one is
    // emitted as `t="e"` — the *error* type — and every projected cell opens as `#N/A`. The
    // placeholder is discarded on open: the file carries no calcChain.xml, so Excel rebuilds
    // the dependency graph and recalculates rather than trusting these zeros.
    return cell.format === "text"
      ? ({t: "s", v: "", f: cell.formula} as XLSX.CellObject)
      : ({t: "n", v: 0, f: cell.formula, z: format} as XLSX.CellObject);
  }
  if (cell.value === undefined || cell.value === "") return undefined;
  if (typeof cell.value === "number") return {t: "n", v: cell.value, z: format};
  return {t: "s", v: cell.value};
}

/**
 * The cover: what this model is, what it is not, and which numbers are ours rather than the
 * company's.
 *
 * A workbook that opens straight onto a projection invites the reader to treat every cell as
 * fact. Naming the desk's own assumptions on the first sheet is the difference between a model
 * and a claim.
 */
function coverSheet(model: FinancialModel, lang: "pt" | "en"): XLSX.WorkSheet {
  const assumptionsName = lang === "pt" ? "Premissas" : "Assumptions";
  const sourcesName = lang === "pt" ? "Fontes" : "Sources";

  const rows: string[][] = [
    ["Offroad Capital"],
    [lang === "pt" ? "Modelo de crédito, indicativo" : "Credit model, indicative"],
    [],
    [
      lang === "pt"
        ? "Este é um modelo de crédito: leva a receita ao EBITDA, ao caixa disponível para o serviço da dívida e à cobertura. Não projeta balanço patrimonial."
        : "This is a credit model: it runs revenue to EBITDA to cash available for debt service to coverage. It does not project a balance sheet.",
    ],
    [
      lang === "pt"
        ? `Toda célula editável está na aba ${assumptionsName}. As demais abas são fórmulas: mude uma premissa e o modelo inteiro recalcula. Não há número digitado escondido em nenhuma projeção.`
        : `Every editable cell is on the ${assumptionsName} sheet. Every other sheet is formulas: change an assumption and the whole model recalculates. No hardcoded number is hidden in any projection.`,
    ],
    [
      lang === "pt"
        ? `Cada número histórico vem de um documento da companhia e está rastreado na aba ${sourcesName}, com o campo, o rank de evidência e o arquivo de origem.`
        : `Every historical number comes from one of the company's documents and is traced on the ${sourcesName} sheet, with the field, the evidence rank, and the source file.`,
    ],
    [],
    [lang === "pt" ? "Premissas que a Offroad supriu porque o data room não as trouxe" : "Assumptions Offroad supplied because the data room did not provide them"],
    ...model.deskAssumptions.map((assumption) => [`•  ${assumption}`]),
    [],
    [
      lang === "pt"
        ? "Documento indicativo. Não constitui proposta firme, compromisso de crédito, aprovação ou garantia de captação. A Offroad não precifica a operação: o custo da dívida nas Premissas é um placeholder para sensibilidade, não uma indicação de taxa."
        : "Indicative document. Not a firm offer, credit commitment, approval, or guarantee of funding. Offroad does not price the transaction: the cost of debt on the Assumptions sheet is a sensitivity placeholder, not a rate indication.",
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{wch: 118}];
  return sheet;
}

export function toWorkbook(model: FinancialModel, lang: "pt" | "en"): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, coverSheet(model, lang), lang === "pt" ? "Leia-me" : "Read me");

  for (const sheet of model.sheets) {
    const worksheet: XLSX.WorkSheet = {};
    let maxColumn = 0;

    sheet.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, columnIndex) => {
        const built = toCell(cell);
        if (!built) return;
        worksheet[`${columnLetter(columnIndex)}${rowIndex + 1}`] = built;
        maxColumn = Math.max(maxColumn, columnIndex);
      });
    });

    worksheet["!ref"] = XLSX.utils.encode_range({
      s: {c: 0, r: 0},
      e: {c: Math.max(maxColumn, 0), r: Math.max(sheet.rows.length - 1, 0)},
    });
    worksheet["!cols"] = sheet.widths.map((width) => ({wch: width}));
    XLSX.utils.book_append_sheet(book, worksheet, sheet.name[lang]);
  }

  return book;
}

/**
 * The bytes to hand a browser.
 *
 * `type: "array"` yields an ArrayBuffer, not a typed array — asserting the return type without
 * wrapping it produced an object that looked right to TypeScript and had no indexable bytes.
 */
export function toXlsxBuffer(model: FinancialModel, lang: "pt" | "en"): Uint8Array {
  return new Uint8Array(XLSX.write(toWorkbook(model, lang), {bookType: "xlsx", type: "array"}) as ArrayBuffer);
}
