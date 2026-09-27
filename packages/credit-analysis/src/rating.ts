import {
  calculateEbitdaTrend, calculateRatingCoverage, compareFigures, gradeInternalRating, presentationFigure, scoreRatingFactor, type RatingBand,
} from "@offroad/financial-core";

import {publishedRatio} from "./absent-ratio";
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
 *
 * The thresholds and weights stay here as data; every figure the rating reads or makes (interest
 * coverage, the EBITDA trend, the points against the bands, the score and the grade) and every
 * figure it prints comes from `@offroad/financial-core` (stage 19, third polish).
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

/** A figure at the precision the rating prints it, half-up on the decimal value. */
const at = (value: string, digits = 2) => presentationFigure({value, decimals: digits}).value;
/** A fraction as a percentage at the precision the rating prints it. */
const percent = (value: string, digits: number) => presentationFigure({value, scale: "percent", decimals: digits}).value;
/** The Portuguese sentence prints the same figure with a decimal comma. */
const fmt = (value: string, digits = 2) => at(value, digits).replace(".", ",");
const fmtPercent = (value: string, digits: number) => percent(value, digits).replace(".", ",");

/** Points from the value against ascending ceilings: the first ceiling the value does not exceed wins. */
const pointsUnder = (value: string, bands: readonly RatingBand[], otherwise: number): number => scoreRatingFactor({value, bands, reading: "at_most", otherwise}).points;
/** Points from the value against ascending floors: the last floor the value reaches wins. */
const pointsOver = (value: string, bands: readonly RatingBand[], otherwise: number): number => scoreRatingFactor({value, bands, reading: "at_least", otherwise}).points;

