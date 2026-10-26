import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {operatingProjectionPacketInputSchema, operatingProjectionPacketOutputSchema, operatingProjectionPacketVersion} from "./operating-projection-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function operatingProjectionPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(operatingProjectionPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(operatingProjectionPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareOperatingProjectionPacket", version: operatingProjectionPacketVersion},
    inputs: methodDataContractFromJsonSchema("operating-projection-packet-input", operatingProjectionPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("operating-projection-packet-output", operatingProjectionPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
