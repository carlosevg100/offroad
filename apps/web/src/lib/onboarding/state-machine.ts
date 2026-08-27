export type OnboardingJourney = "company" | "originator" | "capital_provider";

export type BorrowerSetupRequest = "terms" | "project" | null;

export type BorrowerSessionState = {
  id: string;
  status: string;
  projectName: string | null;
};

export type BorrowerOnboardingView =
  | "welcome"
  | "confidentiality"
  | "confidentiality_review"
  | "project_setup"
  | "project_edit"
  | "guided"
  | "completion";

type ResolveInput = {
  journey: OnboardingJourney;
  termsAccepted: boolean;
  requestedSetup: BorrowerSetupRequest;
  session: BorrowerSessionState | null;
};

/**
 * The only router for borrower and advisor onboarding.
 *
 * Query parameters may request a reversible view, but they never create state and never bypass a
 * prerequisite. Destructive lifecycle changes belong to explicit commands, not Back or Edit links.
 */
export function resolveBorrowerOnboardingView(input: ResolveInput): BorrowerOnboardingView | "provider_legacy" {
  if (input.journey === "capital_provider") return "provider_legacy";

  const activeSession = input.session && !["cancelled"].includes(input.session.status)
    ? input.session
    : null;

  if (!activeSession) {
    if (!input.requestedSetup) return "welcome";
    if (!input.termsAccepted) return "confidentiality";
    return input.requestedSetup === "terms" ? "confidentiality_review" : "project_setup";
  }

  if (!input.termsAccepted) return "confidentiality";

  // Sessions created before the project gate must be configured before the guided intake can
  // continue. This is a migration path, not a second journey.
  if (!activeSession.projectName?.trim()) return "project_setup";

  if (input.requestedSetup === "terms") return "confidentiality_review";
  if (input.requestedSetup === "project") return "project_edit";
  if (activeSession.status === "confirmed") return "completion";
  return "guided";
}

export function borrowerViewUsesWorkspace(view: BorrowerOnboardingView | "provider_legacy") {
  return view === "guided" || view === "completion" || view === "provider_legacy";
}
