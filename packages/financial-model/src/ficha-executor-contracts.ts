import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {adoptedFinancingProposalInputSchema, calculateAdoptedFinancingProposal} from "./adopted-financing-proposal";
import {adoptedRelativeDebtCostInputSchema, calculateAdoptedRelativeDebtCost} from "./adopted-relative-debt-cost";
import {adoptedDebtCapacityInputSchema, calculateAdoptedDebtCapacity} from "./adopted-debt-capacity";
import {adoptedInvestmentAnalysisInputSchema, calculateAdoptedInvestmentAnalysis} from "./adopted-investment-analysis";
import {adoptedFinancingProposalOutputSchema, adoptedRelativeDebtCostOutputSchema,
  adoptedDebtCapacityOutputSchema, adoptedInvestmentAnalysisOutputSchema} from "./ficha-calculation-results";

export const fichaCalculationExecutorVersion = "2026.10.07-v1";
/** Build-owned entry points validate the complete result, including operands, trace,
 * contextual bindings and exclusions. No narrative, provider call or permission here. */
export function calculateFinancingProposalEvidence(raw: unknown) {
  const result = calculateAdoptedFinancingProposal(raw); adoptedFinancingProposalOutputSchema.parse(result); return result;
}
export function calculateRelativeDebtCostEvidence(raw: unknown) {
  const result = calculateAdoptedRelativeDebtCost(raw); adoptedRelativeDebtCostOutputSchema.parse(result); return result;
}
export function calculateDebtCapacityEvidence(raw: unknown) {
  const result = calculateAdoptedDebtCapacity(raw); adoptedDebtCapacityOutputSchema.parse(result); return result;
}
export function calculateInvestmentAnalysisEvidence(raw: unknown) {
  const result = calculateAdoptedInvestmentAnalysis(raw); adoptedInvestmentAnalysisOutputSchema.parse(result); return result;
}

function contracts(id: string, exportName: string, input: z.ZodType, output: z.ZodType) {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(input, {...options, io: "input"}), outputSchema = z.toJSONSchema(output, options);
  return {schemaVersion: "method-executor-contracts.v1", executor: {module: "@offroad/financial-model", exportName, version: fichaCalculationExecutorVersion},
    inputs: methodDataContractFromJsonSchema(`${id}-input`, fichaCalculationExecutorVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema(`${id}-output`, fichaCalculationExecutorVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
export function fichaCalculationExecutorContracts() {
  return [
    {name: "financing-proposal-evidence", ...contracts("financing-proposal-evidence", "calculateFinancingProposalEvidence", adoptedFinancingProposalInputSchema, adoptedFinancingProposalOutputSchema)},
    {name: "relative-debt-cost-evidence", ...contracts("relative-debt-cost-evidence", "calculateRelativeDebtCostEvidence", adoptedRelativeDebtCostInputSchema, adoptedRelativeDebtCostOutputSchema)},
    {name: "debt-capacity-evidence", ...contracts("debt-capacity-evidence", "calculateDebtCapacityEvidence", adoptedDebtCapacityInputSchema, adoptedDebtCapacityOutputSchema)},
    {name: "investment-analysis-evidence", ...contracts("investment-analysis-evidence", "calculateInvestmentAnalysisEvidence", adoptedInvestmentAnalysisInputSchema, adoptedInvestmentAnalysisOutputSchema)},
  ];
}
