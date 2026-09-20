import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {capitalDecisionDeliveryInputSchema, capitalDecisionDeliveryOutputSchema} from "./capital-decision-delivery";

export const capitalDecisionDeliveryVersion = "2026.09.20-v1";
/** Build-owned contracts derived from the exact schemas the executor validates. */
export function capitalDecisionExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(capitalDecisionDeliveryInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(capitalDecisionDeliveryOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1", executor: {module: "@offroad/financial-model", exportName: "prepareCapitalDecisionDelivery", version: capitalDecisionDeliveryVersion},
    inputs: methodDataContractFromJsonSchema("capital.decision-delivery-input", capitalDecisionDeliveryVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("capital.decision-delivery-output", capitalDecisionDeliveryVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
