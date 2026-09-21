import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import * as interestCore from "@offroad/financial-core/contractual-interest";
import * as covenantCore from "@offroad/financial-core/contractual-covenants";
import * as interestCompatibility from "./executors/build-interest-and-indexation-schedule";
import * as covenantCompatibility from "./executors/reconcile-covenant-definitions";

const root = resolve(import.meta.dirname, "../../..");
describe("contractual mathematics ownership", () => {
  it("keeps old entrypoints as transparent compatibility exports without a second calculation", () => {
    for (const [file, target] of [["build-interest-and-indexation-schedule", "contractual-interest"],
      ["reconcile-covenant-definitions", "contractual-covenants"]]) {
      const source = readFileSync(resolve(root, `packages/credit-playbook/src/executors/${file}.ts`), "utf8");
      expect(source.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe(`export * from "@offroad/financial-core/${target}";`);
    }
    expect(interestCompatibility.buildInterestAndIndexationSchedule).toBe(interestCore.buildInterestAndIndexationSchedule);
    expect(interestCompatibility.buildInterestAndIndexationScheduleWithConventions).toBe(interestCore.buildInterestAndIndexationScheduleWithConventions);
    expect(covenantCompatibility.reconcileCovenantDefinitions).toBe(covenantCore.reconcileCovenantDefinitions);
  });
  it("keeps financial-core independent of playbook policy and runtime packages", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "packages/financial-core/package.json"), "utf8"));
    expect(Object.keys(packageJson.dependencies).filter(name => name.startsWith("@offroad/"))).toEqual([]);
    for (const file of ["contractual-interest", "contractual-covenants", "credit-math"])
      expect(readFileSync(resolve(root, `packages/financial-core/src/${file}.ts`), "utf8")).not.toMatch(/from ["']@offroad\//);
    expect(interestCore.interestScheduleInputSchema).toBe(interestCompatibility.interestScheduleInputSchema);
    expect(covenantCore.covenantReconciliationInputSchema).toBe(covenantCompatibility.covenantReconciliationInputSchema);
  });
});
