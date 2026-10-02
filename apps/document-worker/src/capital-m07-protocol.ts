/** Parse-only transport shapes. No DTO alone grants access to a retained body. */
import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
export const capitalM07RetentionScopeSchema=z.strictObject({schemaVersion:z.literal("capital-retained-body.v1"),retentionState:z.enum(["allocated","retained"]),
 allocationId:uuid,retainedPayloadId:uuid.nullable(),bodyBasisId:uuid,bucket:z.literal("capital-input-capture"),
 path:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),
 storageObjectId:uuid.nullable(),storageVersion:z.string().min(1).nullable(),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time,replayed:z.boolean()});
export const capitalM07CommitReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-m07-commit-receipt.v1"),recipeId:uuid,taskRunId:uuid,capitalArtifactId:uuid,revisionId:uuid,
 finalFingerprint:hash,artifactFingerprint:hash,artifactVersion:z.number().int().positive(),replayed:z.boolean()});
export type CapitalM07RetentionScope=z.infer<typeof capitalM07RetentionScopeSchema>;
export type CapitalM07CommitReceipt=z.infer<typeof capitalM07CommitReceiptSchema>;

export const capitalM07QualityResultsSchema=z.array(z.strictObject({id:z.enum(["schema","citation_allowlist","citation_coverage","uncertainty","forward_case_governance","unsupported_material_numbers","official_financial_coverage","debt_amount_units","scope_boundary"]),passed:z.boolean()})).length(9).refine(values=>new Set(values.map(value=>value.id)).size===9,"every native grader must appear once");
export const capitalM07QualityFailureSchema=z.strictObject({schemaVersion:z.literal("capital-m07-quality-failure.v1"),acceptedInvocationId:uuid,parsedRetainedPayloadId:uuid,finalRetainedPayloadId:uuid,finalFingerprint:hash,
 qualityResults:capitalM07QualityResultsSchema.refine(values=>values.some(value=>!value.passed),"a failed diagnostic requires a failed grader")});
export const capitalM07QualityFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-m07-quality-failure-receipt.v1"),recipeId:uuid,taskRunId:uuid,qualityFailure:capitalM07QualityFailureSchema,replayed:z.boolean()});
export class CapitalM07QualityFailure extends Error {readonly code="quality_gate_m07_failed";constructor(){super("A análise não passou na verificação. Atualize o contexto e aprove um novo plano para uma nova execução.");}}

export const capitalM07ExecutionFailureReasonSchema=z.enum(["model_attempts_exhausted","processing_denied","budget_denied","accepted_body_unavailable"]);
export const capitalM07ExecutionFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-m07-execution-failure-receipt.v1"),recipeId:uuid,taskRunId:uuid,reason:capitalM07ExecutionFailureReasonSchema,outcomeIds:z.array(uuid).max(2),replayed:z.boolean()});

export class CapitalM07ExecutionFailure extends Error {readonly code="capital_m07_execution_failed_terminal";constructor(readonly reason:z.infer<typeof capitalM07ExecutionFailureReasonSchema>){super("A execução foi encerrada sem publicar uma análise. Atualize o contexto e aprove um novo plano para tentar novamente.");}}
