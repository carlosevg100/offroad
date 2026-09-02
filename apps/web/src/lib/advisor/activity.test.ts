import {describe, expect, it} from "vitest";

import {advisorActivities, type AdvisorActivityInput} from "./activity";

const labels = {
  context: "Entendendo o pedido e recuperando o contexto",
  research: "Reunindo divulgações, resultados e notícias",
  market: "Comparando operações e referências de mercado",
  readout: "Preparando a leitura para a conversa",
};

describe("advisor activities", () => {
  it("hides the internal origination DAG behind customer-readable work", () => {
    const tasks: AdvisorActivityInput[] = [
      task("1", "M01", "Resolve company identity", "succeeded"),
      task("2", "M02", "Define meeting mandate", "succeeded"),
      task("3", "C02", "Research company", "running"),
      task("4", "K04", "Research comparables", "queued"),
      task("5", "M07", "Compile meeting brief", "waiting"),
    ];

    expect(advisorActivities("origination_thesis", tasks, labels)).toEqual([
      {id: "context", label: labels.context, status: "succeeded"},
      {id: "research", label: labels.research, status: "running"},
      {id: "market", label: labels.market, status: "queued"},
      {id: "readout", label: labels.readout, status: "waiting"},
    ]);
  });

  it("does not declare a grouped stage complete until every member completes", () => {
    const tasks: AdvisorActivityInput[] = [
      task("1", "M01", "one", "succeeded"),
      task("2", "M02", "two", "waiting"),
    ];
    expect(advisorActivities("origination_thesis", tasks, labels)[0]?.status).toBe("waiting");
  });

  it("preserves localized labels outside the origination workflow", () => {
    const tasks: AdvisorActivityInput[] = [task("1", "C01", "Entender o negócio", "running")];
    expect(advisorActivities("company_debt_view", tasks, labels)).toEqual([
      {id: "1", label: "Entender o negócio", status: "running"},
    ]);
  });
});

function task(
  id: string,
  taskId: string,
  label: string,
  status: AdvisorActivityInput["status"],
): AdvisorActivityInput {
  return {id, taskId, label, status};
}
