import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {receivablesFundingPacketInputSchema, receivablesFundingPacketOutputSchema, receivablesFundingPacketVersion} from "./receivables-funding-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function receivablesFundingPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(receivablesFundingPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(receivablesFundingPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareReceivablesFundingPacket", version: receivablesFundingPacketVersion},
    inputs: methodDataContractFromJsonSchema("receivables-funding-packet-input", receivablesFundingPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("receivables-funding-packet-output", receivablesFundingPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
