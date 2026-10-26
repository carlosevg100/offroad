import {describe, expect, it} from "vitest";
import {checkQuarterUpdatePins} from "./quarter-update-pins";

const hex = (c: string) => c.repeat(64);
const snapshot = (envelope: string) => JSON.stringify({schemaVersion: "x", analysis: {envelope: {fingerprint: envelope}}});
const prior = (executionId: string, resultFingerprint: string, envelope: string) => ({executionId, inputSnapshot: snapshot(envelope), resultFingerprint, sources: []});
const shown = {weeklyCash: prior("a0000000-0000-4000-8000-000000000001", hex("1"), hex("a")), covenant: prior("a0000000-0000-4000-8000-000000000002", hex("2"), hex("b"))};
const summary = {priorResults: [{role: "weekly_cash", executionId: shown.weeklyCash.executionId, resultFingerprint: hex("1")},
  {role: "covenant", executionId: shown.covenant.executionId, resultFingerprint: hex("2")}]};
const facts = {priorWeeklyFingerprint: {value: hex("a")}, priorCovenantFingerprint: {value: hex("b")}};

describe("the quarter close card pins the exact priors it showed", () => {
  it("confirms over the very executions and packets on the card", () => {
    expect(checkQuarterUpdatePins(summary, facts, shown)).toEqual({ok: true, pins: summary.priorResults});
  });
  it("is superseded by another weekly cash execution on the same basis with other numbers (independent review, round 3)", () => {
    // Same envelope, other streams in the informed case: another execution and another packet.
    const later = {...shown, weeklyCash: prior("a0000000-0000-4000-8000-000000000003", hex("3"), hex("a"))};
    expect(checkQuarterUpdatePins(summary, facts, later)).toEqual({ok: false, error: "superseded"});
    expect(checkQuarterUpdatePins(summary, facts, {...shown, covenant: prior(shown.covenant.executionId, hex("4"), hex("b"))})).toEqual({ok: false, error: "superseded"});
  });
  it("is superseded when the card carries no pins, or a basis the stored priors do not have", () => {
    expect(checkQuarterUpdatePins({}, facts, shown)).toEqual({ok: false, error: "superseded"});
    expect(checkQuarterUpdatePins(summary, {...facts, priorWeeklyFingerprint: {value: hex("c")}}, shown)).toEqual({ok: false, error: "superseded"});
  });
});
