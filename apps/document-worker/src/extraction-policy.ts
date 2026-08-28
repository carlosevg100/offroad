import type {DocumentProfile} from "@offroad/document-classification";
import type {ParseResult} from "@offroad/document-parsers";

/**
 * Generic field extraction is designed for financial statements, contracts and narrative
 * materials. It is not a row engine for operational tapes.
 *
 * Receivables tapes, agings and customer masters are already captured in full by the immutable
 * document layer and consumed by the deterministic receivables engine. Sending every cell to a
 * model would make the exact source of truth slower, more expensive and less reliable without
 * adding information. The production Vertentes acceptance case measured the failure mode:
 * 11,516 cells became 129 extraction windows and 130 model calls for one workbook.
 */

export const maxGenericTabularCells = 5_000;

export type GenericExtractionPolicy =
  | {
      mode: "model";
      reason: "within_semantic_extraction_envelope";
      cellCount: number;
      documentKind: string;
    }
  | {
      mode: "deterministic_only";
      reason: "high_volume_tabular_dataset";
      cellCount: number;
      limit: number;
      documentKind: string;
    };

export function genericExtractionPolicy(
  parsed: ParseResult,
  profile: DocumentProfile,
): GenericExtractionPolicy {
  const tabular = parsed.layer.kind === "spreadsheet" || parsed.layer.kind === "csv";
  const cellCount = (parsed.layer.sheets ?? []).reduce(
    (total, sheet) => total + sheet.cells.length,
    0,
  );

  if (tabular && cellCount > maxGenericTabularCells) {
    return {
      mode: "deterministic_only",
      reason: "high_volume_tabular_dataset",
      cellCount,
      limit: maxGenericTabularCells,
      documentKind: profile.document_kind,
    };
  }

  return {
    mode: "model",
    reason: "within_semantic_extraction_envelope",
    cellCount,
    documentKind: profile.document_kind,
  };
}
