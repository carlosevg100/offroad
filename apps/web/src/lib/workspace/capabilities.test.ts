import {describe, expect, it} from "vitest";

import {
  hasWorkspaceCapability,
  resolveNewProjectEntry,
  workspaceCapabilities,
  workspaceHomeAfterOnboarding,
} from "./capabilities";

const analysis = {own_analysis: true, mandate_management: false, origination_representation: false, external_disclosure: false};
const mandates = {...analysis, mandate_management: true};
const representation = {...analysis, origination_representation: true, external_disclosure: true};

describe("workspaceCapabilities", () => {
  it("uses only the complete server-issued contract", () => {
    expect(workspaceCapabilities(analysis)).toEqual(analysis);
    expect(workspaceCapabilities(mandates)).toEqual(mandates);
  });
  it.each(["company", "originator", "capital_provider", "personal", "institutional", null, {own_analysis: true}, {...analysis, mandate_management: "true"}])("does not infer authority from labels or malformed data: %j", (input) => {
    expect(Object.values(workspaceCapabilities(input)).some(Boolean)).toBe(false);
  });
  it("does not turn analysis into external effects", () => {
    expect(hasWorkspaceCapability(analysis, "own_analysis")).toBe(true);
    expect(hasWorkspaceCapability(analysis, "external_disclosure")).toBe(false);
  });
});

describe("resolveNewProjectEntry", () => {
  it("keeps the representation-declared setup for companies and advisors", () => {
    expect(resolveNewProjectEntry({capabilities: representation, mode: "choice", session: null})).toEqual({kind: "representation_setup"});
    expect(resolveNewProjectEntry({capabilities: representation, mode: "documents", session: {id: "s1", capitalProjectId: null}})).toEqual({kind: "representation_setup"});
  });

  it("opens a financier session in its own project and never in the guided intake", () => {
    expect(resolveNewProjectEntry({capabilities: mandates, mode: "documents", session: {id: "s1", capitalProjectId: "p1"}})).toEqual({kind: "project", projectId: "p1"});
  });

  it("refuses a financier session that does not resolve inside the displayed tenant", () => {
    expect(resolveNewProjectEntry({capabilities: mandates, mode: "documents", session: null})).toEqual({kind: "session_not_found"});
    expect(resolveNewProjectEntry({capabilities: mandates, mode: "documents", session: {id: "s1", capitalProjectId: null}})).toEqual({kind: "session_not_found"});
  });

  it("shows the analytical entry instead of a representation form to a financier", () => {
    expect(resolveNewProjectEntry({capabilities: mandates, mode: "choice", session: null})).toEqual({kind: "analysis_entry"});
  });
});

describe("workspaceHomeAfterOnboarding", () => {
  it("sends a mandate-registered financier to the mandates panel and everyone else to the conversation", () => {
    expect(workspaceHomeAfterOnboarding({capabilities: mandates, completedThrough: "mandate"})).toBe("mandates");
    expect(workspaceHomeAfterOnboarding({capabilities: mandates, completedThrough: "own_analysis"})).toBe("app");
    expect(workspaceHomeAfterOnboarding({capabilities: representation, completedThrough: "mandate"})).toBe("app");
  });
});
