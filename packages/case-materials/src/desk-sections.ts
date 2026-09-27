import Decimal from "decimal.js";
import {absentRatioGap, publishedRatio, type AbsentRatio, type DeskAnalysis, type Trajectory} from "@offroad/credit-analysis";
import {calculateNewInstrumentAmount, presentationAmount, presentationFigure, presentationNumber, type DecimalInput} from "@offroad/financial-core";

import type {MaterialBlock, MaterialTableCell} from "./compile";

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
 * staleness and audit machinery that guards the prose guards these tables. Every sum and every
 * conversion of a figure is a financial-core kernel; this file only lays the figures out.
 */

type Locale = "pt-BR" | "en-US";
const money = (value: DecimalInput, locale: Locale) => presentationAmount({value, locale, style: "whole"}).text;
const pct = (value: DecimalInput, locale: Locale) =>
  `${presentationNumber(presentationFigure({value, scale: "percent"}).value).value.toLocaleString(locale, {minimumFractionDigits: 1, maximumFractionDigits: 2})}%`;
const turns = (value: DecimalInput, locale: Locale) =>
  `${presentationNumber(value).value.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;
/** A table cell in each language: a figure prints with the separators of the language that reads it (invariant 9). */
const cell = (value: (locale: Locale) => string): MaterialTableCell => ({pt: value("pt-BR"), en: value("en-US")});
/**
 * A ratio of the desk or of the trajectory in each language, or, when it is absent (a ratio over a
 * zero denominator, stage 19, second polish), the gap in words: never a division printed as a number.
 */
const ratioText = (
  output: {readonly absentRatios?: readonly AbsentRatio[]} | null,
  field: string,
  value: string | null,
  print: (value: string, locale: Locale) => string,
): {pt: string; en: string} => {
  const stated = publishedRatio(value);
  if (stated !== null) return {pt: print(stated, "pt-BR"), en: print(stated, "en-US")};
  return absentRatioGap(output, field, value) ?? {pt: "não calculado", en: "not computed"};
};

/** Preserve the exact threshold: only Decimal normalizes insignificant fractional zeroes. */
function covenantTurns(value: string, locale: Locale): string {
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error("Covenant maximum must be finite");
  const [coefficient, exponent] = decimal.toString().split("e");
  const separator = locale === "pt-BR" ? "," : ".";
  const localized = coefficient!.includes(".") ? coefficient!.replace(".", separator) : `${coefficient}${separator}0`;
  return `${localized}${exponent === undefined ? "" : `e${exponent}`}x`;
}

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
  const amount = trajectory.years.length > 0 ? calculateNewInstrumentAmount({covenantedBalance: lm.covenantedBalance, netNewMoney: lm.netNewMoney}).value : null;
  if (!amount) return null;

  return {
    type: "table",
    caption: {pt: "Fontes e usos", en: "Sources and uses"},
    head: [
      {pt: "Item", en: "Item"},
      {pt: "Valor", en: "Amount"},
    ],
    rows: [
      [{pt: "Fonte: novo instrumento", en: "Source: new instrument"}, cell((locale) => money(amount, locale))],
      [
        lm.lendersTakenOut.length > 0
          ? {pt: `Uso: quitação das linhas com covenant (${lm.lendersTakenOut.join(", ")})`, en: `Use: takeout of the covenanted lines (${lm.lendersTakenOut.join(", ")})`}
          : {pt: "Uso: resgate de dívida existente (troca de passivo)", en: "Use: repayment of existing debt (liability swap)"},
        cell((locale) => money(lm.covenantedBalance, locale)),
      ],
      [{pt: "Uso: recursos novos para o plano da companhia", en: "Use: new money for the company's plan"}, cell((locale) => money(lm.netNewMoney, locale))],
    ],
  };
}

/** The stack the day before and the day after, on one axis. */
/** What a venture lender reads instead of leverage: runway, burn, ARR and what the ticket buys. */
export function runwayAndRecurring(desk: DeskAnalysis): MaterialBlock | null {
  const runway = desk.runway;
  if (!runway) return null;
  const months = (value: string, locale: "pt-BR" | "en-US") => `${presentationFigure({value, decimals: 1}).value.replace(".", locale === "pt-BR" ? "," : ".")} ${locale === "pt-BR" ? "meses" : "months"}`;
  const rows: Array<{label: {pt: string; en: string}; value: {pt: string; en: string}; supportIds?: string[]}> = [
    {label: {pt: "Queima de caixa mensal", en: "Monthly cash burn"}, value: {pt: money(runway.monthlyBurn, "pt-BR"), en: money(runway.monthlyBurn, "en-US")}, supportIds: ["desk.queima_mensal"]},
    {label: {pt: "Runway antes da operação", en: "Runway before the deal"}, value: {pt: months(runway.monthsPre, "pt-BR"), en: months(runway.monthsPre, "en-US")}, supportIds: ["desk.runway_pre_meses"]},
    {label: {pt: "Runway após a operação, com o serviço", en: "Runway after the deal, with service"}, value: ratioText(desk, "runway.monthsPostAfterService", runway.monthsPostAfterService, months), supportIds: ["desk.runway_pos_meses"]},
    {label: {pt: "Taxa assumida para o serviço", en: "Rate assumed for service"}, value: {pt: pct(runway.assumedRate, "pt-BR"), en: pct(runway.assumedRate, "en-US")}},
  ];
  if (runway.arr) rows.push({label: {pt: "ARR", en: "ARR"}, value: {pt: money(runway.arr, "pt-BR"), en: money(runway.arr, "en-US")}, supportIds: ["desk.arr"]});
  if (runway.debtToArr) rows.push({label: {pt: "Dívida pós-operação sobre ARR", en: "Post-deal debt over ARR"}, value: {pt: pct(runway.debtToArr, "pt-BR"), en: pct(runway.debtToArr, "en-US")}, supportIds: ["desk.divida_sobre_arr"]});
  if (runway.nrr) rows.push({label: {pt: "Retenção líquida de receita", en: "Net revenue retention"}, value: {pt: pct(runway.nrr, "pt-BR"), en: pct(runway.nrr, "en-US")}});
  if (runway.topCustomerShare) rows.push({label: {pt: "Maior cliente sobre o MRR", en: "Largest customer over MRR"}, value: {pt: pct(runway.topCustomerShare, "pt-BR"), en: pct(runway.topCustomerShare, "en-US")}});
  return {type: "kv", caption: {pt: "Runway e receita recorrente", en: "Runway and recurring revenue"}, rows};
}

export function capitalStructure(desk: DeskAnalysis, trajectory: Trajectory | null): MaterialBlock[] {
  const takenOut = new Set(trajectory?.liabilityManagement?.lendersTakenOut ?? []);
  const rows = desk.stack.lines.map((line): MaterialTableCell[] => [
    line.lender,
    cell((locale) => money(line.balance, locale)),
    line.effectiveAnnual ? cell((locale) => pct(line.effectiveAnnual!, locale)) : {pt: "não normalizável", en: "not normalisable"},
    line.maturity ?? {pt: "não informado", en: "not stated"},
    line.covenant ? {pt: `Dív.líq./EBITDA ≤ ${covenantTurns(line.covenant.maximum, "pt-BR")}`, en: `Net debt/EBITDA ≤ ${covenantTurns(line.covenant.maximum, "en-US")}`} : {pt: "sem covenant", en: "no covenant"},
    takenOut.has(line.lender) ? {pt: "quitada na operação", en: "taken out in the transaction"} : {pt: "mantida", en: "kept"},
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
          value: publishedRatio(desk.leverage.preTurns) ?? "",
          // Over a zero EBITDA the leverage is absent and the gap is named; over a negative one it is a number without meaning.
          formatted: absentRatioGap(desk, "leverage.preTurns", desk.leverage.preTurns)
            ?? (desk.profile === "cash_burning"
              ? {pt: "não se aplica (EBITDA negativo)", en: "not applicable (negative EBITDA)"}
              : ratioText(desk, "leverage.preTurns", desk.leverage.preTurns, turns)),
          supportIds: ["desk.alavancagem_pre"],
        },
        ...(trajectory?.liabilityManagement
          ? [{
              label: {pt: "Alavancagem pós, com quitação das linhas com covenant", en: "Post-transaction leverage, covenanted lines taken out"},
              value: publishedRatio(trajectory.liabilityManagement.postLeverageAfterRefi) ?? "",
              formatted: ratioText(trajectory, "liabilityManagement.postLeverageAfterRefi", trajectory.liabilityManagement.postLeverageAfterRefi, turns),
              supportIds: ["trajetoria.alavancagem_pos_refi"],
            }]
          : []),
      ],
    },
  ];
  const runway = runwayAndRecurring(desk);
  return runway ? [...blocks, runway] : blocks;
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
      cell((locale) => money(year.netDebt, locale)),
      cell((locale) => money(year.ebitdaBase, locale)),
      ratioText(trajectory, `years.${year.year}.leverageBase`, year.leverageBase, turns),
      ratioText(trajectory, `years.${year.year}.leverageStressed`, year.leverageStressed, turns),
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
    rows: trajectory.covenantProposal.map((step) => [String(step.year), ratioText(trajectory, `covenantProposal.${step.year}.maximum`, step.maximum, turns)]),
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
      ? trajectory.liabilityManagement.lendersTakenOut.length > 0
        ? {
            pt: `Endereçado na estrutura: as linhas com covenant são quitadas na operação (${trajectory.liabilityManagement.lendersTakenOut.join(", ")}), e o novo instrumento carrega covenant próprio, escalonado conforme a trajetória.`,
            en: `Addressed in the structure: the covenanted lines are taken out in the transaction (${trajectory.liabilityManagement.lendersTakenOut.join(", ")}), and the new instrument carries its own covenant, stepped to the trajectory.`,
          }
        : {
            pt: "Parcialmente endereçado: a captação é majoritariamente troca de passivo, e a trajetória até a próxima medição do covenant deve ser demonstrada com a sazonalidade de caixa e o resgate das parcelas de curto prazo.",
            en: "Partially addressed: the raise is mostly a liability swap, and the trajectory to the next covenant test must be shown with cash seasonality and the repayment of the short-dated instalments.",
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
      // Each document states the risk and its treatment in its own language, figures included.
      rows: relevant.map((finding) => [
        {pt: finding.pt, en: finding.en},
        mitigants[finding.id] ?? {pt: "Pergunta aberta à companhia; ver Pontos em aberto.", en: "Open question to the company; see Open points."},
      ]),
    },
  ];
}
