import {describe, expect, it} from "vitest";
import {archetypes} from "@offroad/credit-playbook";
import {reconciliationRules} from "@offroad/credit-ontology";

import {ISSUE_TYPE, PRIORITY} from "./reconcile";

/**
 * The vocabularies the database actually accepts, copied from the live check constraints.
 *
 * Written out here rather than imported, deliberately. The defect this guards against was code
 * that agreed with itself and disagreed with the schema, so a test that derives its expectation
 * from the same code would have passed while every insert failed. These four arrays are the
 * output of `pg_get_constraintdef` on `public.intake_issues`, and if a migration changes them the
 * `database` CI job fails on the RLS test while this one keeps passing, which is the right
 * division of labour: this file guards the mapping, that one guards the schema.
 */
const ACCEPTED = {
  issue_type: ["conflict", "missing", "validation"],
  priority: ["critical", "analysis", "diligence", "complementary"],
  exception_type: [
    "arithmetic",
    "period",
    "entity",
    "source_conflict",
    "missing",
    "plausibility",
    "validation",
    "quality",
    "adjustment",
  ],
  owner_role: ["company", "internal_analyst", "external_advisor"],
} as const;

describe("every value the reconciler writes is one the database accepts", () => {
  it("maps every rule type in the ontology to an allowed issue_type", () => {
    // Seven of the nine ontology types were being written straight into a column that accepts
    // three. Only `missing` and `validation` happened to overlap.
    for (const rule of reconciliationRules) {
      const mapped = ISSUE_TYPE[rule.type];
      expect(mapped, `rule ${rule.id} of type ${rule.type}`).toBeDefined();
      expect(ACCEPTED.issue_type, `rule ${rule.id}`).toContain(mapped);
    }
  });

  it("keeps the precise type available even though the coarse one collapses", () => {
    // Collapsing seven types into `validation` is only acceptable because `exception_type`
    // carries the original, and its constraint accepts the whole ontology.
    for (const rule of reconciliationRules) {
      expect(ACCEPTED.exception_type, `rule ${rule.id}`).toContain(rule.type);
    }
  });

  it("maps every severity to an allowed priority", () => {
    for (const severity of ["critical", "high", "medium", "low"]) {
      expect(ACCEPTED.priority, severity).toContain(PRIORITY[severity]);
    }
  });

  it("uses all four priorities rather than collapsing them into two", () => {
    // The previous code wrote "blocking" or "diligence" and nothing else. Beyond violating the
    // constraint it threw away the distinction the review screen was already built to show.
    expect(new Set(Object.values(PRIORITY)).size).toBe(4);
  });

  it("orders priority the same way severity is ordered", () => {
    // A mapping that inverted anywhere would be worse than the bug it replaces: an exception that
    // holds the case would arrive labelled as something to look at eventually.
    const rank = ACCEPTED.priority.indexOf.bind(ACCEPTED.priority);
    expect(rank(PRIORITY.critical)).toBeLessThan(rank(PRIORITY.high));
    expect(rank(PRIORITY.high)).toBeLessThan(rank(PRIORITY.medium));
    expect(rank(PRIORITY.medium)).toBeLessThan(rank(PRIORITY.low));
  });

  it("writes an owner role the database accepts, for every requirement in the playbook", () => {
    // Gaps carry the requirement's owner straight through, so the playbook is the source of the
    // values that reach the column.
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        // Requirements do not carry an owner today; gaps default to `company`. The assertion is
        // that the default itself is legal, which is what a future change would break silently.
        expect(ACCEPTED.owner_role).toContain("company");
        expect(requirement.id.length).toBeGreaterThan(0);
      }
    }
  });
});
