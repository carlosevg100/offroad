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

import {capitalContractPreparationInputSchema, capitalContractPreparationOutputSchema} from "./capital-contract-preparation";
export function capitalContractPreparationExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const version = "2026.09.20-v1";
  const inputSchema = z.toJSONSchema(capitalContractPreparationInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(capitalContractPreparationOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1", executor: {module: "@offroad/financial-model", exportName: "prepareCapitalContractEvidence", version},
    inputs: methodDataContractFromJsonSchema("capital.contract-preparation-input", version, inputSchema),
    outputs: methodDataContractFromJsonSchema("capital.contract-preparation-output", version, outputSchema), validationSchemas: {input: inputSchema, output: outputSchema}};
}

import {capitalProcedurePacketInputSchema, capitalProcedurePacketOutputSchema} from "./capital-procedure-packet";
export function capitalProcedurePacketExecutorContracts() {
  const options = {reused: "inline", cycles: "throw", unrepresentable: "throw"} as const;
  const version = "2026.09.20-v1";
  const inputSchema = z.toJSONSchema(capitalProcedurePacketInputSchema, {...options, io: "input"});
  const outputSchema = z.toJSONSchema(capitalProcedurePacketOutputSchema, options);
  return {schemaVersion: "method-executor-contracts.v1", executor: {module: "@offroad/financial-model", exportName: "prepareCapitalProcedurePacket", version},
    inputs: methodDataContractFromJsonSchema("capital.procedure-packet-input", version, inputSchema),
    outputs: methodDataContractFromJsonSchema("capital.procedure-packet-output", version, outputSchema), validationSchemas: {input: inputSchema, output: outputSchema}};
}

import {capitalContractPreparationV2InputSchema, capitalContractPreparationV2OutputSchema} from "./capital-contract-preparation-v2";
import {capitalProcedurePacketV2InputSchema, capitalProcedurePacketV2OutputSchema} from "./capital-procedure-packet-v2";
export function capitalContractPreparationV2ExecutorContracts() {
  return buildV2Contracts("capital.contract-preparation-v2", "prepareCapitalContractEvidenceV2", capitalContractPreparationV2InputSchema, capitalContractPreparationV2OutputSchema);
}
export function capitalProcedurePacketV2ExecutorContracts() {
  return buildV2Contracts("capital.procedure-packet-v2", "prepareCapitalProcedurePacketV2", capitalProcedurePacketV2InputSchema, capitalProcedurePacketV2OutputSchema);
}
function buildV2Contracts(id: string, exportName: string, input: z.ZodType, output: z.ZodType) {
  const options={reused:"inline",cycles:"throw",unrepresentable:"throw"} as const;
  const version="2026.09.21-v2";
  const inputSchema=z.toJSONSchema(input,{...options,io:"input"});const outputSchema=z.toJSONSchema(output,options);
  return {schemaVersion:"method-executor-contracts.v1",executor:{module:"@offroad/financial-model",exportName,version},
    inputs:methodDataContractFromJsonSchema(`${id}-input`,version,inputSchema),outputs:methodDataContractFromJsonSchema(`${id}-output`,version,outputSchema),validationSchemas:{input:inputSchema,output:outputSchema}};
}