export function rateCredit(input: RatingInput): InternalRating {
  const {desk, trajectory} = input;
  const burning = desk.profile === "cash_burning";
  const factors: RatingFactor[] = [];

  // ---- leverage: net debt over EBITDA, post-transaction when a trajectory says what it becomes
  if (!burning) {
    // The leverage the structure leaves: after the swap when the trajectory says what it becomes, after
    // the ask otherwise, today when neither is stated. An absent one (over a zero EBITDA) is not rated.
    const lm = trajectory?.liabilityManagement ?? null;
    const scenario = desk.leverage.scenarios[0];
    const post = Boolean(lm || scenario);
    const leverage = publishedRatio(lm ? lm.postLeverageAfterRefi : scenario ? scenario.postTurns : desk.leverage.preTurns);
    if (leverage === null) {
      factors.push({
        id: "leverage", weight: 3, value: null, points: null,
        labels: {pt: "Alavancagem pós-operação", en: "Post-transaction leverage"},
        rationale: {
          pt: "Não avaliada: a alavancagem não é calculável, porque o EBITDA do último exercício é zero.",
          en: "Not assessed: leverage is not computable, because EBITDA for the latest financial year is zero.",
        },
      });
    } else {
      const value = leverage;
      const points = pointsUnder(value, [{limit: "1.5", points: 4}, {limit: "2.5", points: 3}, {limit: "3.5", points: 2}, {limit: "4.5", points: 1}], 0);
      factors.push({
        id: "leverage", weight: 3, value: at(value, 4), points,
        labels: {pt: "Alavancagem pós-operação", en: "Post-transaction leverage"},
        rationale: {
          pt: `Dívida líquida sobre EBITDA de ${fmt(value)}x após a operação (${post ? "com a estrutura proposta" : "sem trajetória, pré-operação"}). Faixas: até 1,5x forte; até 2,5x adequada; até 3,5x atenção; até 4,5x fraca; acima, crítica.`,
          en: `Net debt over EBITDA of ${at(value)}x after the transaction (${post ? "with the proposed structure" : "no trajectory, pre-transaction"}). Bands: up to 1.5x strong; up to 2.5x adequate; up to 3.5x watch; up to 4.5x weak; above, critical.`,
        },
      });
    }
  }

  // ---- coverage: EBITDA over interest expense
  if (!burning) {
    const value = input.financialExpenses ? calculateRatingCoverage({ebitda: desk.leverage.ebitda, financialExpenses: input.financialExpenses}).value : null;
    const points = value !== null ? pointsOver(value, [{limit: "1.5", points: 1}, {limit: "2.5", points: 2}, {limit: "4", points: 3}, {limit: "6", points: 4}], 0) : null;
    factors.push({
      id: "coverage", weight: 2, value: value !== null ? at(value, 4) : null, points,
      labels: {pt: "Cobertura de juros", en: "Interest coverage"},
      rationale: value !== null
        ? {pt: `EBITDA cobre a despesa financeira ${fmt(value, 1)} vezes. Faixas: acima de 6x forte; de 4x adequada; de 2,5x atenção; de 1,5x fraca; abaixo, crítica.`, en: `EBITDA covers interest expense ${at(value, 1)} times. Bands: above 6x strong; from 4x adequate; from 2.5x watch; from 1.5x weak; below, critical.`}
        : {pt: "Não avaliada: a sala não traz a despesa financeira do último exercício.", en: "Not assessed: the room does not carry the latest year's interest expense."},
    });
  }

  // ---- liquidity: cash over the principal due in twelve months
  {
    const coverage = desk.stack.liquidityCoverage12 ? desk.stack.liquidityCoverage12 : null;
    const nothingDue = compareFigures(desk.stack.maturingWithin12Months, 0) <= 0;
    const points = nothingDue ? 4 : coverage !== null ? pointsOver(coverage, [{limit: "0.5", points: 1}, {limit: "1", points: 2}, {limit: "1.5", points: 3}, {limit: "2.5", points: 4}], 0) : null;
    factors.push({
      id: "liquidity", weight: 2, value: coverage !== null ? at(coverage, 4) : nothingDue ? "n/a" : null, points,
      labels: {pt: "Liquidez contra os próximos 12 meses", en: "Liquidity against the next 12 months"},
      rationale: nothingDue
        ? {pt: "Nenhum principal vence nos próximos 12 meses segundo o mapa e o perfil de vencimentos.", en: "No principal falls due in the next 12 months per the schedule and the maturity profile."}
        : coverage !== null
          ? {pt: `Caixa cobre ${fmt(coverage)}x o principal dos próximos 12 meses. Faixas: acima de 2,5x forte; de 1,5x adequada; de 1x atenção; de 0,5x fraca; abaixo, crítica.`, en: `Cash covers ${at(coverage)}x the principal due in the next 12 months. Bands: above 2.5x strong; from 1.5x adequate; from 1x watch; from 0.5x weak; below, critical.`}
          : {pt: "Não avaliada: sem vencimentos datados nem perfil de amortização.", en: "Not assessed: no dated maturities and no amortisation profile."},
    });
  }

  // ---- trend: EBITDA against the year before
  {
    const growth = input.priorEbitda ? calculateEbitdaTrend({current: desk.leverage.ebitda, prior: input.priorEbitda}).value : null;
    const points = growth !== null ? pointsOver(growth, [{limit: "-0.2", points: 1}, {limit: "-0.05", points: 2}, {limit: "0.05", points: 3}, {limit: "0.15", points: 4}], 0) : null;
    factors.push({
      id: "trend", weight: 1, value: growth !== null ? at(growth, 4) : null, points,
      labels: {pt: "Tendência do EBITDA", en: "EBITDA trend"},
      rationale: growth !== null
        ? {pt: `EBITDA variou ${fmtPercent(growth, 1)}% contra o exercício anterior. Faixas: acima de 15% forte; de 5% adequada; de -5% estável; de -20% fraca; abaixo, crítica.`, en: `EBITDA moved ${percent(growth, 1)}% against the prior year. Bands: above 15% strong; from 5% adequate; from -5% stable; from -20% weak; below, critical.`}
        : {pt: "Não avaliada: a sala traz um único exercício.", en: "Not assessed: the room carries a single year."},
    });
  }

  // ---- concentration: the largest customer
  {
    const share = input.topCustomerShare ? input.topCustomerShare : desk.runway?.topCustomerShare ? desk.runway.topCustomerShare : null;
    const points = share !== null ? pointsUnder(share, [{limit: "0.1", points: 4}, {limit: "0.2", points: 3}, {limit: "0.3", points: 2}, {limit: "0.5", points: 1}], 0) : null;
    factors.push({
      id: "concentration", weight: 1, value: share !== null ? at(share, 4) : null, points,
      labels: {pt: "Concentração no maior cliente", en: "Largest-customer concentration"},
      rationale: share !== null
        ? {pt: `O maior cliente responde por ${fmtPercent(share, 1)}% da receita. Faixas: até 10% forte; até 20% adequada; até 30% atenção; até 50% fraca; acima, crítica.`, en: `The largest customer is ${percent(share, 1)}% of revenue. Bands: up to 10% strong; up to 20% adequate; up to 30% watch; up to 50% weak; above, critical.`}
        : {pt: "Não avaliada: a sala não traz concentração de clientes.", en: "Not assessed: the room carries no customer concentration."},
    });
  }

  // ---- evidence: how good is what the grade stands on
  {
    const rank = input.evidenceRank ? input.evidenceRank : null;
    const points = rank !== null ? pointsUnder(rank, [{limit: "1.5", points: 4}, {limit: "3", points: 3}, {limit: "4.5", points: 2}, {limit: "6", points: 1}], 0) : null;
    factors.push({
      id: "evidence", weight: 1, value: rank !== null ? at(rank, 2) : null, points,
      labels: {pt: "Qualidade da evidência", en: "Evidence quality"},
      rationale: rank !== null
        ? {pt: `Rank médio de evidência dos fatos materiais: ${fmt(rank, 1)} (1 auditado, 7 declaração da empresa). Até 1,5 forte; até 3 adequada; até 4,5 atenção; até 6 fraca.`, en: `Mean evidence rank of the material facts: ${at(rank, 1)} (1 audited, 7 company statement). Up to 1.5 strong; up to 3 adequate; up to 4.5 watch; up to 6 weak.`}
        : {pt: "Não avaliada: rank de evidência não informado.", en: "Not assessed: evidence rank not provided."},
    });
  }

  // ---- runway, in place of leverage and coverage for a company that burns cash
  if (burning) {
    // An absent runway after service (the burn plus the raise's interest sums to zero) is named, never rated.
    const months = desk.runway ? publishedRatio(desk.runway.monthsPostAfterService) : null;
    const points = months !== null ? pointsOver(months, [{limit: "6", points: 1}, {limit: "12", points: 2}, {limit: "18", points: 3}, {limit: "24", points: 4}], 0) : null;
    factors.push({
      id: "runway", weight: 5, value: months !== null ? at(months, 1) : null, points,
      labels: {pt: "Runway após a operação, com o serviço", en: "Runway after the deal, with service"},
      rationale: months !== null
        ? {pt: `${fmt(months, 1)} meses de caixa após a captação, pagando os juros dela. Faixas: acima de 24 forte; de 18 adequada; de 12 atenção; de 6 fraca; abaixo, crítica.`, en: `${at(months, 1)} months of cash after the raise, paying its interest. Bands: above 24 strong; from 18 adequate; from 12 watch; from 6 weak; below, critical.`}
        : desk.runway
          ? {
              pt: "Não avaliada: o runway após a operação não é calculável, porque a queima mensal somada aos juros mensais da captação é zero.",
              en: "Not assessed: runway after the deal is not computable, because monthly burn plus the raise's monthly interest is zero.",
            }
          : {pt: "Não avaliada: sem queima mensal na sala.", en: "Not assessed: no monthly burn in the room."},
    });
  }

  // One grade for each 11.2 points from grade 10 at a score of 0 (100 is grade 2); a critical leverage or runway floors the grade.
  const floorFactor = factors.find((factor) => (factor.id === "leverage" || factor.id === "runway") && factor.points === 0);
  const {score, grade, assessed} = gradeInternalRating({factors: factors.map((factor) => ({points: factor.points, weight: factor.weight})), floorAtEight: Boolean(floorFactor)});
  const band = grade <= 2 ? "strong" : grade <= 4 ? "adequate" : grade <= 6 ? "watch" : grade <= 8 ? "weak" : "distressed";
  const bandPt = {strong: "forte", adequate: "adequado", watch: "atenção", weak: "fraco", distressed: "crítico"}[band];

  return {
    grade,
    score,
    assessed,
    factors,
    band,
    summary: {
      pt: `Rating interno ${grade} de 10 (${bandPt}), ${score} pontos em 100 sobre ${assessed} de ${factors.length} fatores avaliáveis${floorFactor ? `; piso em 8 por ${floorFactor.labels.pt.toLowerCase()} crítica` : ""}.`,
      en: `Internal rating ${grade} of 10 (${band}), ${score} points out of 100 over ${assessed} of ${factors.length} assessable factors${floorFactor ? `; floored at 8 by critical ${floorFactor.labels.en.toLowerCase()}` : ""}.`,
    },
  };
}
