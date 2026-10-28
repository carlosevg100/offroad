import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema} from "./artifact-protocol";
import {readReceivedProposalPacketBlocks, receivedProposalPacketBlocks, type ReceivedProposalPacketLike} from "./lote4-received-proposal-result-blocks";
// The packet and blocks the SQL mapping is proved against: the synthetic Aurora calibration of ficha C01, in BRL millions.
import blocksFixture from "./fixtures/received-proposal-result-blocks.json";
import packetFixture from "./fixtures/received-proposal-result-packet.json";

const packet = packetFixture as unknown as ReceivedProposalPacketLike;
const without = <T extends {blockKey: string}>(blocks: readonly T[], key: string) => blocks.filter((b) => b.blockKey !== key);
const tampered = <T extends {blockKey: string; claims: readonly {value: unknown}[]}>(blocks: readonly T[], key: string) =>
  blocks.map((b) => b.blockKey === key ? {...b, claims: b.claims.map((c, n) => n === 0 ? {...c, value: "1"} : c)} : b);

describe("the shared received proposal result fixture (C01)", () => {
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = receivedProposalPacketBlocks(packet);
    expect(blocks).toEqual(blocksFixture);
    expect((blocksFixture as unknown[]).every((b) => artifactBlockDraftSchema.safeParse(b).success)).toBe(true);
    const view = readReceivedProposalPacketBlocks(blocks)!;
    expect(view.framing).toMatchObject({lender: "Itaú", status: "prepared_for_human_review", firmness: {firmness: "indicative", validUntil: "2026-09-13", bankSawIndenture: false}});
    expect([view.liquidity.peak?.peakYear, view.liquidity.peak?.peakQuarter, view.liquidity.years.length]).toEqual([2027, "2027-09-30", 3]);
    expect(view.fit.uses.map((u) => [u.label, u.reading])).toEqual([["Compra de safra de outubro a dezembro", "longer_than_use"], ["Antecipar a linha de embalagem", "shorter_than_use"]]);
    expect([view.collateral.collateral?.assignable, view.collateral.negativePledge?.remaining, view.collateral.negativePledge?.consentBy]).toEqual(["25.41", "3", "2026-09-13"]);
    expect(view.collateral.collateral?.excluded.map((x) => x.label)).toEqual(["Rede A (maior cliente)", "Contratos de dois clientes cedidos ao Bradesco", "Atraso acima de 30 dias"]);
    expect([Number(view.price.price?.equivalentSpread).toFixed(4), Number(view.price.price?.equivalentSpreadNet).toFixed(4), view.price.price?.marketPosition])
      .toEqual(["0.0490", "0.0324", "above_median_within_range"]);
    expect(view.price.history?.peer).toBe("CCB Bradesco de setembro de 2024");
    expect(view.asks.map((a) => a.id)).toEqual(["carencia-12-prazo-48", "carencia-12-prazo-60", "cobertura-120-sem-conta"]);
    expect(view.alternatives.map((a) => [a.label, a.allInSpread])).toEqual([["Linha de giro de seis meses para a safra", "0.068"], ["Finame para a linha de embalagem", null]]);
    expect(view.assessment.recommendations[0]).toBe("address_indenture_consent_before_signing");
    expect([view.informationGaps, view.exclusions.length]).toEqual([[], 5]);
    for (const key of ["liquidity", "price", "asks"]) expect(readReceivedProposalPacketBlocks(tampered(blocks, key)), key).toBeNull();
    expect(readReceivedProposalPacketBlocks(without(blocks, "covenant"))).toBeNull();
    expect(readReceivedProposalPacketBlocks([...blocks, blocks[0]!])).toBeNull();
  });
  it("maps a framed packet without numbers, keeps the open question, and refuses another packet", () => {
    const framed = {...structuredClone(packet), readings: null, status: "framed" as const, openQuestions: ["indexer_confirmation"], result: {...packet.result, evaluation: null},
      gaps: [{operand: "received_proposal.x.proposal.indexer", reason: "No contribution adopted for proposal.indexer in scenario base"}]};
    const view = readReceivedProposalPacketBlocks(receivedProposalPacketBlocks(framed))!;
    expect([view.liquidity.peak, view.asks, view.price.price, view.collateral.collateral, view.framing.openQuestions, view.informationGaps.length])
      .toEqual([null, [], null, null, ["indexer_confirmation"], 1]);
    expect(() => receivedProposalPacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
  it("carries no net claim when the net cost is not stated", () => {
    const p = structuredClone(packet) as unknown as {readings: {price: {equivalentSpreadNet: string | null; netConvention: string}}};
    p.readings.price.equivalentSpreadNet = null; p.readings.price.netConvention = "life_beyond_fiscal_calendar";
    const blocks = receivedProposalPacketBlocks(p as unknown as ReceivedProposalPacketLike);
    expect(blocks.find((b) => b.blockKey === "price")!.claims.map((c) => c.claimId)).toEqual(["equivalent-spread"]);
    expect(readReceivedProposalPacketBlocks(blocks)?.price.price?.equivalentSpreadNet).toBeNull();
  });
});
