import {describe, expect, it} from "vitest";
import {closeExecutionGates, openExecutionGates} from "./gates";
// The calibration packets of fichas C10, C12 and C18, shared with the result protocol tests.
import debtTable from "../../domain-contracts/src/fixtures/debt-table-result-packet.json";
import covenant from "../../domain-contracts/src/fixtures/covenant-headroom-result-packet.json";
import weekly from "../../domain-contracts/src/fixtures/weekly-cash-result-packet.json";

const company = {entityId: "ac400000-0000-4000-9000-000000000001", registration: "registered", research: "recorded", researchAsOf: "2026-10-20T12:00:00+00:00"} as const;
const methods = [
  {methodId: "build-company-debt-table", situations: ["refinancing", "near-covenant", "restructuring"], packet: debtTable},
  {methodId: "measure-covenant-headroom", situations: ["near-covenant"], packet: covenant},
  {methodId: "project-weekly-cash", situations: ["seasonal-working-capital"], packet: weekly},
];

describe.each(methods)("gates of $methodId 2026.10.23-v1", ({methodId, situations, packet}) => {
  const method = {methodId, methodVersion: "2026.10.23-v1", manifestHash: "0".repeat(64)};
  it.each(situations)("open for the situation the premise card asks (%s) and close over the calibration packet", (situationId) => {
    const opened = openExecutionGates({company, method, situationIds: [situationId], referenceDate: "2026-10-23"});
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const closed = closeExecutionGates(opened, packet);
    expect(closed.ok, JSON.stringify(closed.findings)).toBe(true);
  });
  it("refuse a situation the method does not serve", () => {
    expect(openExecutionGates({company, method, situationIds: ["receivables"], referenceDate: "2026-10-23"})).toMatchObject({ok: false});
  });
});
