import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {z} from "zod";

export const capitalPlanningPolicyPath = "packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md";
const policySchema = z.strictObject({schemaVersion: z.literal("capital-planning-compatibility.v1"),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/), scope: z.literal("existing_public_directional_adapter"),
  activatesCapitalDecisionProcedure: z.literal(false), system: z.string().min(100).max(16000),
  families: z.array(z.strictObject({id: z.string().regex(/^[a-z][a-z_]+$/), label: z.string().min(1).max(200),
    methodBoundary: z.string().min(1).max(2000)})).min(1).max(32),
}).refine(p => new Set(p.families.map(f => f.id)).size === p.families.length, "Duplicate family identity");
export function compileCapitalPlanningPolicy(markdown: string) {
  const blocks = [...markdown.matchAll(/^```capital-planning-compatibility\n([\s\S]*?)\n```/gm)];
  if (blocks.length !== 1) throw new Error("capital_compatibility_single_canonical_block_required");
  const policy = policySchema.parse(JSON.parse(blocks[0]![1]!));
  return {...policy, sourcePath: capitalPlanningPolicyPath,
    policyHash: createHash("sha256").update(JSON.stringify(policy)).digest("hex")};
}
export function renderCapitalPlanningPolicy(root: string) {
  const policy = compileCapitalPlanningPolicy(readFileSync(join(root, capitalPlanningPolicyPath), "utf8"));
  return `// Generated from the canonical procedure. Edit its compatibility block, then regenerate.\n// This preserves the existing adapter; it does not publish or activate the candidate method.\nexport const capitalPlanningCompatibilityPolicy = ${JSON.stringify(policy, null, 2)} as const;\n`;
}
