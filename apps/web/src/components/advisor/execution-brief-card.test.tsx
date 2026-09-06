import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ExecutionBriefCard} from "./execution-brief-card";

describe("ExecutionBriefCard", () => {
  it("shows the user agreement and never leaks internal graph or authority fields", () => {
    const html = renderToStaticMarkup(<ExecutionBriefCard version={3} brief={{
      schemaVersion: "execution-brief.v1",
      fingerprint: "a".repeat(64),
      locale: "pt-BR",
      objective: "Preparar a conversa sobre o refinanciamento da Camil",
      currentContext: [{label: "Pedido e contexto deste projeto", role: "project_context", informationClass: "private"}],
      proposedDeliverable: "Leitura prospectiva e alternativas priorizadas",
      workstreams: [
        {label: "Conferir balanço, caixa e dívida", purpose: "Resolver a base.", sources: [{label: "RI e CVM", status: "available", informationClass: "public"}], analyses: ["Conciliação"], output: "Base conciliada", dependencies: []},
        {label: "Testar serviço da dívida e downside", purpose: "Medir capacidade.", sources: [{label: "Curvas de mercado", status: "to_research", informationClass: "public"}], analyses: ["Cenários"], output: "Diagnóstico", dependencies: ["Conferir balanço, caixa e dívida"]},
        {label: "Comparar os caminhos", purpose: "Separar trade-offs.", sources: [{label: "Métodos homologados", status: "available", informationClass: "restricted"}], analyses: ["Antes e depois"], output: "Alternativas", dependencies: ["Testar serviço da dívida e downside"]},
      ],
      assumptions: [{label: "Prazo", value: "60 meses", basis: "Informado pelo usuário", editable: true}],
      checkpoints: [{label: "Escolher o caminho a aprofundar", afterWorkstreamKey: "alternatives", kind: "choice"}],
      executionMode: "start_after_display",
    }} />);

    expect(html).toContain("Plano deste trabalho");
    expect(html).toContain("a pesquisar");
    expect(html).toContain("Premissas que você pode alterar");
    expect(html).toContain("Escolher o caminho a aprofundar");
    expect(html).not.toContain("sourceTaskIds");
    expect(html).not.toContain("executionAuthority");
    expect(html).not.toContain("TaskSpec");
  });
});
