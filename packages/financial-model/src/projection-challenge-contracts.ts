import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {projectionChallengePacketInputSchema, projectionChallengePacketOutputSchema, projectionChallengePacketVersion} from "./projection-challenge-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the calculation and its schemas. */
export function projectionChallengePacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(projectionChallengePacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(projectionChallengePacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareProjectionChallengePacket", version: projectionChallengePacketVersion},
    inputs: methodDataContractFromJsonSchema("projection-challenge-packet-input", projectionChallengePacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("projection-challenge-packet-output", projectionChallengePacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
