import type {SourcePack, SourcePackEntry} from "./source-pack";
import {sha256Hex} from "./source-pack";

/** An in-memory pack for tests: bytes keyed by entry id, manifest derived from them. */
export function inMemorySourcePack(input: {
  caseId: string;
  files: Array<{
    id: string;
    topic: SourcePackEntry["topic"];
    url: string;
    bytes: string;
    asOfDate?: string;
    licence?: SourcePackEntry["licence"];
    country?: string;
  }>;
}): {pack: SourcePack; read: (entry: SourcePackEntry) => Promise<Uint8Array>; bytes: Map<string, Uint8Array>} {
  const bytes = new Map<string, Uint8Array>();
  const entries: SourcePackEntry[] = input.files.map((file) => {
    const encoded = new TextEncoder().encode(file.bytes);
    const licence = file.licence ?? {policy: "public_reusable" as const};
    const retainable = licence.policy === "public_reusable" || licence.policy === "licensed_reusable_within_contract";
    if (retainable) bytes.set(file.id, encoded);
    return {
      id: file.id,
      topic: file.topic,
      title: file.id,
      url: file.url,
      finalUrl: file.url,
      acquiredAt: "2026-09-04T12:00:00.000Z",
      asOfDate: file.asOfDate ?? "2026-06-30",
      version: "1",
      sha256: sha256Hex(encoded),
      byteSize: encoded.byteLength,
      contentType: "text/plain",
      publisherSourceId: null,
      licence,
      path: retainable ? `${file.id}.txt` : null,
      ...(file.country ? {country: file.country} : {}),
    };
  });
  const pack: SourcePack = {
    schemaVersion: "source-pack.v1",
    caseId: input.caseId,
    subject: {legalName: "Camil Alimentos S.A."},
    frozenAt: "2026-09-04T12:00:00.000Z",
    entries,
  };
  const read = async (entry: SourcePackEntry) => {
    const found = bytes.get(entry.id);
    if (!found) throw new Error(`no bytes for ${entry.id}`);
    return found;
  };
  return {pack, read, bytes};
}
