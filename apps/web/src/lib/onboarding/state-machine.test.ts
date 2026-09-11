import {describe, expect, it} from "vitest";

import {resolveBorrowerOnboardingView, resolveFinancierOnboardingView} from "./state-machine";

const session = {id: "session-1", status: "collecting", projectName: "Projeto Atlas"};

describe("resolveBorrowerOnboardingView", () => {
  it("keeps a first-time visitor on the welcome page until they choose to begin", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: false,
      requestedSetup: null,
      session: null,
    })).toBe("welcome");
  });

  it("enforces confidentiality before project setup", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: false,
      requestedSetup: "project",
      session: null,
    })).toBe("confidentiality");
  });

  it("opens project setup after confidentiality has been accepted", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "originator",
      termsAccepted: true,
      requestedSetup: "project",
      session: null,
    })).toBe("project_setup");
  });

  it("forces an older unnamed session through the one canonical project setup", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: true,
      requestedSetup: null,
      session: {...session, projectName: null},
    })).toBe("project_setup");
  });

  it("uses Back and Edit as reversible views without cancelling the active session", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: true,
      requestedSetup: "terms",
      session,
    })).toBe("confidentiality_review");
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: true,
      requestedSetup: "project",
      session,
    })).toBe("project_edit");
  });

  it("resumes the guided flow only after every prerequisite exists", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: true,
      requestedSetup: null,
      session,
    })).toBe("guided");
  });

  it("routes a confirmed guided session to the completion view", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "company",
      termsAccepted: true,
      requestedSetup: null,
      session: {...session, status: "confirmed"},
    })).toBe("completion");
  });

  it("keeps capital-provider onboarding separate", () => {
    expect(resolveBorrowerOnboardingView({
      journey: "capital_provider",
      termsAccepted: false,
      requestedSetup: null,
      session: null,
    })).toBe("provider_legacy");
  });
});

describe("resolveFinancierOnboardingView", () => {
  it("starts a financier on the analysis-or-mandates choice, never inside the mandate path", () => {
    expect(resolveFinancierOnboardingView({
      requestedSetup: null,
      requestedSection: null,
      persistedStep: "organization",
      mandatePathStarted: false,
    })).toBe("financier_welcome");
  });

  it("opens the workspace terms when own analysis is chosen", () => {
    expect(resolveFinancierOnboardingView({
      requestedSetup: "terms",
      requestedSection: null,
      persistedStep: "organization",
      mandatePathStarted: false,
    })).toBe("financier_terms");
  });

  it("enters the mandate path only on an explicit section request or a persisted mandate step", () => {
    expect(resolveFinancierOnboardingView({
      requestedSetup: null,
      requestedSection: "organization",
      persistedStep: "organization",
      mandatePathStarted: false,
    })).toBe("provider_legacy");
    expect(resolveFinancierOnboardingView({
      requestedSetup: null,
      requestedSection: null,
      persistedStep: "fund",
      mandatePathStarted: true,
    })).toBe("provider_legacy");
    expect(resolveFinancierOnboardingView({
      requestedSetup: null,
      requestedSection: null,
      persistedStep: "organization",
      mandatePathStarted: true,
    })).toBe("provider_legacy");
  });

  it("never turns a project setup request into a representation form for a financier", () => {
    expect(resolveFinancierOnboardingView({
      requestedSetup: "project",
      requestedSection: null,
      persistedStep: "organization",
      mandatePathStarted: false,
    })).toBe("financier_welcome");
  });
});
