import {describe, expect, it} from "vitest";

import {
  allWorkspaceJourneyBlueprints,
  collaborativeAdvisoryPolicy,
  executableWorkspaceJobSchema,
  workspaceJourneyBlueprint,
} from "./index";

describe("workspace journey blueprints", () => {
  it("covers every released workspace entry with one shared advisory system", () => {
    const journeys = allWorkspaceJourneyBlueprints();
    expect(journeys.map((journey) => journey.id)).toEqual(executableWorkspaceJobSchema.options);
    expect(new Set(journeys.map((journey) => journey.schemaVersion))).toEqual(new Set(["workspace-journey-blueprint.v1"]));
  });

  it("makes document-led work read before asking", () => {
    const journey = workspaceJourneyBlueprint("structure_from_documents");
    expect(journey.workThatCanRunInParallel).toContain("classify and extract every document");
    expect(journey.interactionRule).toContain("Read before asking");
  });

  it("treats professional capability as prioritization rather than an alternative boundary", () => {
    expect(collaborativeAdvisoryPolicy.alternativeUniverse).toBe("company_first_and_unconstrained");
    expect(collaborativeAdvisoryPolicy.professionalContextUse).toBe("prioritize_and_shape_never_suppress");
    expect(collaborativeAdvisoryPolicy.collaborationClose).toMatchObject({
      posture: "associate_or_vp_to_md",
      choices: ["deepen_one", "combine_alternatives", "develop_all_for_comparison", "add_context_and_reassess"],
    });
  });
});
