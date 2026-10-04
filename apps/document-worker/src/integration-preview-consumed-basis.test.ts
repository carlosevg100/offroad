import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {case01,preview} from "@offroad/credit-playbook";
import {compilePreviewConsumedBasis,capturePreviewActualInput,compilePreviewBoundaryBasis} from "./integration-preview-consumed-basis";
const corpus=JSON.parse(readFileSync(new URL("../../../docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json",import.meta.url),"utf8"));
const composition="prepare_meeting"as const;
function actualInputs(){const evidence=case01.case01Evidence()as Record<string,unknown>;return Object.fromEntries(preview.previewStepsForComposition(composition).map(s=>[s.taskId,evidence[s.methodId]??{}]));}
describe("actual preview consumed basis / reconstruction only",()=>{
 it("captures Map entries and their economic bodies instead of erasing them as an empty object",()=>{
  const first=capturePreviewActualInput(new Map([["S10",{value:"0.15"}]])),second=capturePreviewActualInput(new Map([["S10",{value:"0.16"}]]));expect(first).not.toEqual({});expect(first).not.toEqual(second);expect(()=>capturePreviewActualInput(undefined)).toThrow("input_not_json");
 });
 it("distinguishes a pre-dispatch pin from the final complete input closure",()=>{
  const pin=compilePreviewBoundaryBasis({boundary:"questions",contextFingerprint:"a".repeat(64),sourceBasisFingerprint:"b".repeat(64),predecessorInputs:{C02:{definition:"coverage"}},modelInputFingerprint:"c".repeat(64)});expect(pin.schemaVersion).toBe("capital-preview-boundary-basis.v1");expect(Object.keys(pin.predecessorInputs as object)).toEqual(["C02"]);
 });
 it("maps the real financial inputs to a strict subset, resolving PDF anchors to pinned extraction bytes",()=>{
  const result=compilePreviewConsumedBasis({composition,inputs:actualInputs(),corpusManifest:corpus});
  expect(result.entries.length).toBeLessThan(corpus.entries.length);
  expect(result.anchors.some(a=>a.document.endsWith(".pdf")&&a.basis.kind==="corpus"&&a.basis.file.endsWith(".txt"))).toBe(true);
  expect(result.entries.some(e=>e.file==="cvm_ipe_2026_camil.csv")).toBe(false);
 });
 it("does not license hypothetical calendars or frozen calculated exit quotes",()=>{
  const result=compilePreviewConsumedBasis({composition,inputs:actualInputs(),corpusManifest:corpus});
  for(const document of["fixture_hipotetico.md","calendario_anbima_2026.csv","exit-costs-gc01.json"]){
   const matches=result.anchors.filter(a=>a.document===document);expect(matches.length).toBeGreaterThan(0);expect(matches.every(a=>a.basis.kind==="captured_input")).toBe(true);
  }
 });
 it("pins complete actual input bodies and rejects missing or foreign steps",()=>{
  const inputs=actualInputs(),baseline=compilePreviewConsumedBasis({composition,inputs,corpusManifest:corpus});
  const key=Object.keys(inputs)[0]!;expect(compilePreviewConsumedBasis({composition,inputs:{...inputs,[key]:{...inputs[key]as object,changedPremise:"0.15"}},corpusManifest:corpus}).fingerprint).not.toBe(baseline.fingerprint);
  const incomplete={...inputs};delete incomplete[key];expect(()=>compilePreviewConsumedBasis({composition,inputs:incomplete,corpusManifest:corpus})).toThrow("actual_inputs_incomplete");
  expect(()=>compilePreviewConsumedBasis({composition,inputs:{...inputs,FOREIGN:{}},corpusManifest:corpus})).toThrow("actual_inputs_incomplete");
 });
 it("fails closed on new unmapped anchors rather than guessing rights or extraction filenames",()=>{
  const inputs=actualInputs(),key=Object.keys(inputs)[0]!;
  expect(()=>compilePreviewConsumedBasis({composition,inputs:{...inputs,[key]:{document:"new-unpublished.pdf"}},corpusManifest:corpus})).toThrow("anchor_unmapped");
 });
});
