import type {ModelGateway} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {generatePreviewQuestions, type CandidateQuestion} from "./preview-questions";

const gaps = [
  {id: "C05.incomplete_reasons[0]", taskId: "C05", methodId: "build-debt-ledger", objectLabel: "Mapear a dívida", key: "incomplete_reasons" as const, text: "the interest bridge is not comparable"},
  {id: "C09.unproven_conditions[0]", taskId: "C09", methodId: "reconcile-covenant-definitions", objectLabel: "Covenants", key: "unproven_conditions" as const, text: "deb-11: proof of ordinary settlement"},
];
const fixed: CandidateQuestion[] = [{id: "q-angle", text: "Leitura de refinanciamento ou alternativas mais amplas?", changesTheWork: "define o universo", coverage: {searched: ["ITR"], answeredBy: null, answer: null}, priority: 1}];
const base = {locale: "pt-BR" as const, gaps, request: {desiredOutcome: "material", audience: "vp", depth: null, form: null, undefinedAspects: ["thesis"], sponsorInstruction: null}, professionalContext: null, answered: [], documents: ["ITR"], fixed};

function gateway(output: unknown, fail = false): ModelGateway {
  let spent = 0;
  return {
    complete: async () => { if (fail) throw new Error("provider down"); spent += 0.001; return {output, model: "claude-sonnet-5"} as never; },
    spent: () => ({costUsd: spent, calls: spent > 0 ? 1 : 0}),
  } as unknown as ModelGateway;
}

describe("preview questions from gaps", () => {
  it("keeps only questions that cite a real gap, bounded to four, with the base declared as searched", async () => {
    const result = await generatePreviewQuestions({...base, gateway: gateway({
      questions: [
        {id: "q-settle", text: "A companhia pode comprovar a liquidação ordinária que a escritura exige?", gapIds: ["C09.unproven_conditions[0]"], changesTheWork: "define o tier do covenant", effect: "scope", priority: 1},
        {id: "q-made-up", text: "Qual o rating da companhia?", gapIds: ["X99.none"], changesTheWork: "define o pricing", effect: "premise", priority: 2},
        {id: "q-bridge", text: "O release usa a mesma ponte de juros da nota?", gapIds: ["C05.incomplete_reasons[0]", "X99.none"], changesTheWork: "fecha a conciliação", effect: "scope", priority: 3},
      ],
      abstain: false, abstainReason: null,
    })});
    expect(result.source).toBe("model");
    expect(result.questions.map((question) => question.id)).toEqual(["q-settle", "q-bridge"]);
    expect(result.questions[0]!.coverage).toEqual({searched: ["ITR"], answeredBy: null, answer: null});
    expect(result.dropped).toBe(1);
    expect(result.citations).toEqual({"q-settle": ["C09.unproven_conditions[0]"], "q-bridge": ["C05.incomplete_reasons[0]"]});
    expect(result.costUsd).toBeCloseTo(0.001, 6);
  });

  it("falls back to the fixed questions, and says so, when the model fails or grounds nothing", async () => {
    const failed = await generatePreviewQuestions({...base, gateway: gateway(null, true)});
    expect(failed.source).toBe("fixed");
    expect(failed.reason).toContain("model call failed");
    const ungrounded = await generatePreviewQuestions({...base, gateway: gateway({questions: [{id: "q-x", text: "Pergunta sem lacuna citada aqui?", gapIds: ["nope"], changesTheWork: "nada de concreto", effect: "scope", priority: 1}], abstain: false, abstainReason: null})});
    expect(ungrounded.source).toBe("fixed");
    expect(ungrounded.dropped).toBe(1);
    const none = await generatePreviewQuestions({...base, gateway: null});
    expect(none.source).toBe("fixed");
    expect(none.reason).toBe("no model gateway for this run");
  });
});
