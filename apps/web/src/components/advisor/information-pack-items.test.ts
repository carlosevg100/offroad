import {describe, expect, it} from "vitest";

import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";
import {
  houseTemplateIdentity,
  informationPackItems,
  informationPackItemsMatch,
} from "./information-pack-items";

const sessionId = "40000000-0000-4000-8000-000000000001";
const fingerprint = "a".repeat(64);

function governed(overrides: Partial<GovernedMaterialPackage> = {}): GovernedMaterialPackage {
  return {
    artifactFingerprint: fingerprint,
    issuedOn: "2026-09-11",
    materials: [
      {kind: "teaser", title: {pt: "Resumo", en: "Summary"}, blocks: [], dependsOn: []},
      {kind: "term_sheet", title: {pt: "Termos", en: "Terms"}, blocks: [], dependsOn: []},
    ] as GovernedMaterialPackage["materials"],
    financialModel: null,
    plannedArtifacts: ["teaser", "indicative_term_sheet"],
    ...overrides,
  };
}

describe("information pack items", () => {
  it("records one row per exported file with the artifact fingerprint and the template identity", () => {
    const items = informationPackItems({
      governed: governed(),
      locale: "pt-BR",
      sessionId,
      sourceResultIds: ["b".repeat(64), "b".repeat(64), "c".repeat(64)],
      template: houseTemplateIdentity,
      titles: {teaser: "Resumo da operacao"},
    });

    expect(items.map((item) => `${item.deliverableId}:${item.format}`)).toEqual([
      "teaser:pdf", "teaser:docx", "teaser:pptx",
      "indicative_term_sheet:pdf", "indicative_term_sheet:docx",
    ]);
    expect(items.every((item) => item.artifactFingerprint === fingerprint)).toBe(true);
    expect(items.every((item) => item.templateKey === "offroad-house" && item.templateOrigin === "offroad_house")).toBe(true);
    expect(items.every((item) => item.templateFingerprint === undefined)).toBe(true);
    expect(items[0]?.sourceResultIds).toEqual(["b".repeat(64), "c".repeat(64)]);
    expect(items[0]?.title).toBe("Resumo da operacao");
    expect(items[3]?.title).toBe("indicative_term_sheet");
  });

  it("carries the client template fingerprint when the project bound its own identity", () => {
    const items = informationPackItems({
      governed: governed({plannedArtifacts: ["teaser"]}),
      locale: "en-US",
      sessionId,
      sourceResultIds: [],
      template: {key: "client-identity", version: "2026.09.11-v1", origin: "client_supplied", fingerprint: "d".repeat(64)},
      titles: {},
    });
    expect(items.every((item) => item.templateFingerprint === "d".repeat(64))).toBe(true);
  });

  it("never proposes a file the approved package does not have", () => {
    const items = informationPackItems({
      governed: governed({materials: [] as GovernedMaterialPackage["materials"]}),
      locale: "pt-BR",
      sessionId,
      sourceResultIds: [],
      template: houseTemplateIdentity,
      titles: {},
    });
    expect(items).toEqual([]);
  });

  it("detects a pack whose exported files changed", () => {
    const base = informationPackItems({
      governed: governed(),
      locale: "pt-BR",
      sessionId,
      sourceResultIds: [],
      template: houseTemplateIdentity,
      titles: {},
    });
    const changed = informationPackItems({
      governed: governed({artifactFingerprint: "e".repeat(64)}),
      locale: "pt-BR",
      sessionId,
      sourceResultIds: [],
      template: houseTemplateIdentity,
      titles: {},
    });
    expect(informationPackItemsMatch(base, base)).toBe(true);
    expect(informationPackItemsMatch(base, changed)).toBe(false);
    expect(informationPackItemsMatch(base, base.slice(1))).toBe(false);
  });
});
