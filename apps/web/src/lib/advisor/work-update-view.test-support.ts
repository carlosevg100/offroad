/** A view as `work_update_view_v1` returns it, shared by the model and component tests. Tests only. */
export const id = (n: number) => `a4210000-0000-4000-9000-${String(n).padStart(12, "0")}`;
// A command milestone id is derived by md5 in the database and carries no RFC version.
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
