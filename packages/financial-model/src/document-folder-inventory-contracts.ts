import {z} from "zod";
import {methodDataContractFromJsonSchema} from "@offroad/credit-playbook";
import {documentFolderInventoryPacketInputSchema, documentFolderInventoryPacketOutputSchema, documentFolderInventoryPacketVersion} from "./document-folder-inventory-packet";

/** Build-owned contract publication, kept apart from the executor so the released artifact
 * bundles only the organization and its schemas. */
export function documentFolderInventoryPacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const inputSchema = z.toJSONSchema(documentFolderInventoryPacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(documentFolderInventoryPacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1",
    executor: {module: "@offroad/financial-model", exportName: "prepareDocumentFolderInventoryPacket", version: documentFolderInventoryPacketVersion},
    inputs: methodDataContractFromJsonSchema("document-folder-inventory-packet-input", documentFolderInventoryPacketVersion, inputSchema),
    outputs: methodDataContractFromJsonSchema("document-folder-inventory-packet-output", documentFolderInventoryPacketVersion, outputSchema),
    validationSchemas: {input: inputSchema, output: outputSchema}};
}
