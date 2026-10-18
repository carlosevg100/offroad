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
]);

/** The adapter for a derived profile, or a refusal. Method id, executor key and version must all match. */
export function compiledExecutorAdapter(profile) {
  const adapter = compiledExecutorAdapters.find(a => a.methodId === profile.method.methodId
    && a.executorKey === profile.method.executor.key && a.executorVersion === profile.method.executor.version);
  if (!adapter) throw Error('compiled_executor_adapter_unavailable');
  return adapter;
}
