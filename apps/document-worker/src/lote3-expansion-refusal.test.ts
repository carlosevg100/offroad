import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

// Each lote 3 turn hands its spec to the shared turn step; the spec is recorded and then run for real.
const recorded = vi.hoisted(() => ({specs: [] as {logPrefix: string; expansionRefusalAsGap?: boolean; readerCheck?: unknown; build: (facts: unknown, situationId: string) => unknown}[]}));
vi.mock("./lote2-premises", async (original) => {
  const real = await original<typeof import("./lote2-premises")>();
  return {...real, proposeLote2PremisesForTurn: async (spec: never) => { recorded.specs.push(spec); return null; }};
});
const {proposeLote2PremisesForTurn} = await vi.importActual<typeof import("./lote2-premises")>("./lote2-premises");
const {proposeOperatingProjectionPremisesForTurn} = await import("./operating-projection-premises-proposal");
const {proposeProjectionChallengePremisesForTurn} = await import("./projection-challenge-premises-proposal");
const {proposeReceivablesFundingPremisesForTurn} = await import("./receivables-funding-premises-proposal");
const {proposeQuarterUpdatePremisesForTurn} = await import("./quarter-update-premises-proposal");

const base = {hasAttachments: false, recentUserMessages: [], projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], extract: async () => ({}), log: () => {}};
const prior = (n: number) => ({executionId: `a0000000-0000-4000-8000-00000000007${n}`, resultFingerprint: String(n).repeat(64), envelopeFingerprint: "a".repeat(64), packet: {}});

describe("any refusal to expand facts into hypotheses is a gap in the turn, for the four lote 3 methods (independent review, round 8)", () => {
  it("each turn opts in, and its own expansion throwing yields a named gap, never a dropped card", async () => {
    await proposeOperatingProjectionPremisesForTurn({...base, message: "Me ajuda a montar o business plan."});
    await proposeProjectionChallengePremisesForTurn({...base, message: "Esse plano está otimista?"});
    await proposeReceivablesFundingPremisesForTurn({...base, message: "Quero antecipar recebíveis em vez de pegar linha no banco."});
    await proposeQuarterUpdatePremisesForTurn({...base, message: "Fechou o trimestre. Atualiza tudo.", loadPriors: async () => ({weeklyCash: prior(1), covenant: prior(2)})});
    expect(recorded.specs.map((s) => [s.logPrefix, s.expansionRefusalAsGap])).toEqual([["operating_projection_premises", true], ["projection_challenge_premises", true],
      ["receivables_funding_premises", true], ["quarter_update_premises", true]]);
    // Round 9: each also runs the method's own reader before offering the card.
    expect(recorded.specs.map((s) => typeof s.readerCheck)).toEqual(["function", "function", "function", "function"]);
    for (const spec of recorded.specs) {
      const events: string[] = [];
      // Facts the method's expansion refuses: its proposeXHypotheses throws.
      const turn = await proposeLote2PremisesForTurn({logPrefix: spec.logPrefix, expansionRefusalAsGap: true, idName: "x", schema: z.object({turnIntent: z.string()}).loose(),
        complete: () => ({status: "complete", facts: {}, situationId: "x", housePremiseKeys: []}), build: spec.build as never},
        {...base, entry: "cue", message: "x", extract: async () => ({turnIntent: "answers_pending"}), log: (event) => {events.push(event);}});
      expect(turn, spec.logPrefix).toEqual({forAdvisor: {status: "missing", missing: ["premisesRefused"]}, proposal: null});
      expect(events).toEqual([`${spec.logPrefix}.expansion_refused`]);
    }
  });
  it("names the basis limit apart, and leaves a spec that does not opt in (lote 2) as before", async () => {
    const run = (expansionRefusalAsGap: boolean | undefined, message: string) => proposeLote2PremisesForTurn({logPrefix: "p", idName: "x", schema: z.object({turnIntent: z.string()}).loose(),
      complete: () => ({status: "complete" as const, facts: {}, situationId: "x", housePremiseKeys: []}), build: () => { throw new Error(message); }, ...expansionRefusalAsGap === undefined ? {} : {expansionRefusalAsGap}},
      {...base, entry: "cue", message: "x", extract: async () => ({turnIntent: "answers_pending"})});
    expect(await run(true, "quarter_update_premises_exceed_basis")).toEqual({forAdvisor: {status: "missing", missing: ["tooManyItems"]}, proposal: null});
    expect(await run(true, "anything else")).toEqual({forAdvisor: {status: "missing", missing: ["premisesRefused"]}, proposal: null});
    expect(await run(undefined, "quarter_update_premises_exceed_basis")).toBeNull();
  });
  it("offers no card when the reader check names a refusal, and says what it refused", async () => {
    const events: string[] = [];
    const turn = await proposeLote2PremisesForTurn({logPrefix: "p", idName: "x", schema: z.object({turnIntent: z.string()}).loose(),
      complete: () => ({status: "complete" as const, facts: {}, situationId: "x", housePremiseKeys: []}),
      build: () => ({methodId: "m", methodVersion: "v", facts: {}, hypotheses: [], summary: {situationId: "x", referenceDate: null, items: []}, fingerprint: "f"}),
      expansionRefusalAsGap: true, readerCheck: () => ["readerRefused.quarter_update_order_ambiguous"]},
      {...base, entry: "cue", message: "x", extract: async () => ({turnIntent: "answers_pending"}), log: (event) => {events.push(event);}});
    expect(turn).toEqual({forAdvisor: {status: "missing", missing: ["readerRefused.quarter_update_order_ambiguous"]}, proposal: null});
    expect(events).toEqual(["p.reader_refused"]);
  });
});
