import Decimal from "decimal.js";

import type {DeskAnalysis} from "./analyze";
import type {Trajectory} from "./trajectory";

/**
 * The internal rating: the first thing a committee asks for, written down as arithmetic.
 *
 * Ten grades, from 1 (the strongest credit this desk sees) to 10 (a credit it would not take
 * to market), built from seven factors a head of credit reads in this order: leverage,
 * interest coverage, liquidity against the next twelve months, the direction of the numbers,
 * concentration, the quality of the evidence, and, for a company that burns cash, runway in
 * place of the first two. Every factor carries its value, the band it fell in, the points it
 * earned and the sentence that says why, so the grade can be argued line by line instead of
 * trusted.
 *
 * The scale is the desk's, not an agency's. It is deliberately written as data a credit
 * professional can disagree with: change a threshold here and every case is re-rated the same
 * way, which is the whole point of writing it down.
 */

export type RatingFactor = {
  id: "leverage" | "coverage" | "liquidity" | "trend" | "concentration" | "evidence" | "runway";
  labels: {pt: string; en: string};
  /** The number the factor read, as a decimal string, or null when the room did not carry it. */
  value: string | null;
  /** 0 (worst) to 4 (best); null when not assessable. */
  points: number | null;
  weight: number;
  rationale: {pt: string; en: string};
};

export type InternalRating = {
  /** 1 (strongest) to 10 (weakest). */
  grade: number;
  /** 0 to 100: weighted points over the maximum the assessable factors allowed. */
  score: number;
  /** Coverage of the scale: factors the room let the desk assess, over the seven. */
  assessed: number;
  factors: RatingFactor[];
  /** The band a lender reads the grade in. */
  band: "strong" | "adequate" | "watch" | "weak" | "distressed";
  summary: {pt: string; en: string};
};

export type RatingInput = {
  desk: DeskAnalysis;
  trajectory: Trajectory | null;
  /** Interest expense of the latest audited year, when the room states it. */
  financialExpenses?: string;
  /** EBITDA of the year before, when known, for the trend. */
  priorEbitda?: string;
  /** Share of revenue (or MRR) in the largest customer, as a fraction. */
  topCustomerShare?: string;
  /** Weighted evidence rank of the material facts the analysis stands on: 1 audited to 7 company statement. */
  evidenceRank?: string;
};

const d = (value: string | number): Decimal => new Decimal(value);
const fmt = (value: Decimal, digits = 2) => value.toFixed(digits).replace(".", ",");

type Band = {max: string; points: number};
/** Points from the value against ascending ceilings: the first ceiling the value is under wins. */
const pointsUnder = (value: Decimal, bands: readonly Band[], otherwise: number): number => {
  for (const band of bands) if (value.lte(band.max)) return band.points;
  return otherwise;
};
/** Points from the value against ascending floors: the last floor the value clears wins. */
const pointsOver = (value: Decimal, bands: readonly {min: string; points: number}[], otherwise: number): number => {
  let points = otherwise;
  for (const band of bands) if (value.gte(band.min)) points = band.points;
  return points;
};

