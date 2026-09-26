/** A view as `work_update_view_v1` returns it, shared by the model and component tests. Tests only. */
export const id = (n: number) => `a4210000-0000-4000-9000-${String(n).padStart(12, "0")}`;
// An id without RFC version bits, as synthetic and older derived ids are: the view accepts it.
const derived = "a5ee8591-a849-a54e-9f9b-5663cc91bc07";
export const at = (minute: number) => `2026-09-25T12:${String(minute).padStart(2, "0")}:00+00:00`;
const source = (versionNo: number) => ({sourceId: id(500), versionNo, versionId: id(500 + versionNo)});
const slot = (revision: number) => ({revision, versionId: id(600 + revision), decisionId: id(650 + revision)});
const capital = {methodId: "prepare-capital-structure-decision", houseTitle: null};
const receivables = {methodId: "underwrite-receivables-pool", houseTitle: null};
const house = {methodId: "house-covenant-method", houseTitle: "Covenants da casa"};
export const CAPITAL = "Preparar alternativas de estrutura de capital para uma decisão";
export const RECEIVABLES = "Conciliar e testar a capacidade de uma carteira de recebíveis";

/** A view as work_update_view_v1 returns it: a ready update with two recomputed lineages, a held one, executions left valid and a declined update. */
export const rawView = {
  schemaVersion: "work-update-view.v1",
  workId: id(1),
  conversationId: null,
  milestones: [],
  bases: [],
  followups: [],
  updates: [
    {
      requestId: id(10), status: "ready", revision: 5, createdAt: at(1), updatedAt: at(9), supersededByRequestId: null, declineReason: null,
      proposalMilestoneId: id(11), decision: null,
      events: [{eventId: id(20), aggregateKind: "source_version", aggregateId: id(500), aggregateVersion: 2}, {eventId: id(21), aggregateKind: "source_version", aggregateId: id(500), aggregateVersion: 3}],
      affected: [
        {executionId: id(30), rootExecutionId: id(30), label: "prepare-capital-structure-decision", method: capital, resultMilestoneId: id(31), candidateId: id(40), holds: [], changes: [
          {eventId: id(20), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(2), viaSourceVersionIds: [], createdAt: at(2), name: "balancete.xlsx", premise: null, method: null},
          {eventId: id(21), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(3), viaSourceVersionIds: [], createdAt: at(3), name: "balancete.xlsx", premise: null, method: null},
          {eventId: id(21), dependencyKind: "assumption_slot", logicalKey: `${id(599)}:cash`, reasonClass: "data_change", gap: null, pinned: slot(2), head: slot(3), viaSourceVersionIds: [], createdAt: at(3),
            name: "liquidity.available_cash", premise: {fieldPath: "liquidity.available_cash", definition: "Synthetic liquidity.available_cash definition"}, method: null},
          {eventId: id(21), dependencyKind: "assumption_slot", logicalKey: `${id(599)}:other`, reasonClass: "data_change", gap: null, pinned: slot(1), head: slot(2), viaSourceVersionIds: [], createdAt: at(3),
            name: "capital.covenant_headroom", premise: {fieldPath: "capital.covenant_headroom", definition: null}, method: null},
        ]},
        {executionId: id(32), rootExecutionId: id(32), label: "underwrite-receivables-pool", method: receivables, resultMilestoneId: null, candidateId: null,
          holds: [{kind: "basis_behind_source", signal: `assumption_version:${id(600)}`, subject: {}, createdAt: at(3), releasedAt: null},
            {kind: "derived_source_not_rederived", signal: `source_version:${id(601)}`, subject: {}, createdAt: at(2), releasedAt: at(3)}],
          changes: [{eventId: id(20), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(2), viaSourceVersionIds: [id(700)], createdAt: at(2), name: null}]},
        {executionId: id(34), rootExecutionId: id(34), label: "house-covenant-method", method: house, resultMilestoneId: id(35), candidateId: id(41), holds: [], changes: [
          {eventId: id(21), dependencyKind: "method_release", logicalKey: "prepare-capital-structure-decision", reasonClass: "method_update", gap: null,
            pinned: {platformReleaseId: "pcsd-v3", houseReleaseId: null}, head: {platformReleaseId: "pcsd-v4", houseReleaseId: null}, viaSourceVersionIds: [], createdAt: at(3),
            name: "prepare-capital-structure-decision", premise: null, method: capital},
        ]},
      ],
      candidates: [
        {candidateId: id(40), state: "settled", reason: null, action: "recompute", revision: 3, maxCostMicrousd: 0, maxModelCalls: 0, baseExecutionId: id(30), baseLabel: "prepare-capital-structure-decision", baseMethod: capital,
          executionIds: [id(30)], executionId: id(42), resultMilestoneId: id(43), waitMilestoneId: null, waitOpen: false, createdAt: at(4), updatedAt: at(8)},
        {candidateId: id(41), state: "declined", reason: "superseded", action: "recompute", revision: 2, maxCostMicrousd: 0, maxModelCalls: 0, baseExecutionId: id(34), baseLabel: "house-covenant-method", baseMethod: house,
          executionIds: [id(34)], executionId: null, resultMilestoneId: null, waitMilestoneId: null, waitOpen: false, createdAt: at(4), updatedAt: at(5)},
        {candidateId: id(44), state: "failed", reason: "requester_not_authorized:execution_access_denied", action: "recompute", revision: 2, maxCostMicrousd: 0, maxModelCalls: 0,
          baseExecutionId: id(34), baseLabel: "house-covenant-method", baseMethod: house, executionIds: [id(34)], executionId: null, resultMilestoneId: null, waitMilestoneId: null, waitOpen: false, createdAt: at(5), updatedAt: at(6)},
      ],
      unaffected: [
        {executionId: id(36), label: "prepare-capital-structure-decision", method: capital, resultMilestoneId: id(37)},
        {executionId: id(38), label: "prepare-capital-structure-decision", method: capital, resultMilestoneId: id(39)},
        {executionId: id(50), label: "custom-method", method: {methodId: "custom-method", houseTitle: null}, resultMilestoneId: null},
      ],
    },
    {
      requestId: id(12), status: "awaiting_authorization", revision: 2, createdAt: at(10), updatedAt: at(11), supersededByRequestId: null, declineReason: null,
      proposalMilestoneId: id(13), decision: null, events: [{eventId: id(22), aggregateKind: "method_release", aggregateId: id(501), aggregateVersion: 1}],
      affected: [{executionId: id(30), rootExecutionId: id(30), label: "prepare-capital-structure-decision", method: capital, resultMilestoneId: id(31), candidateId: id(45), holds: [], changes: []}],
      candidates: [{candidateId: id(45), state: "awaiting_authorization", reason: null, action: "await_authorization", revision: 1, maxCostMicrousd: 250000, maxModelCalls: 3,
        baseExecutionId: id(30), baseLabel: "prepare-capital-structure-decision", baseMethod: capital, executionIds: [id(30)], executionId: null, resultMilestoneId: null, waitMilestoneId: id(46), waitOpen: true, createdAt: at(10), updatedAt: at(10)}],
      unaffected: [],
    },
    {
      requestId: id(14), status: "declined", revision: 4, createdAt: at(12), updatedAt: at(14), supersededByRequestId: null, declineReason: "person_declined:cost_not_justified",
      proposalMilestoneId: id(15), decision: {milestoneId: derived, kind: "decision", outcome: "rejected", revision: 3, createdBy: id(900), occurredAt: at(14)},
      events: [], affected: [], candidates: [], unaffected: [],
    },
  ],
};

