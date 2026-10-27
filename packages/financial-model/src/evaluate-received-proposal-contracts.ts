import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {receivedProposalPacketInputSchema, receivedProposalPacketOutputSchema, receivedProposalPacketVersion} from "./evaluate-received-proposal-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function receivedProposalPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(receivedProposalPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(receivedProposalPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareReceivedProposalPacket", version: receivedProposalPacketVersion},
    inputs: methodDataContractFromJsonSchema("received-proposal-packet-input", receivedProposalPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("received-proposal-packet-output", receivedProposalPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
