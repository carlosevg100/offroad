import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {financingComparisonPacketInputSchema, financingComparisonPacketOutputSchema, financingComparisonPacketVersion} from "./financing-comparison-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function financingComparisonPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(financingComparisonPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(financingComparisonPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareFinancingComparisonPacket", version: financingComparisonPacketVersion},
    inputs: methodDataContractFromJsonSchema("financing-comparison-packet-input", financingComparisonPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("financing-comparison-packet-output", financingComparisonPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
