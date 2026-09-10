import {describe, expect, it} from "vitest";

import {compareReceivablesPoolTrigger} from "./pool-triggers";

describe("receivables pool trigger kernel", () => {
  it("breaches a maximum strictly above the threshold and keeps a value at the limit within it", () => {
    const breached = compareReceivablesPoolTrigger({id: "single_debtor_concentration", actual: "0.25", threshold: "0.20", comparison: "maximum", consequence: "remediate"});
    expect(breached).toMatchObject({status: "breached", headroom: "-0.05", actual: "0.25", threshold: "0.2", consequence: "remediate"});
    expect(breached.trace).toMatchObject({id: "receivables.pool_trigger", result: "breached", operands: {trigger: "single_debtor_concentration"}});
    expect(compareReceivablesPoolTrigger({id: "dilution", actual: "0.05", threshold: "0.05", comparison: "maximum", consequence: "remediate"})).toMatchObject({status: "within_limit", headroom: "0"});
  });

  it("breaches a minimum strictly below the threshold with the headroom sign reversed", () => {
    expect(compareReceivablesPoolTrigger({id: "eligible_share", actual: "0.59999999", threshold: "0.60", comparison: "minimum", consequence: "block"})).toMatchObject({status: "breached", headroom: "-0.00000001", consequence: "block"});
    expect(compareReceivablesPoolTrigger({id: "eligible_share", actual: "1", threshold: "0.60", comparison: "minimum", consequence: "block"})).toMatchObject({status: "within_limit", headroom: "0.4"});
  });

  it("refuses malformed identifiers and non-finite values", () => {
    expect(() => compareReceivablesPoolTrigger({id: "Bad Id", actual: "1", threshold: "1", comparison: "maximum", consequence: "block"})).toThrow(RangeError);
    expect(() => compareReceivablesPoolTrigger({id: "ok", actual: "Infinity", threshold: "1", comparison: "maximum", consequence: "block"})).toThrow(RangeError);
  });
});
