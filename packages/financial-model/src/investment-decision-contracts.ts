import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {investmentDecisionPacketInputSchema, investmentDecisionPacketOutputSchema, investmentDecisionPacketVersion} from "./investment-decision-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function investmentDecisionPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(investmentDecisionPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(investmentDecisionPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareInvestmentDecisionPacket", version: investmentDecisionPacketVersion},
    inputs: methodDataContractFromJsonSchema("investment-decision-packet-input", investmentDecisionPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("investment-decision-packet-output", investmentDecisionPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
