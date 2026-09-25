import {describe, expect, it} from "vitest";

import {workUpdateViewSchema, type WorkUpdateView} from "./work-update-view";
import {workUpdatesModel} from "./work-updates";

const id = (n: number) => `a4210000-0000-4000-9000-${String(n).padStart(12, "0")}`;
// A command milestone id is derived by md5 in the database and carries no RFC version.
const derived = "a5ee8591-a849-a54e-9f9b-5663cc91bc07";
const at = (minute: number) => `2026-09-25T12:${String(minute).padStart(2, "0")}:00+00:00`;
const source = (versionNo: number) => ({sourceId: id(500), versionNo, versionId: id(500 + versionNo)});

/** A view as work_update_view_v1 returns it: a ready update with two recomputed lineages, a held one, an execution left valid and a declined update. */
const view: WorkUpdateView = workUpdateViewSchema.parse({
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
        {executionId: id(30), rootExecutionId: id(30), label: "Estrutura de capital", resultMilestoneId: id(31), candidateId: id(40), holds: [], changes: [
          {eventId: id(20), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(2), viaSourceVersionIds: [], createdAt: at(2), name: "balancete.xlsx"},
          {eventId: id(21), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(3), viaSourceVersionIds: [], createdAt: at(3), name: "balancete.xlsx"},
        ]},
        {executionId: id(32), rootExecutionId: id(32), label: "Liquidez", resultMilestoneId: null, candidateId: null,
          holds: [{kind: "basis_behind_source", signal: `assumption_version:${id(600)}`, subject: {}, createdAt: at(3), releasedAt: null},
            {kind: "derived_source_not_rederived", signal: `source_version:${id(601)}`, subject: {}, createdAt: at(2), releasedAt: at(3)}],
          changes: [{eventId: id(20), dependencyKind: "source_version", logicalKey: id(500), reasonClass: "data_change", gap: null, pinned: source(1), head: source(2), viaSourceVersionIds: [id(700)], createdAt: at(2), name: null}]},
        {executionId: id(34), rootExecutionId: id(34), label: "Covenants", resultMilestoneId: id(35), candidateId: id(41), holds: [], changes: [
          {eventId: id(21), dependencyKind: "method_release", logicalKey: "prepare-capital-structure-decision", reasonClass: "method_update", gap: null,
            pinned: {platformReleaseId: "pcsd-v3", houseReleaseId: null}, head: {platformReleaseId: "pcsd-v4", houseReleaseId: null}, viaSourceVersionIds: [], createdAt: at(3), name: "prepare-capital-structure-decision"},
        ]},
      ],
      candidates: [
        {candidateId: id(40), state: "settled", reason: null, action: "recompute", revision: 3, maxCostMicrousd: 0, maxModelCalls: 0, baseExecutionId: id(30), baseLabel: "Estrutura de capital",
          executionIds: [id(30)], executionId: id(42), resultMilestoneId: id(43), waitMilestoneId: null, waitOpen: false, createdAt: at(4), updatedAt: at(8)},
        {candidateId: id(41), state: "declined", reason: "superseded", action: "recompute", revision: 2, maxCostMicrousd: 0, maxModelCalls: 0, baseExecutionId: id(34), baseLabel: "Covenants",
          executionIds: [id(34)], executionId: null, resultMilestoneId: null, waitMilestoneId: null, waitOpen: false, createdAt: at(4), updatedAt: at(5)},
        {candidateId: id(44), state: "failed", reason: "requester_not_authorized:execution_access_denied", action: "recompute", revision: 2, maxCostMicrousd: 0, maxModelCalls: 0,
          baseExecutionId: id(34), baseLabel: "Covenants", executionIds: [id(34)], executionId: null, resultMilestoneId: null, waitMilestoneId: null, waitOpen: false, createdAt: at(5), updatedAt: at(6)},
      ],
      unaffected: [{executionId: id(36), label: "Cenário de juros", resultMilestoneId: id(37)}],
    },
    {
      requestId: id(12), status: "awaiting_authorization", revision: 2, createdAt: at(10), updatedAt: at(11), supersededByRequestId: null, declineReason: null,
      proposalMilestoneId: id(13), decision: null, events: [{eventId: id(22), aggregateKind: "method_release", aggregateId: id(501), aggregateVersion: 1}],
      affected: [{executionId: id(30), rootExecutionId: id(30), label: "Estrutura de capital", resultMilestoneId: id(31), candidateId: id(45), holds: [], changes: []}],
      candidates: [{candidateId: id(45), state: "awaiting_authorization", reason: null, action: "await_authorization", revision: 1, maxCostMicrousd: 250000, maxModelCalls: 3,
        baseExecutionId: id(30), baseLabel: "Estrutura de capital", executionIds: [id(30)], executionId: null, resultMilestoneId: null, waitMilestoneId: id(46), waitOpen: true, createdAt: at(10), updatedAt: at(10)}],
      unaffected: [],
    },
    {
      requestId: id(14), status: "declined", revision: 4, createdAt: at(12), updatedAt: at(14), supersededByRequestId: null, declineReason: "person_declined:cost_not_justified",
      proposalMilestoneId: id(15), decision: {milestoneId: derived, kind: "decision", outcome: "rejected", revision: 3, createdBy: id(900), occurredAt: at(14)},
      events: [], affected: [], candidates: [], unaffected: [],
    },
  ],
});

