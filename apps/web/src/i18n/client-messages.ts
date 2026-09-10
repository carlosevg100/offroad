type Messages = typeof import("../../messages/pt-BR.json");

/** Exact client projection used by the locale layout, shared with render regressions. */
export function selectClientMessages(messages: Messages) {
  return {
    App: {privateCase: messages.App.privateCase, advisorProject: {recovery: messages.App.advisorProject.recovery}},
    IntegrationPreviewWork: messages.IntegrationPreviewWork,
    decisionReadout: messages.decisionReadout,
    ExecutionBriefCard: messages.ExecutionBriefCard,
    AdvisorEvidenceInventory: messages.AdvisorEvidenceInventory,
    AdvisorWorkSurface: messages.AdvisorWorkSurface,
    Intake: {executionApproval: messages.Intake.executionApproval},
    Errors: messages.Errors,
    Navigation: messages.Navigation,
    ProviderCaseFitForm: messages.ProviderCaseFitForm,
    ProviderCaseFitWork: messages.ProviderCaseFitWork,
    ProviderResearchWork: messages.ProviderResearchWork,
    ProviderWorkHistory: messages.ProviderWorkHistory,
    InstitutionalSetup: messages.InstitutionalSetup,
    InstitutionalModelResult: messages.InstitutionalModelResult,
    InstitutionalConfigurationReview: messages.InstitutionalConfigurationReview,
    InstitutionalIssues: messages.InstitutionalIssues,
    InstitutionalSetupReview: messages.InstitutionalSetupReview,

  };
}
