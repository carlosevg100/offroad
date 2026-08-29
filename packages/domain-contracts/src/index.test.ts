import {describe, expect, it} from "vitest";

import {
  dealWorkflowAllows,
  deriveDealWorkflowState,
  initialDealWorkflowState,
  scenarioTermsSchema,
  taskEnvelopeSchema,
  type DealStateObject,
} from "./index";

describe("domain contracts", () => {
  it("rejects a task without a tenant boundary", () => {
    expect(() => taskEnvelopeSchema.parse({taskId: crypto.randomUUID()})).toThrow();
  });

  it("rejects floating or malformed economic inputs", () => {
    expect(() => scenarioTermsSchema.parse({amount: 10.5})).toThrow();
  });

  it("keeps an unconfirmed case in diagnosis and blocks paid downstream work", () => {
    const state = deriveDealWorkflowState([]);
    expect(state).toEqual(initialDealWorkflowState);
    expect(dealWorkflowAllows(state, "prepare")).toBe(false);
    expect(dealWorkflowAllows(state, "match")).toBe(false);
  });

  it("unlocks prepare only after understanding, structure and production plan gates", () => {
    const objects = [
      object("understanding_snapshot", "confirmed", 1),
      object("structure_decision", "confirmed", 1),
      object("production_plan", "approved", 1),
    ];
    const state = deriveDealWorkflowState(objects);
    expect(state.stage).toBe("prepare");
    expect(dealWorkflowAllows(state, "prepare")).toBe(true);
    expect(dealWorkflowAllows(state, "match")).toBe(false);
  });

  it("uses only the latest active version of each object", () => {
    const state = deriveDealWorkflowState([
      object("understanding_snapshot", "confirmed", 1),
      object("understanding_snapshot", "stale", 2),
      object("structure_decision", "approved", 1),
      object("production_plan", "approved", 1),
    ]);
    expect(state.stage).toBe("prepare");
    expect(state.objectFingerprints.understanding_snapshot).toBe("a".repeat(64));
  });
});

function object(
  objectType: DealStateObject["objectType"],
  status: DealStateObject["status"],
  objectVersion: number,
): DealStateObject {
  return {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    intakeSessionId: crypto.randomUUID(),
    objectType,
    objectVersion,
    status,
    inputFingerprint: "b".repeat(64),
    objectFingerprint: objectVersion === 1 ? "a".repeat(64) : "c".repeat(64),
    payload: {},
    dependencies: [],
    createdBy: crypto.randomUUID(),
    createdAt: "2026-08-29T12:00:00.000Z",
    supersededAt: null,
  };
}
