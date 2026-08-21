import Decimal from "decimal.js";
import type {DeskAnalysis, Trajectory} from "@offroad/credit-analysis";

import type {MaterialBlock} from "./compile";

/**
 * The sections a fund actually underwrites from, built from the desk battery.
 *
 * A credit package that says who the company is and what it wants is a brochure. The document
 * an investor prices from answers different questions: where does the money go, line by line;
 * what does the capital structure look like the day after; how does leverage travel over the
 * life of the paper; what covenant will police it; and what are the risks, each with the
 * structural answer beside it rather than a paragraph of comfort.
 *
 * Everything here is assembled from computed values carrying their citable ids, so the same
 * staleness and audit machinery that guards the prose guards these tables.
 */

const money = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `R$ ${new Decimal(value).toNumber().toLocaleString(locale, {maximumFractionDigits: 0})}`;
const pct = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `${new Decimal(value).times(100).toNumber().toLocaleString(locale, {minimumFractionDigits: 1, maximumFractionDigits: 2})}%`;
const turns = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `${new Decimal(value).toNumber().toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;

/**
 * Sources and uses. The single table that states what the transaction is.
 *
 * The uses side leads with the takeout of the covenanted lines, because that is the structure:
 * the fund is not lending on top of the stack, it is replacing the part of the stack whose
 * contract would otherwise govern the company.
 */
export function sourcesAndUses(desk: DeskAnalysis, trajectory: Trajectory): MaterialBlock | null {
  const lm = trajectory.liabilityManagement;
  if (!lm) return null;
  const amount = trajectory.years.length > 0 ? new Decimal(lm.covenantedBalance).plus(lm.netNewMoney) : null;
  if (!amount) return null;

  return {
    type: "table",
    caption: {pt: "Fontes e usos", en: "Sources and uses"},
    head: [
      {pt: "Item", en: "Item"},
      {pt: "Valor", en: "Amount"},
    ],
    rows: [
      ["Fonte: novo instrumento", money(amount, "pt-BR")],
      [`Uso: quitação das linhas com covenant (${lm.lendersTakenOut.join(", ")})`, money(lm.covenantedBalance, "pt-BR")],
      ["Uso: recursos novos para o plano da companhia", money(lm.netNewMoney, "pt-BR")],
    ],
  };
}

/** The stack the day before and the day after, on one axis. */
export function capitalStructure(desk: DeskAnalysis, trajectory: Trajectory | null): MaterialBlock[] {
  const takenOut = new Set(trajectory?.liabilityManagement?.lendersTakenOut ?? []);
  const rows = desk.stack.lines.map((line) => [
    line.lender,
    money(line.balance, "pt-BR"),
    line.effectiveAnnual ? pct(line.effectiveAnnual, "pt-BR") : "não normalizável",
    line.maturity ?? "não informado",
    line.covenant ? `Dív.líq./EBITDA ≤ ${line.covenant.maximum.replace(/0+$/, "").replace(/\.$/, ",0")}x` : "sem covenant",
    takenOut.has(line.lender) ? "quitada na operação" : "mantida",
  ]);

  const blocks: MaterialBlock[] = [
    {
      type: "table",
      caption: {pt: "Estrutura de capital atual e tratamento na operação", en: "Current capital structure and treatment in the transaction"},
      head: [
        {pt: "Credor", en: "Lender"},
        {pt: "Saldo", en: "Balance"},
        {pt: "Custo efetivo a.a.", en: "Effective annual cost"},
        {pt: "Vencimento", en: "Maturity"},
        {pt: "Covenant", en: "Covenant"},
        {pt: "Tratamento", en: "Treatment"},
      ],
      rows,
    },
    {
      type: "metrics",
      items: [
        {
          label: {pt: "Custo médio do estoque", en: "Weighted stack cost"},
          value: desk.stack.weightedCost ?? "",
          formatted: {
            pt: desk.stack.weightedCost ? pct(desk.stack.weightedCost, "pt-BR") : "não computável",
            en: desk.stack.weightedCost ? pct(desk.stack.weightedCost, "en-US") : "not computable",
          },
          supportIds: ["desk.custo_medio_do_stack"],
        },
        {
          label: {pt: "Alavancagem pré-operação", en: "Pre-transaction leverage"},
          value: desk.leverage.preTurns,
          formatted: {pt: turns(desk.leverage.preTurns, "pt-BR"), en: turns(desk.leverage.preTurns, "en-US")},
          supportIds: ["desk.alavancagem_pre"],
        },
        ...(trajectory?.liabilityManagement
          ? [{
              label: {pt: "Alavancagem pós, com quitação das linhas com covenant", en: "Post-transaction leverage, covenanted lines taken out"},
              value: trajectory.liabilityManagement.postLeverageAfterRefi,
              formatted: {
                pt: turns(trajectory.liabilityManagement.postLeverageAfterRefi, "pt-BR"),
                en: turns(trajectory.liabilityManagement.postLeverageAfterRefi, "en-US"),
              },
              supportIds: ["trajetoria.alavancagem_pos_refi"],
            }]
          : []),
      ],
    },
  ];
  return blocks;
}

/** Leverage over the life of the paper, base and haircut cases side by side. */
export function trajectoryTable(trajectory: Trajectory): MaterialBlock {
  return {
    type: "table",
    caption: {
      pt: `Trajetória de alavancagem (cenário cortado: ${pct(trajectory.assumptions.growthHaircut, "pt-BR")} do crescimento projetado removido; caixa constante)`,
      en: `Leverage trajectory (cut case removes ${pct(trajectory.assumptions.growthHaircut, "en-US")} of projected growth; cash held flat)`,
    },
    head: [
      {pt: "Ano", en: "Year"},
      {pt: "Dívida líquida", en: "Net debt"},
      {pt: "EBITDA projetado", en: "Projected EBITDA"},
      {pt: "Alavancagem", en: "Leverage"},
      {pt: "Alavancagem (cortado)", en: "Leverage (cut)"},
    ],
    rows: trajectory.years.map((year) => [
      String(year.year),
      money(year.netDebt, "pt-BR"),
      money(year.ebitdaBase, "pt-BR"),
      turns(year.leverageBase, "pt-BR"),
      turns(year.leverageStressed, "pt-BR"),
    ]),
  };
}

/** The covenant offered to the market, following the trajectory it polices. */
export function covenantSchedule(trajectory: Trajectory): MaterialBlock {
  return {
    type: "table",
    caption: {
      pt: "Covenant proposto para o novo instrumento (dívida líquida/EBITDA, teste anual, primeira aferição no primeiro exercício completo)",
      en: "Proposed covenant for the new instrument (net debt/EBITDA, tested annually, first test at the first full year)",
    },
    head: [
      {pt: "Exercício", en: "Year"},
      {pt: "Máximo", en: "Maximum"},
    ],
    rows: trajectory.covenantProposal.map((step) => [String(step.year), turns(step.maximum, "pt-BR")]),
  };
}

/**
 * Risk factors, each with the structural answer beside it.
 *
 * The findings are the risks: hiding them would only mean the fund finds them alone and trusts
 * the rest of the package less. The mitigant column is what separates a desk's material from a
 * confession: where the structure answers the risk, the answer is stated with its numbers;
 * where only the company can answer, the material says that too.
 */
export function riskFactors(desk: DeskAnalysis, trajectory: Trajectory | null): MaterialBlock[] {
  const mitigants: Record<string, {pt: string; en: string} | undefined> = {
    "covenant-breach-day-one": trajectory?.liabilityManagement
      ? {
          pt: `Endereçado na estrutura: as linhas com covenant são quitadas na operação (${trajectory.liabilityManagement.lendersTakenOut.join(", ")}), e o novo instrumento carrega covenant próprio, escalonado conforme a trajetória.`,
          en: `Addressed in the structure: the covenanted lines are taken out in the transaction (${trajectory.liabilityManagement.lendersTakenOut.join(", ")}), and the new instrument carries its own covenant, stepped to the trajectory.`,
        }
      : undefined,
    "maturity-wall": trajectory?.liabilityManagement
      ? {
          pt: "Parcialmente endereçado: a quitação retira da parede as linhas com covenant; o cronograma das demais deve ser demonstrado compatível com o caixa no material de projeções.",
          en: "Partially addressed: the takeout removes the covenanted lines from the wall; the remaining schedule must be shown serviceable in the projections material.",
        }
      : undefined,
    "amortization-outruns-cash": {
      pt: "Endereçado na estrutura: a operação substitui o cronograma incompatível por prazo e carência desenhados sobre a geração projetada.",
      en: "Addressed in the structure: the transaction replaces the unserviceable schedule with tenor and grace designed over projected generation.",
    },
    "receivables-encumbrance": {
      pt: "Mitigação parcial: a quitação das linhas caucionadas em duplicatas libera a cobertura correspondente; a base livre pós-operação deve ser recalculada no fechamento.",
      en: "Partial mitigation: taking out the receivables-covered lines releases the corresponding coverage; the post-closing free base must be recomputed at closing.",
    },
  };

  const relevant = desk.findings.filter((finding) => finding.severity === "critical" || finding.severity === "high");
  if (relevant.length === 0) return [];

  return [
    {type: "heading", text: {pt: "Fatores de risco e tratamento", en: "Risk factors and treatment"}},
    {
      type: "table",
      caption: {pt: "Cada risco com a resposta estrutural ao lado", en: "Each risk with the structural answer beside it"},
      head: [
        {pt: "Risco", en: "Risk"},
        {pt: "Tratamento", en: "Treatment"},
      ],
      rows: relevant.map((finding) => [
        finding.pt,
        mitigants[finding.id]?.pt ?? "Pergunta aberta à companhia; ver Pontos em aberto.",
      ]),
    },
  ];
}
