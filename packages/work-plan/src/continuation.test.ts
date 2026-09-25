import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  collectDependencyDescendants,
  computeDependencyImpact,
  dependencyLogicalKeyId,
  dependencyRecomputeKey,
  isContinuationContractError,
  mergeDependencyUpdate,
  openWorkWaits,
  planDependencyRecompute,
  resolveWorkContinuation,
  type ContinuationBudget,
  type ContinuationExecution,
  type ContinuationGraph,
  type DependencyChangeEvent,
  type DependencyHead,
  type ExecutionDependency,
  type RecomputeCandidateRecord,
  type RecomputeCandidateState,
  type RecomputePlan,
  type SourceDerivationEdge,
  type WorkMilestone,
} from "./index";

const WORK = "work-capital-structure";
const PROCEDURE = "prepare-capital-structure-decision";
const OLD_RELEASE = "pcsd-2026.09.18-v1";
const CURRENT_RELEASE = "pcsd-2026.09.21-v4";
const ZERO: ContinuationBudget = {maxCostMicrousd: 0, maxModelCalls: 0};
const PAID: ContinuationBudget = {maxCostMicrousd: 1_500_000, maxModelCalls: 6};

const sha = (label: string) => createHash("sha256").update(label).digest("hex");
const version = (sourceId: string, versionNo: number) => ({sourceId, versionNo, versionId: `${sourceId}@v${versionNo}`});
const source = (sourceId: string, versionNo: number): ExecutionDependency => ({kind: "source_version", ...version(sourceId, versionNo)});
const sourceHead = (sourceId: string, versionNo: number): DependencyHead => ({kind: "source_version", ...version(sourceId, versionNo)});
const slot = (setId: string, slotName: string, revision: number, decisionId: string): ExecutionDependency => ({
  kind: "assumption_slot",
  setId,
  slotKey: sha(slotName),
  revision,
  versionId: `${setId}@r${revision}`,
  decisionId,
  contentFingerprint: sha(`${setId}@r${revision}`),
});
const slotHead = (setId: string, slotName: string, revision: number, decisionId: string | null): DependencyHead => ({
  kind: "assumption_slot",
  setId,
  slotKey: sha(slotName),
  revision,
  versionId: `${setId}@r${revision}`,
  decisionId,
});
const method = (platformReleaseId: string, houseReleaseId: string | null = null): ExecutionDependency => ({
  kind: "method_release",
  procedureId: PROCEDURE,
  platformReleaseId,
  houseReleaseId,
});
const methodHead = (platformReleaseId: string, profileBudget: ContinuationBudget = ZERO, houseReleaseId: string | null = null): DependencyHead => ({
  kind: "method_release",
  procedureId: PROCEDURE,
  platformReleaseId,
  houseReleaseId,
  profileBudget,
});
const execution = (
  executionId: string,
  dependencies: ExecutionDependency[],
  options: {budget?: ContinuationBudget; baseExecutionId?: string} = {},
): ContinuationExecution => ({
  executionId,
  workId: WORK,
  baseExecutionId: options.baseExecutionId ?? null,
  profileBudget: options.budget ?? ZERO,
  dependencies,
});
const derivation = (derived: readonly [string, number], parent: readonly [string, number]): SourceDerivationEdge => ({
  derived: version(derived[0], derived[1]),
  parent: version(parent[0], parent[1]),
});
const graph = (executions: ContinuationExecution[], heads: DependencyHead[], derivations: SourceDerivationEdge[] = []): ContinuationGraph => ({
  workId: WORK,
  executions,
  derivations,
  heads,
});
const event = (eventId: string, aggregateKind: string, aggregateId: string, aggregateVersion: number): DependencyChangeEvent => ({
  eventId,
  aggregateKind,
  aggregateId,
  aggregateVersion,
});
const persisted = (plan: RecomputePlan, state?: RecomputeCandidateState): RecomputeCandidateRecord[] => plan.candidates.map((candidate) => ({
  workId: WORK,
  idempotencyKey: candidate.idempotencyKey,
  baseExecutionId: candidate.baseExecutionId,
  state: state ?? (candidate.action === "recompute" ? "scheduled" : "awaiting_authorization"),
}));
const byId = <T extends {executionId: string}>(entries: readonly T[], executionId: string): T => {
  const found = entries.find((entry) => entry.executionId === executionId);
  if (!found) throw new Error(`missing ${executionId}`);
  return found;
};
const refusal = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a refusal");
};
const result = (milestoneId: string, sequence: number, executionId: string, label: string, workId = WORK): WorkMilestone => ({
  milestoneId, workId, sequence, kind: "execution_result", label, executionId, references: [], decision: null,
});
const decided = (
  milestoneId: string,
  sequence: number,
  references: string[],
  label: string,
  decision: {decisionId: string; revision: number; outcome?: "approved" | "rejected"},
  kind: "decision" | "update_adopted" | "human_resolved" = "decision",
  workId = WORK,
): WorkMilestone => ({
  milestoneId, workId, sequence, kind, label, executionId: null, references,
  decision: {decisionId: decision.decisionId, revision: decision.revision, outcome: decision.outcome ?? "approved"},
});
const milestone = (
  milestoneId: string,
  sequence: number,
  kind: "awaiting_human" | "continuation_proposed" | "human_resolved",
  references: string[],
  label: string,
): WorkMilestone => ({milestoneId, workId: WORK, sequence, kind, label, executionId: null, references, decision: null});

