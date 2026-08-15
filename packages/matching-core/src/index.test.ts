import {describe, expect, it} from "vitest";

import type {OpportunityProjection} from "@offroad/domain-contracts";

import {rankMandates, type Mandate} from "./index";

const opportunity: OpportunityProjection = {
  id: "7990d3a9-115e-4ad0-b6a7-ae5ab56afc1a",
  sector: "food_retail",
  geography: "BR",
  currency: "BRL",
  amountMin: "54",
  amountMax: "62",
  termMonthsMin: 36,
  termMonthsMax: 48,
  structureTypes: ["senior_secured"],
  collateralTypes: ["receivables", "real_estate"],
};

const mandates: Mandate[] = [
  {id: "a", fundName: "Aurora Credit", currencies: ["BRL"], geographies: ["BR"], sectors: ["food_retail"], ticketMin: "30", ticketMax: "100", termMonthsMin: 24, termMonthsMax: 60, structures: ["senior_secured"], collateralTypes: ["receivables"], confidence: 0.95, freshnessDays: 12},
  {id: "b", fundName: "Canyon Opportunities", currencies: ["USD"], geographies: ["BR"], sectors: ["all"], ticketMin: "30", ticketMax: "150", termMonthsMin: 12, termMonthsMax: 72, structures: ["senior_secured"], collateralTypes: ["real_estate"], confidence: 0.9, freshnessDays: 20},
];

describe("matching core", () => {
  it("ranks a current, exact-fit mandate first and explains failures", () => {
    const results = rankMandates(opportunity, mandates);
    expect(results[0]?.fundName).toBe("Aurora Credit");
    expect(results[0]?.hardFilterStatus).toBe("pass");
    expect(results[1]?.mismatchReasons).toContain("currency_outside_mandate");
  });
});
