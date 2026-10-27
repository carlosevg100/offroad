import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {capitalPathsPacketInputSchema, capitalPathsPacketOutputSchema, capitalPathsPacketVersion} from "./capital-structure-paths-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function capitalPathsPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(capitalPathsPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(capitalPathsPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareCapitalPathsPacket", version: capitalPathsPacketVersion},
    inputs: methodDataContractFromJsonSchema("capital-structure-paths-packet-input", capitalPathsPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("capital-structure-paths-packet-output", capitalPathsPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