/** The case every scenario starts from: a balancete, two derived sources, a contract, one assumption set and the method. */
const derivations = [
  derivation(["dre-normalizada", 1], ["balancete", 1]),
  derivation(["indicadores", 1], ["dre-normalizada", 1]),
];
const executions = [
  execution("exec-direct", [source("balancete", 1), method(CURRENT_RELEASE)]),
  execution("exec-derived", [source("dre-normalizada", 1), method(CURRENT_RELEASE)]),
  execution("exec-derived-twice", [source("indicadores", 1), method(CURRENT_RELEASE)]),
  execution("exec-contract", [source("contrato-bancario", 1), method(CURRENT_RELEASE)]),
  execution("exec-rate", [slot("premissas", "taxa", 1, "d-taxa-1"), method(CURRENT_RELEASE)]),
  execution("exec-term", [slot("premissas", "prazo", 1, "d-prazo-1"), method(CURRENT_RELEASE)]),
  execution("exec-paid", [source("balancete", 1), slot("premissas", "prazo", 1, "d-prazo-1"), method(CURRENT_RELEASE)], {budget: PAID}),
];
const headsBefore = [
  sourceHead("balancete", 1), sourceHead("dre-normalizada", 1), sourceHead("indicadores", 1), sourceHead("contrato-bancario", 1),
  slotHead("premissas", "taxa", 1, "d-taxa-1"), slotHead("premissas", "prazo", 1, "d-prazo-1"), methodHead(CURRENT_RELEASE),
];
const withHeads = (replacements: DependencyHead[]): DependencyHead[] => headsBefore.map((head) =>
  replacements.find((replacement) => dependencyLogicalKeyId(keyOf(replacement)) === dependencyLogicalKeyId(keyOf(head))) ?? head);
const keyOf = (head: DependencyHead) => head.kind === "source_version"
  ? {kind: "source_version" as const, sourceId: head.sourceId}
  : head.kind === "assumption_slot"
    ? {kind: "assumption_slot" as const, setId: head.setId, slotKey: head.slotKey}
    : {kind: "method_release" as const, procedureId: head.procedureId};
const newBalancete = sourceHead("balancete", 2);
const newRate = [slotHead("premissas", "taxa", 2, "d-taxa-2"), slotHead("premissas", "prazo", 2, "d-prazo-1")];

describe("new balancete", () => {
  it("affects only executions bound to that source or derived from it", () => {
    const impact = computeDependencyImpact(graph(executions, withHeads([newBalancete]), derivations));
    expect(impact.affectedExecutionIds).toEqual(["exec-derived", "exec-derived-twice", "exec-direct", "exec-paid"]);
    expect(impact.unaffectedExecutionIds).toEqual(["exec-contract", "exec-rate", "exec-term"]);
    expect(impact.incompleteExecutionIds).toEqual([]);
    const moved = {key: {kind: "source_version", sourceId: "balancete"}, pinned: version("balancete", 1), current: version("balancete", 2)};
    expect(byId(impact.executions, "exec-direct").reasons).toEqual([{kind: "source_version", reasonClass: "data_change", ...moved, viaDerivedVersionIds: []}]);
    expect(byId(impact.executions, "exec-derived").reasons).toEqual([
      {kind: "source_version", reasonClass: "data_change", ...moved, viaDerivedVersionIds: ["dre-normalizada@v1"]},
    ]);
    expect(byId(impact.executions, "exec-derived-twice").reasons).toEqual([
      {kind: "source_version", reasonClass: "data_change", ...moved, viaDerivedVersionIds: ["indicadores@v1"]},
    ]);
  });

  it("recomputes the affected zero-budget executions and reuses the rest by hash", () => {
    const plan = planDependencyRecompute({graph: graph(executions, withHeads([newBalancete]), derivations), candidates: []});
    expect(plan.items.map((item) => [item.executionId, item.action])).toEqual([
      ["exec-contract", "reuse"],
      ["exec-derived", "recompute"],
      ["exec-derived-twice", "recompute"],
      ["exec-direct", "recompute"],
      ["exec-paid", "await_authorization"],
      ["exec-rate", "reuse"],
      ["exec-term", "reuse"],
    ]);
    const enqueued = plan.candidates.filter((candidate) => candidate.enqueue).map((candidate) => candidate.executionIds);
    expect(enqueued).toHaveLength(3);
    expect(enqueued).toEqual(expect.arrayContaining([["exec-derived"], ["exec-derived-twice"], ["exec-direct"]]));
    const impact = computeDependencyImpact(graph(executions, withHeads([newBalancete]), derivations));
    for (const item of plan.items) {
      if (item.action !== "reuse") continue;
      const assessed = byId(impact.executions, item.executionId);
      expect(item.inputFingerprint).toBe(assessed.pinnedInputFingerprint);
      expect(assessed.currentInputFingerprint).toBe(assessed.pinnedInputFingerprint);
    }
  });

  it("sees the derived source itself move once it is derived again from the new balancete", () => {
    const rederived = [...derivations, derivation(["dre-normalizada", 2], ["balancete", 2])];
    const impact = computeDependencyImpact(graph(
      [execution("exec-derived", [source("dre-normalizada", 1), method(CURRENT_RELEASE)])],
      [newBalancete, sourceHead("dre-normalizada", 2), methodHead(CURRENT_RELEASE)],
      rederived,
    ));
    expect(byId(impact.executions, "exec-derived").reasons.map((reason) => reason.kind === "source_version" ? reason.key.sourceId : reason.kind))
      .toEqual(["balancete", "dre-normalizada"]);
  });
});

describe("change of one assumption", () => {
  it("affects only executions that used the changed slot", () => {
    const impact = computeDependencyImpact(graph(
      [
        ...executions.filter((entry) => entry.executionId === "exec-rate" || entry.executionId === "exec-term"),
        execution("exec-both", [slot("premissas", "taxa", 1, "d-taxa-1"), slot("premissas", "prazo", 1, "d-prazo-1"), method(CURRENT_RELEASE)]),
      ],
      [...newRate, methodHead(CURRENT_RELEASE)],
    ));
    expect(impact.affectedExecutionIds).toEqual(["exec-both", "exec-rate"]);
    expect(impact.unaffectedExecutionIds).toEqual(["exec-term"]);
    const expectedReason = {
      kind: "assumption_slot",
      reasonClass: "data_change",
      key: {kind: "assumption_slot", setId: "premissas", slotKey: sha("taxa")},
      pinned: {revision: 1, versionId: "premissas@r1", decisionId: "d-taxa-1", contentFingerprint: sha("premissas@r1")},
      current: {revision: 2, versionId: "premissas@r2", decisionId: "d-taxa-2"},
    };
    expect(byId(impact.executions, "exec-rate").reasons).toEqual([expectedReason]);
    expect(byId(impact.executions, "exec-both").reasons).toEqual([expectedReason]);
    const term = byId(impact.executions, "exec-term");
    expect(term.currentInputFingerprint).toBe(term.pinnedInputFingerprint);
  });

  it("treats a slot the head revision no longer holds as changed", () => {
    const impact = computeDependencyImpact(graph(
      [execution("exec-term", [slot("premissas", "prazo", 1, "d-prazo-1"), method(CURRENT_RELEASE)])],
      [slotHead("premissas", "prazo", 2, null), methodHead(CURRENT_RELEASE)],
    ));
    expect(byId(impact.executions, "exec-term").reasons).toEqual([expect.objectContaining({
      kind: "assumption_slot",
      current: {revision: 2, versionId: "premissas@r2", decisionId: null},
    })]);
  });
});

