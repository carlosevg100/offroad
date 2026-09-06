import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {InformationRequestCard} from "./information-request-card";

const copy = {
  eyebrow: "Uma informação pode melhorar a análise",
  why: "Por que pergunto",
  impact: "O que pode mudar",
  evidence: "Se tiver, ajuda enviar",
  other: "Outra resposta",
  placeholder: "Escreva aqui",
  submit: "Incorporar resposta",
  submitting: "Incorporando",
  unavailable: "Não tenho essa informação",
  unavailableMessage: "Não tenho essa informação no momento. Siga com uma premissa explícita.",
  remaining: "perguntas depois desta",
  confirmYes: "Sim",
  confirmNo: "Não",
};

describe("InformationRequestCard", () => {
  it("shows one decision-relevant question and its answer paths without internal vocabulary", () => {
    const html = renderToStaticMarkup(<InformationRequestCard copy={copy} onAnswer={vi.fn()} remaining={2} request={{
      id: "70000000-0000-4000-8000-000000000393",
      question: "Qual prazo o conselho quer testar?",
      whyItMatters: "O prazo muda cobertura e custo total.",
      decisionImpact: "Pode alterar a alternativa priorizada.",
      answerKind: "choice",
      choices: ["60 meses", "72 meses"],
      acceptableEvidence: ["Orçamento aprovado"],
      updatedAt: "2026-09-06T19:40:00.000Z",
    }} />);

    expect(html).toContain("Qual prazo o conselho quer testar?");
    expect(html).toContain("Por que pergunto");
    expect(html).toContain("O que pode mudar");
    expect(html).toContain("60 meses");
    expect(html).toContain("72 meses");
    expect(html).toContain("Outra resposta");
    expect(html).toContain("Não tenho essa informação");
    expect(html).not.toContain("requirementKey");
    expect(html).not.toContain("information_gain");
  });
});
