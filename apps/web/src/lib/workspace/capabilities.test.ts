import {describe, expect, it} from "vitest";

import {
  hasWorkspaceCapability,
  resolveNewProjectEntry,
  workspaceCapabilities,
  workspaceHomeAfterOnboarding,
} from "./capabilities";

describe("workspaceCapabilities", () => {
  it("gives every workspace type its own analysis and nothing else by default", () => {
    expect(workspaceCapabilities("capital_provider")).toEqual({
      own_analysis: true,
      mandate_management: true,
      origination_representation: false,
      external_disclosure: false,
    });
    expect(workspaceCapabilities("company")).toEqual({
      own_analysis: true,
      mandate_management: false,
      origination_representation: true,
      external_disclosure: true,
    });
    expect(workspaceCapabilities("originator")).toEqual(workspaceCapabilities("company"));
  });

  it("closes everything for unknown or internal organization types", () => {
    expect(workspaceCapabilities("offroad")).toEqual({
      own_analysis: false,
      mandate_management: false,
      origination_representation: false,
      external_disclosure: false,
    });
    expect(hasWorkspaceCapability("", "own_analysis")).toBe(false);
  });

  it("never lets analysis imply origination, representation or disclosure", () => {
    expect(hasWorkspaceCapability("capital_provider", "own_analysis")).toBe(true);
    expect(hasWorkspaceCapability("capital_provider", "origination_representation")).toBe(false);
    expect(hasWorkspaceCapability("capital_provider", "external_disclosure")).toBe(false);
  });
});

describe("resolveNewProjectEntry", () => {
  it("keeps the representation-declared setup for companies and advisors", () => {
    expect(resolveNewProjectEntry({organizationType: "company", mode: "choice", session: null})).toEqual({kind: "representation_setup"});
    expect(resolveNewProjectEntry({organizationType: "originator", mode: "documents", session: {id: "s1", capitalProjectId: null}})).toEqual({kind: "representation_setup"});
  });

  it("opens a financier session in its own project and never in the guided intake", () => {
    expect(resolveNewProjectEntry({organizationType: "capital_provider", mode: "documents", session: {id: "s1", capitalProjectId: "p1"}})).toEqual({kind: "project", projectId: "p1"});
  });

  it("refuses a financier session that does not resolve inside the displayed tenant", () => {
    expect(resolveNewProjectEntry({organizationType: "capital_provider", mode: "documents", session: null})).toEqual({kind: "session_not_found"});
    expect(resolveNewProjectEntry({organizationType: "capital_provider", mode: "documents", session: {id: "s1", capitalProjectId: null}})).toEqual({kind: "session_not_found"});
  });

  it("shows the analytical entry instead of a representation form to a financier", () => {
    expect(resolveNewProjectEntry({organizationType: "capital_provider", mode: "choice", session: null})).toEqual({kind: "analysis_entry"});
  });
});

describe("workspaceHomeAfterOnboarding", () => {
  it("sends a mandate-registered financier to the mandates panel and everyone else to the conversation", () => {
    expect(workspaceHomeAfterOnboarding({organizationType: "capital_provider", completedThrough: "mandate"})).toBe("mandates");
    expect(workspaceHomeAfterOnboarding({organizationType: "capital_provider", completedThrough: "own_analysis"})).toBe("app");
    expect(workspaceHomeAfterOnboarding({organizationType: "company", completedThrough: "mandate"})).toBe("app");
  });
});