describe("method change", () => {
  it("affects only executions on the older release, with the reason method_update", () => {
    const impact = computeDependencyImpact(graph(
      [
        execution("exec-old", [source("balancete", 1), method(OLD_RELEASE)]),
        execution("exec-new", [source("balancete", 1), method(CURRENT_RELEASE)]),
      ],
      [sourceHead("balancete", 1), methodHead(CURRENT_RELEASE)],
    ));
    expect(impact.affectedExecutionIds).toEqual(["exec-old"]);
    expect(impact.unaffectedExecutionIds).toEqual(["exec-new"]);
    expect(byId(impact.executions, "exec-old").reasons).toEqual([{
      kind: "method_release",
      reasonClass: "method_update",
      key: {kind: "method_release", procedureId: PROCEDURE},
      pinned: {platformReleaseId: OLD_RELEASE, houseReleaseId: null},
      current: {platformReleaseId: CURRENT_RELEASE, houseReleaseId: null},
    }]);
  });

  it("keeps method_update apart from a data change on the same execution", () => {
    const impact = computeDependencyImpact(graph(
      [execution("exec-old", [source("balancete", 1), method(OLD_RELEASE)])],
      [newBalancete, methodHead(CURRENT_RELEASE)],
    ));
    expect(byId(impact.executions, "exec-old").reasons.map((reason) => reason.reasonClass)).toEqual(["data_change", "method_update"]);
  });

  it("counts a new house release over the same platform release as a method update", () => {
    const impact = computeDependencyImpact(graph(
      [execution("exec-house", [source("balancete", 1), method(CURRENT_RELEASE, "house-2026.09.10")])],
      [sourceHead("balancete", 1), methodHead(CURRENT_RELEASE, ZERO, "house-2026.09.23")],
    ));
    expect(byId(impact.executions, "exec-house").reasons).toEqual([expect.objectContaining({
      reasonClass: "method_update",
      current: {platformReleaseId: CURRENT_RELEASE, houseReleaseId: "house-2026.09.23"},
    })]);
  });

  it("asks a person before a recomputation under a head release whose profile can spend", () => {
    const plan = planDependencyRecompute({
      graph: graph([execution("exec-old", [source("balancete", 1), method(OLD_RELEASE)])], [sourceHead("balancete", 1), methodHead(CURRENT_RELEASE, PAID)]),
      candidates: [],
    });
    expect(plan.candidates).toEqual([expect.objectContaining({action: "await_authorization", budget: PAID, enqueue: false, openWait: true})]);
  });

  it("keeps asking when the pinned profile could spend, even if the head release's profile cannot", () => {
    const plan = planDependencyRecompute({
      graph: graph([execution("exec-old", [source("balancete", 1), method(OLD_RELEASE)], {budget: PAID})], [sourceHead("balancete", 1), methodHead(CURRENT_RELEASE)]),
      candidates: [],
    });
    expect(plan.candidates).toEqual([expect.objectContaining({action: "await_authorization", budget: PAID, enqueue: false, openWait: true})]);
  });
});

describe("graph incomplete", () => {
  it("treats the whole output as affected and never reports reuse", () => {
    const incomplete = graph(
      [
        execution("exec-no-edges", []),
        execution("exec-unknown-head", [source("contrato-bancario", 1), method(CURRENT_RELEASE)]),
        execution("exec-unknown-ancestor", [source("fluxo-projetado", 1), method(CURRENT_RELEASE)]),
        execution("exec-moved-and-unknown", [source("balancete", 1), slot("premissas-2027", "taxa", 1, "d-taxa-2027"), method(CURRENT_RELEASE)]),
      ],
      [newBalancete, sourceHead("fluxo-projetado", 1), methodHead(CURRENT_RELEASE)],
      [derivation(["fluxo-projetado", 1], ["orcamento", 1])],
    );
    const plan = planDependencyRecompute({graph: incomplete, candidates: []});
    const impact = computeDependencyImpact(incomplete);
    expect(impact.incompleteExecutionIds).toEqual(["exec-moved-and-unknown", "exec-no-edges", "exec-unknown-ancestor", "exec-unknown-head"]);
    expect(impact.affectedExecutionIds).toEqual(impact.incompleteExecutionIds);
    expect(impact.unaffectedExecutionIds).toEqual([]);
    expect(byId(impact.executions, "exec-no-edges").gaps).toEqual([{code: "no_recorded_edges"}]);
    expect(byId(impact.executions, "exec-unknown-head").gaps).toEqual([
      {code: "head_unknown", key: {kind: "source_version", sourceId: "contrato-bancario"}, viaDerivedVersionIds: []},
    ]);
    expect(byId(impact.executions, "exec-unknown-ancestor").gaps).toEqual([
      {code: "head_unknown", key: {kind: "source_version", sourceId: "orcamento"}, viaDerivedVersionIds: ["fluxo-projetado@v1"]},
    ]);
    const mixed = byId(impact.executions, "exec-moved-and-unknown");
    expect(mixed.status).toBe("graph_incomplete");
    expect(mixed.reasons.map((reason) => reason.kind)).toEqual(["source_version"]);
    expect(mixed.gaps).toEqual([{code: "head_unknown", key: {kind: "assumption_slot", setId: "premissas-2027", slotKey: sha("taxa")}, viaDerivedVersionIds: []}]);
    expect(impact.executions.every((entry) => entry.currentInputFingerprint === null)).toBe(true);
    expect(plan.items.every((item) => item.action === "rebuild_graph")).toBe(true);
    expect(plan.candidates).toEqual([]);
  });

  it("does not trust a head older than the version the execution already used", () => {
    const impact = computeDependencyImpact(graph(
      [execution("exec-ahead", [source("balancete", 2), method(CURRENT_RELEASE)])],
      [sourceHead("balancete", 1), methodHead(CURRENT_RELEASE)],
    ));
    expect(byId(impact.executions, "exec-ahead").gaps).toEqual([
      {code: "head_behind_pin", key: {kind: "source_version", sourceId: "balancete"}, pinnedVersionId: "balancete@v2", currentVersionId: "balancete@v1"},
    ]);
    expect(impact.affectedExecutionIds).toEqual(["exec-ahead"]);
  });
});

