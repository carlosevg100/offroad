import {describe, expect, it} from "vitest";

import {compileObjectiveSpecialization} from "./index";
import {selectWorkflowRecipeForObjective, workflowRecipeSelectionSchema} from "./workflow-selection";

function specialize(objectiveText: string) {
  return compileObjectiveSpecialization({objectiveText, taskIds: ["C05", "C07", "C08", "C09", "C10", "D07", "S07", "S10", "A01", "A02"]});
}

describe("workflow recipe selection", () => {
  it("selects different dependency-closed slices from the same refinance recipe", () => {
    const specialization = specialize("Quero analisar um refinance e liability management.");
    const meeting = selectWorkflowRecipeForObjective({specialization, outputTerminal: "meeting_brief"});
    const alternatives = selectWorkflowRecipeForObjective({specialization, outputTerminal: "capital_alternative_map"});
    const board = selectWorkflowRecipeForObjective({specialization, outputTerminal: "board_decision_pack"});

    expect(meeting).toMatchObject({status: "selected", recipeId: "refinance-liability-management", outcome: "meeting_plan"});
    expect(meeting.taskIds).toHaveLength(9);
    expect(alternatives).toMatchObject({status: "selected", outcome: "alternatives"});
    expect(alternatives.taskIds).toHaveLength(8);
    expect(board).toMatchObject({status: "selected", outcome: "material"});
    expect(board.taskIds).toHaveLength(10);
    expect(workflowRecipeSelectionSchema.safeParse(board).success).toBe(true);
  });

  it("is invariant to role and refinance paraphrase when the economics and output match", () => {
    const prompts = [
      "Sou CFO e preciso preparar uma reunião sobre refinanciamento.",
      "Meu VP pediu uma reunião para discutir liability management.",
      "Precisamos preparar uma reunião sobre alongamento dos vencimentos.",
      "Quero uma reunião para avaliar repricing da dívida cara.",
    ];
    const selections = prompts.map((objectiveText) => selectWorkflowRecipeForObjective({
      specialization: specialize(objectiveText),
      outputTerminal: "meeting_brief",
    }));
    expect(new Set(selections.map((selection) => selection.recipeFingerprint)).size).toBe(1);
    expect(new Set(selections.map((selection) => selection.fingerprint)).size).toBe(1);
  });

  it("blocks needs for which no recipe is implemented", () => {
    const selection = selectWorkflowRecipeForObjective({
      specialization: specialize("Quero financiar a expansão de uma fábrica com capex novo."),
      outputTerminal: "board_decision_pack",
    });
    expect(selection).toMatchObject({status: "blocked", reason: "economic_situation_not_implemented", recipeId: null, taskIds: []});
  });

  it("blocks a combined economic case until a combined recipe is proven", () => {
    const selection = selectWorkflowRecipeForObjective({
      specialization: specialize("Quero refinanciar a dívida e financiar o capex de expansão."),
      outputTerminal: "board_decision_pack",
    });
    expect(selection).toMatchObject({status: "blocked", reason: "combined_economic_situations_not_implemented"});
    expect(selection.activatedEconomicPacks).toEqual(["objective.capex-expansion", "objective.refinance-liability-management"]);
  });

  it("blocks an output that the refinance recipe does not yet implement", () => {
    const selection = selectWorkflowRecipeForObjective({
      specialization: specialize("Quero revisar os riscos de um refinanciamento."),
      outputTerminal: "risk_matrix",
    });
    expect(selection).toMatchObject({status: "blocked", reason: "requested_output_not_implemented"});
  });
});
