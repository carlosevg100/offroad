import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket, type BoardCapitalDiscussionPacketInput} from "./board-capital-discussion-packet";
import {boardLiteralRecordIds, boardTemplates, checkBoardTemplateLibrary} from "./board-capital-discussion-templates";
import {auroraBoardSources, boardRenamedSources} from "./board-capital-discussion.test-support";
import {boardMaterialDigest, boardPacketInput, boardRenamedInput, boardRoleAttempts} from "./board-capital-discussion-runs.test-support";

/** Records bound by the role their result registers, never by identifier (ficha C47, review of the bridge). */
describe("board discussion records bound by role", () => {
  it("no template, condition or token names a record by its identifier", () => {
    expect(checkBoardTemplateLibrary()).toEqual([]);
    for (const [id, t] of Object.entries(boardTemplates)) expect(boardLiteralRecordIds(t), id).toEqual([]);
    // The check is not vacuous: a literal id written back into a slot, a condition or a token is reported.
    const row = boardTemplates["alternatives.row.keep_and_roll"]!, roll = boardTemplates["a.roll_bank"]!;
    const literal = {...boardTemplates,
      "alternatives.row.keep_and_roll": {...row, slots: {...row.slots, caixa: {...row.slots.caixa!, from: [["evaluate-financing-paths", "readings.paths[id=manter].minimumCash.amount"] as const]}}},
      "a.roll_bank": {...roll, text: roll.text.replace("{bankcredit:$b}", "{bankcredit:bradesco-sem-linha}")}};
    expect(checkBoardTemplateLibrary(literal)).toEqual(expect.arrayContaining(["alternatives.row.keep_and_roll:literal_record:id=manter", "a.roll_bank:literal_record:bradesco-sem-linha"]));
  });

  it("the renaming is total: every record identifier of every result changes, and no identifier is shared across results", () => {
    const {packets, renames} = boardRenamedSources();
    const original = auroraBoardSources();
    for (const s of original) {
      const rename = renames[s.id]!;
      expect(rename.size, s.id).toBeGreaterThan(0);
      // No old identifier survives as a token of the renamed result, except as a word of a registered vocabulary equal to
      // it (the investment role base, the covenant scenario original, the receivables debtor key of the closed dictionary).
      const left: string[] = [];
      const walk = (v: unknown, key: string, debtorKey: boolean): void => {
        if (Array.isArray(v)) v.forEach((x) => walk(x, key, debtorKey));
        else if (v && typeof v === "object") {const o = v as Record<string, unknown>; for (const [k, x] of Object.entries(o)) walk(x, k, debtorKey || (typeof o.fieldPath === "string" && o.fieldPath.endsWith(".debtorKey") && k === "value"));}
        else if (typeof v === "string") for (const t of v.split(/[.|]/)) if (rename.has(t) && !debtorKey && !(key === "role" && t === "base") && !(key === "scenario" && t === "original")) left.push(`${key}:${t}`);
      };
      walk(packets[s.id], "", false);
      expect(left, s.id).toEqual([]);
    }
    const all = Object.values(renames).flatMap((m) => [...m.values()]);
    expect(new Set(all).size).toBe(all.length);
    // The two sources that hold the Bradesco instrument now hold it under different identifiers.
    expect(renames["tabela-divida"]!.get("ccb-bradesco")).not.toBe(renames["plano-2027"]!.get("ccb-bradesco"));
  }, 120_000);

  it("the whole calibration over renamed results gives the same material at every turn (texts, numbers, pages, versions)", () => {
    for (const turn of [1, 2, 3] as const) {
      const calibrated = prepareBoardCapitalDiscussionPacket(boardPacketInput(turn)), renamed = prepareBoardCapitalDiscussionPacket(boardRenamedInput(turn));
      expect(boardMaterialDigest(renamed), `${turn}`).toBe(boardMaterialDigest(calibrated));
      expect(renamed.result.discussion!.versions, `${turn}`).toEqual(calibrated.result.discussion!.versions);
      expect(renamed.gaps, `${turn}`).toEqual(calibrated.gaps);
      expect(renamed.status, `${turn}`).toBe(calibrated.status);
      // Every reading resolved in the renamed results, and none by an identifier of the calibration.
      expect(renamed.result.discussion!.identity.map((x) => x.rounded), `${turn}`).toEqual(calibrated.result.discussion!.identity.map((x) => x.rounded));
      expect(renamed.result.discussion!.identity.some((x) => /\[(?:id|caseId|holderId|limitId)=(?:manter|ccb-bradesco|politica|aditamento|economy-4|defer-12|sem-linha)\]/.test(x.path)), `${turn}`).toBe(false);
    }
    // Another random renaming gives the same material again.
    expect(boardMaterialDigest(prepareBoardCapitalDiscussionPacket(boardRenamedInput(2, "another-seed")))).toBe(boardMaterialDigest(prepareBoardCapitalDiscussionPacket(boardPacketInput(2))));
  }, 600_000);

  it("a role the result does not register, or registers more than once, refuses the template by name; never chosen by order", () => {
    for (const [id, build, message] of boardRoleAttempts((turn, edit) => boardPacketInput(turn, edit))) {
      expect(() => prepareBoardCapitalDiscussionPacket(build() as BoardCapitalDiscussionPacketInput), id).toThrow(message);
    }
  }, 300_000);
});
