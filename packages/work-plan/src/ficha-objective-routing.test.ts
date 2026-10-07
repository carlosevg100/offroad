import {describe, expect, it} from "vitest";
import {compileAdvisorStartingPlan} from "./advisor-starting-plan";
import {inferCapitalProjectJob} from "./job-inference";
import {compileObjectiveToPlan, objectiveToPlanDecisionSchema} from "./objective-plan";

// Canonical paraphrases from outputs/fichas-ensaio-2026-10/{C02,C03,C04,C32}/corpo.html.
// These IDs belong to the fichas, not to the historical coverage catalogue or TaskSpecs.
const fichas = [
  {id: "C02", kind: "proposal_comparison", messages: [
    "Recebemos propostas do Itaú, do Santander e de um fundo para os R$ 70 milhões. Qual eu fico?",
    "Chegaram três term sheets. Qual é a melhor?",
    "O Itaú está mais barato, né? Posso fechar com ele?",
    "Qual dessas ofertas sai mais barata de verdade?",
    "Compare essas três propostas, mas não me diga qual escolher ainda.",
  ]},
  {id: "C03", kind: "relative_debt_cost", messages: [
    "Tenho conselho na quarta e vão me perguntar por que pagamos mais que a Serra Verde. Me ajuda a pensar a resposta.",
    "Por que pagamos mais caro que nossos concorrentes?",
    "A Serra Verde emitiu a CDI mais 1,35. A gente paga 2,6. Por quê?",
    "Explique por que nosso custo de dívida é maior que o dos pares.",
    "Prepara a resposta para o conselho sobre por que pagamos mais que a Serra Verde.",
  ]},
  {id: "C04", kind: "debt_capacity", messages: [
    "Queremos fazer uma segunda linha de produção de R$ 60 milhões em 2027 e 2028. Quanto de dívida a gente aguenta tomar para isso?",
    "Quanto de dívida cabe para o capex?",
    "Até quanto a gente pode se alavancar?",
    "O banco disse que cabem mais 80 milhões. Faz sentido?",
  ]},
  {id: "C32", kind: "capital_strategy", messages: [
    "Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?",
    "Vence muita coisa ano que vem e ainda quero fazer o investimento. O que eu faço?",
    "Como financio a expansão sem apertar o caixa?",
    "Quero alongar a dívida e fazer o capex. Por onde começo?",
    "Não quero recomendação ainda, só me mostre os caminhos para a dívida de 2027.",
  ]},
] as const;

describe("canonical ficha objective routing", () => {
  for (const ficha of fichas) for (const message of ficha.messages) {
    it.each([false, true])(`${ficha.id}: ${message} (attachments: %s)`, (hasAttachments) => {
      const plan = compileObjectiveToPlan({message, hasAttachments});
      expect(plan.objectiveKind).toBe(ficha.kind);
      const entry = compileAdvisorStartingPlan({message, hasAttachments, documentaryEnabled: true});
      expect(entry.plan.taskSpecs.map((task) => task.id)).not.toEqual(["Q01", "Q02", "Q03"]);
      expect(inferCapitalProjectJob({message, hasAttachments}).job).toBe(plan.entryJob);
      expect(plan.outputTerminal).not.toBe("preliminary_case");
      expect(plan.outputTerminal).not.toBe("board_decision_pack");
      expect(plan.taskGraph.tasks.every((task) => task.effect !== "external")).toBe(true);
      expect(objectiveToPlanDecisionSchema.safeParse(plan).success).toBe(true);
    });
  }

  it.each([
    "O que significa capacidade de dívida?",
    "Explique o conceito de custo relativo da dívida.",
    "Qual é a diferença entre CDI e IPCA?",
  ])("keeps conceptual questions bounded, with or without annexes: %s", (message) => {
    for (const hasAttachments of [false, true]) {
      expect(compileObjectiveToPlan({message, hasAttachments})).toMatchObject({
        objectiveKind: "factual_question", mode: "conversation", targetTaskIds: [],
      });
    }
  });

  it.each([
    "Só organize as propostas e os contratos na pasta, sem análise.",
    "Organize os documentos dos pares, sem analisar o custo da dívida.",
  ])("does not turn collection into analysis: %s", (message) => {
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe("information_organization");
  });

  it.each(fichas.slice(0, 3))("keeps the specific $id intent when a generic starter was selected", (ficha) => {
    const input = {message: ficha.messages[0], hasAttachments: true, explicitHint: "structure_from_documents" as const};
    expect(compileObjectiveToPlan(input).objectiveKind).toBe(ficha.kind);
    expect(inferCapitalProjectJob(input).job).toBe(compileObjectiveToPlan(input).entryJob);
  });

  it("does not bind user-facing ficha IDs to historical TaskSpecs with the same IDs", () => {
    const comparison = compileObjectiveToPlan({message: fichas[0].messages[0], hasAttachments: true});
    const relative = compileObjectiveToPlan({message: fichas[1].messages[0], hasAttachments: true});
    const capacity = compileObjectiveToPlan({message: fichas[2].messages[0], hasAttachments: true});
    expect(comparison.targetTaskIds).toEqual(["S10"]);
    expect(relative.targetTaskIds).toEqual(["C05", "K04"]);
    expect(capacity.targetTaskIds).toEqual(["C10"]);
    expect(new Set([comparison, relative, capacity].map((plan) => plan.structuralIdentity)).size).toBe(3);
  });
});
