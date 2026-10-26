import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {quarterUpdatePacketInputSchema, quarterUpdatePacketOutputSchema, quarterUpdatePacketVersion} from "./quarter-update-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function quarterUpdatePacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(quarterUpdatePacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(quarterUpdatePacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareQuarterUpdatePacket", version: quarterUpdatePacketVersion},
    inputs: methodDataContractFromJsonSchema("quarter-update-packet-input", quarterUpdatePacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("quarter-update-packet-output", quarterUpdatePacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
