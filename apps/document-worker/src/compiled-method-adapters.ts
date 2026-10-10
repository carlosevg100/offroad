/** Mirror of packages/credit-playbook/scripts/compiled-executor-adapters.mjs for the worker
 * runtime; a test keeps both identical. Selecting an adapter grants nothing: SQL still resolves
 * the release, the profile and the producer before any execution is claimed. */
export const compiledMethodAdapters = [
  {methodId: "prepare-capital-structure-decision", executorKey: "@offroad/financial-model#prepareCapitalProcedurePacketV2", executorVersion: "2026.09.21-v2",
    exports: {calculate: "prepareCapitalProcedurePacketV2", input: "capitalProcedurePacketV2InputSchema", output: "capitalProcedurePacketV2OutputSchema"}},
  {methodId: "analyze-investment-project", executorKey: "@offroad/financial-model#prepareInvestmentDecisionPacket", executorVersion: "2026.10.09-v1",
    exports: {calculate: "prepareInvestmentDecisionPacket", input: "investmentDecisionPacketInputSchema", output: "investmentDecisionPacketOutputSchema"}},
] as const;
export type CompiledMethodAdapter = (typeof compiledMethodAdapters)[number];
export const compiledMethodIds: readonly string[] = compiledMethodAdapters.map(a => a.methodId);
export function compiledMethodAdapter(methodId: string): CompiledMethodAdapter {
  const adapter = compiledMethodAdapters.find(a => a.methodId === methodId);
  if (!adapter) throw new Error("published_method_executor_unavailable");
  return adapter;
}
