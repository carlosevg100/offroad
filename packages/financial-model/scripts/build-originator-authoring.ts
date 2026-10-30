import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {originatorKitExecutorContracts, originatorCreditExecutorContracts, originatorRegistryExecutorContracts} from "../src/originator-case-contracts";

const root = resolve(import.meta.dirname, "../../.."), version = "2026.10.30-v1";
const budget = {maxModelCalls: 0, maxDurationMs: 31000, maxCostMinorUnits: 0, currency: "BRL"};
for (const [kind, build] of [["kit", originatorKitExecutorContracts], ["credit", originatorCreditExecutorContracts], ["registry", originatorRegistryExecutorContracts]] as const) {
  const id = "prepare-originator-" + kind, relative = `packages/credit-playbook/knowledge/procedures/receivables/${id}.md`, path = resolve(root, relative);
  let source = readFileSync(path, "utf8").split("\n# Composição tipada")[0]!;
  if (!source.includes(`id: ${id}\n`) || !source.includes("maturity: candidate\n")) throw new Error("originator_authoring_refuses_non_candidate");
  // Exact output contract: required nulls stay required; no optional field hides the absence.
  source = source.replace(/- (credit|registry|kit) \(object, optional\):/g, (_all, field: string) => `- ${field} (${field === kind ? "object|null" : "null"}, required):`);
  if (kind === "registry") source = source.replace(/(- kit \(null, required\):[^\n]+)\n(- registry \(object\|null, required\):[^\n]+)/, "$2\n$1");
  const contract = build();
  writeFileSync(resolve(root, `packages/financial-model/contracts/originator-${kind}-packet.json`), JSON.stringify(contract, null, 2) + "\n");
  const shared = {version, dependencies: [], tools: [], effect: "none", budget, rights: {inheritSourceRestrictions: true, purposes: ["case.analysis"], sourceClasses: ["provided.documents", "project.context", "house.method"]}, competencies: ["receivables.originator"], invariants: ["law", "contractual_definition", "traceability", "verification", "access_barriers", "deterministic_financial_math"], overridePoints: [], evidence: [relative]};
  const composition = {schemaVersion: "procedure-composition.v1", authoringStatus: "ready_for_review", pendingContent: [], budget, allowedTools: [], maximumEffect: "none", components: [
    {...shared, id: `originator-${kind}.packet`, kind: "rule", title: "Preparar a revisão sobre a base confirmada", inputs: contract.inputs, outputs: contract.outputs, authority: "house", statement: "Executar somente registros confirmados no escopo autorizado, conservar fontes, unidades e pendências e manter a decisão com o responsável.", executor: contract.executor},
  ]};
  writeFileSync(path, source.trimEnd() + "\n\n# Composição tipada\n```offroad-procedure\n" + JSON.stringify(composition, null, 2) + "\n```\n");
}
