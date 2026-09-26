import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

import {
  applyPresentationStructure,
  moveStructureSection,
  offroadHousePresentationStructure,
  presentationStructureFromStored,
  presentationStructureIssues,
  presentationStructureToStored,
  type PresentationStructure,
} from "./presentation-structure";

const content = (overrides: Partial<Record<"text" | "number" | "table" | "chart" | "source_list", boolean>> = {}) =>
  ({text: false, number: false, table: false, chart: false, source_list: false, ...overrides});

describe("presentation structure", () => {
  it("is the house structure the migration default embeds, one source for the database and the web", async () => {
    expect(presentationStructureIssues(offroadHousePresentationStructure)).toEqual([]);
    expect(offroadHousePresentationStructure.sections.map((section) => section.key)).toEqual([
      "decision-headline", "maturity-wall", "analytical-direction", "open-gaps", "source-register",
    ]);
    const migration = await readFile(new URL("../../../supabase/migrations/20260927130000_presentation_template_versions.sql", import.meta.url), "utf8");
    const literal = migration.split("$house$")[1];
    expect(literal, "the migration carries the house structure between $house$ markers").toBeTruthy();
    expect(JSON.parse(literal!)).toEqual(JSON.parse(JSON.stringify(offroadHousePresentationStructure)));
    // What the database stores is what the type carries; the round trip loses nothing.
    expect(presentationStructureFromStored(presentationStructureToStored(offroadHousePresentationStructure))).toEqual(offroadHousePresentationStructure);
  });

  it("refuses what the database refuses, with the same named reasons", () => {
    const house = offroadHousePresentationStructure;
    expect(presentationStructureIssues({...house, sections: []})).toContainEqual({code: "empty_sections", detail: "sections"});
    expect(presentationStructureIssues({...house, sections: [{...house.sections[0]!, fields: []}]})).toContainEqual({code: "empty_sections", detail: "decision-headline"});
    expect(presentationStructureIssues({...house, sections: [house.sections[0]!, house.sections[0]!]})).toContainEqual({code: "duplicate_key", detail: "decision-headline"});
    expect(presentationStructureIssues({...house, sections: [{...house.sections[0]!, fields: [{...house.sections[0]!.fields[0]!, kind: "image"}]}]})).toContainEqual({code: "unknown_kind", detail: "image"});
    expect(presentationStructureIssues({...house, sections: [{...house.sections[0]!, fields: [{...house.sections[0]!.fields[0]!, key: ""}]}]})).toContainEqual({code: "required_without_key", detail: "decision-headline"});
    expect(presentationStructureIssues({...house, sections: [{...house.sections[0]!, audiences: ["board"]}]})).toContainEqual({code: "unknown_audience", detail: "board"});
    expect(presentationStructureIssues("not a structure")).toEqual([{code: "invalid_structure", detail: "root"}]);
    expect(presentationStructureFromStored({...house, sections: [{...house.sections[0]!, audiences: ["board"]}]})).toBeNull();
  });

  it("orders the deck by the structure, leaves out what it does not name and names every missing required field", () => {
    const structure: PresentationStructure = {
      ...offroadHousePresentationStructure,
      sections: [
        offroadHousePresentationStructure.sections[4]!,
        {...offroadHousePresentationStructure.sections[0]!, fields: [{key: "headline-metrics", kind: "number", required: true, title: {"pt-BR": "Indicadores", "en-US": "Indicators"}}, {key: "narrative", kind: "text", required: true, title: {"pt-BR": "Leitura", "en-US": "Reading"}}]},
        {key: "board-letter", title: {"pt-BR": "Carta ao conselho", "en-US": "Board letter"}, audiences: ["external"], fields: [{key: "letter", kind: "text", required: true, title: {"pt-BR": "Carta", "en-US": "Letter"}}, {key: "annex", kind: "table", required: false, title: {"pt-BR": "Anexo", "en-US": "Annex"}}]},
      ],
    };
    const applied = applyPresentationStructure(structure, [
      {id: "decision-headline", content: content({number: true})},
      {id: "open-gaps", content: content({table: true})},
      {id: "source-register", content: content({source_list: true})},
    ]);
    expect(applied.order).toEqual(["source-register", "decision-headline"]);
    expect(applied.omittedBlockIds).toEqual(["open-gaps"]);
    expect(applied.sectionsWithoutBlock).toEqual(["board-letter"]);
    // The narrative the headline block cannot offer, and the letter no block carries, are gaps;
    // the optional annex is not, and nothing was written in their place.
    expect(applied.gaps).toEqual([
      {sectionKey: "decision-headline", fieldKey: "narrative", kind: "text", blockId: "decision-headline"},
      {sectionKey: "board-letter", fieldKey: "letter", kind: "text", blockId: null},
    ]);
  });

  it("moves a section one place and refuses to move past either end", () => {
    const moved = moveStructureSection(offroadHousePresentationStructure, "source-register", "up");
    expect(moved.sections.map((section) => section.key)).toEqual(["decision-headline", "maturity-wall", "analytical-direction", "source-register", "open-gaps"]);
    expect(moveStructureSection(offroadHousePresentationStructure, "decision-headline", "up")).toBe(offroadHousePresentationStructure);
    expect(moveStructureSection(offroadHousePresentationStructure, "missing", "down")).toBe(offroadHousePresentationStructure);
  });
});
