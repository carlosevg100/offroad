import {describe, expect, it} from "vitest";
import {auditVoice, type VoiceString} from "@offroad/credit-playbook";
import {capitalDecisionCompositionFixture, capitalDecisionReviewFixture, capitalStructureDecisionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {composeCapitalStructureDecision} from "./capital-decision-composition";
import {prepareCapitalDecisionDelivery} from "./capital-decision-delivery";
import {prepareCapitalProcedurePacket} from "./capital-procedure-packet";
import {capitalPacketFixture, integratedCapitalPacketFixture} from "./capital-procedure-packet.test-support";
import {prepareCapitalStructureComparison} from "./capital-structure-decision";

/** Every string leaf of a value, keyed by the path that lets somebody find it. */
function* strings(node: unknown, path = "$"): Generator<VoiceString> {
  if (typeof node === "string") {
    yield {id: path, text: node};
    return;
  }
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index++) yield* strings(node[index], `${path}[${index}]`);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) yield* strings(value, `${path}.${key}`);
  }
}

const blocked = (value: unknown) => {
  const entries = [...strings(value)];
  expect(entries.length).toBeGreaterThan(0);
  return auditVoice(entries, {channel: "packet"})
    .filter((finding) => finding.severity === "block")
    .map((finding) => `${finding.stringId} ${finding.ruleId} ${finding.code}: ${finding.excerpt}`);
};

describe("capital packet voice", () => {
  // The voice filter reads the packet the way a reader would: every string, wherever the
  // fixture or the composer put it. Warnings are for review; a blocked pattern is a defect.
  it.each([
    ["comparison input", () => capitalStructureDecisionFixture().input],
    ["composition input", () => capitalDecisionCompositionFixture().input],
    ["review input", () => capitalDecisionReviewFixture().input],
    ["procedure packet input", () => capitalPacketFixture()],
    ["integrated procedure packet input", () => integratedCapitalPacketFixture()],
  ])("%s fixture carries no blocked voice pattern", (_name, build) => {
    expect(blocked(build())).toEqual([]);
  });

  it.each([
    ["comparison", () => prepareCapitalStructureComparison(capitalStructureDecisionFixture().input)],
    ["composition", () => composeCapitalStructureDecision(capitalDecisionCompositionFixture().input)],
    ["delivery with material", () => prepareCapitalDecisionDelivery({review: capitalDecisionReviewFixture().input, material: {requested: true, audience: "authorized_work_participants"}})],
    ["procedure packet", () => prepareCapitalProcedurePacket(capitalPacketFixture())],
    ["integrated procedure packet", () => prepareCapitalProcedurePacket(integratedCapitalPacketFixture())],
  ])("%s output carries no blocked voice pattern", (_name, produce) => {
    expect(blocked(produce())).toEqual([]);
  });

  it("walks nested objects and arrays down to every string", () => {
    const entries = [...strings({a: ["x", {b: "y"}], c: {d: "z", e: 1, f: null}})];
    expect(entries).toEqual([
      {id: "$.a[0]", text: "x"},
      {id: "$.a[1].b", text: "y"},
      {id: "$.c.d", text: "z"},
    ]);
  });
});
