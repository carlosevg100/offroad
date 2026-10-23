import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {debtTablePacketInputSchema, debtTablePacketOutputSchema, debtTablePacketVersion} from "./debt-table-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function debtTablePacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(debtTablePacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(debtTablePacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareDebtTablePacket", version: debtTablePacketVersion},
    inputs: methodDataContractFromJsonSchema("debt-table-packet-input", debtTablePacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("debt-table-packet-output", debtTablePacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
