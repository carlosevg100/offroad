import {expect, it} from "vitest";

import type {OcrLine, OcrResult} from "./capabilities";
import {pagesFromOcr, parseImageWithOcr} from "./ocr";

const line = (text: string, confidence: number, y: number): OcrLine => ({text, confidence, bbox: [0, y, 300, y + 12], words: []});

it("does not make a low-confidence line quotable inside a high-confidence block", () => {
  const result: OcrResult = {confidence: 0.8, blocks: [{confidence: 0.8, text: "Receita 9.400.000 Caixa 1.000.000", lines: [
    line("Receita 9.400.000", 0.2, 0), line("Caixa 1.000.000", 0.98, 20),
  ]}]};
  const output = pagesFromOcr([{pageNumber: 1, result}]);
  expect(output.pages[0]?.blocks.map((block) => block.text)).toEqual(["Caixa 1.000.000"]);
  expect(output.pages[0]?.scanned).toBe(true);
  expect(output.warnings.some((warning) => warning.code === "parse_error" && warning.where === "p1")).toBe(true);
});

it("keeps an all-refused block empty rather than falling back to its unfiltered text", () => {
  const result: OcrResult = {confidence: 0.8, blocks: [{confidence: 0.8, text: "Dívida 9.400.000", lines: [line("Dívida 9.400.000", 0.2, 0)]}]};
  const output = pagesFromOcr([{pageNumber: 1, result}]);
  expect(output.pages[0]?.blocks).toEqual([]);
  expect(output.warnings.some((warning) => warning.code === "no_text")).toBe(true);
});

it("does not concatenate text across a refused line", () => {
  const result: OcrResult = {confidence: 0.8, blocks: [{confidence: 0.8, text: "Trecho anterior não trecho posterior", lines: [
    line("Trecho anterior", 0.98, 0), line("não", 0.2, 20), line("trecho posterior", 0.98, 40),
  ]}]};
  const output = pagesFromOcr([{pageNumber: 2, result}]);
  expect(output.pages[0]?.blocks.map((block) => block.text)).toEqual(["Trecho anterior", "trecho posterior"]);
  expect(output.pages[0]?.blocks[0]?.bbox).toEqual([0, 0, 300, 12]);
  expect(output.pages[0]?.blocks[1]?.bbox).toEqual([0, 40, 300, 52]);
  expect(output.warnings.some((warning) => warning.where === "p2")).toBe(true);
});

it("does not derive a scale from a refused OCR line", () => {
  const result: OcrResult = {confidence: 0.8, blocks: [{confidence: 0.8, text: "Em milhões de reais Em milhares de reais", lines: [
    line("Em milhões de reais", 0.2, 0), line("Em milhares de reais", 0.98, 20),
  ]}]};
  expect(pagesFromOcr([{pageNumber: 1, result}]).scaleDeclarations.map((scale) => scale.scale)).toEqual([1000]);
});

it("counts a table-only OCR image as readable and retains the scale declared in its header", async () => {
  const tableLine = (left: string, right: string, y: number): OcrLine => ({text: `${left} ${right}`, confidence: 0.98, bbox: [0, y, 400, y + 12], words: [
    {text: left, confidence: 0.98, bbox: [0, y, 70, y + 12]}, {text: right, confidence: 0.98, bbox: [200, y, 400, y + 12]},
  ]});
  const result: OcrResult = {confidence: 0.98, blocks: [{confidence: 0.98, text: "table", lines: [
    tableLine("Descrição", "Em milhares de reais", 0), tableLine("Caixa", "1.000", 20), tableLine("Dívida", "9.400", 40), tableLine("Clientes", "10.000", 60),
  ]}]};
  const parsed = await parseImageWithOcr({bytes: new Uint8Array(), documentId: "synthetic-image", documentVersion: 1, mime: "image/png", extension: "png", mismatch: false},
    {name: "synthetic", version: "test", languages: ["por"], recognizeImage: async () => result});
  expect(parsed.layer.pages?.[0]?.tables).toHaveLength(1);
  expect(parsed.layer.pages?.[0]?.blocks).toEqual([]);
  expect(parsed.warnings.some((warning) => warning.code === "no_text")).toBe(false);
  expect(parsed.warnings.some((warning) => warning.message.includes("every value needs review"))).toBe(true);
  expect(parsed.layer.scaleDeclarations.map((scale) => scale.scale)).toEqual([1000]);
  expect(parsed.layer.stats.estimatedTokens).toBeGreaterThan(0);
});
