import {describe, expect, it} from "vitest";

import {namesFor} from "./work-update-names.test-support";
import {CAPITAL, RECEIVABLES, at, id, rawIntegrationView, rawView} from "./work-update-view.test-support";
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
      {candidateId: id(40), kind: "execution", revision: 3, label: CAPITAL, state: "settled", produced: true, resultReady: true, reason: null, canDecline: false},
      {candidateId: id(44), kind: "execution", revision: 2, label: "Covenants da casa", state: "failed", produced: false, resultReady: false,
        reason: "requester_not_authorized:execution_access_denied", canDecline: false},
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

  it("reads a view written before 5C with no institutional keys and no follow-up detail", () => {
    expect(model.followups).toEqual([]);
    expect(model.open.every((item) => item.merged === 0)).toBe(true);
  });

  it("refuses a view of another shape", () => {
    expect(workUpdateViewSchema.safeParse({...view, schemaVersion: "work-update-view.v0"}).success).toBe(false);
    expect(workUpdateViewSchema.safeParse({...view, updates: [{...view.updates[0], status: "approved"}]}).success).toBe(false);
  });
});

describe("the update section of a work with institutional results, merged updates and follow-ups (5C)", () => {
  const integration = workUpdateViewSchema.parse(rawIntegrationView);
  const model = workUpdatesModel(integration, namesFor("pt-BR"), (raw) => raw);
  const MODEL = "O modelo financeiro";

  it("shows an update merged into the older one that covers it inside that update, and keeps one a newer update replaced", () => {
    expect(model.open.map((item) => [item.updateId, item.status, item.merged])).toEqual([[id(66), "scheduled", 0], [id(60), "ready", 1]]);
    expect(model.closed.map((item) => item.updateId)).toEqual([id(64)]);
    const ready = model.open[1];
    expect(ready?.changes.map((change) => change.key)).toContain(`assumption_slot:${id(599)}:cash`);
  });

  it("names the financial model as a dependent: its facts next to the executions', its configuration change and its recalculation", () => {
    const ready = model.open[1];
    expect(ready?.changes).toEqual(expect.arrayContaining([
      {key: `source_version:${id(500)}`, kind: "source_version", name: "balancete.xlsx", from: "1", to: "2", gap: null, executions: [CAPITAL, MODEL]},
      {key: `institutional_configuration:${id(1)}`, kind: "institutional_configuration", name: MODEL, from: "1", to: "2", gap: null, executions: [MODEL]},
    ]));
    expect(ready?.recomputed).toEqual([
      {candidateId: id(40), kind: "execution", revision: 3, label: CAPITAL, state: "settled", produced: true, resultReady: true, reason: null, canDecline: false},
      {candidateId: id(86), kind: "institutional", revision: 3, label: MODEL, state: "settled", produced: true, resultReady: true, reason: null, canDecline: false},
    ]);
    expect(ready).toMatchObject({canAdopt: true, holds: []});
  });

  it("offers to decline a scheduled recalculation alone, at its own revision, and shows what holds it", () => {
    const scheduled = model.open[0];
    expect(scheduled?.recomputed).toEqual([
      {candidateId: id(82), kind: "institutional", revision: 1, label: MODEL, state: "scheduled", produced: false, resultReady: false, reason: null, canDecline: true},
    ]);
    expect(scheduled?.holds).toEqual([{kind: "configuration_behind_source", execution: MODEL}]);
  });

  it("lists the follow-ups with their base, the execution they led to and the decision they allow", () => {
    expect(model.followups).toEqual([
      {requestId: id(90), status: "ready", revision: 3, text: "Aprofundar o cenário de refinanciamento", base: {label: "Alongamento com os bancos atuais", revision: 3},
        execution: {name: CAPITAL, state: "result"}, open: true, canAdopt: true, canDecline: true, declineReason: null, decidedAt: null},
      {requestId: id(94), status: "open", revision: 1, text: "Revisar o covenant de alavancagem", base: {label: "Alongamento com os bancos atuais", revision: 3},
        execution: null, open: true, canAdopt: false, canDecline: true, declineReason: null, decidedAt: null},
      {requestId: id(96), status: "declined", revision: 2, text: "Atualizar a estrutura de garantias", base: {label: "Alongamento com os bancos atuais", revision: 3},
        execution: null, open: false, canAdopt: false, canDecline: false, declineReason: "other", decidedAt: at(15)},
    ]);
    // The ready update and the ready follow-up await a decision.
    expect(model.awaitingDecision).toBe(2);
  });
});
