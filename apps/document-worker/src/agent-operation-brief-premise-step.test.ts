import {describe, expect, it} from "vitest";
import {premiseStepForTurn} from "./agent-operation-brief";

describe("one premise step per turn", () => {
  it.each([
    ["Recebemos propostas do Itaú, do Santander e de um fundo para os R$ 70 milhões. Qual eu fico?", "comparison"],
    ["Quanto de dívida cabe para o capex?", "capacity"],
    ["Monta a tabela de dívida com tudo que temos.", "debt_table"],
    ["Qual a folga do covenant da debênture em dezembro?", "covenant_headroom"],
    ["Quando é a semana mais apertada?", "weekly_cash"],
    ["Vale a pena comprar a máquina nova de R$ 8 milhões?", "investment"],
    ["O que é covenant?", "investment"],
  ] as const)("%s runs the %s step", (message, step) => {
    for (const docs of [false, true]) expect(premiseStepForTurn(message, docs, [])).toBe(step);
  });

  it("continues the latest premise question with the answer's data", () => {
    const thread = ["Quanto de dívida cabe para o capex?", "Qual a folga do covenant da debênture em dezembro?"];
    expect(premiseStepForTurn("O limite é 3x e o EBITDA é R$ 54 milhões", false, thread)).toBe("covenant_headroom");
    expect(premiseStepForTurn("O limite é 3x e o EBITDA é R$ 54 milhões", false, thread.slice(0, 1))).toBe("capacity");
    expect(premiseStepForTurn("O saldo é R$ 41 milhões", false, [...thread, "Como fica o caixa até dezembro e o que vence?"])).toBe("weekly_cash");
    expect(premiseStepForTurn("A CCB tem saldo de R$ 40 milhões", false, ["Monta a tabela de dívida com tudo que temos."])).toBe("debt_table");
  });
});
