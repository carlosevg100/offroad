import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {relativeDebtCostPacketInputSchema, relativeDebtCostPacketOutputSchema, relativeDebtCostPacketVersion} from "./relative-debt-cost-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function relativeDebtCostPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(relativeDebtCostPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(relativeDebtCostPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareRelativeDebtCostPacket", version: relativeDebtCostPacketVersion},
    inputs: methodDataContractFromJsonSchema("relative-debt-cost-packet-input", relativeDebtCostPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("relative-debt-cost-packet-output", relativeDebtCostPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
