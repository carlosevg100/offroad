import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {InformationRequestCard} from "./information-request-card";

const copy = {
  eyebrow: "Uma informação pode melhorar a análise",
  why: "Por que pergunto",
  impact: "O que pode mudar",
  evidence: "Se tiver, ajuda enviar",
  attachEvidence: "Anexar os documentos desta pergunta",
  attachEvidenceHelp: "A pergunta permanece aberta até a análise dos arquivos.",
  downloadTemplate: "Baixar modelo guiado",
  other: "Outra resposta",
  placeholder: "Escreva aqui",
  submit: "Incorporar resposta",
  submitting: "Incorporando",
  unavailable: "Não tenho essa informação",
  unavailableMessage: "Não tenho essa informação no momento. Preserve a lacuna e siga apenas com o que puder ser sustentado.",
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

  it("asks for the actual file when the gap requires documentary evidence", () => {
    const html = renderToStaticMarkup(<InformationRequestCard copy={copy} onAnswer={vi.fn()} onAttachEvidence={vi.fn()} remaining={0} request={{
      id: "70000000-0000-4000-8000-000000000394",
      question: "Envie o extrato e o arquivo de baixas para reconciliar os recebimentos.",
      whyItMatters: "Os recebimentos ainda não estão ligados aos títulos.",
      decisionImpact: "Sem esta evidência o método permanece bloqueado.",
      answerKind: "document",
      choices: [],
      acceptableEvidence: ["Extrato bancário", "Arquivo de baixas"],
      templateHref: "/pt-BR/app/projects/project-1/templates/receivables-r01",
      updatedAt: "2026-09-06T19:40:00.000Z",
    }} />);

    expect(html).toContain("Anexar os documentos desta pergunta");
    expect(html).toContain("Extrato bancário · Arquivo de baixas");
    expect(html).toContain("A pergunta permanece aberta até a análise dos arquivos.");
    expect(html).toContain("Baixar modelo guiado");
    expect(html).toContain("templates/receivables-r01");
    expect(html).not.toContain('placeholder="Escreva aqui"');
  });

  it("accepts institutional number notation instead of constraining the field to browser numbers", () => {
    const html = renderToStaticMarkup(<InformationRequestCard copy={copy} onAnswer={vi.fn()} remaining={0} request={{
      id: "70000000-0000-4000-8000-000000000395",
      question: "Qual advance rate devemos testar?",
      whyItMatters: "Altera o borrowing base.",
      decisionImpact: "Recalcula a estrutura.",
      answerKind: "number",
      choices: [], acceptableEvidence: [], updatedAt: "2026-09-07T03:00:00.000Z",
    }} />);
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('type="text"');
    expect(html).not.toContain('type="number"');
  });
});
