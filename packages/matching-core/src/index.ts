import type {OpportunityProjection} from "@offroad/domain-contracts";
import Decimal from "decimal.js";

export type Mandate = {
  id: string;
  fundName: string;
  currencies: string[];
  geographies: string[];
  sectors: string[];
  ticketMin: string;
  ticketMax: string;
  termMonthsMin: number;
  termMonthsMax: number;
  structures: string[];
  collateralTypes: string[];
  confidence: number;
  freshnessDays: number;
};

export type MatchResult = {
  mandateId: string;
  fundName: string;
  hardFilterStatus: "pass" | "fail";
  score: number;
  fitReasons: string[];
  mismatchReasons: string[];
};

export function evaluateMandate(opportunity: OpportunityProjection, mandate: Mandate): MatchResult {
  const amount = new Decimal(opportunity.amountMin).plus(opportunity.amountMax).div(2);
  const ticketPass = amount.gte(mandate.ticketMin) && amount.lte(mandate.ticketMax);
  const currencyPass = mandate.currencies.includes(opportunity.currency);
  const geographyPass = mandate.geographies.includes(opportunity.geography);
  const sectorPass = mandate.sectors.includes(opportunity.sector) || mandate.sectors.includes("all");
  const termPass = opportunity.termMonthsMin >= mandate.termMonthsMin && opportunity.termMonthsMax <= mandate.termMonthsMax;
  const structurePass = opportunity.structureTypes.some((value) => mandate.structures.includes(value));

  const checks = [currencyPass, geographyPass, sectorPass, ticketPass, termPass, structurePass];
  const mismatchReasons = [
    [currencyPass, "currency_outside_mandate"],
    [geographyPass, "geography_outside_mandate"],
    [sectorPass, "sector_outside_mandate"],
    [ticketPass, "ticket_outside_mandate"],
    [termPass, "term_outside_mandate"],
    [structurePass, "structure_outside_mandate"],
  ].filter(([pass]) => !pass).map(([, reason]) => reason as string);

  const collateralFit = opportunity.collateralTypes.some((value) => mandate.collateralTypes.includes(value));
  const freshnessFactor = Math.max(0.55, 1 - mandate.freshnessDays / 730);
  const baseScore = checks.filter(Boolean).length / checks.length;
  const score = Number((baseScore * 0.72 + (collateralFit ? 0.14 : 0) + mandate.confidence * 0.14) * freshnessFactor);

  return {
    mandateId: mandate.id,
    fundName: mandate.fundName,
    hardFilterStatus: checks.every(Boolean) ? "pass" : "fail",
    score: Number(Math.min(1, score).toFixed(6)),
    fitReasons: [
      ...(ticketPass ? ["ticket_fit"] : []),
      ...(sectorPass ? ["sector_fit"] : []),
      ...(structurePass ? ["structure_fit"] : []),
      ...(collateralFit ? ["collateral_fit"] : []),
    ],
    mismatchReasons,
  };
}

export function rankMandates(opportunity: OpportunityProjection, mandates: Mandate[]): MatchResult[] {
  return mandates
    .map((mandate) => evaluateMandate(opportunity, mandate))
    .sort((left, right) => {
      if (left.hardFilterStatus !== right.hardFilterStatus) return left.hardFilterStatus === "pass" ? -1 : 1;
      return right.score - left.score || left.fundName.localeCompare(right.fundName);
    });
}
