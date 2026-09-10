import {describe, expect, it} from "vitest";

import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";

import {privateMaterialArtifacts, privateMaterialPackageApproved} from "./private-material-artifacts";

const governed = {
  plannedArtifacts: ["teaser", "financial_model", "indicative_term_sheet", "data_room_index"],
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
        actions: [
          {kind: "pdf", href: "/pt-BR/app/materials/session-1/teaser?print=1"},
          {kind: "word", href: "/pt-BR/app/materials/session-1/teaser/docx"},
        ],
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

  it("keeps a standalone teaser task complete without requiring unrelated outputs", () => {
    const artifacts = privateMaterialArtifacts({...governed, plannedArtifacts: ["teaser"], financialModel: null}, "en-US", "session-2");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({id: "teaser", available: true});
    expect(artifacts[0]!.actions).toContainEqual({kind: "word", href: "/en-US/app/materials/session-2/teaser/docx"});
  });

  it("does not expose outputs outside the approved production plan", () => {
    expect(privateMaterialArtifacts({...governed, plannedArtifacts: []}, "pt-BR", "session-2")).toEqual([]);
  });
});

it("does not carry approval forward after the material package changes", () => {
  const review = {status: "approved", payload: {approval: {artifactFingerprint: "a".repeat(64)}},
    dependencies: [{objectType: "material_artifact", objectFingerprint: "a".repeat(64)}]};
  expect(privateMaterialPackageApproved(review, "a".repeat(64))).toBe(true);
  expect(privateMaterialPackageApproved(review, "b".repeat(64))).toBe(false);
  expect(privateMaterialPackageApproved({...review, dependencies: []}, "a".repeat(64))).toBe(false);
  expect(privateMaterialPackageApproved({...review, payload: {}}, "a".repeat(64))).toBe(false);
  expect(privateMaterialPackageApproved({...review, status: "superseded"}, "a".repeat(64))).toBe(false);
});
