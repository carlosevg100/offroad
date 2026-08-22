import {describe, expect, it} from "vitest";

import {renumberByTable} from "./extract";

const candidate = (field_path: string, anchorId: string) => ({
  field_path, value_raw: "x", value_type: "text" as const, scale: 1, information_class: "management" as const,
  anchor: {kind: "row" as const, id: anchorId, page: 1}, quote: "x", confidence: 0.9,
});

describe("tuples from two tables of one document", () => {
  it("never share a number", () => {
    const out = renumberByTable([
      candidate("company.controllers.1.name", "s1.t1.r2"), candidate("company.controllers.2.name", "s1.t1.r3"),
      candidate("company.controllers.1.name", "s1.t2.r2"), candidate("company.controllers.1.ownership_pct", "s1.t2.r2.c2"),
      candidate("transaction.requested_amount", "s1.b1"),
    ] as never);
    expect(out.map((c) => c.field_path)).toEqual([
      "company.controllers.1.name", "company.controllers.2.name", "company.controllers.3.name", "company.controllers.3.ownership_pct", "transaction.requested_amount",
    ]);
  });

  it("treats every cell of one spreadsheet row as the same tuple", () => {
    const out = renumberByTable([
      candidate("debt.instruments.1.lender", "sDívida!A5"), candidate("debt.instruments.1.balance", "sDívida!C5"),
      candidate("debt.instruments.2.lender", "sDívida!A6"), candidate("debt.instruments.2.balance", "sDívida!C6"),
    ] as never);
    expect(out.map((c) => c.field_path)).toEqual([
      "debt.instruments.1.lender", "debt.instruments.1.balance", "debt.instruments.2.lender", "debt.instruments.2.balance",
    ]);
  });
});
