import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {institutionalInputFixture} from "./institutional-input.fixture";
import {prepareInstitutionalModelInput} from "./institutional-input";
import {institutionalFormulaSheets} from "./institutional-formula-workbook";
import {toGovernedXlsxBuffer} from "./governed-workbook";

const input = () => prepareInstitutionalModelInput(institutionalInputFixture()).input!;
const metadata = {title:"Synthetic roundtrip bindings", asOfDate:"2026-09-10", currency:"BRL" as const, scale:"units" as const, classification:"confidential" as const, artifactClass:"institutional_editable" as const};
describe("institutional roundtrip input identities", () => {
 it("keeps historical sheet construction unchanged unless roundtrip is requested", () => {
  const original = institutionalFormulaSheets(input(), 0, "en");
  expect(original.flatMap(s => s.rows.flatMap(r => r.cells)).every(c => c.roundtrip === undefined)).toBe(true);
  const bound = institutionalFormulaSheets(input(), 0, "en", "scenario-1");
  expect(bound.map(s => s.rows.map(r => r.cells.map(({roundtrip: _binding, ...cell}) => cell)))).toEqual(original.map(s => s.rows.map(r => r.cells)));
 });
 it.each(["pt", "en"] as const)("retains unique defined names through governed packaging in %s", async lang => {
  const prepared = input();
  const sheets = [...institutionalFormulaSheets(prepared, 0, lang, "scenario-1"), ...institutionalFormulaSheets(prepared, 1, lang, "scenario-2")];
  const model = {sheets, periods:[...prepared.assumptionBook.periods], deskAssumptions:[]};
  const a = await toGovernedXlsxBuffer(model, lang, metadata), b = await toGovernedXlsxBuffer(model, lang, metadata);
  expect(a.bytes).toEqual(b.bytes);
  const wb = XLSX.read(a.bytes, {type:"array"});
  const names = wb.Workbook?.Names ?? [];
  const expected = sheets.flatMap(s => s.rows.flatMap(r => r.cells.flatMap(c => c.roundtrip ? [c.roundtrip] : [])));
  expect(names).toHaveLength(expected.length);
  expect(new Set(names.map(n => n.Name)).size).toBe(names.length);
  for (const cell of expected) expect(names.some(n => n.Name === cell.name)).toBe(true);
  const inputs = expected.filter(b => b.role === "input");
  expect(inputs.length).toBeGreaterThan(0);
  for (const binding of inputs) expect(prepared.assumptionBook.assumptions.some(a => a.id === binding.assumptionId && a.editable && binding.period! in a.values)).toBe(true);
  const xml = await (await JSZip.loadAsync(a.bytes)).file("xl/workbook.xml")!.async("string");
  expect(xml).toContain("<definedNames>");expect(xml).toContain('fullCalcOnLoad="1"');
 });
});
