import {describe, expect, it} from "vitest";

import {namesFor} from "./work-update-names.test-support";
import {CAPITAL, RECEIVABLES, at, id, rawView} from "./work-update-view.test-support";
import {workUpdateViewSchema, type WorkUpdateView} from "./work-update-view";
import {workUpdatesModel} from "./work-updates";

const view: WorkUpdateView = workUpdateViewSchema.parse(rawView);

describe("the update section of a work", () => {
  const model = workUpdatesModel(view, namesFor("pt-BR"));

  it("keeps open updates apart from closed ones and counts those awaiting a decision", () => {
    expect(model.open.map((item) => [item.updateId, item.status])).toEqual([[id(10), "ready"], [id(12), "awaiting_authorization"]]);
    expect(model.closed.map((item) => item.updateId)).toEqual([id(14)]);
    expect(model.awaitingDecision).toBe(2);
  });

  it("says what changed once per input, from the oldest pinned version to the newest head, named as a person reads it", () => {
    const [ready] = model.open;
    expect(ready?.changes).toEqual([
      {key: `source_version:${id(500)}`, kind: "source_version", name: "balancete.xlsx", from: "1", to: "3", gap: null, executions: [CAPITAL, RECEIVABLES]},
      {key: `assumption_slot:${id(599)}:cash`, kind: "assumption_slot", name: "Caixa disponível", from: "2", to: "3", gap: null, executions: [CAPITAL]},
      {key: `assumption_slot:${id(599)}:other`, kind: "assumption_slot", name: null, from: "1", to: "2", gap: null, executions: [CAPITAL]},
      {key: "method_release:prepare-capital-structure-decision", kind: "method_release", name: CAPITAL, from: null, to: null, gap: null, executions: ["Covenants da casa"]},
    ]);
  });

  it("says what was redone and why a recomputation did not finish, and leaves out candidates newer heads replaced", () => {
    const [ready] = model.open;
    expect(ready?.recomputed).toEqual([
      {candidateId: id(40), label: CAPITAL, state: "settled", produced: true, resultReady: true, reason: null},
      {candidateId: id(44), label: "Covenants da casa", state: "failed", produced: false, resultReady: false, reason: "requester_not_authorized:execution_access_denied"},
    ]);
    expect(ready?.stayedValid).toEqual([`${CAPITAL} (2 execuções)`, "A análise desta base"]);
  });

  it("says what waits: open holds with their execution, and costed recomputations with their ceiling", () => {
    const [ready, waiting] = model.open;
    expect(ready?.holds).toEqual([{kind: "basis_behind_source", execution: RECEIVABLES}]);
    expect(ready).toMatchObject({canAdopt: true, canDecline: true, awaitingAuthorization: []});
    expect(waiting?.awaitingAuthorization).toEqual([{candidateId: id(45), revision: 1, label: CAPITAL, maxCostMicrousd: 250000, maxModelCalls: 3}]);
    expect(waiting).toMatchObject({canAdopt: false, canDecline: true, revision: 2});
  });

  it("records a person's decline with its reason and offers no action on a closed update", () => {
    const [declined] = model.closed;
    expect(declined).toMatchObject({status: "declined", open: false, canAdopt: false, canDecline: false, declineReason: "cost_not_justified", decidedAt: at(14), holds: [], awaitingAuthorization: []});
  });

  it("reads a view without method or premise references, and still names nothing by its key", () => {
    const bare = workUpdateViewSchema.parse({...view, updates: [{...view.updates[0], unaffected: [{executionId: id(36), label: "prepare-capital-structure-decision", resultMilestoneId: id(37)}]}]});
    expect(workUpdatesModel(bare, namesFor("en-US")).open[0]?.stayedValid).toEqual(["This basis analysis"]);
  });

  it("refuses a view of another shape", () => {
    expect(workUpdateViewSchema.safeParse({...view, schemaVersion: "work-update-view.v0"}).success).toBe(false);
    expect(workUpdateViewSchema.safeParse({...view, updates: [{...view.updates[0], status: "approved"}]}).success).toBe(false);
  });
});
