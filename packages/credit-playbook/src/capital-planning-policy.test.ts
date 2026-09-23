import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {capitalPlanningPolicyPath, compileCapitalPlanningPolicy, renderCapitalPlanningPolicy} from "./build-capital-planning-policy";
import {capitalPlanningCompatibilityPolicy} from "./capital-planning-policy.generated";
const root = resolve(import.meta.dirname, "../../..");
const markdown = () => readFileSync(resolve(root, capitalPlanningPolicyPath), "utf8");
describe("canonical capital planning compatibility policy", () => {
  it("reproduces the generated adapter from the single residual-batch block", () => {
    expect(renderCapitalPlanningPolicy(root)).toBe(readFileSync(resolve(root, "packages/credit-playbook/src/capital-planning-policy.generated.ts"), "utf8"));
    expect(compileCapitalPlanningPolicy(markdown())).toEqual(capitalPlanningCompatibilityPolicy);
  });
  it("keeps the residual-batch policy apart from publication of the capital decision procedure", () => {
    expect(capitalPlanningCompatibilityPolicy.activatesCapitalDecisionProcedure).toBe(false);
    expect(capitalPlanningCompatibilityPolicy.scope).toBe("existing_public_directional_adapter");
    expect(capitalPlanningCompatibilityPolicy.families).toHaveLength(11);
    expect(capitalPlanningCompatibilityPolicy.policyHash).toBe("31ca5d156de399e5b8c3db53c50bd67003d05709711894cda6fb36c7f2265516");
  });
  it("rejects ambiguous missing and malformed canonical compatibility blocks", () => {
    expect(() => compileCapitalPlanningPolicy("no policy")).toThrow();
    expect(() => compileCapitalPlanningPolicy(markdown() + markdown())).toThrow();
    expect(() => compileCapitalPlanningPolicy("```capital-planning-compatibility\n{}\n```")).toThrow();
  });
  it("refuses activation flags extra authority and duplicate family identities", () => {
    const raw = JSON.parse(markdown().match(/```capital-planning-compatibility\n([\s\S]*?)\n```/)![1]!);
    const block = (p: unknown) => "```capital-planning-compatibility\n" + JSON.stringify(p) + "\n```";
    expect(() => compileCapitalPlanningPolicy(block({...raw, activatesCapitalDecisionProcedure: true}))).toThrow();
    expect(() => compileCapitalPlanningPolicy(block({...raw, grantsPublication: true}))).toThrow();
    expect(() => compileCapitalPlanningPolicy(block({...raw, families: [...raw.families, raw.families[0]]}))).toThrow();
  });
});