export function rateCredit(input: RatingInput): InternalRating {
  const {desk, trajectory} = input;
  const burning = desk.profile === "cash_burning";
  const factors: RatingFactor[] = [];

  // ---- leverage: net debt over EBITDA, post-transaction when a trajectory says what it becomes
  if (!burning) {
    const post = trajectory?.liabilityManagement?.postLeverageAfterRefi ?? desk.leverage.scenarios[0]?.postTurns ?? null;
    const value = d(post ?? desk.leverage.preTurns);
    const points = pointsUnder(value, [{max: "1.5", points: 4}, {max: "2.5", points: 3}, {max: "3.5", points: 2}, {max: "4.5", points: 1}], 0);
    factors.push({
      id: "leverage", weight: 3, value: value.toFixed(4), points,
      labels: {pt: "Alavancagem pós-operação", en: "Post-transaction leverage"},
      rationale: {
        pt: `Dívida líquida sobre EBITDA de ${fmt(value)}x após a operação (${post ? "com a estrutura proposta" : "sem trajetória, pré-operação"}). Faixas: até 1,5x forte; até 2,5x adequada; até 3,5x atenção; até 4,5x fraca; acima, crítica.`,
        en: `Net debt over EBITDA of ${value.toFixed(2)}x after the transaction (${post ? "with the proposed structure" : "no trajectory, pre-transaction"}). Bands: up to 1.5x strong; up to 2.5x adequate; up to 3.5x watch; up to 4.5x weak; above, critical.`,
      },
    });
  }

  // ---- coverage: EBITDA over interest expense
  if (!burning) {
    const expenses = input.financialExpenses ? d(input.financialExpenses).abs() : null;
    const value = expenses && expenses.gt(0) ? d(desk.leverage.ebitda).div(expenses) : null;
    const points = value ? pointsOver(value, [{min: "1.5", points: 1}, {min: "2.5", points: 2}, {min: "4", points: 3}, {min: "6", points: 4}], 0) : null;
    factors.push({
      id: "coverage", weight: 2, value: value ? value.toFixed(4) : null, points,
      labels: {pt: "Cobertura de juros", en: "Interest coverage"},
      rationale: value
        ? {pt: `EBITDA cobre a despesa financeira ${fmt(value, 1)} vezes. Faixas: acima de 6x forte; de 4x adequada; de 2,5x atenção; de 1,5x fraca; abaixo, crítica.`, en: `EBITDA covers interest expense ${value.toFixed(1)} times. Bands: above 6x strong; from 4x adequate; from 2.5x watch; from 1.5x weak; below, critical.`}
        : {pt: "Não avaliada: a sala não traz a despesa financeira do último exercício.", en: "Not assessed: the room does not carry the latest year's interest expense."},
    });
  }

  // ---- liquidity: cash over the principal due in twelve months
  {
    const coverage = desk.stack.liquidityCoverage12 ? d(desk.stack.liquidityCoverage12) : null;
    const nothingDue = d(desk.stack.maturingWithin12Months).lte(0);
    const points = nothingDue ? 4 : coverage ? pointsOver(coverage, [{min: "0.5", points: 1}, {min: "1", points: 2}, {min: "1.5", points: 3}, {min: "2.5", points: 4}], 0) : null;
    factors.push({
      id: "liquidity", weight: 2, value: coverage ? coverage.toFixed(4) : nothingDue ? "n/a" : null, points,
      labels: {pt: "Liquidez contra os próximos 12 meses", en: "Liquidity against the next 12 months"},
      rationale: nothingDue
        ? {pt: "Nenhum principal vence nos próximos 12 meses segundo o mapa e o perfil de vencimentos.", en: "No principal falls due in the next 12 months per the schedule and the maturity profile."}
        : coverage
          ? {pt: `Caixa cobre ${fmt(coverage)}x o principal dos próximos 12 meses. Faixas: acima de 2,5x forte; de 1,5x adequada; de 1x atenção; de 0,5x fraca; abaixo, crítica.`, en: `Cash covers ${coverage.toFixed(2)}x the principal due in the next 12 months. Bands: above 2.5x strong; from 1.5x adequate; from 1x watch; from 0.5x weak; below, critical.`}
          : {pt: "Não avaliada: sem vencimentos datados nem perfil de amortização.", en: "Not assessed: no dated maturities and no amortisation profile."},
    });
  }

  // ---- trend: EBITDA against the year before
  {
    const prior = input.priorEbitda ? d(input.priorEbitda) : null;
    const current = d(desk.leverage.ebitda);
    const growth = prior && !prior.isZero() ? current.minus(prior).div(prior.abs()) : null;
    const points = growth ? pointsOver(growth, [{min: "-0.2", points: 1}, {min: "-0.05", points: 2}, {min: "0.05", points: 3}, {min: "0.15", points: 4}], 0) : null;
    factors.push({
      id: "trend", weight: 1, value: growth ? growth.toFixed(4) : null, points,
      labels: {pt: "Tendência do EBITDA", en: "EBITDA trend"},
      rationale: growth
        ? {pt: `EBITDA variou ${fmt(growth.times(100), 1)}% contra o exercício anterior. Faixas: acima de 15% forte; de 5% adequada; de -5% estável; de -20% fraca; abaixo, crítica.`, en: `EBITDA moved ${growth.times(100).toFixed(1)}% against the prior year. Bands: above 15% strong; from 5% adequate; from -5% stable; from -20% weak; below, critical.`}
        : {pt: "Não avaliada: a sala traz um único exercício.", en: "Not assessed: the room carries a single year."},
    });
  }

  // ---- concentration: the largest customer
  {
    const share = input.topCustomerShare ? d(input.topCustomerShare) : desk.runway?.topCustomerShare ? d(desk.runway.topCustomerShare) : null;
    const points = share ? pointsUnder(share, [{max: "0.1", points: 4}, {max: "0.2", points: 3}, {max: "0.3", points: 2}, {max: "0.5", points: 1}], 0) : null;
    factors.push({
      id: "concentration", weight: 1, value: share ? share.toFixed(4) : null, points,
      labels: {pt: "Concentração no maior cliente", en: "Largest-customer concentration"},
      rationale: share
        ? {pt: `O maior cliente responde por ${fmt(share.times(100), 1)}% da receita. Faixas: até 10% forte; até 20% adequada; até 30% atenção; até 50% fraca; acima, crítica.`, en: `The largest customer is ${share.times(100).toFixed(1)}% of revenue. Bands: up to 10% strong; up to 20% adequate; up to 30% watch; up to 50% weak; above, critical.`}
        : {pt: "Não avaliada: a sala não traz concentração de clientes.", en: "Not assessed: the room carries no customer concentration."},
    });
  }

  // ---- evidence: how good is what the grade stands on
  {
    const rank = input.evidenceRank ? d(input.evidenceRank) : null;
    const points = rank ? pointsUnder(rank, [{max: "1.5", points: 4}, {max: "3", points: 3}, {max: "4.5", points: 2}, {max: "6", points: 1}], 0) : null;
    factors.push({
      id: "evidence", weight: 1, value: rank ? rank.toFixed(2) : null, points,
      labels: {pt: "Qualidade da evidência", en: "Evidence quality"},
      rationale: rank
        ? {pt: `Rank médio de evidência dos fatos materiais: ${fmt(rank, 1)} (1 auditado, 7 declaração da empresa). Até 1,5 forte; até 3 adequada; até 4,5 atenção; até 6 fraca.`, en: `Mean evidence rank of the material facts: ${rank.toFixed(1)} (1 audited, 7 company statement). Up to 1.5 strong; up to 3 adequate; up to 4.5 watch; up to 6 weak.`}
        : {pt: "Não avaliada: rank de evidência não informado.", en: "Not assessed: evidence rank not provided."},
    });
  }

  // ---- runway, in place of leverage and coverage for a company that burns cash
  if (burning) {
    const months = desk.runway ? d(desk.runway.monthsPostAfterService) : null;
    const points = months ? pointsOver(months, [{min: "6", points: 1}, {min: "12", points: 2}, {min: "18", points: 3}, {min: "24", points: 4}], 0) : null;
    factors.push({
      id: "runway", weight: 5, value: months ? months.toFixed(1) : null, points,
      labels: {pt: "Runway após a operação, com o serviço", en: "Runway after the deal, with service"},
      rationale: months
        ? {pt: `${fmt(months, 1)} meses de caixa após a captação, pagando os juros dela. Faixas: acima de 24 forte; de 18 adequada; de 12 atenção; de 6 fraca; abaixo, crítica.`, en: `${months.toFixed(1)} months of cash after the raise, paying its interest. Bands: above 24 strong; from 18 adequate; from 12 watch; from 6 weak; below, critical.`}
        : {pt: "Não avaliada: sem queima mensal na sala.", en: "Not assessed: no monthly burn in the room."},
    });
  }

  const assessable = factors.filter((factor) => factor.points !== null);
  const earned = assessable.reduce((sum, factor) => sum + factor.points! * factor.weight, 0);
  const possible = assessable.reduce((sum, factor) => sum + 4 * factor.weight, 0);
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  // 100 → grade 1, 0 → grade 10, in equal steps; a critical leverage or runway floors the grade.
  let grade = Math.min(10, Math.max(1, 10 - Math.floor(score / 11.2)));
  const floorFactor = factors.find((factor) => (factor.id === "leverage" || factor.id === "runway") && factor.points === 0);
  if (floorFactor) grade = Math.max(grade, 8);
  const band = grade <= 2 ? "strong" : grade <= 4 ? "adequate" : grade <= 6 ? "watch" : grade <= 8 ? "weak" : "distressed";
  const bandPt = {strong: "forte", adequate: "adequado", watch: "atenção", weak: "fraco", distressed: "crítico"}[band];

  return {
    grade,
    score,
    assessed: assessable.length,
    factors,
    band,
    summary: {
      pt: `Rating interno ${grade} de 10 (${bandPt}), ${score} pontos em 100 sobre ${assessable.length} de ${factors.length} fatores avaliáveis${floorFactor ? `; piso em 8 por ${floorFactor.labels.pt.toLowerCase()} crítica` : ""}.`,
      en: `Internal rating ${grade} of 10 (${band}), ${score} points out of 100 over ${assessable.length} of ${factors.length} assessable factors${floorFactor ? `; floored at 8 by critical ${floorFactor.labels.en.toLowerCase()}` : ""}.`,
    },
  };
}
