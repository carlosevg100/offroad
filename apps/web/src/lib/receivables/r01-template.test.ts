import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";

import {buildReceivablesR01Template} from "./r01-template";

describe("R01 guided workbook", () => {
  it("ships the exact machine-readable sheets and no fabricated data rows", () => {
    const workbook = XLSX.read(buildReceivablesR01Template("pt-BR"), {type: "array"});
    expect(workbook.SheetNames).toEqual(["LEIA-ME", "CEDENTE", "CARTEIRA", "RECEBIMENTOS", "CONTABIL", "POLITICA", "ESTRUTURA"]);
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.CARTEIRA!, {header: 1});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("NUM_TITULO");
    expect(rows[0]).toContain("LASTRO_VERIFICADO");
    expect(rows[0]).toContain("DILUICAO_PERIODO");
    const policyRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.POLITICA!, {header: 1});
    expect(policyRows[0]).toEqual(["CAMPO", "VALOR", "FORMATO"]);
    expect(policyRows.slice(1).map((row) => row[0])).toContain("MAX_CONCENTRACAO_SACADO");
    expect(policyRows.slice(1).every((row) => !row[1])).toBe(true);
    const structureRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.ESTRUTURA!, {header: 1});
    expect(structureRows.slice(1).map((row) => row[0])).toContain("WATERFALL_JUROS_SENIOR");
  });

  it("warns explicitly that missing information must not be entered as zero", () => {
    const workbook = XLSX.read(buildReceivablesR01Template("en-US"), {type: "array"});
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["LEIA-ME"]!, {header: 1});
    expect(rows.flat().join(" ")).toContain("never enter zero merely because data is missing");
  });
});
