import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";

import {buildReceivablesR01Template} from "./r01-template";

describe("R01 guided workbook", () => {
  it("ships the exact machine-readable sheets and no fabricated data rows", () => {
    const workbook = XLSX.read(buildReceivablesR01Template("pt-BR"), {type: "array"});
    expect(workbook.SheetNames).toEqual(["LEIA-ME", "CEDENTE", "CARTEIRA", "RECEBIMENTOS", "CONTABIL"]);
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.CARTEIRA!, {header: 1});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("NUM_TITULO");
    expect(rows[0]).toContain("LASTRO_VERIFICADO");
    expect(rows[0]).toContain("DILUICAO_PERIODO");
  });

  it("warns explicitly that missing information must not be entered as zero", () => {
    const workbook = XLSX.read(buildReceivablesR01Template("en-US"), {type: "array"});
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["LEIA-ME"]!, {header: 1});
    expect(rows.flat().join(" ")).toContain("never enter zero merely because data is missing");
  });
});
