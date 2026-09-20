import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {matchesMethodValue} from "@offroad/credit-playbook";
import {capitalDecisionReviewFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalDecisionExecutorContracts} from "./capital-executor-contracts";
import {prepareCapitalDecisionDelivery} from "./capital-decision-delivery";

describe("capital executor build-owned contracts", () => {
  it("requires the generated artifact to equal the current executor validation schemas", () => {
    const bytes = readFileSync(new URL("../contracts/capital-decision-delivery.json", import.meta.url), "utf8");
    expect(bytes).toBe(JSON.stringify(capitalDecisionExecutorContracts(), null, 2) + "\n");
  });
  it("matches the real validated input and calculated output with complete typed contracts", () => {
    const c = capitalDecisionExecutorContracts(); const input = {review: capitalDecisionReviewFixture().input,
      material: {requested: false, audience: "authorized_work_participants"}};
    const result = prepareCapitalDecisionDelivery(input);
    expect(matchesMethodValue(c.inputs.value, input)).toBe(true);
    expect(matchesMethodValue(c.outputs.value, result)).toBe(true);
    expect(matchesMethodValue(c.outputs.value, {...result, alternatives: [{id: "opaque"}]})).toBe(false);
  });
});
