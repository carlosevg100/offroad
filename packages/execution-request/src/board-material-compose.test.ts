import {createHash} from "node:crypto";
import {beforeAll, describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket, proposeBoardCapitalDiscussionHypotheses, type BoardCapitalDiscussionFacts} from "@offroad/financial-model";
import {boardMaterialContractBasis, boardMaterialNamedSources, boardMaterialPriorResults, composeBoardMaterialPacket, type BoardMaterialPriorResult, type BoardMaterialRole} from "./board-material-compose";
import type {ExecutionContractBasis} from "./contract";

const id = (n: number) => `a4700000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
type Source = {id: string; methodId: string; packet: Record<string, unknown>; moneyScale: "reais" | "millions"};
let facts: BoardCapitalDiscussionFacts, sources: Source[];
beforeAll(async () => {
  const f = await import(new URL("../../financial-model/src/board-capital-discussion.test-support.ts", import.meta.url).href) as {auroraBoardFacts: (t: number) => BoardCapitalDiscussionFacts; auroraBoardSources: () => Source[]};
  facts = f.auroraBoardFacts(2); sources = f.auroraBoardSources();
}, 120_000);

/** The facts adopted as one working basis, one entry per hypothesis, as a confirmation adopts them. */
function basis(): ExecutionContractBasis {
  const workId = id(1), versionId = id(2), purpose = "prepare-board-capital-discussion";
  const entries = proposeBoardCapitalDiscussionHypotheses(facts).map((h, n) => ({decisionId: id(100 + n), slotKey: sha(h.fieldPath + h.dimensions.scenario), kind: "hypothesis", fieldPath: h.fieldPath,
    dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(3), reason: h.reason}));
  const canonical = JSON.stringify({schemaVersion: "contextual-adoption.v1", versionId, setId: id(4), workId, purpose, contextKey: purpose, revision: 1, previousVersionId: null, classification: "working_basis", entries});
  return {envelope: {canonical, fingerprint: sha(canonical)}, workId, purpose, versionId, sources: [{resourceId: id(60), sourceVersionId: id(61), contentHash: "1".repeat(64), rightsRevision: "1"}]} as unknown as ExecutionContractBasis;
}
const priors = (): BoardMaterialPriorResult[] => sources.map((s, n) => ({role: s.id as BoardMaterialRole, methodId: s.methodId, executionId: id(700 + n), result: JSON.stringify(s.packet),
  resultFingerprint: s.packet.fingerprint as string, sources: [{resourceId: id(60 + n % 2), sourceVersionId: id(61 + (n % 2) * 2), contentHash: "1".repeat(64), rightsRevision: "1"}],
  moneyScale: s.moneyScale}));
const ask = {question: "Conselho na quarta. Prepara a discussão de estrutura de capital.", objectives: [], asOf: "2026-09-30", situationIds: []};

describe("board material over the stored results of the work (C47)", () => {
  it("names exactly the results the basis names, by execution and fingerprint, in the basis's order", () => {
    expect(boardMaterialNamedSources(basis())?.map((n) => n.role)).toEqual(sources.map((s) => s.id));
    expect(boardMaterialPriorResults(basis(), priors())).toEqual(priors().map((p) => ({role: p.role, executionId: p.executionId, resultFingerprint: p.resultFingerprint})));
  });
  it("is superseded when a named result is missing, repeated, of another method or another fingerprint", () => {
    const all = priors();
    expect(boardMaterialPriorResults(basis(), all.slice(1))).toBeNull();
    expect(boardMaterialPriorResults(basis(), [...all, {...all[0]!, executionId: id(799)}])).toBeNull();
    expect(boardMaterialPriorResults(basis(), all.map((p, n) => n === 2 ? {...p, resultFingerprint: "0".repeat(64)} : p))).toBeNull();
    expect(boardMaterialPriorResults(basis(), all.map((p, n) => n === 2 ? {...p, methodId: "assess-debt-capacity"} : p))).toBeNull();
    // The scale the database records for the method must be the one the card adopted, and known.
    expect(boardMaterialNamedSources(basis())?.map((n) => n.moneyScale)).toEqual(sources.map((s) => s.moneyScale));
    expect(boardMaterialPriorResults(basis(), all.map((p, n) => n === 2 ? {...p, moneyScale: p.moneyScale === "reais" ? "millions" : "reais"} : p))).toBeNull();
    expect(boardMaterialPriorResults(basis(), all.map((p, n) => n === 2 ? {...p, moneyScale: null} : p))).toBeNull();
  });
  it("composes the packet with each stored result verbatim, and the method prepares the material", () => {
    const refs = boardMaterialPriorResults(basis(), priors())!;
    const input = composeBoardMaterialPacket(basis(), ask, priors(), refs);
    expect(input.analysis.sources.map((s) => s.packet)).toEqual(priors().map((p) => p.result));
    const packet = prepareBoardCapitalDiscussionPacket(input);
    expect(packet.readings?.stage).toBe("material_prepared");
    expect(packet.readings?.material?.allFiguresMatch).toBe(true);
  }, 120_000);
  it("pins the discussion's sources first and then each prior source it does not pin, once", () => {
    const refs = boardMaterialPriorResults(basis(), priors())!;
    expect(boardMaterialContractBasis(basis(), priors(), refs).sources.map((s) => s.sourceVersionId)).toEqual([id(61), id(63)]);
  });
});
