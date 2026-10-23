import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {weeklyCashPacketInputSchema, weeklyCashPacketOutputSchema, weeklyCashPacketVersion} from "./weekly-cash-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function weeklyCashPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(weeklyCashPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(weeklyCashPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareWeeklyCashPacket", version: weeklyCashPacketVersion},
    inputs: methodDataContractFromJsonSchema("weekly-cash-packet-input", weeklyCashPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("weekly-cash-packet-output", weeklyCashPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
