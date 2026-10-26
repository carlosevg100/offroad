import {beforeAll, describe, expect, it} from "vitest";
import {proposeOperatingProjectionHypotheses, proposeProjectionChallengeHypotheses, proposeQuarterUpdateHypotheses, proposeReceivablesFundingHypotheses,
  type OperatingProjectionFacts, type ProjectionChallengeFacts, type ProposedHypothesis, type QuarterUpdateFacts, type ReceivablesFundingFacts} from "@offroad/financial-model";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";
import {operatingProjectionReader, operatingProjectionReaderGaps} from "./operating-projection-premises-proposal";
import {projectionChallengeReader, projectionChallengeReaderGaps} from "./projection-challenge-premises-proposal";
import {receivablesFundingReader, receivablesFundingReaderGaps} from "./receivables-funding-premises-proposal";
import {quarterUpdateReader, quarterUpdateReaderGaps} from "./quarter-update-premises-proposal";
import {auroraQuarterUpdatePriors, financialModelFixture} from "./lote2-premises.test-support";
import weeklyPacket from "../../../packages/domain-contracts/src/fixtures/weekly-cash-result-packet.json";

type Method = {name: string; facts: () => unknown; propose: (f: never) => ProposedHypothesis[]; reader: (b: BoundBasis) => unknown; gaps: (f: never) => string[]};
const methods: Method[] = [];
let priors: Awaited<ReturnType<typeof auroraQuarterUpdatePriors>>;
beforeAll(async () => {
  const c24 = (await financialModelFixture<{auroraProjectionFacts: () => OperatingProjectionFacts}>("operating-projection.test-support.ts")).auroraProjectionFacts;
  const c26 = (await financialModelFixture<{auroraProjectionFacts: () => ProjectionChallengeFacts}>("projection-challenge.test-support.ts")).auroraProjectionFacts;
  const c35 = (await financialModelFixture<{auroraReceivablesFundingFacts: () => ReceivablesFundingFacts}>("receivables-funding.test-support.ts")).auroraReceivablesFundingFacts;
  const c54 = (await financialModelFixture<{auroraQuarterUpdateFacts: (w: string, c: string) => QuarterUpdateFacts}>("quarter-update.test-support.ts")).auroraQuarterUpdateFacts;
  priors = await auroraQuarterUpdatePriors(weeklyPacket as unknown as Record<string, unknown>);
  methods.push(
    {name: "C24", facts: c24, propose: proposeOperatingProjectionHypotheses as never, reader: operatingProjectionReader, gaps: operatingProjectionReaderGaps as never},
    {name: "C26", facts: c26, propose: proposeProjectionChallengeHypotheses as never, reader: projectionChallengeReader, gaps: projectionChallengeReaderGaps as never},
    {name: "C35", facts: c35, propose: proposeReceivablesFundingHypotheses as never, reader: receivablesFundingReader, gaps: receivablesFundingReaderGaps as never},
    {name: "C54", facts: () => c54(priors.weeklyCash.envelopeFingerprint, priors.covenant.envelopeFingerprint), propose: proposeQuarterUpdateHypotheses as never,
      reader: quarterUpdateReader(priors), gaps: ((f: QuarterUpdateFacts) => quarterUpdateReaderGaps(f, priors)) as never});
});

describe("the method's own reader runs before the card is offered (independent review, round 9)", () => {
  it("passes the calibration facts of each method, so a card the reader accepts is offered as before", () => {
    for (const m of methods) expect(m.gaps(m.facts() as never), m.name).toEqual([]);
  });
  it("names two hypotheses for one slot with different values, for each method", () => {
    for (const m of methods) {
      const h = m.propose(m.facts() as never), k = h.findIndex((x) => x.value.type === "number");
      const twin = {...h[k]!, value: {type: "number", value: "123456"}} as ProposedHypothesis;
      const gaps = readerGaps([...h, twin], m.reader);
      expect(gaps.length, m.name).toBe(1);
      expect(gaps[0]!.startsWith("conflictingSlot."), m.name).toBe(true);
    }
  });
  it("turns any refusal of the reader or the packet into a named gap, for each method", () => {
    for (const m of methods) {
      // A basis without the analysis' own anchor: the reader refuses it.
      expect(readerGaps([], m.reader)[0]!.startsWith("readerRefused."), m.name).toBe(true);
      expect(readerGaps(m.propose(m.facts() as never), () => {throw new Error("Order Ambiguous!");}), m.name).toEqual(["readerRefused.order_ambiguous"]);
    }
  });
  it("catches the reviewer's two transforms of one stream, which the reader would refuse after confirmation", () => {
    const m = methods.find((x) => x.name === "C54")!, f = m.facts() as QuarterUpdateFacts;
    const u = f.streamUpdates.find((x) => x.value.transform.kind === "scale")!;
    const twice = {...f, streamUpdates: [...f.streamUpdates.map((x) => x === u ? {...x, value: {...x.value, transform: {kind: "scale" as const, factor: "0.9"}}} : x),
      {...u, value: {...u.value, transform: {kind: "scale" as const, factor: "0.7"}}}]};
    const gaps = quarterUpdateReaderGaps(twice, priors);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((g) => g.startsWith("conflictingSlot.streamUpdate.") || g.startsWith("readerRefused."))).toBe(true);
  });
});
