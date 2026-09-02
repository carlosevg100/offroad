import {describe, expect, it} from "vitest";

import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";

import {privateMaterialArtifacts} from "./private-material-artifacts";

const governed = {
  materials: [
    {kind: "teaser"},
    {kind: "term_sheet"},
    {kind: "data_room_index"},
  ],
  financialModel: {sha256: "abc"},
} as unknown as GovernedMaterialPackage;

describe("privateMaterialArtifacts", () => {
  it("keeps every approved deliverable available in its institutional format", () => {
    expect(privateMaterialArtifacts(governed, "pt-BR", "session-1")).toEqual([
      {
        id: "teaser",
        available: true,
        actions: [{kind: "pdf", href: "/pt-BR/app/materials/session-1/teaser?print=1"}],
      },
      {
        id: "financial_model",
        available: true,
        actions: [{kind: "excel", href: "/pt-BR/app/model/session-1"}],
      },
      {
        id: "indicative_term_sheet",
        available: true,
        actions: [
          {kind: "pdf", href: "/pt-BR/app/materials/session-1/term_sheet?print=1"},
          {kind: "word", href: "/pt-BR/app/materials/session-1/term_sheet/docx"},
        ],
      },
      {
        id: "data_room_index",
        available: true,
        actions: [
          {kind: "open", href: "/pt-BR/app/materials/session-1/data_room_index"},
          {kind: "word", href: "/pt-BR/app/materials/session-1/data_room_index/docx"},
        ],
      },
    ]);
  });

  it("does not claim a missing artifact is ready", () => {
    const missing = {...governed, materials: governed.materials.filter((item) => item.kind !== "term_sheet")};
    expect(privateMaterialArtifacts(missing, "en-US", "session-2").find((item) => item.id === "indicative_term_sheet"))
      .toMatchObject({available: false});
  });
});
