import {describe, expect, it} from "vitest";
import type {DocumentProfile} from "@offroad/document-classification";
import type {ParseResult} from "@offroad/document-parsers";
import {genericExtractionPolicy, maxGenericTabularCells} from "./extraction-policy";

const profile: DocumentProfile = {
  document_kind: "customer_concentration",
  information_class: "management",
  evidence_rank: 5,
  confidence: 0.95,
};

function parsed(kind: "spreadsheet" | "csv" | "pdf", cells: number): ParseResult {
  return {
    layer: {
      documentId: "11111111-1111-4111-8111-111111111111",
      documentVersion: 1,
      kind,
      scaleDeclarations: [],
      ...(kind === "pdf"
        ? {pages: [{n: 1, blocks: [], tables: [], scanned: false}]}
        : {
            sheets: [{
              name: "base",
              hidden: false,
              cells: Array.from({length: cells}, (_, index) => ({
                ref: `A${index + 1}`,
                v: index + 1,
                t: "n" as const,
              })),
              tables: [],
            }],
          }),
      stats: {},
    },
    parserVersions: {},
    warnings: [],
    detected: {kind, mime: kind === "pdf" ? "application/pdf" : "text/csv", extension: kind === "pdf" ? "pdf" : "csv", mismatch: false},
  };
}

describe("generic extraction policy", () => {
  it("keeps ordinary workbooks on semantic extraction", () => {
    expect(genericExtractionPolicy(parsed("spreadsheet", 120), profile)).toMatchObject({
      mode: "model",
      cellCount: 120,
    });
  });

  it("routes operational tapes to deterministic analysis before model fan-out", () => {
    expect(genericExtractionPolicy(parsed("csv", maxGenericTabularCells + 1), profile)).toEqual({
      mode: "deterministic_only",
      reason: "high_volume_tabular_dataset",
      cellCount: maxGenericTabularCells + 1,
      limit: maxGenericTabularCells,
      documentKind: "customer_concentration",
    });
  });

  it("does not suppress long narrative documents based on tabular limits", () => {
    expect(genericExtractionPolicy(parsed("pdf", maxGenericTabularCells + 1), profile).mode).toBe("model");
  });
});
