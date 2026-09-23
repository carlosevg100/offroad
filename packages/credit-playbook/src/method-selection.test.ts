import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

import {
  MethodSelectionRefusal,
  capitalStructureMethodId,
  methodSelectionSource,
  methodSelectionVersion,
  receivablesPoolMethodId,
  selectMethod,
  structuringSituations,
} from "./method-selection";
import {specialistMethodRuntimeManifest} from "./method-runtime-manifest";
import {loadMethodLibrary} from "./procedure-markdown";

const here = import.meta.dirname;
const source = readFileSync(resolve(here, "../knowledge/procedures", methodSelectionSource.procedurePath), "utf8");
const capitalVersion = "2026.09.21-v4";

/** The rows of the R3 table exactly as the procedure prints them. */
function r3Rows(): Array<{label: string; structuringMethods: string; misleadingAlone: string}> {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `## ${methodSelectionSource.section}`);
  expect(start).toBeGreaterThan(0);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("|")) rows.push(line.split("|").slice(1, -1).map((cell) => cell.trim()));
  }
  const [header, separator, ...body] = rows;
  expect(header).toEqual(["Situação", "Métodos que devem estruturar a análise", "Método que isoladamente engana"]);
  expect(separator?.every((cell) => /^-+$/.test(cell))).toBe(true);
  return body.map(([label, structuringMethods, misleadingAlone]) => ({label: label!, structuringMethods: structuringMethods!, misleadingAlone: misleadingAlone!}));
}

describe("R3 situation catalogue", () => {
  it("is a literal copy of the R3 table, row by row", () => {
    const rows = r3Rows();
    expect(rows).toHaveLength(12);
    expect(structuringSituations.map(({label, structuringMethods, misleadingAlone}) => ({label, structuringMethods, misleadingAlone}))).toEqual(rows);
    for (const situation of structuringSituations) {
      for (const text of [situation.label, situation.structuringMethods, situation.misleadingAlone]) expect(source).toContain(text);
    }
  });

  it("has non-empty unique labels and stable kebab-case ids", () => {
    const labels = structuringSituations.map((situation) => situation.label);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    const ids = structuringSituations.map((situation) => situation.situationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it("serves every situation by at least one method that exists in the procedure library", () => {
    const library = loadMethodLibrary(resolve(here, "../knowledge/procedures"));
    const methodIds = new Set(library.methods.map((method) => method.procedure.id));
    for (const situation of structuringSituations) {
      expect(situation.servedBy.length, situation.situationId).toBeGreaterThan(0);
      for (const methodId of situation.servedBy) expect(methodIds.has(methodId), `${situation.situationId} -> ${methodId}`).toBe(true);
    }
  });

  it("binds the receivables situation to the method behind task R01 and the rest to the capital procedure", () => {
    const receivables = structuringSituations.find((situation) => situation.situationId === "receivables")!;
    expect(receivables.servedBy).toEqual([receivablesPoolMethodId]);
    const bound = specialistMethodRuntimeManifest.find((method) => method.procedure.id === receivablesPoolMethodId);
    expect(bound?.taskIds).toContain("R01");
    for (const situation of structuringSituations) {
      if (situation.situationId !== "receivables") expect(situation.servedBy, situation.situationId).toEqual([capitalStructureMethodId]);
    }
  });
});

describe("selectMethod", () => {
  it("records a selection served by the method, with the literal misleading methods", () => {
    const record = selectMethod({situationIds: ["seasonal-working-capital", "near-covenant"], methodId: capitalStructureMethodId, methodVersion: capitalVersion});
    expect(record).toEqual({
      selectionVersion: methodSelectionVersion,
      situations: [
        {situationId: "seasonal-working-capital", label: "Giro sazonal", servedByMethod: true, misleadingAlone: "EBITDA ou DSCR anual que esconde o mês de falta de caixa."},
        {situationId: "near-covenant", label: "Próxima de covenant", servedByMethod: true, misleadingAlone: "Preço como critério principal."},
      ],
      methodId: capitalStructureMethodId,
      methodVersion: capitalVersion,
      misleadingAlone: ["EBITDA ou DSCR anual que esconde o mês de falta de caixa.", "Preço como critério principal."],
      reasonCodes: ["all_situations_served", "decision_crosses_situations"],
    });
    expect(selectMethod({situationIds: ["receivables"], methodId: receivablesPoolMethodId, methodVersion: "2026.09.06-v1"})).toMatchObject({
      situations: [{situationId: "receivables", servedByMethod: true}],
      reasonCodes: ["all_situations_served"],
    });
  });

  it("keeps a partially served selection and marks the situations the method does not serve", () => {
    const record = selectMethod({situationIds: ["refinancing", "receivables"], methodId: capitalStructureMethodId, methodVersion: capitalVersion});
    expect(record.situations.map((situation) => [situation.situationId, situation.servedByMethod])).toEqual([["refinancing", true], ["receivables", false]]);
    expect(record.reasonCodes).toEqual(["partial_coverage", "decision_crosses_situations"]);
  });

  it("refuses a method that serves none of the selected situations", () => {
    const refusal = () => selectMethod({situationIds: ["receivables"], methodId: capitalStructureMethodId, methodVersion: capitalVersion});
    expect(refusal).toThrow(MethodSelectionRefusal);
    expect(refusal).toThrow("method_not_applicable_for_situation");
    try {
      refusal();
    } catch (error) {
      expect(error).toBeInstanceOf(MethodSelectionRefusal);
      expect((error as MethodSelectionRefusal).code).toBe("method_not_applicable_for_situation");
      expect((error as MethodSelectionRefusal).situationIds).toEqual(["receivables"]);
    }
  });

  it("refuses an empty selection", () => {
    const refusal = () => selectMethod({situationIds: [], methodId: capitalStructureMethodId, methodVersion: capitalVersion});
    expect(refusal).toThrow(MethodSelectionRefusal);
    expect(refusal).toThrow("situation_required");
  });

  it("refuses an unknown situation id and names it", () => {
    const refusal = () => selectMethod({situationIds: ["near-covenant", "leveraged-buyout"], methodId: capitalStructureMethodId, methodVersion: capitalVersion});
    expect(refusal).toThrow(MethodSelectionRefusal);
    expect(refusal).toThrow("situation_unknown: unknown situation leveraged-buyout");
  });

  it("refuses a malformed method id or version before recording anything", () => {
    for (const input of [
      {situationIds: ["near-covenant"], methodId: "", methodVersion: capitalVersion},
      {situationIds: ["near-covenant"], methodId: capitalStructureMethodId, methodVersion: "v4"},
    ]) {
      expect(() => selectMethod(input)).toThrow("input_invalid");
    }
  });

  it("is deterministic and evaluates a repeated situation once", () => {
    const input = {situationIds: ["holding-group", "holding-group", "refinancing"], methodId: capitalStructureMethodId, methodVersion: capitalVersion};
    const record = selectMethod(input);
    expect(record.situations.map((situation) => situation.situationId)).toEqual(["holding-group", "refinancing"]);
    expect(selectMethod(input)).toEqual(record);
  });
});
