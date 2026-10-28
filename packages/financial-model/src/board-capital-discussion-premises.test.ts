import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {ProposedHypothesis} from "./investment-premises";
import {composeBoundBoardCapitalDiscussion} from "./board-capital-discussion-composer";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardCapitalDiscussionFactsSchema, proposeBoardCapitalDiscussionHypotheses} from "./board-capital-discussion-premises";
import {auroraBoardFacts, auroraBoardSources, type BoardTurn} from "./board-capital-discussion.test-support";
import {boardPacketInput, boardQuestion as question} from "./board-capital-discussion-runs.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

function envelopeOf(entries: AdoptionBasisEntry[], version: number) {
  const purpose = "synthetic board discussion";
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(version), setId: id(6), workId: id(7), purpose,
    contextKey: purpose, revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose, versionId: id(version)}};
}
function adopt(hypotheses: ProposedHypothesis[]) {
  let n = 9800;
  return hypotheses.map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
}
/** The stored results of the completed executions, as the server copies them. */
const stored = () => auroraBoardSources().map((s) => ({id: s.id, result: JSON.stringify(s.packet)}));
const composed = (turn: BoardTurn, entries = adopt(proposeBoardCapitalDiscussionHypotheses(auroraBoardFacts(turn)))) =>
  prepareBoardCapitalDiscussionPacket(composeBoundBoardCapitalDiscussion({discussion: envelopeOf(entries, 601), question, sources: stored()}));

describe("C47 premises proposed from facts with origin, adopted, composed and measured", {timeout: 300000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    for (const turn of [1, 2, 3] as const) {
      const h = proposeBoardCapitalDiscussionHypotheses(auroraBoardFacts(turn));
      expect(h.length).toBeLessThanOrEqual(256);
      expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
    }
  });
  it("reproduces the hand-built calibration at every turn: same discussion, readings and status", () => {
    for (const turn of [1, 2, 3] as const) {
      const p = composed(turn), reference = prepareBoardCapitalDiscussionPacket(boardPacketInput(turn));
      expect(p.status).toBe(reference.status);
      expect(p.readings).toEqual(reference.readings);
      expect(p.result.discussion).toEqual(reference.result.discussion);
      expect(p.result.sources).toEqual(reference.result.sources);
    }
  });
  it("accepts the stored results already parsed and refuses one the basis does not name", () => {
    const entries = adopt(proposeBoardCapitalDiscussionHypotheses(auroraBoardFacts(2)));
    const parsed = composeBoundBoardCapitalDiscussion({discussion: envelopeOf(entries, 601), question, sources: auroraBoardSources().map((s) => ({id: s.id, result: s.packet}))});
    expect(prepareBoardCapitalDiscussionPacket(parsed).fingerprint).toBe(composed(2).fingerprint);
    expect(() => composeBoundBoardCapitalDiscussion({discussion: envelopeOf(entries, 601), question, sources: [...stored(), {id: "outra", result: "{}"}]})).toThrow("board_capital_source_not_named");
    expect(() => composeBoundBoardCapitalDiscussion({discussion: envelopeOf(entries, 601), question, sources: stored().slice(1)})).toThrow("board_capital_source_missing:tabela-divida");
  });
  it("declares an absent operand missing and never supplies it", () => {
    const entries = adopt(proposeBoardCapitalDiscussionHypotheses(auroraBoardFacts(2))).filter((e) => !e.fieldPath.endsWith(".figure.wal.reading"));
    const p = composed(2, entries);
    expect(p.status).toBe("framed");
    expect(p.readings).toBeNull();
    expect(p.gaps.some((g) => g.operand.endsWith(".figure.wal.reading") && g.reason.startsWith("No contribution adopted for figure.wal.reading"))).toBe(true);
  });
  it("refuses facts that read a result the discussion does not name", () => {
    const f = auroraBoardFacts(2);
    (f.figures[0]!.value as {reading: string[]}).reading[0] = "outra";
    expect(boardCapitalDiscussionFactsSchema.safeParse(f).success).toBe(false);
  });
});
