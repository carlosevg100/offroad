import {describe, expect, it} from "vitest";

import {createPublicCompanyMemoryRecord, publicCompanyKey, selectFreshPublicCompanyMemory} from "./company-memory";

const source = {
  provider: "official" as const,
  topic: "identity" as const,
  title: "Camil — Relações com investidores",
  url: "https://ri.camil.com.br/resultados?utm_source=test",
  snippet: "Fonte pública oficial.",
  publishedAt: "2026-08-01",
  retrievedAt: "2026-09-03T12:00:00.000Z",
  contentHash: "a".repeat(64),
};

describe("public company memory", () => {
  it("keys only the normalized public identity", () => {
    expect(publicCompanyKey({legalName: "Camil Alimentos", geography: "Brasil"}))
      .toBe(publicCompanyKey({legalName: "  CÁMIL   ALIMENTOS ", geography: "BRASIL"}));
  });

  it("compounds public sources and strips duplicate tracking URLs", () => {
    const first = createPublicCompanyMemoryRecord({
      subject: {legalName: "Camil Alimentos", geography: "Brasil"},
      queryIds: ["1".repeat(64)], sources: [source], storedAt: new Date("2026-09-03T12:00:00.000Z"),
    });
    const second = createPublicCompanyMemoryRecord({
      subject: {legalName: "Camil Alimentos", geography: "Brasil"},
      queryIds: ["2".repeat(64)],
      sources: [{...source, url: "https://ri.camil.com.br/resultados", contentHash: "b".repeat(64)}],
      previous: first, storedAt: new Date("2026-09-03T13:00:00.000Z"),
    });
    expect(second.queryIds).toHaveLength(2);
    expect(second.sources).toHaveLength(1);
    expect(second.sources[0]?.contentHash).toBe("b".repeat(64));
  });

  it("rejects expired or mismatched company material", () => {
    const record = createPublicCompanyMemoryRecord({
      subject: {legalName: "Camil Alimentos", geography: "Brasil"},
      queryIds: ["1".repeat(64)], sources: [source], storedAt: new Date("2026-09-03T12:00:00.000Z"), ttlHours: 1,
    });
    expect(selectFreshPublicCompanyMemory({subject: record.subject, record, now: new Date("2026-09-03T12:30:00.000Z")})).not.toBeNull();
    expect(selectFreshPublicCompanyMemory({subject: record.subject, record, now: new Date("2026-09-03T14:00:00.000Z")})).toBeNull();
    expect(selectFreshPublicCompanyMemory({subject: {legalName: "Outra Companhia", geography: "Brasil"}, record, now: new Date("2026-09-03T12:30:00.000Z")})).toBeNull();
  });
});
