/**
 * The four workspace capabilities, mirrored from `private.organization_has_workspace_capability`
 * in the database (docs/product/FINANCIER_ANALYTICAL_WORKSPACE.md). The database is the
 * authority: these helpers only decide what the interface offers and explains, never what the
 * server accepts. A route that shows a button the server would refuse is a bug on this side.
 */
export type WorkspaceOrganizationType = "company" | "originator" | "capital_provider";

export type WorkspaceCapability =
  | "own_analysis"
  | "mandate_management"
  | "origination_representation"
  | "external_disclosure";

export type WorkspaceCapabilities = Readonly<Record<WorkspaceCapability, boolean>>;

const capabilitiesByType: Readonly<Record<WorkspaceOrganizationType, WorkspaceCapabilities>> = {
  company: {own_analysis: true, mandate_management: false, origination_representation: true, external_disclosure: true},
  originator: {own_analysis: true, mandate_management: false, origination_representation: true, external_disclosure: true},
  capital_provider: {own_analysis: true, mandate_management: true, origination_representation: false, external_disclosure: false},
};

const closed: WorkspaceCapabilities = {
  own_analysis: false, mandate_management: false, origination_representation: false, external_disclosure: false,
};

export function isWorkspaceOrganizationType(value: string): value is WorkspaceOrganizationType {
  return value === "company" || value === "originator" || value === "capital_provider";
}

/** Unknown types (the internal `offroad` tenant, or a value this build does not know) get nothing. */
export function workspaceCapabilities(organizationType: string): WorkspaceCapabilities {
  return isWorkspaceOrganizationType(organizationType) ? capabilitiesByType[organizationType] : closed;
}

export function hasWorkspaceCapability(organizationType: string, capability: WorkspaceCapability): boolean {
  return workspaceCapabilities(organizationType)[capability];
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
 * Decides what `/app/new` shows. Company and advisor keep the representation-declared setup and
 * the guided document pages. A financier never sees a representation declaration: its sessions
 * open in their project and the choice screen becomes the analytical entry.
 */
export function resolveNewProjectEntry(input: {
  organizationType: string;
  mode: "choice" | "documents";
  session: {id: string; capitalProjectId: string | null} | null;
}): NewProjectEntry {
  const capabilities = workspaceCapabilities(input.organizationType);
  if (capabilities.origination_representation) return {kind: "representation_setup"};
  if (input.mode === "documents") {
    if (!input.session) return {kind: "session_not_found"};
    if (input.session.capitalProjectId) return {kind: "project", projectId: input.session.capitalProjectId};
    return {kind: "session_not_found"};
  }
  return {kind: "analysis_entry"};
}

/** Where the workspace sends someone once account onboarding completes. */
export function workspaceHomeAfterOnboarding(input: {organizationType: string; completedThrough: "mandate" | "own_analysis"}): "app" | "mandates" {
  return input.completedThrough === "mandate" && hasWorkspaceCapability(input.organizationType, "mandate_management") ? "mandates" : "app";
}
