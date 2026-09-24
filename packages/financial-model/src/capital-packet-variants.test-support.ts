import {createHash} from "node:crypto";
import {prepareCapitalProcedurePacket} from "./capital-procedure-packet";
import {prepareCapitalProcedurePacketV2} from "./capital-procedure-packet-v2";
import {capitalPacketFixture, integratedCapitalPacketFixture} from "./capital-procedure-packet.test-support";
import {capitalPacketV2Fixture, indexedPacketFixture, integratedCapitalPacketV2Fixture} from "./capital-indexed-contracts.test-support";

// Evaluation-only module; not exported to application consumers. All packets are synthetic.
type PacketV2Input = ReturnType<typeof capitalPacketV2Fixture>;
type Composition = PacketV2Input["decision"]["review"]["composition"];

/** Every packet fixture of the package, run through the executor that returns it. */
export const capitalPacketFixtures = [
  ["v1 base", () => prepareCapitalProcedurePacket(capitalPacketFixture())],
  ["v1 integrated", () => prepareCapitalProcedurePacket(integratedCapitalPacketFixture())],
  ["v2 base", () => prepareCapitalProcedurePacketV2(capitalPacketV2Fixture())],
  ["v2 integrated", () => prepareCapitalProcedurePacketV2(integratedCapitalPacketV2Fixture())],
  ["v2 indexed", () => prepareCapitalProcedurePacketV2(indexedPacketFixture())],
] as const;

function revenueDecisionId(projection: Composition["alternatives"][number]["projection"]): string {
  const revenue = projection.operating.revenue;
  if (revenue.mode !== "drivers" || !revenue.quantities.decisionId) throw new Error("Synthetic driver fixture required");
  return revenue.quantities.decisionId;
}

function run(edit: (input: PacketV2Input) => void) {
  const input = capitalPacketV2Fixture();
  edit(input);
  return prepareCapitalProcedurePacketV2(input);
}

/** The recommendation names an alternative and the facts that would change it. */
export const recommendedPacket = (alternativeId: "maintain" | "change") => run((input) => {
  const composition = input.decision.review.composition;
  const alternative = composition.alternatives.find((entry) => entry.id === alternativeId)!;
  composition.recommendation = {alternativeId, rationale: "Synthetic rationale", basisDecisionIds: [revenueDecisionId(alternative.projection)],
    conditions: [], wouldChangeIf: ["Synthetic change fact"]};
});

/** Every review item supported, optionally one conditional: the packet is prepared for human review. */
export const preparedPacket = (conditionalIndex: number | null = null) => run((input) => {
  const evidence = revenueDecisionId(input.decision.review.composition.alternatives[0]!.projection);
  input.decision.review.reviewItems.forEach((item, index) => {
    item.status = index === conditionalIndex ? "conditional" : "supported";
    item.evidenceIds = [evidence];
  });
});

/** No projection can be calculated: the packet is partial with zero calculated rows. */
export const partialPacketWithoutProjection = () => run((input) => {
  const composition = input.decision.review.composition;
  for (const entry of [...composition.alternatives, ...composition.sensitivities]) {
    const revenue = entry.projection.operating.revenue;
    if (revenue.mode !== "drivers") throw new Error("Synthetic driver fixture required");
    revenue.quantities.decisionId = null;
    revenue.quantities.missingReason = "Synthetic source absent";
  }
});

/** No alternative at all: the packet only frames the decision. */
export const framedPacket = () => run((input) => {
  input.decision.review.composition.alternatives = [];
  input.decision.review.composition.sensitivities = [];
  input.decision.review.alternativeConditions = [];
});

/** One alternative, with or without an explicit exclusion of the current structure. */
export const singleAlternativePacket = (withMaintenanceExclusion: boolean) => run((input) => {
  const review = input.decision.review;
  const kept = withMaintenanceExclusion ? "change" : "maintain";
  const alternative = review.composition.alternatives.find((entry) => entry.id === kept)!;
  review.composition.alternatives = [alternative];
  review.composition.sensitivities = review.composition.sensitivities.filter((entry) => entry.baseAlternativeId === kept);
  review.composition.maintenanceExclusion = withMaintenanceExclusion
    ? {reason: "Synthetic exclusion", basisDecisionIds: [revenueDecisionId(alternative.projection)]}
    : null;
  review.alternativeConditions = review.alternativeConditions.filter((entry) => entry.id === kept);
});

/** No sensitivity: nothing tests the calculated alternatives against an adverse case. */
export const packetWithoutSensitivity = () => run((input) => {
  input.decision.review.composition.sensitivities = [];
});

/**
 * One adopted unit of revenue per period in the current structure: its available cash closes the
 * horizon below zero, and the declared volume sensitivity closes above it, so it is not adverse.
 */
export const negativeCashPacket = () => run((input) => {
  const composition = input.decision.review.composition;
  const snapshot = JSON.parse(composition.alternatives[0]!.projection.operating.envelope.canonical);
  snapshot.entries.find((entry: {fieldPath: string; dimensions: {scenario: string}}) =>
    entry.fieldPath === "operating_projection.revenue.quantities" && entry.dimensions.scenario === "house").value.value = ["1", "1"];
  const canonical = JSON.stringify(snapshot);
  const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  for (const entry of [...composition.alternatives, ...composition.sensitivities]) {
    entry.projection.operating.envelope = envelope;
    if (entry.projection.funding.kind !== "debt") throw new Error("Synthetic debt fixture required");
    entry.projection.funding.input.envelope = envelope;
  }
});
