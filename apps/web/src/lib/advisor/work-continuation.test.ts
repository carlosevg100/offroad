import {describe, expect, it} from "vitest";

import pt from "../../../messages/pt-BR.json";
import {advisorMessageRoute, continuationMilestones, continuationNote, draftRevisionUnavailable, resolveContinuation} from "./work-continuation";
import {milestoneLabelKeys, milestoneLabelText, type MilestoneLabelKey, type WorkMilestoneRow} from "./work-update-view";

const WORK = "a4200000-0000-4000-9000-000000000001";
const id = (n: number) => `a4200000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const translate = (key: MilestoneLabelKey) => pt.App.workUpdates.labels[key];

const row = (n: number, sequence: number, kind: WorkMilestoneRow["kind"], label: string, extra: Partial<WorkMilestoneRow> = {}): WorkMilestoneRow => ({
  milestoneId: id(n), sequence, kind, subjectKind: kind === "execution_result" ? "work_execution" : "capital_project_artifact", subjectId: id(100 + n),
  label, revision: kind === "decision" || kind === "update_adopted" ? 1 : null, outcome: kind === "execution_result" ? "succeeded" : null,
  references: [], createdBy: id(900), occurredAt: `2026-09-25T12:0${sequence}:00+00:00`, ...extra,
});

describe("routing of a message typed in a work's conversation", () => {
  it("routes continuation verbs to the continuation, and tries a draft only when the message names it", () => {
    expect(advisorMessageRoute("Aprofundar o alongamento aprovado")).toEqual({kind: "continuation", tryDraft: false});
    expect(advisorMessageRoute("Revise o rascunho com um cenário de estresse")).toEqual({kind: "continuation", tryDraft: true});
    expect(advisorMessageRoute("Corrija a minuta e inclua o prazo de carência")).toEqual({kind: "draft_revision", tryDraft: true});
    // A revision request that does not name the draft never targets it by default.
    expect(advisorMessageRoute("Corrija o prazo e inclua um cenário downside")).toEqual({kind: "ordinary", tryDraft: false});
    expect(advisorMessageRoute("De onde saiu essa alavancagem de 4,7x?")).toEqual({kind: "ordinary", tryDraft: false});
    expect(advisorMessageRoute("Altere a taxa da nova dívida para 15,50% a.a.")).toEqual({kind: "ordinary", tryDraft: false});
  });

  it("treats every P0002 of the draft command as nothing to revise, including a work without intake", () => {
    expect(draftRevisionUnavailable({code: "P0002"})).toBe(true);
    expect(draftRevisionUnavailable({code: "42501"})).toBe(false);
    expect(draftRevisionUnavailable(null)).toBe(false);
  });
});

describe("the milestone log the contract reads", () => {
  const log: WorkMilestoneRow[] = [
    row(1, 1, "execution_result", "Cenário de alongamento"),
    row(2, 2, "decision", "alternative_map", {references: [id(1)]}),
    row(3, 3, "awaiting_human", "dependency_recompute_authorization", {subjectKind: "work_recompute_candidate"}),
    row(4, 4, "human_resolved", "dependency_recompute_authorization", {subjectKind: "work_recompute_candidate", references: [id(3)]}),
    row(5, 5, "decision", "dependency_recompute_authorization", {subjectKind: "work_recompute_candidate", references: [id(3)], outcome: "approved"}),
    row(6, 6, "continuation_proposed", "dependency_update", {subjectKind: "work_continuation_request"}),
  ];

  it("maps rows to milestones in the person's language and leaves out decisions about a candidate's cost", () => {
    const milestones = continuationMilestones(WORK, log, (raw) => milestoneLabelText(raw, translate));
    expect(milestones.map((milestone) => milestone.milestoneId)).toEqual([id(1), id(2), id(3), id(4), id(6)]);
    expect(milestones[0]).toMatchObject({kind: "execution_result", executionId: id(101), decision: null});
    expect(milestones[1]).toMatchObject({label: "Mapa de alternativas de dívida", decision: {decisionId: id(102), revision: 1, outcome: "approved"}, references: [id(1)]});
    expect(milestones.at(-1)).toMatchObject({kind: "continuation_proposed", label: "Atualização por mudança de insumo", references: []});
  });

  it("translates every key the database writes and spells out an unknown one", () => {
    for (const key of milestoneLabelKeys) expect(milestoneLabelText(key, translate)).toBe(pt.App.workUpdates.labels[key]);
    expect(milestoneLabelText("some_future_key", translate)).toBe("some future key");
    expect(milestoneLabelText("Alongamento com os bancos atuais", translate)).toBe("Alongamento com os bancos atuais");
  });
});

describe("resolution of a follow-up", () => {
  const approved = [
    row(1, 1, "execution_result", "Cenário de alongamento da dívida"),
    row(2, 2, "decision", "Alongamento com os bancos atuais", {references: [id(1)], revision: 3}),
    row(3, 3, "execution_result", "Refinanciamento por debêntures"),
    row(4, 4, "decision", "Emissão de debêntures", {references: [id(3)]}),
  ];

  it("proposes the one approved base the text names, with its decision and revision", () => {
    const resolution = resolveContinuation({workId: WORK, conversationId: id(50), text: "Aprofundar o alongamento aprovado", milestones: approved, translate});
    expect(resolution).toMatchObject({status: "proposed", base: {milestoneId: id(2), decisionId: id(102), revision: 3, label: "Alongamento com os bancos atuais"}});
  });

  it("asks when several bases match or none does, and offers the approved bases", () => {
    const ambiguous = resolveContinuation({workId: WORK, conversationId: id(50), text: "Aprofundar o aprovado", milestones: approved, translate});
    expect(ambiguous).toMatchObject({status: "question", code: "no_approved_base"});
    expect(ambiguous.status === "question" && ambiguous.options.map((option) => option.milestoneId)).toEqual([id(2), id(4)]);
    const twoLengthening = [...approved, row(5, 5, "execution_result", "Alongamento via debêntures"),
      row(6, 6, "decision", "Alongamento com debêntures", {references: [id(5)], revision: 2})];
    const question = resolveContinuation({workId: WORK, conversationId: id(50), text: "Aprofundar o alongamento", milestones: twoLengthening, translate});
    expect(question).toMatchObject({status: "question", code: "ambiguous_base"});
    expect(question.status === "question" && question.options.map((option) => option.milestoneId)).toEqual([id(2), id(6)]);
  });

  it("asks with no option when the work has no approved base at all", () => {
    const none = resolveContinuation({workId: WORK, conversationId: null, text: "Aprofundar o alongamento", milestones: [row(1, 1, "execution_result", "Cenário")], translate});
    expect(none).toMatchObject({status: "question", code: "no_approved_base", options: [], conversationId: WORK});
  });

  it("works in a work without an intake session: the conversation id is only where the request is recorded", () => {
    const standalone = resolveContinuation({workId: WORK, conversationId: null, text: "Aprofundar o alongamento aprovado", milestones: approved, translate});
    expect(standalone).toMatchObject({status: "proposed", workId: WORK, conversationId: WORK});
  });

  it("resolves an adopted update by its translated label", () => {
    const adopted = [...approved, row(5, 5, "execution_result", "Alongamento com o balancete de agosto"),
      row(6, 6, "update_adopted", "dependency_update_adopted", {subjectKind: "work_continuation_request", references: [id(5), id(1)], outcome: "approved"})];
    const resolution = resolveContinuation({workId: WORK, conversationId: id(50), text: "Aprofundar a atualização adotada", milestones: adopted, translate});
    expect(resolution).toMatchObject({status: "proposed", base: {milestoneId: id(6), label: "Atualização adotada"}});
  });
});

describe("the note of a recorded follow-up", () => {
  it("reads the base from the turn's metadata and ignores any other message", () => {
    expect(continuationNote({kind: "work_continuation", projectId: WORK, requestId: id(7), base: {milestoneId: id(2), decisionId: id(102), revision: 3, kind: "decision", label: "Alongamento"}}))
      .toEqual({requestId: id(7), label: "Alongamento", revision: 3});
    expect(continuationNote({kind: "message"})).toBeNull();
    expect(continuationNote(null)).toBeNull();
  });
});
