import {existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {redeHorizonteRequiredFiles} from "@offroad/testing-fixtures";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute paths of the eight synthetic Rede Horizonte files versioned in `packages/testing-fixtures`. */
export const dataRoomDirectory = join(here, "..", "..", "..", "..", "packages", "testing-fixtures", "assets", "rede-horizonte");

export const dataRoomFiles = redeHorizonteRequiredFiles.map((name) => join(dataRoomDirectory, name));

export function assertDataRoomPresent() {
  const missing = dataRoomFiles.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`Synthetic data room files missing: ${missing.join(", ")}`);
}

/** Expected review numbers for the full package (see packages/testing-fixtures/src/document-intake.ts). */
export const dataRoomExpectations = {
  documents: redeHorizonteRequiredFiles.length,
  candidates: 34,
  openIssues: 8,
  /** Primary candidates with confidence ≥ 0.95 accepted by the "high confidence" action. */
  acceptedAfterBulkAccept: 33,
} as const;
