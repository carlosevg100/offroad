import {ModelGatewayError} from "@offroad/model-gateway";
import {z} from "zod";

/**
 * Every failed job carries a cause, not only a category.
 *
 * Until now an executor that caught an exception persisted `{code: "agent_processing_failed"}`
 * and logged the message. The category survived in the database; the cause survived only in a
 * log line nobody reads a week later. Phase 0 requires that no failure exists without a cause,
 * and that the cause is queryable, so this envelope travels with the job row.
 *
 * The message is scrubbed before it is stored. Error messages from our own code name tables,
 * columns, stages and RPCs, which is exactly what a person needs; they can also quote a value
 * that came out of a document, which is exactly what must never reach a telemetry row. Long
 * digit runs, e-mail addresses and currency amounts are replaced before anything is written.
 */
export const failureClassSchema = z.enum([
  "budget",
  "model_exhausted",
  "model_invalid_output",
  "model_policy",
  "quality_gate",
  "invalid_input",
  "schema_mismatch",
  "db_constraint",
  "db_timeout",
  "authorization",
  "transient",
  "worker_error",
]);
export type FailureClass = z.infer<typeof failureClassSchema>;

export const failureCauseSchema = z.object({
  /** Error class name: ZodError, ModelGatewayError, TypeError... */
  name: z.string().min(1).max(80),
  /** Machine code carried by the error itself, when it has one. */
  code: z.string().min(1).max(120).optional(),
  class: failureClassSchema,
  /** Bounded and scrubbed. Names tables, columns and stages; never a value from a document. */
  message: z.string().max(300),
});
export type FailureCause = z.infer<typeof failureCauseSchema>;

export type JobFailureRecord = {
  code: string;
  stage: string;
  cause: FailureCause;
  retryable: boolean;
} & Record<string, unknown>;

const TRANSIENT = /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|expired|rate.?limit|\b429\b|\b5\d\d\b/i;
const DB_TIMEOUT = /statement timeout|canceling statement|lock timeout/i;
const DB_CONSTRAINT = /violates .*constraint|null value in column|duplicate key|foreign key|check constraint/i;
const AUTHORIZATION = /\b42501\b|permission denied|authentication_required|organization_access_denied|capability/i;

export function safeMessage(input: unknown): string {
  const raw = typeof input === "string" ? input : input instanceof Error ? input.message : String(input ?? "");
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/(?:R\$|US\$|BRL|USD|EUR|€|\$)\s*[\d.,]+/gi, "<amount>")
    // Any number carrying four or more digits, with or without thousand separators, is a value.
    .replace(/\d[\d.,]*\d|\d/g, (token) => (token.replace(/\D/g, "").length >= 4 ? "#" : token))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function errorCodeOf(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120);
  }
  return undefined;
}

export function classifyFailure(error: unknown, code?: string): FailureClass {
  const own = errorCodeOf(error) ?? code ?? "";
  if (error instanceof ModelGatewayError) {
    if (error.code === "budget_exceeded") return "budget";
    if (error.code === "all_attempts_failed" || error.code === "timeout") return "model_exhausted";
    if (error.code === "invalid_output" || error.code === "output_truncated") return "model_invalid_output";
    return "model_policy";
  }
  if (error instanceof z.ZodError) {
    return error.issues.some((issue) => issue.code === "unrecognized_keys") ? "schema_mismatch" : "invalid_input";
  }
  if (/budget/i.test(own)) return "budget";
  if (/quality_gate/i.test(own)) return "quality_gate";
  if (/invalid_.*input|invalid_case/i.test(own)) return "invalid_input";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (DB_TIMEOUT.test(message)) return "db_timeout";
  if (DB_CONSTRAINT.test(message)) return "db_constraint";
  if (AUTHORIZATION.test(message) || AUTHORIZATION.test(own)) return "authorization";
  if (TRANSIENT.test(message)) return "transient";
  return "worker_error";
}

/**
 * Builds the envelope persisted with a failed job. `code` keeps whatever category the executor
 * already used, so nothing downstream changes; `cause` is what was missing.
 */
export function describeJobFailure(
  error: unknown,
  options: {code: string; stage: string; retryable?: boolean} & Record<string, unknown>,
): JobFailureRecord {
  const {code, stage, retryable, ...extra} = options;
  const failureClass = classifyFailure(error, code);
  const name = error instanceof Error ? error.name || "Error" : typeof error;
  const cause = failureCauseSchema.parse({
    name: name.slice(0, 80),
    ...(errorCodeOf(error) ? {code: errorCodeOf(error)} : {}),
    class: failureClass,
    message: safeMessage(error) || `${failureClass} without message`,
  });
  return {
    ...extra,
    code,
    stage,
    cause,
    retryable: retryable ?? (failureClass === "transient" || failureClass === "db_timeout"),
  };
}
