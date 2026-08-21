import {describe, expect, it} from "vitest";
import {z} from "zod";

import {documentLayerSchema, type DocumentLayer, type DocumentProfile} from "@offroad/document-intelligence";
import type {ModelGateway} from "@offroad/model-gateway";

import {extractDocument} from "./extract";

const wide: DocumentLayer = documentLayerSchema.parse({
  documentId: "doc-wide",
  documentVersion: 1,
  kind: "pdf",
  parserVersion: "test",
  scaleDeclarations: [],
  stats: {},
  pages: [
    {
      n: 1,
      scanned: false,
      blocks: [],
      tables: [
        {
          id: "p1.t1",
          header: ["Credor", "Saldo"],
          rows: Array.from({length: 12}, (_, rowIndex) => ({
            id: `p1.t1.r${rowIndex + 1}`,
            cells: [
              {id: `p1.t1.r${rowIndex + 1}.c1`, text: `Banco número ${rowIndex + 1} com um nome comprido para encher a linha`},
              {id: `p1.t1.r${rowIndex + 1}.c2`, text: `${(rowIndex + 1) * 1_000_000}`},
            ],
          })),
        },
      ],
    },
  ],
});

const profile: DocumentProfile = {
  documentId: "doc-wide",
  kind: "debt_schedule",
  informationClass: "management",
  evidenceRank: 5,
  entityName: "Empresa",
  language: "pt",
  quality: {alerts: []},
  confidence: 1,
};

/** Answers each pass after a delay that shrinks with the call number, so later calls finish first. */
function slowReverseGateway() {
  let started = 0;
  let inFlight = 0;
  let peak = 0;
  const gateway = {
    async complete<TSchema extends z.ZodType>(request: {schema: TSchema; metadata?: Record<string, string>}) {
      const call = started++;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, 40 - call * 3)));
      inFlight -= 1;
      const output = request.schema.parse({candidates: [], absent_fields: [], document_alerts: [`alerta ${request.metadata?.chunk}`]});
      return {
        output, provider: "anthropic", model: "claude-sonnet-5", effort: "medium",
        usage: {inputTokens: 10, outputTokens: 5}, costUsd: 0.001, latencyMs: 1, stopReason: "stop",
        usedFallback: false, fromCassette: false, attempts: [],
      } as never;
    },
    spent: () => ({costUsd: 0, calls: 0}),
  } as unknown as ModelGateway;
  return {gateway, peak: () => peak, started: () => started};
}

describe("passes in flight together", () => {
  it("runs up to the limit at once and still merges in document order", async () => {
    const {gateway, peak, started} = slowReverseGateway();
    const result = await extractDocument({layer: wide, profile, fileName: "mapa.pdf", gateway, render: {maxChars: 400}, concurrency: 4});

    expect(result.chunks.total).toBeGreaterThan(1);
    expect(peak()).toBeGreaterThan(1);
    expect(peak()).toBeLessThanOrEqual(4);
    expect(result.usage.calls).toBe(started());
    // Alerts come only from whole-document chunks, and arrive in chunk order even though the
    // later calls answered first: what the lanes did is invisible in the result.
    const chunkAlerts = result.alerts.filter((alert) => !alert.includes("row:"));
    expect(chunkAlerts.length).toBeGreaterThan(1);
    expect(chunkAlerts).toEqual(chunkAlerts.map((_, index) => `alerta ${index + 1}`));
  });

  it("is the same reading with one lane", async () => {
    const four = await extractDocument({layer: wide, profile, fileName: "mapa.pdf", gateway: slowReverseGateway().gateway, render: {maxChars: 400}, concurrency: 4});
    const one = await extractDocument({layer: wide, profile, fileName: "mapa.pdf", gateway: slowReverseGateway().gateway, render: {maxChars: 400}, concurrency: 1});
    expect(four.alerts).toEqual(one.alerts);
    expect(four.usage.calls).toBe(one.usage.calls);
  });
});
