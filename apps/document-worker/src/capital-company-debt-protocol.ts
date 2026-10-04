/** Parse-only transport shapes. No DTO alone grants access to a retained body. */
import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
export const capitalCompanyDebtRetentionScopeSchema=z.strictObject({schemaVersion:z.literal("capital-retained-body.v1"),retentionState:z.enum(["allocated","retained"]),
 allocationId:uuid,retainedPayloadId:uuid.nullable(),bodyBasisId:uuid,bucket:z.literal("capital-input-capture"),
 path:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),
 storageObjectId:uuid.nullable(),storageVersion:z.string().min(1).nullable(),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time,replayed:z.boolean()});
export const capitalCompanyDebtCommitReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-debt-commit-receipt.v1"),recipeId:uuid,executionPlanTaskRunId:uuid,taskRunId:uuid,capitalArtifactId:uuid,revisionId:uuid,
 finalFingerprint:hash,artifactFingerprint:hash,artifactVersion:z.number().int().positive(),replayed:z.boolean()});
export type CapitalCompanyDebtRetentionScope=z.infer<typeof capitalCompanyDebtRetentionScopeSchema>;
export type CapitalCompanyDebtCommitReceipt=z.infer<typeof capitalCompanyDebtCommitReceiptSchema>;
export const capitalCompanyDebtTaskProjectionReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-debt-task-projection-receipt.v1"),recipeId:uuid,taskId:z.string().regex(/^[A-Z][0-9]{2}$/),taskRunId:uuid,capitalArtifactId:uuid,artifactFingerprint:hash,artifactVersion:z.number().int().positive(),retainedPayloadId:uuid,replayed:z.boolean()});
export type CapitalCompanyDebtTaskProjectionReceipt=z.infer<typeof capitalCompanyDebtTaskProjectionReceiptSchema>;

export const capitalCompanyDebtQualityResultsSchema=z.array(z.strictObject({id:z.enum(["schema","citation_allowlist","business_evidence","capacity_boundary","next_batch","unsupported_material_numbers","scope_boundary"]),passed:z.boolean()})).length(7).refine(values=>new Set(values.map(value=>value.id)).size===7,"every native grader must appear once");
export const capitalCompanyDebtQualityFailureSchema=z.strictObject({schemaVersion:z.literal("capital-debt-quality-failure.v1"),acceptedInvocationId:uuid,parsedRetainedPayloadId:uuid,finalRetainedPayloadId:uuid,finalFingerprint:hash,
 qualityResults:capitalCompanyDebtQualityResultsSchema.refine(values=>values.some(value=>!value.passed),"a failed diagnostic requires a failed grader")});
export const capitalCompanyDebtQualityFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-debt-quality-failure-receipt.v1"),recipeId:uuid,executionPlanTaskRunId:uuid,qualityFailure:capitalCompanyDebtQualityFailureSchema,replayed:z.boolean()});
export class CapitalCompanyDebtQualityFailure extends Error {readonly code="quality_gate_c11_failed";constructor(){super("A análise não passou na verificação. Atualize o contexto e aprove um novo plano para uma nova execução.");}}

export const capitalCompanyDebtExecutionFailureReasonSchema=z.enum(["model_attempts_exhausted","processing_denied","budget_denied","accepted_body_unavailable"]);
export const capitalCompanyDebtExecutionFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-debt-execution-failure-receipt.v1"),recipeId:uuid,executionPlanTaskRunId:uuid,reason:capitalCompanyDebtExecutionFailureReasonSchema,outcomeIds:z.array(uuid).max(2),replayed:z.boolean()});

export class CapitalCompanyDebtExecutionFailure extends Error {readonly code="capital_debt_execution_failed_terminal";constructor(readonly reason:z.infer<typeof capitalCompanyDebtExecutionFailureReasonSchema>){super("A execução foi encerrada sem publicar uma análise. Atualize o contexto e aprove um novo plano para tentar novamente.");}}
