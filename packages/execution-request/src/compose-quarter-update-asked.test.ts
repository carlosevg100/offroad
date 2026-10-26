import {beforeEach, describe, expect, it, vi} from "vitest";

// The financial model is exercised in its own package (quarter-update-stored-priors.test.ts carries the
// plano-2027 case); here only what the request composer hands it is observed.
const composed = vi.hoisted(() => ({calls: [] as unknown[]}));
vi.mock("@offroad/financial-model", async (original) => ({
  ...await original<typeof import("@offroad/financial-model")>(),
  composeQuarterUpdateFromStoredPriors: (input: unknown) => { composed.calls.push(input); return {}; },
}));
const {composeQuarterUpdatePacket} = await import("./compose");

const basis = {workId: "w", purpose: "p", versionId: "v", envelope: {canonical: "{}", fingerprint: "f"}} as never;
const ask = {question: "Fechou o trimestre. Atualiza o caixa, o covenant e o plano de 2027.", objectives: [], asOf: "2026-10-26", situationIds: ["near-covenant"]};
const prior = (snapshot: string) => ({executionId: "e", inputSnapshot: snapshot, resultFingerprint: "r", sources: []});
const priors = {weeklyCash: prior("{\"w\":1}"), covenant: prior("{\"c\":1}")};

describe("the quarter close packet carries the dependents the person asked to update (independent review, round 5)", () => {
  beforeEach(() => { composed.calls.length = 0; });
  it("passes the asked dependents with the stored priors verbatim", () => {
    composeQuarterUpdatePacket(basis, ask, priors, ["plano-2027"]);
    expect(composed.calls).toEqual([{update: {envelope: {canonical: "{}", fingerprint: "f"}, scope: {workId: "w", purpose: "p", versionId: "v"}},
      question: ask.question, prior: {weeklyCash: "{\"w\":1}", covenant: "{\"c\":1}"}, askedDependentIds: ["plano-2027"]}]);
  });
  it("passes none when the person asked for none", () => {
    composeQuarterUpdatePacket(basis, ask, priors, []);
    expect((composed.calls[0] as {askedDependentIds: string[]}).askedDependentIds).toEqual([]);
  });
});
