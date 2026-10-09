import {describe, expect, it} from "vitest";
import {inferCapitalProjectJob} from "./job-inference";
import {compileObjectiveToPlan} from "./objective-plan";

// Phrases from outputs/fichas-ensaio-2026-10 (A01, A09, A11, A17, I37 and others) that the router
// misread because JavaScript `\b` does not treat accented letters as word characters and because
// the spoken imperative ("prepara", "monta", "revisa") was missing from the verb patterns.
const kind = (message: string, hasAttachments = false) => compileObjectiveToPlan({message, hasAttachments}).objectiveKind;

describe("accented words reach the patterns", () => {
  it.each([
    ["Prepara a análise de crédito para o comitê.", "board_decision"],
    ["Leva o giro da Aurora ao comitê de quinta", "board_decision"],
    ["Normaliza o EBITDA da Aurora para o comitê", "board_decision"],
    ["Quero a análise da companhia e da dívida", "company_analysis"],
    ["Mapeamento de emissões de debêntures dos últimos meses com spread e prazo", "market_mapping"],
  ])("%s → %s", (message, expected) => {
    expect(kind(message)).toBe(expected);
  });

  it("gives the same answer with and without accents", () => {
    const pairs = [
      ["Prepara a análise de crédito para o comitê", "Prepara a analise de credito para o comite"],
      ["Reunião com a companhia na terça", "Reuniao com a companhia na terca"],
      ["Organiza os documentos e as apresentações", "Organiza os documentos e as apresentacoes"],
    ];
    for (const [accented, plain] of pairs) expect(kind(accented!)).toBe(kind(plain!));
  });
});

describe("spoken imperative forms", () => {
  it.each([
    ["Prepara o memo de investimento do Projeto Trigo.", "material_preparation"],
    ["Monta o deck para a reunião com o fundo", "material_preparation"],
    ["Faz o deck, dez páginas no nosso template.", "material_preparation"],
    ["Revisa a proposta do Itaú", "operation_review"],
    ["Compara essas duas estruturas de dívida", "operation_review"],
    ["Organiza esses arquivos da Aurora por tipo e período", "information_organization"],
    ["Analisa a dívida da companhia", "company_analysis"],
    ["Monitora os covenants e me avisa", "monitoring"],
  ])("%s → %s", (message, expected) => {
    expect(kind(message)).toBe(expected);
  });

  it("keeps a meeting brief ahead of material when the approach is asked", () => {
    expect(kind("Tenho reunião com a Aurora Alimentos na terça. Prepara minha abordagem e o material.")).toBe("meeting_preparation");
    expect(kind("Quero só o roteiro e as perguntas para a reunião")).toBe("meeting_preparation");
    expect(kind("Prepara o material para a reunião com a agência de rating.")).toBe("material_preparation");
  });

  it("keeps the formal imperative and infinitive working", () => {
    expect(kind("Prepare o memo de investimento do Projeto Trigo.")).toBe("material_preparation");
    expect(kind("Preparar o memo de investimento")).toBe("material_preparation");
    expect(kind("Revisar a proposta do Itaú")).toBe("operation_review");
  });
});

describe("job inference fallback stems", () => {
  it.each([
    "Quero refinanciar e alongar o endividamento",
    "Preciso antecipar os recebíveis da safra",
    "Vamos reestruturar a dívida e pagar dividendos",
  ])("%s → capital planning", (message) => {
    expect(inferCapitalProjectJob({message, hasAttachments: false}).job).toBe("capital_planning");
  });
});
