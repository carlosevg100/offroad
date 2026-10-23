import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {covenantHeadroomPacketInputSchema, covenantHeadroomPacketOutputSchema, covenantHeadroomPacketVersion} from "./covenant-headroom-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function covenantHeadroomPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(covenantHeadroomPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(covenantHeadroomPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareCovenantHeadroomPacket", version: covenantHeadroomPacketVersion},
    inputs: methodDataContractFromJsonSchema("covenant-headroom-packet-input", covenantHeadroomPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("covenant-headroom-packet-output", covenantHeadroomPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
