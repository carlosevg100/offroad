import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedCapitalPeriodFixture, capitalStructureDecisionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalProcedurePacketV2InputSchema, composeBoundCapitalPacketV2, deriveBoundCapitalScope, prepareCapitalProcedurePacketV2} from "./index";

type Snapshot = {workId: string; purpose: string; versionId: string; entries: Array<{decisionId: string; slotKey: string; fieldPath: string; dimensions: Record<string, string | null>}>};
function seal(snapshot: Snapshot) {
  const canonical = JSON.stringify(snapshot);
  const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  const scope = {workId: snapshot.workId, purpose: snapshot.purpose, versionId: snapshot.versionId};
  return {envelope, scope, basis: readContextualBasis(envelope, scope)};
}
const framing = {question: "Does the current structure sustain the declared plan?", objectives: ["Measure liquidity under the adopted plan"]};
const domains = ["source", "assumption", "contract", "market", "implementation", "recommendation"];
function walk(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) value.forEach(v => walk(v, visit));
  else if (value && typeof value === "object") {visit(value as Record<string, unknown>); Object.values(value).forEach(v => walk(v, visit));}
}

describe("bound capital packet composer", () => {
  it("reads the projection scope from the basis instead of asking for it", () => {
    const sparse = seal(capitalStructureDecisionFixture().snapshot as Snapshot);
    expect(deriveBoundCapitalScope(sparse.basis, "2027-12-31")).toEqual({entityId: "c1500000-0000-4000-9000-000000000001", perimeter: "standalone", currency: "BRL",
      openingDate: "2027-12-31", endDate: "2028-12-31", openingScenario: "house-current", scenario: "house-current"});
    const rich = seal(adoptedCapitalPeriodFixture().snapshot as Snapshot);
    expect(deriveBoundCapitalScope(rich.basis, "2026-12-31")).toEqual({entityId: "c1510000-0000-4000-9000-000000000001", perimeter: "standalone", currency: "BRL",
      openingDate: "2026-12-31", endDate: "2027-02-28", openingScenario: "actual", scenario: "house"});
    // An earlier reference date still lands on the latest adopted opening on or before it.
    expect(deriveBoundCapitalScope(rich.basis, "2027-01-15").openingDate).toBe("2026-12-31");
  });

  it("composes a bound packet from a basis without projection operands and the executor reports gaps, not a crash", () => {
    const f = capitalStructureDecisionFixture(); const {envelope, scope, basis} = seal(f.snapshot as Snapshot);
    const packet = composeBoundCapitalPacketV2({envelope, scope, ...framing, asOf: "2027-12-31", ...deriveBoundCapitalScope(basis, "2027-12-31")});
    expect(capitalProcedurePacketV2InputSchema.safeParse(packet).success).toBe(true);
    const alternative = packet.decision.review.composition.alternatives[0]!;
    expect(packet.decision.review.composition.alternatives).toHaveLength(1); expect(alternative.kind).toBe("maintain");
    expect(alternative.projection.operating.envelope).toEqual(envelope); expect(alternative.projection.funding.kind).toBe("no_debt");
    expect(packet.contracts).toEqual([]); expect(packet.adoptionLinks).toEqual([]);
    expect(packet.decision.review.composition.recommendation).toBeNull(); expect(packet.decision.review.composition.sensitivities).toEqual([]);
    const selections: Array<{decisionId: string | null; definitionVersionId: string; missingReason: string | null}> = [];
    walk(packet, node => {if ("missingReason" in node) selections.push(node as typeof selections[number]);});
    expect(selections).toHaveLength(26);
    expect(selections.every(s => s.decisionId === null && typeof s.missingReason === "string" && s.missingReason.length > 0)).toBe(true);
    // The schema forces a definition reference on a missing operand; the basis supplies it and the reason says so.
    const references = new Set(basis.entries.map(e => e.dimensions.definitionVersionId));
    expect(selections.every(s => references.has(s.definitionVersionId) && s.missingReason!.includes("placeholder"))).toBe(true);
    const result = prepareCapitalProcedurePacketV2(packet);
    expect(result.status).toBe("partial"); expect(result.decision.status).toBe("partial");
    expect(result.decision.alternatives[0]!.projection.summary).toBeNull(); expect(result.decision.alternatives[0]!.projection.rows).toBeNull();
    expect(result.decision.informationGaps.map(g => g.code)).toContain("alternatives_required");
    const missing = result.decision.informationGaps.filter(g => g.code === "projection_input_missing");
    expect(missing.map(g => g.reason.split(":")[0])).toEqual(expect.arrayContaining(["operating_projection.convention", "operating_projection.periodEnds", "capital.financingInventory", "liquidity.available_cash", "capital.operatingCashAccount"]));
    expect(missing.every(g => g.subjectId === "current" && g.reason.includes("No contribution adopted"))).toBe(true);
    expect(result.decision.nextRequirements).toEqual(domains); expect(result.decision.recommendation).toBeNull();
    expect(result.decision.provenance.contributionIds).toEqual([]); expect(result.decision.grantsExecution).toBe(false);
  });

  it("resolves every operand the basis carries by field path and dimensions and reproduces the fixture's own projection", () => {
    const f = adoptedCapitalPeriodFixture(); const {envelope, scope, basis} = seal(f.snapshot as Snapshot);
    const packet = composeBoundCapitalPacketV2({envelope, scope, ...framing, asOf: "2026-12-31", ...deriveBoundCapitalScope(basis, "2026-12-31")});
    const projection = packet.decision.review.composition.alternatives[0]!.projection;
    expect(projection.operating).toEqual({...f.input.operating, envelope, numericInterpretations: []});
    if (projection.funding.kind !== "debt") throw new Error("adopted instrument terms must produce the debt funding path");
    const {coverageReason: _composed, ...funding} = projection.funding.input;
    const {coverageReason: _fixture, ...expected} = f.input.funding.input;
    expect(funding).toEqual({...expected, envelope, numericInterpretations: []});
    expect(projection.operatingCashAccount).toEqual(f.input.operatingCashAccount); expect(projection.capitalMovements).toEqual(f.input.capitalMovements);
    expect(projection.capitalMovementInventory).toEqual(f.input.capitalMovementInventory);
    const result = prepareCapitalProcedurePacketV2(packet);
    expect(result.decision.alternatives[0]!.projection.summary!.closingAvailable).toBe("123");
    expect(result.decision.informationGaps.map(g => g.code)).not.toContain("projection_input_missing");
    expect(result.status).toBe("partial"); expect(result.decision.informationGaps.map(g => g.code)).toContain("alternatives_required");
    expect(result.decision.provenance.contributionIds.length).toBeGreaterThan(20);
  });

  it("declares an ambiguous slot missing instead of picking one of two matching contributions", () => {
    const f = adoptedCapitalPeriodFixture(); const snapshot = f.snapshot as Snapshot;
    const original = snapshot.entries.find(e => e.fieldPath === "operating_projection.convention")!;
    snapshot.entries.push({...structuredClone(original), decisionId: "c1590000-0000-4000-9000-000000000001", slotKey: "f".repeat(64)});
    const {envelope, scope, basis} = seal(snapshot);
    const packet = composeBoundCapitalPacketV2({envelope, scope, ...framing, asOf: "2026-12-31", ...deriveBoundCapitalScope(basis, "2026-12-31")});
    const convention = packet.decision.review.composition.alternatives[0]!.projection.operating.convention;
    expect(convention.decisionId).toBeNull(); expect(convention.missingReason).toContain("2 contributions match operating_projection.convention");
    expect(convention.definitionVersionId).toBe(original.dimensions.definitionVersionId); expect(convention.missingReason).not.toContain("placeholder");
    const result = prepareCapitalProcedurePacketV2(packet);
    expect(result.decision.informationGaps.some(g => g.code === "projection_input_missing" && g.reason.startsWith("operating_projection.convention"))).toBe(true);
  });

  it("keeps every identity the database walker checks inside the pinned basis", () => {
    const f = adoptedCapitalPeriodFixture(); const {envelope, scope, basis} = seal(f.snapshot as Snapshot);
    const packet = composeBoundCapitalPacketV2({envelope, scope, ...framing, asOf: "2026-12-31", ...deriveBoundCapitalScope(basis, "2026-12-31")});
    const decisions = new Set(basis.entries.map(e => e.decisionId)); const definitions = new Set(basis.entries.map(e => e.dimensions.definitionVersionId));
    let envelopes = 0;
    walk(packet, node => {
      if ("workId" in node) expect(node.workId).toBe(scope.workId);
      if ("purpose" in node) expect(node.purpose).toBe(scope.purpose);
      if ("versionId" in node) expect(node.versionId).toBe(scope.versionId);
      if ("canonical" in node) {envelopes += 1; expect(node).toEqual(envelope);}
      for (const [key, value] of Object.entries(node)) {
        if ((key === "decisionId" || key.endsWith("DecisionId")) && value !== null) expect(decisions.has(value as string)).toBe(true);
        if (key === "definitionVersionId") expect(definitions.has(value as string)).toBe(true);
        if (key === "entityId") expect(value).toBe("c1510000-0000-4000-9000-000000000001");
      }
    });
    expect(envelopes).toBeGreaterThan(0); expect(packet.adoptionLinks).toEqual([]);
  });

  it("produces the same bytes for the same inputs and refuses a basis outside the scope", () => {
    const f = adoptedCapitalPeriodFixture(); const {envelope, scope, basis} = seal(f.snapshot as Snapshot);
    const input = {envelope, scope, ...framing, asOf: "2026-12-31", ...deriveBoundCapitalScope(basis, "2026-12-31")};
    const first = composeBoundCapitalPacketV2(input); const second = composeBoundCapitalPacketV2(JSON.parse(JSON.stringify(input)));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first)); expect(second).toEqual(first);
    expect(() => composeBoundCapitalPacketV2({...input, scope: {...scope, versionId: "c1590000-0000-4000-9000-000000000009"}})).toThrow("adoption_basis_scope_mismatch");
    expect(() => composeBoundCapitalPacketV2({...input, envelope: {...envelope, canonical: envelope.canonical + " "}})).toThrow("adoption_basis_integrity_mismatch");
  });
});
