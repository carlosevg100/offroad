import type {ModelGateway} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {governedShadowAccessBasis, shadowIntentEnvelope, shadowRoutingOutputSchema, stampIntentEnvelope, type ShadowRoutingContext} from "./intent-shadow";

const field = <T,>(value: T, state: "explicit" | "inferred" | "ambiguous" | "unknown" = "explicit") => ({
  value, state, confidence: state === "explicit" ? 1 : 0.7,
});

function validOutput() {
  return shadowRoutingOutputSchema.parse({
    routingCore: {
      action: field(["understand"]), object: field([{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: "Camil"}]}]),
      decisionType: field("none"), audienceType: field("internal_senior"),
      depth: field("preliminary", "inferred"), continuity: field("new"), workResponsibility: field(["producer"]),
    },
    inferableContext: {
      jurisdiction: field(["BR"], "inferred"), asOfDate: field(null, "unknown"), currency: field("BRL", "inferred"),
      deadline: field(null, "unknown"), sponsorInstruction: field(null, "unknown"), constraints: field([]),
      urgency: field(null, "unknown"), availableInputs: field([]),
    },
    primaryWorks: [{work: "understand", confidence: 0.8}], composition: "understand_company_sector_asset",
    firstQuestion: null, abstain: false, abstainReason: null,
  });
}

const context: ShadowRoutingContext = {
  locale: "pt-BR", message: "Analise a Camil.", recentMessages: [],
  organizationId: "20000000-0000-4000-8000-000000000001",
  projectId: "30000000-0000-4000-8000-000000000001",
  entryJob: "origination_thesis", accessBasis: "public_information", authorityGrants: ["read"], documentIds: [], professionalContext: null,
};

describe("shadow intent observability boundary", () => {
  it("does not infer evidence or authority from a project id or documents", () => {
    const output = validOutput();
    const unresolved = stampIntentEnvelope(output, {
      ...context,
      accessBasis: governedShadowAccessBasis("legacy_private_value"),
      authorityGrants: [],
      documentIds: ["40000000-0000-4000-8000-000000000001"],
    });
    expect(unresolved.executionContext.evidenceRegime).toEqual({value: "unresolved", state: "system"});
    expect(unresolved.executionContext.authority).toEqual({value: [], state: "system"});
  });

  it("stamps an external effect from the canonical composition policy, not from the model", () => {
    const output = validOutput();
    const introduced = stampIntentEnvelope({
      ...output,
      composition: "introduce",
      routingCore: {
        ...output.routingCore,
        action: field(["introduce"], "inferred"),
        depth: field("institutional", "inferred"),
        workResponsibility: field(["coordinator"], "inferred"),
      },
      primaryWorks: [{work: "capital_match", confidence: 0.99}],
    }, {...context, authorityGrants: []});
    expect(introduced.effect).toBe("external");
    expect(introduced.executionContext.authority.value).toEqual([]);
  });

  it("replaces the provider-controlled model identifier with the governed route", async () => {
    let completed = false;
    const gateway = {
      complete: async () => {
        completed = true;
        return {output: validOutput(), model: "CLIENT_SECRET_MODEL", provider: "anthropic"};
      },
      spent: () => ({costUsd: completed ? 0.02 : 0, calls: completed ? 1 : 0, unknownCostCalls: 0, budgetExposureUsd: completed ? 0.02 : 0}),
    } as unknown as ModelGateway;
    const result = await shadowIntentEnvelope({gateway, context});
    expect(result).toMatchObject({modelRoute: "governed_model_route", costUsd: 0.02, calls: 1});
    expect(JSON.stringify(result)).not.toContain("CLIENT_SECRET_MODEL");
  });

  it("fails closed before returning an envelope when spend telemetry is invalid", async () => {
    let completed = false;
    const gateway = {
      complete: async () => {
        completed = true;
        return {output: validOutput(), model: "CLIENT_SECRET_MODEL", provider: "anthropic"};
      },
      spent: () => completed
        ? {costUsd: Number.NaN, calls: Number.POSITIVE_INFINITY, unknownCostCalls: 0, budgetExposureUsd: 20_000}
        : {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0},
    } as unknown as ModelGateway;
    await expect(shadowIntentEnvelope({gateway, context})).rejects.toThrow("invalid_model_telemetry");
  });
});
