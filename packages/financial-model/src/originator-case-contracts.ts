import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {originatorCasePacketInputSchema, originatorCasePacketOutputSchema, originatorKitPacketInputSchema, originatorKitPacketOutputSchema, originatorCreditPacketInputSchema, originatorCreditPacketOutputSchema, originatorRegistryPacketInputSchema, originatorRegistryPacketOutputSchema} from "./originator-case";

/** Authoring contracts only; their existence grants no runtime publication or release. */
function contracts(inputContract: z.ZodType, outputContract: z.ZodType, name: string, exportName: string) {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const input = z.toJSONSchema(inputContract, {...options, io: "input"}), output = z.toJSONSchema(outputContract, options);
  return {schemaVersion: "method-executor-contracts.v1", executor: {module: "@offroad/financial-model", exportName, version: "2026.10.30-v1"},
    inputs: methodDataContractFromJsonSchema(name + "-input", "2026.10.30-v1", input), outputs: methodDataContractFromJsonSchema(name + "-output", "2026.10.30-v1", output), validationSchemas: {input, output}};
}
export const originatorCaseExecutorContracts = () => contracts(originatorCasePacketInputSchema, originatorCasePacketOutputSchema, "originator-case-packet", "prepareOriginatorCasePacket");
export const originatorKitExecutorContracts = () => contracts(originatorKitPacketInputSchema, originatorKitPacketOutputSchema, "originator-kit-packet", "prepareOriginatorKitPacket");
export const originatorCreditExecutorContracts = () => contracts(originatorCreditPacketInputSchema, originatorCreditPacketOutputSchema, "originator-credit-packet", "prepareOriginatorCreditPacket");
export const originatorRegistryExecutorContracts = () => contracts(originatorRegistryPacketInputSchema, originatorRegistryPacketOutputSchema, "originator-registry-packet", "prepareOriginatorRegistryPacket");
