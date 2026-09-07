import {describe, expect, it} from "vitest";

import {compositionPolicy, intentEnvelopeSchema, namedCompositionKeys, type NamedComposition} from "./intent-envelope";

const explicit = <T>(value: T) => ({value, state: "explicit" as const});
const system = <T>(value: T) => ({value, state: "system" as const});

function candidate(composition: NamedComposition) {
  const policy = compositionPolicy(composition);
  return {
    schemaVersion: "intent-envelope.v1" as const,
    routingCore: {
      action: explicit([composition]),
      object: explicit([{kind: "process" as const}]),
      desiredOutcome: explicit("resultado materialmente definido"),
      decision: explicit(null),
      audience: explicit(["solicitante"]),
      depth: explicit(policy.depth),
      continuity: explicit("new" as const),
      workResponsibility: explicit([...policy.workResponsibilities]),
    },
    executionContext: {
      evidenceRegime: system("unresolved" as const),
      authority: system([]),
      organizationId: system("10000000-0000-4000-8000-000000000001"),
      projectId: system(null),
      availableDocumentIds: system([]),
      jurisdiction: explicit([]),
      asOfDate: explicit(null),
      currency: explicit(null),
      deadline: explicit(null),
      sponsorInstruction: explicit(null),
      constraints: explicit([]),
      language: system("pt-BR" as const),
      urgency: explicit(null),
      availableInputs: explicit([]),
    },
    primaryWorks: policy.primaryWorks.map((work) => ({work, confidence: 0.99})),
    composition,
    effect: policy.effect,
    createdAt: "2026-09-07T12:00:00.000Z",
  };
}

describe("canonical composition policy", () => {
  it("validates every one of the twenty Atlas compositions from one policy", () => {
    expect(namedCompositionKeys).toHaveLength(20);
    for (const composition of namedCompositionKeys) {
      expect(intentEnvelopeSchema.parse(candidate(composition)).composition).toBe(composition);
    }
  });

  it.each(["primaryWorks", "depth", "workResponsibility", "effect"] as const)(
    "rejects a %s fork from the composition policy",
    (field) => {
      const value = candidate("introduce");
      if (field === "primaryWorks") value.primaryWorks = [{work: "market", confidence: 0.99}];
      if (field === "depth") value.routingCore.depth = explicit("point");
      if (field === "workResponsibility") value.routingCore.workResponsibility = explicit(["producer"]);
      if (field === "effect") value.effect = "none";
      expect(intentEnvelopeSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects an unknown composition instead of letting the catalogue drift", () => {
    expect(intentEnvelopeSchema.safeParse({...candidate("monitor"), composition: "future_composition"}).success).toBe(false);
  });
});
