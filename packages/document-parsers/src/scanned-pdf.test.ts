import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import type {OcrEngine} from "./capabilities";
import {parseDocument} from "./index";

/** An engine that records what it was handed and answers one line. */
function recordingEngine() {
  const seen: number[] = [];
  const engine: OcrEngine = {
    name: "fake",
    version: "1",
    languages: ["por"],
    recognizeImage: async () => ({blocks: [{text: "imagem", confidence: 0.9, bbox: [0, 0, 1, 1]}], confidence: 0.9}),
    recognizePdfPage: async ({bytes}) => {
      seen.push(bytes.byteLength);
      return {blocks: [{text: "Receita líquida de vendas 191.200", confidence: 0.92, bbox: [0, 0, 10, 10]}], confidence: 0.92};
    },
  };
  return {engine, seen};
}

describe("a scanned PDF with an OCR engine", () => {
  it("hands the engine the bytes after the text parse has run, and keeps the page's text", async () => {
    const file = join(__dirname, "..", "..", "testing-fixtures", "assets", "fakeco-scan", "02_Demonstracoes_Auditadas_2023_2025_digitalizado.pdf");
    const bytes = new Uint8Array(readFileSync(file));
    // pdf.js detaches the caller's buffer; the length is taken before, which is the point.
    const length = bytes.byteLength;
    const {engine, seen} = recordingEngine();
    const parsed = await parseDocument({bytes, documentId: "scan", documentVersion: 1, fileName: "scan.pdf", localeHint: "pt-BR"}, {ocr: engine});
    expect(seen).toEqual([length]);
    const page = parsed.layer.pages?.[0];
    expect(page?.scanned).toBe(true);
    expect(page?.blocks.map((block) => block.text).join(" ")).toContain("191.200");
    expect(parsed.warnings.some((warning) => warning.message.includes("OCR failed"))).toBe(false);
  });
});
