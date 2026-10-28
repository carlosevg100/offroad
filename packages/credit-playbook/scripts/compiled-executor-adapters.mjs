/** Reviewed adapters for compiled, single-executor, deterministic methods. Each entry fixes
 * the method, the executor identity and the exact entry bundled into the released artifact.
 * Adding an entry is a reviewed code change; a manifest alone never selects an adapter. */
export const compiledExecutorAdapters = Object.freeze([
  Object.freeze({
    methodId: 'prepare-capital-structure-decision',
    executorKey: '@offroad/financial-model#prepareCapitalProcedurePacketV2', executorVersion: '2026.09.21-v2',
    exports: Object.freeze({calculate: 'prepareCapitalProcedurePacketV2', input: 'capitalProcedurePacketV2InputSchema', output: 'capitalProcedurePacketV2OutputSchema'}),
    entry: 'export {prepareCapitalProcedurePacketV2, capitalProcedurePacketV2InputSchema, capitalProcedurePacketV2OutputSchema} from "../../packages/financial-model/src/capital-procedure-packet-v2.ts";',
  }),
  Object.freeze({
    methodId: 'analyze-investment-project',
    executorKey: '@offroad/financial-model#prepareInvestmentDecisionPacket', executorVersion: '2026.10.09-v1',
    exports: Object.freeze({calculate: 'prepareInvestmentDecisionPacket', input: 'investmentDecisionPacketInputSchema', output: 'investmentDecisionPacketOutputSchema'}),
    entry: 'export {prepareInvestmentDecisionPacket, investmentDecisionPacketInputSchema, investmentDecisionPacketOutputSchema} from "../../packages/financial-model/src/investment-decision-packet.ts";',
  }),
  Object.freeze({
    methodId: 'compare-financing-proposals',
    executorKey: '@offroad/financial-model#prepareFinancingComparisonPacket', executorVersion: '2026.10.19-v1',
    exports: Object.freeze({calculate: 'prepareFinancingComparisonPacket', input: 'financingComparisonPacketInputSchema', output: 'financingComparisonPacketOutputSchema'}),
    entry: 'export {prepareFinancingComparisonPacket, financingComparisonPacketInputSchema, financingComparisonPacketOutputSchema} from "../../packages/financial-model/src/financing-comparison-packet.ts";',
  }),
  Object.freeze({
    methodId: 'analyze-relative-debt-cost',
    executorKey: '@offroad/financial-model#prepareRelativeDebtCostPacket', executorVersion: '2026.10.19-v1',
    exports: Object.freeze({calculate: 'prepareRelativeDebtCostPacket', input: 'relativeDebtCostPacketInputSchema', output: 'relativeDebtCostPacketOutputSchema'}),
    entry: 'export {prepareRelativeDebtCostPacket, relativeDebtCostPacketInputSchema, relativeDebtCostPacketOutputSchema} from "../../packages/financial-model/src/relative-debt-cost-packet.ts";',
  }),
  Object.freeze({
    methodId: 'assess-debt-capacity',
    executorKey: '@offroad/financial-model#prepareDebtCapacityPacket', executorVersion: '2026.10.19-v1',
    exports: Object.freeze({calculate: 'prepareDebtCapacityPacket', input: 'debtCapacityPacketInputSchema', output: 'debtCapacityPacketOutputSchema'}),
    entry: 'export {prepareDebtCapacityPacket, debtCapacityPacketInputSchema, debtCapacityPacketOutputSchema} from "../../packages/financial-model/src/debt-capacity-packet.ts";',
  }),
  Object.freeze({
    methodId: 'build-company-debt-table',
    executorKey: '@offroad/financial-model#prepareDebtTablePacket', executorVersion: '2026.10.23-v1',
    exports: Object.freeze({calculate: 'prepareDebtTablePacket', input: 'debtTablePacketInputSchema', output: 'debtTablePacketOutputSchema'}),
    entry: 'export {prepareDebtTablePacket, debtTablePacketInputSchema, debtTablePacketOutputSchema} from "../../packages/financial-model/src/debt-table-packet.ts";',
  }),
  Object.freeze({
    methodId: 'measure-covenant-headroom',
    executorKey: '@offroad/financial-model#prepareCovenantHeadroomPacket', executorVersion: '2026.10.23-v1',
    exports: Object.freeze({calculate: 'prepareCovenantHeadroomPacket', input: 'covenantHeadroomPacketInputSchema', output: 'covenantHeadroomPacketOutputSchema'}),
    entry: 'export {prepareCovenantHeadroomPacket, covenantHeadroomPacketInputSchema, covenantHeadroomPacketOutputSchema} from "../../packages/financial-model/src/covenant-headroom-packet.ts";',
  }),
  Object.freeze({
    methodId: 'project-weekly-cash',
    executorKey: '@offroad/financial-model#prepareWeeklyCashPacket', executorVersion: '2026.10.23-v1',
    exports: Object.freeze({calculate: 'prepareWeeklyCashPacket', input: 'weeklyCashPacketInputSchema', output: 'weeklyCashPacketOutputSchema'}),
    entry: 'export {prepareWeeklyCashPacket, weeklyCashPacketInputSchema, weeklyCashPacketOutputSchema} from "../../packages/financial-model/src/weekly-cash-packet.ts";',
  }),
  Object.freeze({
    methodId: 'update-after-quarter-close',
    executorKey: '@offroad/financial-model#prepareQuarterUpdatePacket', executorVersion: '2026.10.26-v1',
    exports: Object.freeze({calculate: 'prepareQuarterUpdatePacket', input: 'quarterUpdatePacketInputSchema', output: 'quarterUpdatePacketOutputSchema'}),
    entry: 'export {prepareQuarterUpdatePacket, quarterUpdatePacketInputSchema, quarterUpdatePacketOutputSchema} from "../../packages/financial-model/src/quarter-update-packet.ts";',
  }),
  Object.freeze({
    methodId: 'monetize-receivables-for-working-capital',
    executorKey: '@offroad/financial-model#prepareReceivablesFundingPacket', executorVersion: '2026.10.26-v1',
    exports: Object.freeze({calculate: 'prepareReceivablesFundingPacket', input: 'receivablesFundingPacketInputSchema', output: 'receivablesFundingPacketOutputSchema'}),
    entry: 'export {prepareReceivablesFundingPacket, receivablesFundingPacketInputSchema, receivablesFundingPacketOutputSchema} from "../../packages/financial-model/src/receivables-funding-packet.ts";',
  }),
  Object.freeze({
    methodId: 'challenge-financial-projection',
    executorKey: '@offroad/financial-model#prepareProjectionChallengePacket', executorVersion: '2026.10.26-v1',
    exports: Object.freeze({calculate: 'prepareProjectionChallengePacket', input: 'projectionChallengePacketInputSchema', output: 'projectionChallengePacketOutputSchema'}),
    entry: 'export {prepareProjectionChallengePacket, projectionChallengePacketInputSchema, projectionChallengePacketOutputSchema} from "../../packages/financial-model/src/projection-challenge-packet.ts";',
  }),
  Object.freeze({
    methodId: 'build-operating-projection',
    executorKey: '@offroad/financial-model#prepareOperatingProjectionPacket', executorVersion: '2026.10.26-v1',
    exports: Object.freeze({calculate: 'prepareOperatingProjectionPacket', input: 'operatingProjectionPacketInputSchema', output: 'operatingProjectionPacketOutputSchema'}),
    entry: 'export {prepareOperatingProjectionPacket, operatingProjectionPacketInputSchema, operatingProjectionPacketOutputSchema} from "../../packages/financial-model/src/operating-projection-packet.ts";',
  }),
  Object.freeze({
    methodId: 'organize-document-folder',
    executorKey: '@offroad/financial-model#prepareDocumentFolderInventoryPacket', executorVersion: '2026.10.27-v1',
    exports: Object.freeze({calculate: 'prepareDocumentFolderInventoryPacket', input: 'documentFolderInventoryPacketInputSchema', output: 'documentFolderInventoryPacketOutputSchema'}),
    entry: 'export {prepareDocumentFolderInventoryPacket, documentFolderInventoryPacketInputSchema, documentFolderInventoryPacketOutputSchema} from "../../packages/financial-model/src/document-folder-inventory-packet.ts";',
  }),
  Object.freeze({
    methodId: 'evaluate-received-proposal',
    executorKey: '@offroad/financial-model#prepareReceivedProposalPacket', executorVersion: '2026.10.27-v1',
    exports: Object.freeze({calculate: 'prepareReceivedProposalPacket', input: 'receivedProposalPacketInputSchema', output: 'receivedProposalPacketOutputSchema'}),
    entry: 'export {prepareReceivedProposalPacket, receivedProposalPacketInputSchema, receivedProposalPacketOutputSchema} from "../../packages/financial-model/src/evaluate-received-proposal-packet.ts";',
  }),
  Object.freeze({
    methodId: 'evaluate-financing-paths',
    executorKey: '@offroad/financial-model#prepareCapitalPathsPacket', executorVersion: '2026.10.27-v1',
    exports: Object.freeze({calculate: 'prepareCapitalPathsPacket', input: 'capitalPathsPacketInputSchema', output: 'capitalPathsPacketOutputSchema'}),
    entry: 'export {prepareCapitalPathsPacket, capitalPathsPacketInputSchema, capitalPathsPacketOutputSchema} from "../../packages/financial-model/src/capital-structure-paths-packet.ts";',
  }),
  Object.freeze({
    methodId: 'prepare-board-capital-discussion',
    executorKey: '@offroad/financial-model#prepareBoardCapitalDiscussionPacket', executorVersion: '2026.10.27-v1',
    exports: Object.freeze({calculate: 'prepareBoardCapitalDiscussionPacket', input: 'boardCapitalDiscussionPacketInputSchema', output: 'boardCapitalDiscussionPacketOutputSchema'}),
    entry: 'export {prepareBoardCapitalDiscussionPacket, boardCapitalDiscussionPacketInputSchema, boardCapitalDiscussionPacketOutputSchema} from "../../packages/financial-model/src/board-capital-discussion-packet.ts";',
  }),
]);

/** The adapter for a derived profile, or a refusal. Method id, executor key and version must all match. */
export function compiledExecutorAdapter(profile) {
  const adapter = compiledExecutorAdapters.find(a => a.methodId === profile.method.methodId
    && a.executorKey === profile.method.executor.key && a.executorVersion === profile.method.executor.version);
  if (!adapter) throw Error('compiled_executor_adapter_unavailable');
  return adapter;
}
