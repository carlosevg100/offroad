import {describe, expect, it} from "vitest";

import {
  buildDecisionArtifactContract,
  decisionArtifactContractSchema,
  decisionArtifactIdentityReport,
  traceDecisionArtifactBlock,
  type DecisionArtifactContractInput,
} from "./decision-artifact";

const hash = (value: string) => value.repeat(64).slice(0, 64);

function fixture(): DecisionArtifactContractInput {
  return {
    schemaVersion: "2026.09.07-v1",
    caseId: "gc02",
    snapshotFingerprint: hash("a"),
    asOf: "2026-05-31",
    status: "reference",
    release: {state: "internal_only", recipientIds: []},
    sources: [{id: "src-itr", title: "ITR", classification: "public", asOf: "2026-05-31", locator: "nota 15"}],
    assumptions: [{id: "asm-rate", label: "Taxa de rollover", value: 0.1541, unit: "% a.a.", basis: "CDI + 150 bps", sourceIds: ["src-itr"], editable: true, material: true}],
    gaps: [{id: "gap-covenant", label: "Definição de covenant", materiality: "blocker", impact: "Headroom não computável", requestedInput: "Definição contratual"}],
    claims: [{
      id: "claim-debt",
      label: "Dívida bruta",
      value: 5_670_186,
      unit: "R$ mil",
      evidenceState: "calculated",
      object: {id: "obj-ledger", type: "debt_ledger", fingerprint: hash("b"), path: "accountingGrossDebt"},
      sourceIds: ["src-itr"],
      assumptionIds: [],
      gapIds: [],
    }],
    views: [
      {surface: "conversation", artifactId: "chat-v1", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "chat-debt", kind: "metric", title: "Dívida", claimIds: ["claim-debt"], sourceIds: [], assumptionIds: [], gapIds: []}]},
      {surface: "workbook", artifactId: "model-v1", artifactKind: "xlsx", artifactFingerprint: null, blocks: [{id: "model-debt", kind: "table", title: "Dívida", claimIds: ["claim-debt"], sourceIds: [], assumptionIds: [], gapIds: []}]},
      {surface: "presentation", artifactId: "deck-v1", artifactKind: "pptx", artifactFingerprint: null, blocks: [{id: "deck-debt", kind: "metric", title: "Dívida", claimIds: ["claim-debt"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    ],
    identityRequirements: [{claimId: "claim-debt", surfaces: ["conversation", "workbook", "presentation"]}],
  };
}

describe("governed decision artifact", () => {
  it("binds the conversation, workbook and presentation to the same claim", () => {
    const contract = buildDecisionArtifactContract(fixture());
    expect(decisionArtifactIdentityReport(contract)).toMatchObject({valid: true});
    expect(traceDecisionArtifactBlock(contract, "workbook", "model-debt")?.claims[0]).toMatchObject({id: "claim-debt", value: 5_670_186});
    expect(decisionArtifactContractSchema.parse(contract).contractFingerprint).toHaveLength(64);
  });

  it("rejects a surface that omits a required claim", () => {
    const input = fixture();
    input.views[2]!.blocks[0]!.claimIds = [];
    input.views[2]!.blocks[0]!.gapIds = ["gap-covenant"];
    expect(() => buildDecisionArtifactContract(input)).toThrow(/claim-debt is absent from presentation/);
  });

  it("rejects release while a blocker is open", () => {
    const input = fixture();
    input.status = "approved";
    input.release = {state: "approved_for_named_recipients", recipientIds: ["board"]};
    for (const view of input.views) view.artifactFingerprint = hash("c");
    expect(() => buildDecisionArtifactContract(input)).toThrow(/blocker gaps cannot be released/);
  });

  it("detects mutation after the fingerprint was signed", () => {
    const contract = buildDecisionArtifactContract(fixture());
    const mutated = structuredClone(contract);
    mutated.claims[0]!.value = 1;
    expect(() => decisionArtifactContractSchema.parse(mutated)).toThrow(/fingerprint does not match/);
  });

  it("rejects two values for the same signed object path", () => {
    const input = fixture();
    input.claims.push({...input.claims[0]!, id: "claim-debt-divergent", value: 1});
    input.views[0]!.blocks[0]!.claimIds.push("claim-debt-divergent");
    expect(() => buildDecisionArtifactContract(input)).toThrow(/carries divergent values/);
  });

  it("governs chart points and their lineage instead of allowing display-only numbers", () => {
    const input = fixture();
    input.series = [{
      id: "series-maturity",
      label: "Vencimentos",
      unit: "R$ milhões",
      chartKind: "column",
      object: {id: "obj-wall", type: "maturity_wall", fingerprint: hash("c"), path: "grossSchedule"},
      points: [{label: "2027", value: 100, evidenceState: "calculated", sourceIds: ["src-itr"], assumptionIds: [], gapIds: []}],
    }];
    input.views[2]!.blocks[0]!.seriesIds = ["series-maturity"];
    const contract = buildDecisionArtifactContract(input);
    expect(contract.series?.[0]?.points[0]?.value).toBe(100);

    input.series[0]!.points[0]!.sourceIds = ["unknown-source"];
    expect(() => buildDecisionArtifactContract(input)).toThrow(/unknown reference unknown-source/);
  });
});