describe("descendants keep decisions immutable", () => {
  const milestones: WorkMilestone[] = [
    result("m1", 1, "exec-rate", "Cenário de alongamento"),
    decided("m2", 2, ["m1"], "Alongamento da dívida bancária", {decisionId: "decision-1", revision: 1}),
    milestone("m3", 3, "awaiting_human", ["m1"], "Confirmar o cronograma com o banco"),
    decided("m4", 4, ["m3"], "Cronograma confirmado", {decisionId: "decision-2", revision: 1}, "human_resolved"),
    result("m5", 5, "exec-term", "Prazo médio da dívida"),
    milestone("m6", 6, "continuation_proposed", ["m2"], "Aprofundar o alongamento"),
    milestone("m7", 7, "awaiting_human", ["m5"], "Validar o prazo médio"),
  ];

  it("marks the affected result and what is built on it stale, and returns decisions and approvals untouched", () => {
    const descendants = collectDependencyDescendants({workId: WORK, affectedExecutionIds: ["exec-rate"], milestones});
    expect(descendants.stale).toEqual([
      {milestoneId: "m1", kind: "execution_result"},
      {milestoneId: "m3", kind: "awaiting_human"},
    ]);
    expect(descendants.referencedImmutable).toEqual([
      {milestoneId: "m2", kind: "decision", decisionId: "decision-1"},
      {milestoneId: "m4", kind: "human_resolved", decisionId: "decision-2"},
    ]);
  });

  it("leaves every milestone alone when nothing is affected", () => {
    expect(collectDependencyDescendants({workId: WORK, affectedExecutionIds: [], milestones})).toEqual({workId: WORK, stale: [], referencedImmutable: []});
  });
});

describe("milestones and waits", () => {
  const base: WorkMilestone[] = [
    result("m1", 1, "exec-paid", "Cenário com custo de modelo"),
    milestone("m2", 2, "awaiting_human", ["m1"], "Autorizar o custo da atualização"),
  ];

  it("keeps a wait open as a milestone, with no job and no lease, until a person resolves it", () => {
    expect(openWorkWaits({workId: WORK, milestones: base})).toEqual([
      {milestoneId: "m2", sequence: 2, label: "Autorizar o custo da atualização", references: ["m1"]},
    ]);
    const resolved = [...base, decided("m3", 3, ["m2"], "Custo autorizado", {decisionId: "authorization-1", revision: 1}, "human_resolved")];
    expect(openWorkWaits({workId: WORK, milestones: resolved})).toEqual([]);
  });

  it("refuses a resolution that does not close exactly one earlier wait of the same work", () => {
    const twice = [
      ...base,
      milestone("m3", 3, "human_resolved", ["m2"], "Custo autorizado"),
      milestone("m4", 4, "human_resolved", ["m2"], "Custo autorizado de novo"),
    ];
    expect(isContinuationContractError(refusal(() => openWorkWaits({workId: WORK, milestones: twice})), "wait_resolution_invalid")).toBe(true);
    const nothing = [...base, milestone("m3", 3, "human_resolved", ["m1"], "Resolvido sem espera")];
    expect(isContinuationContractError(refusal(() => openWorkWaits({workId: WORK, milestones: nothing})), "wait_resolution_invalid")).toBe(true);
    const forward = [milestone("m1", 1, "awaiting_human", ["m2"], "Espera"), result("m2", 2, "exec-rate", "Resultado")];
    expect(isContinuationContractError(refusal(() => openWorkWaits({workId: WORK, milestones: forward})), "milestone_reference_invalid")).toBe(true);
    const foreign = [result("m1", 1, "exec-rate", "Resultado", "another-work")];
    expect(isContinuationContractError(refusal(() => openWorkWaits({workId: WORK, milestones: foreign})), "milestone_work_mismatch")).toBe(true);
    const repeated = [...base, milestone("m2", 3, "awaiting_human", ["m1"], "Outra espera com o mesmo id")];
    expect(isContinuationContractError(refusal(() => openWorkWaits({workId: WORK, milestones: repeated})), "duplicate_milestone")).toBe(true);
  });
});

describe("duplicate delivery", () => {
  it("records an event once and leaves the request and the plan unchanged on redelivery", () => {
    const current = graph(executions, withHeads([newBalancete]), derivations);
    const impact = computeDependencyImpact(current);
    const balancete = event("event-balancete-2", "source", "balancete", 2);
    const first = mergeDependencyUpdate({workId: WORK, openRequest: null, events: [balancete], impact});
    expect(first.newEventIds).toEqual(["event-balancete-2"]);
    expect(first.request?.affectedExecutionIds).toEqual(["exec-derived", "exec-derived-twice", "exec-direct", "exec-paid"]);
    const again = mergeDependencyUpdate({workId: WORK, openRequest: first.request, events: [balancete, balancete], impact});
    expect(again.request).toEqual(first.request);
    expect(again.newEventIds).toEqual([]);
    expect(again.duplicateEventIds).toEqual(["event-balancete-2"]);
    expect(again.addedExecutionIds).toEqual([]);
    const plan = planDependencyRecompute({graph: current, candidates: []});
    expect(planDependencyRecompute({graph: current, candidates: []})).toEqual(plan);
  });

  it("refuses the same event id with another content and two events for one aggregate version", () => {
    const impact = computeDependencyImpact(graph(executions, withHeads([newBalancete]), derivations));
    const request = mergeDependencyUpdate({workId: WORK, openRequest: null, events: [event("event-1", "source", "balancete", 2)], impact}).request;
    expect(isContinuationContractError(refusal(() => mergeDependencyUpdate({
      workId: WORK, openRequest: request, events: [event("event-1", "source", "balancete", 3)], impact,
    })), "event_conflict")).toBe(true);
    expect(isContinuationContractError(refusal(() => mergeDependencyUpdate({
      workId: WORK, openRequest: request, events: [event("event-2", "source", "balancete", 2)], impact,
    })), "event_version_conflict")).toBe(true);
  });
});

