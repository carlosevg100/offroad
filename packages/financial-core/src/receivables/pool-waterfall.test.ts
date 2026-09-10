import {describe, expect, it} from "vitest";

import {allocateReceivablesPoolWaterfall, receivablesPoolWaterfallOrder} from "./pool-waterfall";

/** Independent review gold: reserve target 90,000 against an opening of 30,000; 400,000 of cash. */
const gold = {
  availableCash: "400000.00", servicingFeeDue: "10000.00", seniorInterestDue: "100000.00", seniorPrincipalDue: "200000.00",
  mezzanineDue: "0", reserveOpening: "30000.00", reserveTarget: "90000",
};

describe("receivables pool waterfall kernel", () => {
  it("pays the fixed order in full when cash suffices and hands the rest to the subordinated tranche", () => {
    const result = allocateReceivablesPoolWaterfall(gold);
    expect(result.order).toEqual(receivablesPoolWaterfallOrder);
    expect(result.reserveTopUpDue).toBe("60000");
    expect(result.allocations).toEqual([
      {priority: 1, item: "servicing_fee", due: "10000", paid: "10000", shortfall: "0"},
      {priority: 2, item: "senior_interest", due: "100000", paid: "100000", shortfall: "0"},
      {priority: 3, item: "reserve_top_up", due: "60000", paid: "60000", shortfall: "0"},
      {priority: 4, item: "senior_principal", due: "200000", paid: "200000", shortfall: "0"},
      {priority: 5, item: "mezzanine", due: "0", paid: "0", shortfall: "0"},
      {priority: 6, item: "subordinated_residual", due: "30000", paid: "30000", shortfall: "0"},
    ]);
    expect(result).toMatchObject({subordinatedResidual: "30000", unallocatedCash: "0", totalPaid: "400000", seniorShortfall: "0"});
    expect(result.trace).toMatchObject({id: "receivables.pool_waterfall", result: "400000", operands: {reserveTopUpDue: "60000", availableCash: "400000"}});
  });

  it("stops paying when cash runs out, never goes negative and exposes the senior shortfall", () => {
    const result = allocateReceivablesPoolWaterfall({...gold, availableCash: "50000.00"});
    expect(result.allocations.map((allocation) => [allocation.item, allocation.paid, allocation.shortfall])).toEqual([
      ["servicing_fee", "10000", "0"],
      ["senior_interest", "40000", "60000"],
      ["reserve_top_up", "0", "60000"],
      ["senior_principal", "0", "200000"],
      ["mezzanine", "0", "0"],
      ["subordinated_residual", "0", "0"],
    ]);
    expect(result).toMatchObject({totalPaid: "50000", subordinatedResidual: "0", unallocatedCash: "0", seniorShortfall: "260000"});
  });

  it("floors the reserve top-up at zero when the opening balance already exceeds the target", () => {
    const result = allocateReceivablesPoolWaterfall({...gold, reserveOpening: "95000"});
    expect(result.reserveTopUpDue).toBe("0");
    expect(result.allocations[2]).toEqual({priority: 3, item: "reserve_top_up", due: "0", paid: "0", shortfall: "0"});
    expect(result.subordinatedResidual).toBe("90000");
    expect(result.totalPaid).toBe("400000");
  });

  it("allocates nothing from zero cash and pays mezzanine before the residual", () => {
    const empty = allocateReceivablesPoolWaterfall({...gold, availableCash: "0"});
    expect(empty.allocations.every((allocation) => allocation.paid === "0")).toBe(true);
    expect(empty).toMatchObject({totalPaid: "0", seniorShortfall: "300000"});
    const mezzanine = allocateReceivablesPoolWaterfall({...gold, mezzanineDue: "25000"});
    expect(mezzanine.allocations[4]).toEqual({priority: 5, item: "mezzanine", due: "25000", paid: "25000", shortfall: "0"});
    expect(mezzanine.subordinatedResidual).toBe("5000");
  });

  it("keeps sub-cent amounts unrounded for the caller to publish", () => {
    const result = allocateReceivablesPoolWaterfall({...gold, availableCash: "10000.004", servicingFeeDue: "10000.001"});
    expect(result.allocations[0]).toMatchObject({paid: "10000.001", shortfall: "0"});
    expect(result.allocations[1]).toMatchObject({paid: "0.003", shortfall: "99999.997"});
  });

  it("refuses negative amounts", () => {
    expect(() => allocateReceivablesPoolWaterfall({...gold, availableCash: "-1"})).toThrow(RangeError);
    expect(() => allocateReceivablesPoolWaterfall({...gold, seniorPrincipalDue: "-0.01"})).toThrow(RangeError);
  });
});
