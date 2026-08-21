import {describe, expect, it} from "vitest";

import {assessCapacity} from "./capacity";
import {buildTermSheet} from "./termsheet";

/** A startup is sized against what it has (ARR, a round), never against the EBITDA it lacks. */
describe("capacity for venture debt", () => {
  it("takes the lower of 30% of ARR and 35% of the last round, and asks for no DSCR", () => {
    const capacity = assessCapacity({
      archetypeId: "venture_debt",
      requested: "20000000",
      arr: "40000000",
      lastEquityRound: "30000000",
      adjustedEbitda: "-12000000",
      cfads: "-9000000",
      annualDebtServiceFactor: "0.45",
    });
    expect(capacity.walls.map((wall) => wall.id)).toEqual(["arr_and_round", "collateral"]);
    // 30% of 40M = 12M; 35% of 30M = 10,5M. The round binds.
    expect(capacity.recommended).toBe("10500000");
    expect(capacity.bindingConstraint).toBe("arr_and_round");
    expect(capacity.gaps).not.toContain("EBITDA ajustado positivo");
    expect(capacity.calculations.find((calculation) => calculation.id === "capacity_arr_and_round")?.trace).toContainEqual({label: "binding", value: "last_equity_round"});
  });

  it("names the binding constraint in the term sheet", () => {
    const capacity = assessCapacity({archetypeId: "venture_debt", requested: "20000000", arr: "40000000"});
    const sheet = buildTermSheet({archetypeId: "venture_debt", capacity, requestedTermMonths: 36, requestedGraceMonths: 9, blockers: []});
    const amount = sheet.terms.find((term) => term.id === "amount")!;
    expect(amount.divergence?.reason.pt).toContain("fração do ARR");
  });

  it("reports the gap when neither ARR nor a round is known", () => {
    const capacity = assessCapacity({archetypeId: "venture_debt", requested: "20000000"});
    expect(capacity.recommended).toBeNull();
    expect(capacity.gaps).toContain("ARR ou valor da última rodada");
  });
});
