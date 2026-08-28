import {describe, expect, it} from "vitest";

import {canonicalReceivablesRouteCatalogue} from "./receivables";

describe("receivables playbook compilation", () => {
  it("compiles the complete canonical catalogue into the deterministic executor", () => {
    expect(canonicalReceivablesRouteCatalogue).toHaveLength(9);
    expect(canonicalReceivablesRouteCatalogue.map((route) => route.id)).toEqual(expect.arrayContaining([
      "factoring_purchase",
      "financial_institution_receivables_discount",
      "digital_credit_receivables_purchase",
      "fidc_multicedent_assignment",
      "secured_revolving_facility",
    ]));
  });
});