describe("out-of-order event", () => {
  it("never lets an older version arriving late regress the computed state", () => {
    const impact = computeDependencyImpact(graph(executions, withHeads([sourceHead("balancete", 3)]), derivations));
    const second = event("event-balancete-2", "source", "balancete", 2);
    const third = event("event-balancete-3", "source", "balancete", 3);
    const inOrder = mergeDependencyUpdate({
      workId: WORK, openRequest: mergeDependencyUpdate({workId: WORK, openRequest: null, events: [second], impact}).request, events: [third], impact,
    });
    const lateFirst = mergeDependencyUpdate({workId: WORK, openRequest: null, events: [third], impact});
    const late = mergeDependencyUpdate({workId: WORK, openRequest: lateFirst.request, events: [second], impact});
    expect(late.lateEventIds).toEqual(["event-balancete-2"]);
    expect(late.request).toEqual(inOrder.request);
    expect(late.request?.aggregateVersions).toEqual([{aggregateKind: "source", aggregateId: "balancete", version: 3}]);
    expect(late.request?.events.map((entry) => entry.eventId)).toEqual(["event-balancete-2", "event-balancete-3"]);
    expect(mergeDependencyUpdate({workId: WORK, openRequest: null, events: [third, second], impact}).request).toEqual(inOrder.request);
    expect(byId(impact.executions, "exec-direct").reasons).toEqual([expect.objectContaining({current: version("balancete", 3)})]);
  });

  it("refuses a stored request that is not in its canonical, fingerprinted form", () => {
    const impact = computeDependencyImpact(graph(executions, withHeads([newBalancete]), derivations));
    const request = mergeDependencyUpdate({workId: WORK, openRequest: null, events: [event("event-1", "source", "balancete", 2)], impact}).request;
    if (!request) throw new Error("expected a request");
    const tampered = {...request, affectedExecutionIds: [...request.affectedExecutionIds, "exec-invented"]};
    expect(isContinuationContractError(refusal(() => mergeDependencyUpdate({workId: WORK, openRequest: tampered, events: [], impact})), "request_integrity_mismatch")).toBe(true);
    const forged = {...impact, affectedExecutionIds: []};
    expect(isContinuationContractError(refusal(() => mergeDependencyUpdate({workId: WORK, openRequest: null, events: [], impact: forged})), "impact_integrity_mismatch")).toBe(true);
    expect(isContinuationContractError(refusal(() => mergeDependencyUpdate({workId: "another-work", openRequest: request, events: [], impact})), "request_work_mismatch")).toBe(true);
  });
});

describe("concurrent changes", () => {
  const balanceteEvent = event("event-balancete-2", "source", "balancete", 2);
  const rateEvent = event("event-premissas-2", "assumption_set", "premissas", 2);
  const onlyBalancete = graph(executions, withHeads([newBalancete]), derivations);
  const both = graph(executions, withHeads([newBalancete, ...newRate]), derivations);

  it("keeps one open request with the union of affected executions and the ordered contributing events", () => {
    const impactA = computeDependencyImpact(onlyBalancete);
    const impactAB = computeDependencyImpact(both);
    const aThenB = mergeDependencyUpdate({
      workId: WORK, openRequest: mergeDependencyUpdate({workId: WORK, openRequest: null, events: [balanceteEvent], impact: impactA}).request,
      events: [rateEvent], impact: impactAB,
    });
    const bThenA = mergeDependencyUpdate({
      workId: WORK, openRequest: mergeDependencyUpdate({workId: WORK, openRequest: null, events: [rateEvent], impact: impactAB}).request,
      events: [balanceteEvent], impact: impactA,
    });
    expect(aThenB.request).toEqual(bThenA.request);
    expect(aThenB.addedExecutionIds).toEqual(["exec-rate"]);
    expect(aThenB.request?.affectedExecutionIds).toEqual(["exec-derived", "exec-derived-twice", "exec-direct", "exec-paid", "exec-rate"]);
    expect(aThenB.request?.events.map((entry) => entry.eventId)).toEqual(["event-premissas-2", "event-balancete-2"]);
    expect(aThenB.request?.aggregateVersions).toEqual([
      {aggregateKind: "assumption_set", aggregateId: "premissas", version: 2},
      {aggregateKind: "source", aggregateId: "balancete", version: 2},
    ]);
  });

  it("does not schedule again an execution already recomputed under the newest heads", () => {
    const first = planDependencyRecompute({graph: onlyBalancete, candidates: []});
    const settled = persisted(first, "settled");
    const next = planDependencyRecompute({graph: both, candidates: settled});
    const direct = byId(next.items, "exec-direct");
    const earlier = byId(first.items, "exec-direct");
    expect(direct.action === "recompute" && earlier.action === "recompute" && direct.idempotencyKey === earlier.idempotencyKey).toBe(true);
    const enqueued = next.candidates.filter((candidate) => candidate.enqueue).flatMap((candidate) => candidate.executionIds);
    expect(enqueued).toEqual(["exec-rate"]);
    expect(next.candidates.find((candidate) => candidate.executionIds.includes("exec-direct"))?.recordedState).toBe("settled");
  });
});

