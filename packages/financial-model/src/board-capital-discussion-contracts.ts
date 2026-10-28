import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {boardCapitalDiscussionPacketInputSchema, boardCapitalDiscussionPacketOutputSchema, boardCapitalDiscussionPacketVersion} from "./board-capital-discussion-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function boardCapitalDiscussionPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(boardCapitalDiscussionPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(boardCapitalDiscussionPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareBoardCapitalDiscussionPacket", version: boardCapitalDiscussionPacketVersion},
    inputs: methodDataContractFromJsonSchema("board-capital-discussion-packet-input", boardCapitalDiscussionPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("board-capital-discussion-packet-output", boardCapitalDiscussionPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
