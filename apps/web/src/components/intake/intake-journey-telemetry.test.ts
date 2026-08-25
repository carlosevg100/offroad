import {describe, expect, it} from "vitest";

import {evidenceBand, requestBand} from "./intake-journey-telemetry";

describe("intake journey telemetry bands", () => {
  it("groups document volume without emitting an exact count", () => {
    expect([0, 1, 2, 5, 6, 200].map(evidenceBand)).toEqual([
      "none",
      "single",
      "two_to_five",
      "two_to_five",
      "six_plus",
      "six_plus",
    ]);
  });

  it("groups the governed active batch into its public cardinality bands", () => {
    expect([0, 1, 2, 3, 5].map(requestBand)).toEqual([
      "none",
      "one_to_two",
      "one_to_two",
      "three_to_five",
      "three_to_five",
    ]);
  });
});