describe("worker restart", () => {
  it("gives the same plan from the same persisted inputs, in any order", () => {
    const current = graph(executions, withHeads([newBalancete, ...newRate]), derivations);
    const plan = planDependencyRecompute({graph: current, candidates: []});
    const reloaded = JSON.parse(JSON.stringify({
      ...current,
      executions: [...current.executions].reverse().map((entry) => ({...entry, dependencies: [...entry.dependencies].reverse()})),
      heads: [...current.heads].reverse(),
      derivations: [...current.derivations].reverse(),
    })) as ContinuationGraph;
    expect(planDependencyRecompute({graph: reloaded, candidates: []})).toEqual(plan);
    expect(computeDependencyImpact(reloaded)).toEqual(computeDependencyImpact(current));
  });

  it("schedules nothing twice once the first plan was persisted", () => {
    const current = graph(executions, withHeads([newBalancete, ...newRate]), derivations);
    const plan = planDependencyRecompute({graph: current, candidates: []});
    expect(plan.candidates.some((candidate) => candidate.enqueue)).toBe(true);
    const restarted = planDependencyRecompute({graph: current, candidates: persisted(plan)});
    expect(restarted.candidates.map((candidate) => candidate.idempotencyKey)).toEqual(plan.candidates.map((candidate) => candidate.idempotencyKey));
    expect(restarted.candidates.some((candidate) => candidate.enqueue || candidate.openWait)).toBe(false);
    expect(restarted.items).toEqual(plan.items);
    expect(restarted.supersededCandidateKeys).toEqual([]);
  });
});

describe("cost never repeated", () => {
  const current = graph(executions, withHeads([newBalancete]), derivations);

  it("enqueues a zero-budget recompute and puts a paid one to a person, without a job or a lease", () => {
    const plan = planDependencyRecompute({graph: current, candidates: []});
    const direct = plan.candidates.find((candidate) => candidate.executionIds.includes("exec-direct"));
    const paid = plan.candidates.find((candidate) => candidate.executionIds.includes("exec-paid"));
    expect(direct).toMatchObject({action: "recompute", budget: ZERO, enqueue: true, openWait: false, recordedState: null});
    expect(paid).toMatchObject({action: "await_authorization", budget: PAID, enqueue: false, openWait: true, recordedState: null});
    const item = byId(plan.items, "exec-direct");
    if (item.action !== "recompute") throw new Error("expected a recompute");
    expect(item.idempotencyKey).toBe(dependencyRecomputeKey({workId: WORK, baseExecutionId: "exec-direct", newInputFingerprint: item.newInputFingerprint}));
    expect(item.newInputFingerprint).toBe(byId(computeDependencyImpact(current).executions, "exec-direct").currentInputFingerprint);
  });

  it.each(["awaiting_authorization", "scheduled", "settled", "declined", "failed"] as const)(
    "does not schedule or ask again a key already recorded as %s",
    (state) => {
      const plan = planDependencyRecompute({graph: current, candidates: []});
      const again = planDependencyRecompute({graph: current, candidates: persisted(plan, state)});
      expect(again.candidates.every((candidate) => candidate.recordedState === state && !candidate.enqueue && !candidate.openWait)).toBe(true);
    },
  );

  it("gives one candidate to a lineage, so an open recomputation is not paid for twice", () => {
    const lineage = graph(
      [
        execution("exec-root", [source("balancete", 1), method(CURRENT_RELEASE)], {budget: PAID}),
        execution("exec-update", [source("balancete", 2), method(CURRENT_RELEASE)], {budget: PAID, baseExecutionId: "exec-root"}),
      ],
      [sourceHead("balancete", 3), methodHead(CURRENT_RELEASE)],
    );
    const plan = planDependencyRecompute({graph: lineage, candidates: []});
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({baseExecutionId: "exec-root", executionIds: ["exec-root", "exec-update"], action: "await_authorization", openWait: true});
  });

  it("plans a lineage from its newest execution: an up-to-date recomputation reuses the whole lineage", () => {
    const lineage = graph(
      [
        execution("exec-root", [source("balancete", 1), method(CURRENT_RELEASE)]),
        {...execution("exec-update", [source("balancete", 2), slot("basis", "revenue", 1, "decision-revenue"), method(CURRENT_RELEASE)], {baseExecutionId: "exec-root"}), lineageOrder: 1},
      ],
      [sourceHead("balancete", 2), slotHead("basis", "revenue", 1, "decision-revenue"), methodHead(CURRENT_RELEASE)],
    );
    const plan = planDependencyRecompute({graph: lineage, candidates: []});
    const update = computeDependencyImpact(lineage).executions.find((entry) => entry.executionId === "exec-update");
    expect(plan.candidates).toEqual([]);
    expect(byId(plan.items, "exec-root")).toEqual({executionId: "exec-root", action: "reuse", inputFingerprint: update?.pinnedInputFingerprint});
    expect(byId(plan.items, "exec-update")).toMatchObject({action: "reuse"});
  });

  it("gives a lineage one candidate even when its executions relied on different inputs, keyed on the newest", () => {
    const lineage = graph(
      [
        execution("exec-root", [source("balancete", 1), method(CURRENT_RELEASE)]),
        {...execution("exec-update", [source("balancete", 2), slot("basis", "revenue", 1, "decision-revenue"), method(CURRENT_RELEASE)], {baseExecutionId: "exec-root"}), lineageOrder: 1},
      ],
      [sourceHead("balancete", 3), slotHead("basis", "revenue", 1, "decision-revenue"), methodHead(CURRENT_RELEASE)],
    );
    const impact = computeDependencyImpact(lineage);
    const root = impact.executions.find((entry) => entry.executionId === "exec-root");
    const update = impact.executions.find((entry) => entry.executionId === "exec-update");
    expect(root?.currentInputFingerprint).not.toBe(update?.currentInputFingerprint);
    const plan = planDependencyRecompute({graph: lineage, candidates: []});
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({baseExecutionId: "exec-root", executionIds: ["exec-root", "exec-update"], newInputFingerprint: update?.currentInputFingerprint, enqueue: true});
    expect(plan.candidates[0]?.idempotencyKey).toBe(dependencyRecomputeKey({workId: WORK, baseExecutionId: "exec-root", newInputFingerprint: update?.currentInputFingerprint ?? ""}));
  });

  it("keeps an open record whose execution already relies on the current heads", () => {
    const earlier = graph([execution("exec-root", [source("balancete", 1), method(CURRENT_RELEASE)])], [sourceHead("balancete", 2), methodHead(CURRENT_RELEASE)]);
    const [record] = persisted(planDependencyRecompute({graph: earlier, candidates: []}));
    if (!record) throw new Error("expected a record");
    const produced = graph(
      [execution("exec-root", [source("balancete", 1), method(CURRENT_RELEASE)]), {...execution("exec-update", [source("balancete", 2), method(CURRENT_RELEASE)], {baseExecutionId: "exec-root"}), lineageOrder: 1}],
      [sourceHead("balancete", 2), methodHead(CURRENT_RELEASE)],
    );
    expect(planDependencyRecompute({graph: produced, candidates: [{...record, executionId: "exec-update"}]}).supersededCandidateKeys).toEqual([]);
    const moved = graph(produced.executions, [sourceHead("balancete", 3), methodHead(CURRENT_RELEASE)]);
    expect(planDependencyRecompute({graph: moved, candidates: [{...record, executionId: "exec-update"}]}).supersededCandidateKeys).toEqual([record.idempotencyKey]);
  });

  it("reports an open candidate the current heads no longer produce as superseded", () => {
    const earlier = planDependencyRecompute({graph: current, candidates: []});
    const later = planDependencyRecompute({graph: graph(executions, withHeads([sourceHead("balancete", 3)]), derivations), candidates: persisted(earlier)});
    expect(later.supersededCandidateKeys).toEqual(persisted(earlier).map((record) => record.idempotencyKey).sort());
    expect(later.candidates.every((candidate) => candidate.recordedState === null)).toBe(true);
  });

  it("refuses records of another work or a key recorded for another base", () => {
    const plan = planDependencyRecompute({graph: current, candidates: []});
    const [record] = persisted(plan);
    if (!record) throw new Error("expected a record");
    expect(isContinuationContractError(refusal(() => planDependencyRecompute({graph: current, candidates: [{...record, workId: "another-work"}]})), "candidate_work_mismatch")).toBe(true);
    expect(isContinuationContractError(refusal(() => planDependencyRecompute({graph: current, candidates: [{...record, baseExecutionId: "exec-invented"}]})), "candidate_conflict")).toBe(true);
    expect(isContinuationContractError(refusal(() => planDependencyRecompute({graph: current, candidates: [record, {...record, state: "settled"}]})), "candidate_conflict")).toBe(true);
  });
});

