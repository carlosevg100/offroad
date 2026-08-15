import {describe, expect, it} from "vitest";

import {scenarioTermsSchema, taskEnvelopeSchema} from "./index";

describe("domain contracts", () => {
  it("rejects a task without a tenant boundary", () => {
    expect(() => taskEnvelopeSchema.parse({taskId: crypto.randomUUID()})).toThrow();
  });

  it("rejects floating or malformed economic inputs", () => {
    expect(() => scenarioTermsSchema.parse({amount: 10.5})).toThrow();
  });
});
