/** Parse-only transport shapes. No DTO alone grants access to a retained body. */
import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
export const capitalS11RetentionScopeSchema=z.strictObject({schemaVersion:z.literal("capital-retained-body.v1"),retentionState:z.enum(["allocated","retained"]),
 allocationId:uuid,retainedPayloadId:uuid.nullable(),bodyBasisId:uuid,bucket:z.literal("capital-input-capture"),
 path:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),
 storageObjectId:uuid.nullable(),storageVersion:z.string().min(1).nullable(),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time,replayed:z.boolean()});
export const capitalS11CommitReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-s11-commit-receipt.v1"),recipeId:uuid,producerTaskRunId:uuid,taskRunId:uuid,capitalArtifactId:uuid,revisionId:uuid,
 finalFingerprint:hash,artifactFingerprint:hash,artifactVersion:z.number().int().positive(),replayed:z.boolean()});
export type CapitalS11RetentionScope=z.infer<typeof capitalS11RetentionScopeSchema>;
export type CapitalS11CommitReceipt=z.infer<typeof capitalS11CommitReceiptSchema>;
export const capitalS11TaskProjectionReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-s11-task-projection-receipt.v1"),recipeId:uuid,taskId:z.string().regex(/^[A-Z][0-9]{2}$/),taskRunId:uuid,capitalArtifactId:uuid,artifactFingerprint:hash,artifactVersion:z.number().int().positive(),retainedPayloadId:uuid,replayed:z.boolean()});
export type CapitalS11TaskProjectionReceipt=z.infer<typeof capitalS11TaskProjectionReceiptSchema>;

export const capitalS11QualityResultsSchema=z.array(z.strictObject({id:z.enum(["schema_valid","citations_allowed","recommendation_consistent","no_invented_terms"]),passed:z.boolean()})).length(4).refine(values=>new Set(values.map(value=>value.id)).size===4,"every native grader must appear once");
export const capitalS11QualityFailureSchema=z.strictObject({schemaVersion:z.literal("capital-s11-quality-failure.v1"),acceptedInvocationId:uuid,parsedRetainedPayloadId:uuid,finalRetainedPayloadId:uuid,finalFingerprint:hash,
 qualityResults:capitalS11QualityResultsSchema.refine(values=>values.some(value=>!value.passed),"a failed diagnostic requires a failed grader")});
export const capitalS11QualityFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-s11-quality-failure-receipt.v1"),recipeId:uuid,taskRunId:uuid,qualityFailure:capitalS11QualityFailureSchema,replayed:z.boolean()});
export class CapitalS11QualityFailure extends Error {readonly code="quality_gate_s11_failed";constructor(){super("A análise não passou na verificação. Atualize o contexto e aprove um novo plano para uma nova execução.");}}

export const capitalS11ExecutionFailureReasonSchema=z.enum(["model_attempts_exhausted","processing_denied","budget_denied","accepted_body_unavailable"]);
export const capitalS11ExecutionFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-s11-execution-failure-receipt.v1"),recipeId:uuid,taskRunId:uuid,reason:capitalS11ExecutionFailureReasonSchema,outcomeIds:z.array(uuid).max(2),replayed:z.boolean()});

export class CapitalS11ExecutionFailure extends Error {readonly code="capital_s11_execution_failed_terminal";constructor(readonly reason:z.infer<typeof capitalS11ExecutionFailureReasonSchema>){super("A execução foi encerrada sem publicar uma análise. Atualize o contexto e aprove um novo plano para tentar novamente.");}}
