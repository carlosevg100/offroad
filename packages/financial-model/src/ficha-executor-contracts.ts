import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {adoptedFinancingProposalInputSchema, calculateAdoptedFinancingProposal} from "./adopted-financing-proposal";
import {adoptedRelativeDebtCostInputSchema, calculateAdoptedRelativeDebtCost} from "./adopted-relative-debt-cost";
import {adoptedDebtCapacityInputSchema, calculateAdoptedDebtCapacity} from "./adopted-debt-capacity";
import {adoptedInvestmentAnalysisInputSchema, calculateAdoptedInvestmentAnalysis} from "./adopted-investment-analysis";
import {adoptedFinancingComparisonInputSchema, calculateAdoptedFinancingComparison} from "./adopted-financing-comparison";
import {adoptedDebtTableInputSchema, calculateAdoptedDebtTable} from "./adopted-debt-table";
import {adoptedCovenantHeadroomInputSchema, calculateAdoptedCovenantHeadroom} from "./adopted-covenant-headroom";
import {adoptedWeeklyCashInputSchema, calculateAdoptedWeeklyCash} from "./adopted-weekly-cash";
import {quarterUpdateAnalysesSchema, calculateAdoptedQuarterUpdate} from "./adopted-quarter-update";
import {adoptedQuarterUpdateOutputSchema} from "./quarter-update-results";
import {adoptedReceivablesFundingInputSchema, calculateAdoptedReceivablesFunding} from "./adopted-receivables-funding";
import {adoptedReceivablesFundingOutputSchema} from "./receivables-funding-results";
import {adoptedProjectionChallengeInputSchema, calculateAdoptedProjectionChallenge} from "./adopted-projection-challenge";
import {adoptedProjectionChallengeOutputSchema} from "./projection-challenge-results";
import {adoptedDriverProjectionInputSchema, calculateAdoptedDriverProjection} from "./adopted-operating-projection-drivers";
import {adoptedDriverProjectionOutputSchema} from "./operating-projection-results";
import {adoptedFinancingProposalOutputSchema, adoptedRelativeDebtCostOutputSchema,
  adoptedDebtCapacityOutputSchema, adoptedInvestmentAnalysisOutputSchema, adoptedFinancingComparisonOutputSchema, adoptedDebtTableOutputSchema, adoptedCovenantHeadroomOutputSchema, adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";

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
export function calculateFinancingComparisonEvidence(raw: unknown) {
  const result = calculateAdoptedFinancingComparison(raw); adoptedFinancingComparisonOutputSchema.parse(result); return result;
}
export function calculateDebtTableEvidence(raw: unknown) {
  const result = calculateAdoptedDebtTable(raw); adoptedDebtTableOutputSchema.parse(result); return result;
}
export function calculateCovenantHeadroomEvidence(raw: unknown) {
  const result = calculateAdoptedCovenantHeadroom(raw); adoptedCovenantHeadroomOutputSchema.parse(result); return result;
}
export function calculateWeeklyCashEvidence(raw: unknown) {
  const result = calculateAdoptedWeeklyCash(raw); adoptedWeeklyCashOutputSchema.parse(result); return result;
}
export function calculateOperatingProjectionEvidence(raw: unknown) {
  const result = calculateAdoptedDriverProjection(raw); adoptedDriverProjectionOutputSchema.parse(result); return result;
}
export function calculateProjectionChallengeEvidence(raw: unknown) {
  const result = calculateAdoptedProjectionChallenge(raw); adoptedProjectionChallengeOutputSchema.parse(result); return result;
}
export function calculateReceivablesFundingEvidence(raw: unknown) {
  const result = calculateAdoptedReceivablesFunding(raw); adoptedReceivablesFundingOutputSchema.parse(result); return result;
}
export function calculateQuarterUpdateEvidence(raw: unknown) {
  const result = calculateAdoptedQuarterUpdate(raw); adoptedQuarterUpdateOutputSchema.parse(result); return result;
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
    {name: "financing-comparison-evidence", ...contracts("financing-comparison-evidence", "calculateFinancingComparisonEvidence", adoptedFinancingComparisonInputSchema, adoptedFinancingComparisonOutputSchema)},
    {name: "debt-table-evidence", ...contracts("debt-table-evidence", "calculateDebtTableEvidence", adoptedDebtTableInputSchema, adoptedDebtTableOutputSchema)},
    {name: "covenant-headroom-evidence", ...contracts("covenant-headroom-evidence", "calculateCovenantHeadroomEvidence", adoptedCovenantHeadroomInputSchema, adoptedCovenantHeadroomOutputSchema)},
    {name: "weekly-cash-evidence", ...contracts("weekly-cash-evidence", "calculateWeeklyCashEvidence", adoptedWeeklyCashInputSchema, adoptedWeeklyCashOutputSchema)},
    {name: "operating-projection-evidence", ...contracts("operating-projection-evidence", "calculateOperatingProjectionEvidence", adoptedDriverProjectionInputSchema, adoptedDriverProjectionOutputSchema)},
    {name: "projection-challenge-evidence", ...contracts("projection-challenge-evidence", "calculateProjectionChallengeEvidence", adoptedProjectionChallengeInputSchema, adoptedProjectionChallengeOutputSchema)},
    {name: "receivables-funding-evidence", ...contracts("receivables-funding-evidence", "calculateReceivablesFundingEvidence", adoptedReceivablesFundingInputSchema, adoptedReceivablesFundingOutputSchema)},
    {name: "quarter-update-evidence", ...contracts("quarter-update-evidence", "calculateQuarterUpdateEvidence", quarterUpdateAnalysesSchema, adoptedQuarterUpdateOutputSchema)},
  ];
}