const config = (revision: number) => ({configurationId: id(800 + revision), revision});
const institutionalFacts = (event: number, minute: number) => [
  {eventId: id(event), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(2), createdAt: at(minute), name: "balancete.xlsx"},
  {eventId: id(event + 1), dependencyKind: "institutional_configuration", logicalKey: id(1), reasonClass: "data_change", gap: null, pinned: config(1), head: config(2), createdAt: at(minute), name: null},
];

/**
 * Increment 5C: a ready mixed update (an execution and the financial model) with a later update
 * merged into it, an open update whose institutional recomputation is scheduled and held, an update
 * a newer one replaced, and the follow-ups of the conversation.
 */
export const rawIntegrationView = {
  schemaVersion: "work-update-view.v1",
  workId: id(1),
  conversationId: id(2),
  milestones: [{milestoneId: id(900), sequence: 1, kind: "decision", subjectKind: "execution_brief", subjectId: id(901), label: "Alongamento com os bancos atuais",
    revision: 3, outcome: null, references: [], createdBy: id(902), occurredAt: at(1)}],
  bases: [],
  updates: [
    {
      requestId: id(66), status: "scheduled", revision: 2, createdAt: at(30), updatedAt: at(31), supersededByRequestId: null, declineReason: null, proposalMilestoneId: id(67), decision: null,
      events: [{eventId: id(70), aggregateKind: "institutional_configuration", aggregateId: id(1), aggregateVersion: 2}],
      affected: [{executionId: id(80), rootExecutionId: id(80), label: null, method: null, resultMilestoneId: id(81), candidateId: null, changes: [], holds: [],
        dependentKind: "institutional_result", institutionalCandidateId: id(82), institutionalChanges: institutionalFacts(70, 30),
        institutionalHolds: [{kind: "configuration_behind_source", signal: "institutional_configuration:work", subject: {}, createdAt: at(30), releasedAt: null}]}],
      candidates: [],
      institutionalCandidates: [{candidateId: id(82), state: "scheduled", reason: null, revision: 1, baseResultId: id(80), resultIds: [id(80)], resultId: id(83), resultStatus: "queued",
        resultMilestoneId: null, current: false, createdAt: at(30), updatedAt: at(30)}],
      unaffected: [],
    },
    {
      requestId: id(60), status: "ready", revision: 6, createdAt: at(20), updatedAt: at(29), supersededByRequestId: null, declineReason: null, proposalMilestoneId: id(61), decision: null,
      events: [{eventId: id(71), aggregateKind: "source_version", aggregateId: id(500), aggregateVersion: 2}],
      affected: [
        {executionId: id(30), rootExecutionId: id(30), label: null, method: capital, resultMilestoneId: id(31), candidateId: id(40), holds: [], changes: [
          {eventId: id(71), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(2), viaSourceVersionIds: [], createdAt: at(20),
            name: "balancete.xlsx", premise: null, method: null}]},
        {executionId: id(84), rootExecutionId: id(84), label: null, method: null, resultMilestoneId: id(85), candidateId: null, changes: [], holds: [],
          dependentKind: "institutional_result", institutionalCandidateId: id(86), institutionalChanges: institutionalFacts(71, 21),
          institutionalHolds: [{kind: "configuration_behind_source", signal: "institutional_configuration:work", subject: {}, createdAt: at(20), releasedAt: at(22)}]},
      ],
      candidates: [{candidateId: id(40), state: "settled", reason: null, action: "recompute", revision: 3, maxCostMicrousd: 0, maxModelCalls: 0, baseExecutionId: id(30), baseLabel: null,
        baseMethod: capital, executionIds: [id(30)], executionId: id(42), resultMilestoneId: id(43), waitMilestoneId: null, waitOpen: false, createdAt: at(22), updatedAt: at(28)}],
      institutionalCandidates: [{candidateId: id(86), state: "settled", reason: null, revision: 3, baseResultId: id(84), resultIds: [id(84)], resultId: id(87), resultStatus: "completed",
        resultMilestoneId: id(88), current: false, createdAt: at(22), updatedAt: at(27)}],
      unaffected: [],
    },
    {
      // Superseded toward the older update 60, which already covers its change: merged into it.
      requestId: id(62), status: "superseded", revision: 2, createdAt: at(24), updatedAt: at(25), supersededByRequestId: id(60), declineReason: null, proposalMilestoneId: id(63), decision: null,
      events: [{eventId: id(72), aggregateKind: "assumption_version", aggregateId: id(599), aggregateVersion: 4}],
      affected: [{executionId: id(30), rootExecutionId: id(30), label: null, method: capital, resultMilestoneId: id(31), candidateId: null, holds: [], changes: [
        {eventId: id(72), dependencyKind: "assumption_slot", logicalKey: `${id(599)}:cash`, reasonClass: "data_change", gap: null, pinned: slot(2), head: slot(3), viaSourceVersionIds: [], createdAt: at(24),
          name: "liquidity.available_cash", premise: {fieldPath: "liquidity.available_cash", definition: null}, method: null}]}],
      candidates: [], unaffected: [],
    },
    {
      // Superseded toward the newer update 66, whose heads replaced it: it stays among the closed ones.
      requestId: id(64), status: "superseded", revision: 3, createdAt: at(18), updatedAt: at(30), supersededByRequestId: id(66), declineReason: null, proposalMilestoneId: id(65), decision: null,
      events: [], affected: [], candidates: [], unaffected: [],
    },
  ],
  followups: [
    {requestId: id(90), status: "ready", createdAt: at(10), createdBy: id(902), request: "Aprofundar o cenário de refinanciamento", baseMilestoneId: id(900), baseDecisionId: id(901),
      baseRevision: 3, milestoneId: id(91), revision: 3, updatedAt: at(12), declineReason: null, decision: null,
      execution: {executionId: id(92), baseMilestoneId: id(900), baseDecisionId: id(901), baseRevision: 3, linkedAt: at(11), jobStatus: "succeeded", resultMilestoneId: id(93), method: capital}},
    {requestId: id(94), status: "open", createdAt: at(13), createdBy: id(902), request: "Revisar o covenant de alavancagem", baseMilestoneId: id(900), baseDecisionId: id(901),
      baseRevision: 3, milestoneId: id(95), revision: 1, updatedAt: at(13), declineReason: null, decision: null, execution: null},
    {requestId: id(96), status: "declined", createdAt: at(14), createdBy: id(902), request: "Atualizar a estrutura de garantias", baseMilestoneId: id(900), baseDecisionId: id(901),
      baseRevision: 3, milestoneId: id(97), revision: 2, updatedAt: at(15), declineReason: "person_declined:other",
      decision: {milestoneId: id(98), kind: "decision", outcome: "rejected", revision: 1, createdBy: id(902), occurredAt: at(15)}, execution: null},
  ],
};