describe("continuation base resolution", () => {
  const approved: WorkMilestone[] = [
    result("r1", 1, "exec-1", "Cenário de alongamento da dívida"),
    decided("d1", 2, ["r1"], "Alongamento com os bancos atuais", {decisionId: "decision-alongamento", revision: 3}),
    result("r2", 3, "exec-2", "Refinanciamento por debêntures"),
    decided("d2", 4, ["r2"], "Emissão de debêntures", {decisionId: "decision-debentures", revision: 1}),
  ];

  it("resolves a single match to an explicit base and proposes an objective linked to its decision and revision", () => {
    const resolution = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "Aprofundar o alongamento aprovado", milestones: approved});
    expect(resolution).toEqual({
      status: "proposed",
      workId: WORK,
      conversationId: "conversation-1",
      terms: ["alongamento"],
      base: {milestoneId: "d1", decisionId: "decision-alongamento", revision: 3, label: "Alongamento com os bancos atuais"},
      objective: {request: "Aprofundar o alongamento aprovado", baseMilestoneId: "d1", baseDecisionId: "decision-alongamento", baseRevision: 3},
      milestone: {kind: "continuation_proposed", references: ["d1"]},
    });
    const shouted = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "APROFUNDAR  O ALONGAMENTO APROVADO", milestones: approved});
    expect(shouted.status === "proposed" && shouted.base.milestoneId).toBe("d1");
    const accented = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "Revisar a emissão de debêntures aprovada", milestones: approved});
    expect(accented.status === "proposed" && accented.base.milestoneId).toBe("d2");
  });

  it("asks which base when several approved bases match, and resolves once the text names one", () => {
    const two = [
      ...approved,
      result("r3", 5, "exec-3", "Alongamento via debêntures"),
      decided("d3", 6, ["r3"], "Alongamento com debêntures", {decisionId: "decision-alongamento-debentures", revision: 2}),
    ];
    const question = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "aprofundar o alongamento aprovado", milestones: two});
    expect(question).toEqual({
      status: "question",
      workId: WORK,
      conversationId: "conversation-1",
      terms: ["alongamento"],
      code: "ambiguous_base",
      options: [
        {milestoneId: "d1", decisionId: "decision-alongamento", revision: 3, label: "Alongamento com os bancos atuais"},
        {milestoneId: "d3", decisionId: "decision-alongamento-debentures", revision: 2, label: "Alongamento com debêntures"},
      ],
    });
    const named = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "aprofundar o alongamento com debêntures aprovado", milestones: two});
    expect(named.status === "proposed" && named.base.milestoneId).toBe("d3");
  });

  it("asks when no approved base matches, and offers the approved bases there are", () => {
    const none = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "aprofundar a securitização dos recebíveis", milestones: approved});
    expect(none).toMatchObject({status: "question", code: "no_approved_base", terms: ["securitizacao", "recebiveis"]});
    expect(none.status === "question" && none.options.map((option) => option.milestoneId)).toEqual(["d1", "d2"]);
    const nothingApproved = resolveWorkContinuation({
      workId: WORK, conversationId: "conversation-1", text: "aprofundar o alongamento", milestones: [result("r1", 1, "exec-1", "Cenário de alongamento")],
    });
    expect(nothingApproved).toMatchObject({status: "question", code: "no_approved_base", options: []});
    const vague = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "aprofundar o aprovado", milestones: approved});
    expect(vague).toMatchObject({status: "question", code: "no_approved_base", terms: []});
  });

  it("never picks the latest message or the newest artifact", () => {
    const history = [
      ...approved,
      result("r4", 5, "exec-4", "Alongamento revisado"),
      decided("d4", 6, ["r4"], "Alongamento revisado", {decisionId: "decision-revisado", revision: 1, outcome: "rejected"}),
      result("r5", 7, "exec-5", "Alongamento em preparo"),
    ];
    const resolution = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "aprofundar o alongamento", milestones: history});
    expect(resolution.status === "proposed" && resolution.base.milestoneId).toBe("d1");
    const adopted = [
      ...history,
      result("r6", 8, "exec-6", "Alongamento com o balancete de agosto"),
      decided("u1", 9, ["r6", "d1"], "Atualização do alongamento adotada", {decisionId: "decision-adocao", revision: 1}, "update_adopted"),
    ];
    const afterAdoption = resolveWorkContinuation({workId: WORK, conversationId: "conversation-1", text: "aprofundar o alongamento", milestones: adopted});
    expect(afterAdoption.status === "proposed" && afterAdoption.base).toEqual({
      milestoneId: "u1", decisionId: "decision-adocao", revision: 1, label: "Atualização do alongamento adotada",
    });
  });

  it("works for a standalone work that never had an intake session", () => {
    const standalone = "work-standalone-no-intake";
    const milestones = [
      result("r1", 1, "exec-direct-request", "Alternativas de estrutura de capital", standalone),
      decided("d1", 2, ["r1"], "Alongamento escolhido pelo CFO", {decisionId: "decision-cfo", revision: 1}, "decision", standalone),
    ];
    const resolution = resolveWorkContinuation({workId: standalone, conversationId: "conversation-standalone", text: "Aprofundar o alongamento aprovado", milestones});
    expect(resolution).toMatchObject({
      status: "proposed",
      workId: standalone,
      conversationId: "conversation-standalone",
      objective: {baseMilestoneId: "d1", baseDecisionId: "decision-cfo", baseRevision: 1},
    });
  });
});

