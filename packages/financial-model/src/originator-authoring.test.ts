import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {compileMethodDocument, methodMayRunInStaging} from "@offroad/credit-playbook";
import {originatorKitExecutorContracts, originatorCreditExecutorContracts, originatorRegistryExecutorContracts} from "./originator-case-contracts";
const root = resolve(import.meta.dirname, "../../..");
describe("originator professional candidates and exact executor contracts", () => {
  for (const [kind, build] of [["kit", originatorKitExecutorContracts], ["credit", originatorCreditExecutorContracts], ["registry", originatorRegistryExecutorContracts]] as const) {
    it(`${kind}: the source, generated contract and executable schemas agree without granting release`, () => {
      const path = `receivables/prepare-originator-${kind}.md`, source = readFileSync(resolve(root, "packages/credit-playbook/knowledge/procedures", path), "utf8"), m = compileMethodDocument(source, path), c = build();
      expect(JSON.parse(readFileSync(resolve(root, `packages/financial-model/contracts/originator-${kind}-packet.json`), "utf8"))).toEqual(c);
      expect(m.procedure.output.fields.map(f => f.id)).toEqual(Object.keys(c.outputs.value.type === "object" ? c.outputs.value.fields : {}));
      expect(m.procedure.output.fields.every(f => f.required)).toBe(true);
      expect(m.procedure.maturity).toBe("candidate"); expect(methodMayRunInStaging(m)).toBe(false);
      expect(m.frontmatter.capability_availability).toBe("specified"); expect(m.frontmatter.capability_exposure).toBe("none");
      expect(m.frontmatter.approved_by).toBeUndefined(); expect(m.frontmatter.approved_at).toBeUndefined(); expect(m.frontmatter.task_specs).toEqual([]);
      expect(m.composition?.components.find(c => c.id === `originator-${kind}.packet`)).toMatchObject({executor: c.executor, inputs: c.inputs, outputs: c.outputs});
      expect(() => compileMethodDocument(source.replace("maturity: candidate", "maturity: production"), path)).toThrow(/approval/);
    });
  }
});
