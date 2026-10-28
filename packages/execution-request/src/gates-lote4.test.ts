import {describe, expect, it} from "vitest";
import {auditVoice, selectMethod} from "@offroad/credit-playbook";
import {openExecutionGates, packetSystemStrings, releasedMethodReferenceDataKeys} from "./gates";
import {composeMethodExecutionRequest} from "./compose";
// The calibration packets of fichas C09, C01, C32 (2027 plan) and C47, shared with the result protocol tests.
import folder from "../../domain-contracts/src/fixtures/document-folder-result-packet.json";
import proposal from "../../domain-contracts/src/fixtures/received-proposal-result-packet.json";
import paths from "../../domain-contracts/src/fixtures/financing-paths-result-packet.json";
import board from "../../domain-contracts/src/fixtures/board-material-result-packet.json";

const company = {entityId: "ac400000-0000-4000-9000-000000000001", registration: "registered", research: "recorded", researchAsOf: "2026-10-27T12:00:00+00:00"} as const;
const methods = [
  {methodId: "organize-document-folder", situations: ["unaudited-divergent-numbers", "refinancing"], packet: folder},
  {methodId: "evaluate-received-proposal", situations: ["seasonal-working-capital", "structural-working-capital", "capex-infrastructure", "refinancing"], packet: proposal},
  {methodId: "evaluate-financing-paths", situations: ["refinancing", "capex-infrastructure", "seasonal-working-capital"], packet: paths},
  {methodId: "prepare-board-capital-discussion", situations: ["refinancing", "capex-infrastructure", "seasonal-working-capital"], packet: board},
];

describe.each(methods)("gates of $methodId 2026.10.27-v1", ({methodId, situations, packet}) => {
  const method = {methodId, methodVersion: "2026.10.27-v1", manifestHash: "0".repeat(64)};
  it("declare the procedure's reference data keys (none: every convention is an adopted premise)", () => {
    expect(releasedMethodReferenceDataKeys[`${methodId}@2026.10.27-v1`]).toEqual([]);
  });
  it.each(situations)("serve the situation the premise card asks (%s)", (situationId) => {
    expect(selectMethod({situationIds: [situationId], methodId, methodVersion: method.methodVersion}).situations[0]!.servedByMethod).toBe(true);
  });
  it("pass the voice gate over the calibration packet", () => {
    expect(auditVoice(packetSystemStrings(packet), {channel: "packet"}).filter((f) => f.severity === "block")).toEqual([]);
  });
  it("open over the released version, and only over that version", () => {
    expect(openExecutionGates({company, method, situationIds: [situations[0]!], referenceDate: "2026-10-27"})).toMatchObject({ok: true});
    expect(openExecutionGates({company, method: {...method, methodVersion: "2026.10.26-v1"}, situationIds: [situations[0]!], referenceDate: "2026-10-27"}))
      .toEqual({ok: false, error: "method_unavailable"});
  });
  it("refuse a situation the method does not serve", () => {
    expect(() => selectMethod({situationIds: ["receivables"], methodId, methodVersion: method.methodVersion})).toThrow("method_not_applicable_for_situation");
  });
});

describe("the lote 4 methods that read beyond their basis", () => {
  const ask = {question: "Prepara a discussão.", objectives: [], asOf: "2026-10-27", situationIds: ["refinancing"]};
  const ids = {executionId: "", requestId: "", processingRunId: "", snapshotId: ""};
  it("refuses the board material by name without the reviewed results", () => {
    const basis = {profile: {method: {methodId: "prepare-board-capital-discussion"}}} as never;
    expect(composeMethodExecutionRequest({basis, ask, ids})).toEqual({ok: false, error: "priors_missing"});
  });
  it("refuses the folder by name without its mode and prior", () => {
    const basis = {profile: {method: {methodId: "organize-document-folder"}}} as never;
    expect(composeMethodExecutionRequest({basis, ask, ids})).toEqual({ok: false, error: "priors_missing"});
  });
});