describe("the update section of a work", () => {
  const model = workUpdatesModel(view);

  it("keeps open updates apart from closed ones and counts those awaiting a decision", () => {
    expect(model.open.map((item) => [item.updateId, item.status])).toEqual([[id(10), "ready"], [id(12), "awaiting_authorization"]]);
    expect(model.closed.map((item) => item.updateId)).toEqual([id(14)]);
    expect(model.awaitingDecision).toBe(2);
  });

  it("says what changed once per input, from the oldest pinned version to the newest head, with the executions it affected", () => {
    const [ready] = model.open;
    expect(ready?.changes).toEqual([
      {key: `source_version:${id(500)}`, kind: "source_version", name: "balancete.xlsx", from: "1", to: "3", gap: null, executions: ["Estrutura de capital", "Liquidez"]},
      {key: "method_release:prepare-capital-structure-decision", kind: "method_release", name: "prepare-capital-structure-decision", from: "pcsd-v3", to: "pcsd-v4", gap: null, executions: ["Covenants"]},
    ]);
  });

  it("says what was redone and why a recomputation did not finish, and leaves out candidates newer heads replaced", () => {
    const [ready] = model.open;
    expect(ready?.recomputed).toEqual([
      {candidateId: id(40), label: "Estrutura de capital", state: "settled", produced: true, resultReady: true, reason: null},
      {candidateId: id(44), label: "Covenants", state: "failed", produced: false, resultReady: false, reason: "requester_not_authorized:execution_access_denied"},
    ]);
    expect(ready?.stayedValid).toEqual(["Cenário de juros"]);
  });

  it("says what waits: open holds with their execution, and costed recomputations with their ceiling", () => {
    const [ready, waiting] = model.open;
    expect(ready?.holds).toEqual([{kind: "basis_behind_source", execution: "Liquidez"}]);
    expect(ready).toMatchObject({canAdopt: true, canDecline: true, awaitingAuthorization: []});
    expect(waiting?.awaitingAuthorization).toEqual([{candidateId: id(45), revision: 1, label: "Estrutura de capital", maxCostMicrousd: 250000, maxModelCalls: 3}]);
    expect(waiting).toMatchObject({canAdopt: false, canDecline: true, revision: 2});
  });

  it("records a person's decline with its reason and offers no action on a closed update", () => {
    const [declined] = model.closed;
    expect(declined).toMatchObject({status: "declined", open: false, canAdopt: false, canDecline: false, declineReason: "cost_not_justified", decidedAt: at(14), holds: [], awaitingAuthorization: []});
  });

  it("refuses a view of another shape", () => {
    expect(workUpdateViewSchema.safeParse({...view, schemaVersion: "work-update-view.v0"}).success).toBe(false);
    expect(workUpdateViewSchema.safeParse({...view, updates: [{...view.updates[0], status: "approved"}]}).success).toBe(false);
  });
});
