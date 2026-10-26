import {describe, expect, it} from "vitest";
import {auditVoice, selectMethod} from "@offroad/credit-playbook";
import {openExecutionGates, packetSystemStrings} from "./gates";
import {composeMethodExecutionRequest} from "./compose";
// The calibration packets of fichas C24, C26, C35 and C54, shared with the result protocol tests.
import projection from "../../domain-contracts/src/fixtures/operating-projection-result-packet.json";
import challenge from "../../domain-contracts/src/fixtures/projection-challenge-result-packet.json";
import funding from "../../domain-contracts/src/fixtures/receivables-funding-result-packet.json";
import quarter from "../../domain-contracts/src/fixtures/quarter-update-result-packet.json";

const company = {entityId: "ac400000-0000-4000-9000-000000000001", registration: "registered", research: "recorded", researchAsOf: "2026-10-26T12:00:00+00:00"} as const;
const methods = [
  {methodId: "build-operating-projection", situations: ["stable-business-high-conversion", "structural-working-capital", "capex-infrastructure"], packet: projection},
  {methodId: "challenge-financial-projection", situations: ["stable-business-high-conversion", "structural-working-capital", "capex-infrastructure"], packet: challenge},
  {methodId: "monetize-receivables-for-working-capital", situations: ["seasonal-working-capital", "structural-working-capital"], packet: funding},
  {methodId: "update-after-quarter-close", situations: ["seasonal-working-capital", "near-covenant"], packet: quarter},
];

// The lote 3 executors are packaged on main (#952): the gates open over the released version, refuse any other
// version as method_unavailable, serve the situations the premise cards ask, and the calibration packets pass
// the voice gate.
describe.each(methods)("gates of $methodId 2026.10.26-v1", ({methodId, situations, packet}) => {
  const method = {methodId, methodVersion: "2026.10.26-v1", manifestHash: "0".repeat(64)};
  it.each(situations)("serve the situation the premise card asks (%s)", (situationId) => {
    expect(selectMethod({situationIds: [situationId], methodId, methodVersion: method.methodVersion}).situations[0]!.servedByMethod).toBe(true);
  });
  it("pass the voice gate over the calibration packet", () => {
    expect(auditVoice(packetSystemStrings(packet), {channel: "packet"}).filter((f) => f.severity === "block")).toEqual([]);
  });
  it("open over the packaged release, and only over that version", () => {
    expect(openExecutionGates({company, method, situationIds: [situations[0]!], referenceDate: "2026-10-26"})).toMatchObject({ok: true});
    expect(openExecutionGates({company, method: {...method, methodVersion: "2026.10.23-v1"}, situationIds: [situations[0]!], referenceDate: "2026-10-26"}))
      .toEqual({ok: false, error: "method_unavailable"});
  });
  it("refuse a situation the method does not serve", () => {
    expect(() => selectMethod({situationIds: ["receivables"], methodId, methodVersion: method.methodVersion})).toThrow("method_not_applicable_for_situation");
  });
});

describe("the quarter close over one basis", () => {
  const basis = {profile: {method: {methodId: "update-after-quarter-close"}}} as never;
  const ask = {question: "Fechou o trimestre.", objectives: [], asOf: "2026-10-26", situationIds: ["near-covenant"]};
  const ids = {executionId: "", requestId: "", processingRunId: "", snapshotId: ""};
  it("refuses by name without both prior results", () => {
    expect(composeMethodExecutionRequest({basis, ask, ids})).toEqual({ok: false, error: "priors_missing"});
    const prior = {executionId: "e", inputSnapshot: "{}", resultFingerprint: "f".repeat(64), sources: []};
    expect(composeMethodExecutionRequest({basis, ask, ids, priors: {weeklyCash: prior, covenant: null}})).toEqual({ok: false, error: "priors_missing"});
  });
});
