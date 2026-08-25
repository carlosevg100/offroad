export const m0GovernanceGoldCases = [
  {
    caseId: "multi_entity_document_suggestion",
    title: "A document mentions a second operating company",
    synthetic: true,
    journey: "company",
    observation: {
      legalName: "Controlada Operacional S.A.",
      anchorVerified: true,
      confidence: 0.94,
      sourceDocumentId: "document:multi-entity-001",
    },
    expected: {
      workerAction: "suggest_only",
      initialSuggestionStatus: "pending",
      initialScopeExpansion: false,
      permittedHumanDecisions: ["confirm", "dismiss"],
      confirmedRole: "operating_company",
      confirmedScopeExpansion: true,
    },
  },
  {
    caseId: "advisor_authority_documented",
    title: "An advisor uploads evidence of its declared authority",
    synthetic: true,
    journey: "originator",
    observation: {
      documentKind: "advisor_authority_evidence",
      sourceDocumentId: "document:advisor-authority-001",
    },
    expected: {
      initialStatus: "declared",
      workerMaySetStatus: "documented",
      workerMaySetVerified: false,
      scopesMayExpand: false,
      verificationActor: "offroad_operator",
    },
  },
  {
    caseId: "advisor_authority_revoked",
    title: "An advisor mandate is revoked after verification",
    synthetic: true,
    journey: "originator",
    observation: {
      priorStatus: "verified",
      reason: "Mandato encerrado pela organização responsável.",
    },
    expected: {
      finalStatus: "revoked",
      activeScopes: [],
      terminal: true,
      requestGenerationPermitted: false,
      qualifiedIntroductionPermitted: false,
    },
  },
] as const;

