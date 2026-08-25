/**
 * M0 closeout scenarios.
 *
 * These are truth declarations, not a second implementation of intake. Their economic and
 * governance assertions run through the canonical replay in @offroad/credit-playbook.
 */
export const m0CloseoutGoldCases = [
  {
    caseId: "single_document_start",
    title: "A company starts with one useful document",
    synthetic: true,
    journey: "company",
    inputs: {declaredArchetype: "growth_expansion", classifiedDocuments: ["management_accounts"]},
    expected: {
      documentAccepted: true,
      minimumComplete: false,
      requestBatchRemainsFocused: true,
      maximumActiveRequests: 4,
      noGenericRoomRequest: true,
    },
  },
  {
    caseId: "disorganized_room_no_false_coverage",
    title: "An unclassified and duplicated room does not become evidence by volume",
    synthetic: true,
    journey: "company",
    inputs: {
      declaredArchetype: "growth_expansion",
      receivedDocuments: ["scan-sem-tipo.pdf", "scan-sem-tipo-copia.pdf", "export.txt"],
      classifiedDocuments: ["management_accounts"],
    },
    expected: {
      receivedVolumeDoesNotSatisfyRequirements: true,
      onlyClassifiedEvidenceCounts: true,
      minimumComplete: false,
      maximumActiveRequests: 4,
    },
  },
  {
    caseId: "advisor_multiple_clients_isolated",
    title: "One advisor prepares two client cases under separate authority",
    synthetic: true,
    journey: "originator",
    inputs: {advisorOrganizationId: "advisor-org", caseIds: ["client-a", "client-b"]},
    expected: {
      caseScopedAuthority: true,
      caseScopedEconomicPerimeter: true,
      crossCaseEventRejected: true,
      qualifiedIntroductionInherited: false,
    },
  },
  {
    caseId: "capex_with_disguised_liquidity",
    title: "A capex request contains a possible short-term liquidity need",
    synthetic: true,
    journey: "company",
    inputs: {declaredArchetype: "growth_expansion", routeCheck: "disguised_liquidity"},
    expected: {
      declaredArchetypePreserved: true,
      outcome: "review_required",
      automaticReroute: false,
      fundingPromise: false,
    },
  },
] as const;
