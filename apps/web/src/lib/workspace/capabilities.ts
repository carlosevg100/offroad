/** Display-only capabilities issued by PostgreSQL for the active workspace. */
export type WorkspaceCapability = "own_analysis" | "mandate_management" | "origination_representation" | "external_disclosure";
export type WorkspaceCapabilities = Readonly<Record<WorkspaceCapability, boolean>>;
const closed: WorkspaceCapabilities = {own_analysis: false, mandate_management: false, origination_representation: false, external_disclosure: false};

/** A commercial label, missing response or malformed contract grants nothing. */
export function workspaceCapabilities(value: unknown): WorkspaceCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) return closed;
  const record = value as Record<string, unknown>;
  if (Object.keys(closed).some((key) => typeof record[key] !== "boolean")) return closed;
  return {
    own_analysis: record.own_analysis === true,
    mandate_management: record.mandate_management === true,
    origination_representation: record.origination_representation === true,
    external_disclosure: record.external_disclosure === true,
  };
}
export function hasWorkspaceCapability(value: unknown, capability: WorkspaceCapability): boolean {
  return workspaceCapabilities(value)[capability];
}

export type NewProjectEntry =
  /** The legacy representation-declared setup and the guided intake pages. */
  | {kind: "representation_setup"}
  /** A session that already has a project: continue there. */
  | {kind: "project"; projectId: string}
  /** A session id that does not resolve inside the displayed tenant. */
  | {kind: "session_not_found"}
  /** The analytical entry: explain what is available, offer the conversation and the terms. */
  | {kind: "analysis_entry"};

/**
 * Offers representation setup only when the active workspace has that explicit capability.
 * Analytical work continues in its existing project without inferring a market-side role.
 */
export function resolveNewProjectEntry(input: {
  capabilities: unknown;
  mode: "choice" | "documents";
  session: {id: string; capitalProjectId: string | null} | null;
}): NewProjectEntry {
  const capabilities = workspaceCapabilities(input.capabilities);
  if (capabilities.origination_representation) return {kind: "representation_setup"};
  if (input.mode === "documents") {
    if (!input.session) return {kind: "session_not_found"};
    if (input.session.capitalProjectId) return {kind: "project", projectId: input.session.capitalProjectId};
    return {kind: "session_not_found"};
  }
  return {kind: "analysis_entry"};
}

/** Where the workspace sends someone once account onboarding completes. */
export function workspaceHomeAfterOnboarding(input: {capabilities: unknown; completedThrough: "mandate" | "own_analysis"}): "app" | "mandates" {
  return input.completedThrough === "mandate" && hasWorkspaceCapability(input.capabilities, "mandate_management") ? "mandates" : "app";
}
