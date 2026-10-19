import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {debtCapacityPacketInputSchema, debtCapacityPacketOutputSchema, debtCapacityPacketVersion} from "./debt-capacity-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function debtCapacityPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(debtCapacityPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(debtCapacityPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareDebtCapacityPacket", version: debtCapacityPacketVersion},
    inputs: methodDataContractFromJsonSchema("debt-capacity-packet-input", debtCapacityPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("debt-capacity-packet-output", debtCapacityPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