describe("boundary cases", () => {
  it("handles an empty graph without inventing work", () => {
    const empty = graph([], []);
    const impact = computeDependencyImpact(empty);
    expect(impact).toMatchObject({executions: [], affectedExecutionIds: [], unaffectedExecutionIds: [], incompleteExecutionIds: []});
    expect(planDependencyRecompute({graph: empty, candidates: []})).toMatchObject({items: [], candidates: [], supersededCandidateKeys: []});
    expect(mergeDependencyUpdate({workId: WORK, openRequest: null, events: [event("event-1", "source", "balancete", 2)], impact}).request).toBeNull();
  });

  it("rejects a cycle in source derivation with a named error", () => {
    const cycle = refusal(() => computeDependencyImpact(graph(
      [execution("exec-a", [source("planilha-a", 1)])],
      [sourceHead("planilha-a", 1), sourceHead("planilha-b", 1)],
      [derivation(["planilha-a", 1], ["planilha-b", 1]), derivation(["planilha-b", 1], ["planilha-a", 1])],
    )));
    expect(isContinuationContractError(cycle, "source_derivation_cycle")).toBe(true);
    expect(cycle).toMatchObject({name: "ContinuationContractError", code: "source_derivation_cycle"});
    const itself = refusal(() => computeDependencyImpact(graph([], [], [derivation(["planilha-a", 1], ["planilha-a", 1])])));
    expect(isContinuationContractError(itself, "source_derivation_cycle")).toBe(true);
  });

  it("treats a head equal to the pinned version as unaffected and reusable", () => {
    const pinnedAtHead = graph(
      [execution("exec-current", [source("balancete", 2), slot("premissas", "taxa", 2, "d-taxa-2"), method(CURRENT_RELEASE)])],
      [newBalancete, slotHead("premissas", "taxa", 2, "d-taxa-2"), methodHead(CURRENT_RELEASE)],
    );
    const impact = computeDependencyImpact(pinnedAtHead);
    const current = byId(impact.executions, "exec-current");
    expect(current).toMatchObject({status: "unaffected", reasons: [], gaps: []});
    expect(current.currentInputFingerprint).toBe(current.pinnedInputFingerprint);
    expect(planDependencyRecompute({graph: pinnedAtHead, candidates: []}).items).toEqual([
      {executionId: "exec-current", action: "reuse", inputFingerprint: current.pinnedInputFingerprint},
    ]);
  });

  it("refuses inconsistent identities instead of guessing", () => {
    const conflicts: readonly [ContinuationGraph, string][] = [
      [graph([execution("exec-a", [{kind: "source_version", sourceId: "balancete", versionNo: 1, versionId: "balancete@v2"}])], [newBalancete]), "source_version_identity_conflict"],
      [graph([], [slotHead("premissas", "taxa", 2, "d-taxa-2"), slotHead("premissas", "prazo", 3, "d-prazo-1")]), "assumption_set_head_conflict"],
      [graph([], [newBalancete, newBalancete]), "duplicate_head"],
      [graph([execution("exec-a", []), execution("exec-a", [])], []), "duplicate_execution"],
      [graph([{...execution("exec-a", []), workId: "another-work"}], []), "execution_work_mismatch"],
      [graph([execution("exec-root", []), execution("exec-b", [], {baseExecutionId: "exec-root"}), execution("exec-c", [], {baseExecutionId: "exec-b"})], []), "execution_lineage_invalid"],
      [graph([execution("exec-a", [method(OLD_RELEASE), method(CURRENT_RELEASE)])], []), "multiple_method_pins"],
      [graph([execution("exec-a", [slot("premissas", "taxa", 1, "d-taxa-1")]), execution("exec-b", [slot("premissas", "taxa", 1, "d-taxa-9")])], []), "assumption_version_identity_conflict"],
    ];
    for (const [input, code] of conflicts) {
      const error = refusal(() => computeDependencyImpact(input));
      expect(isContinuationContractError(error), String(error)).toBe(true);
      expect((error as {code?: string}).code).toBe(code);
    }
  });
});
