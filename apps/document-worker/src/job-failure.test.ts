import {ModelGatewayError} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";
import {z} from "zod";

import {classifyFailure, describeJobFailure, jobFailureRecordSchema, safeMessage} from "./job-failure";

describe("job failure envelope", () => {
  it("keeps the cause of an ordinary exception instead of an empty object", () => {
    const record = describeJobFailure(new TypeError("cannot read properties of undefined (reading 'tasks')"), {
      code: "agent_processing_failed",
      stage: "agent_operation_brief",
      spend: {costUsd: 0.02},
    });
    expect(record.code).toBe("agent_processing_failed");
    expect(record.cause).toMatchObject({name: "TypeError", class: "worker_error"});
    expect(record.cause.message).toContain("reading 'tasks'");
    expect(record.spend).toEqual({costUsd: 0.02});
    expect(record.retryable).toBe(false);
  });

  it("names the class of the failures seen in production", () => {
    const zod = new z.ZodError([{code: "unrecognized_keys", keys: ["requestHash"], path: [], message: "Unrecognized key"}]);
    expect(classifyFailure(zod)).toBe("schema_mismatch");
    expect(classifyFailure(new Error("worker_record_retrieval_chunks failed: canceling statement due to statement timeout"))).toBe("db_timeout");
    expect(classifyFailure(new Error('null value in column "normalized_value" of relation "intake_field_candidates" violates not-null constraint'))).toBe("db_constraint");
    expect(classifyFailure(new ModelGatewayError("all model attempts failed", "all_attempts_failed"))).toBe("model_exhausted");
    expect(classifyFailure(new ModelGatewayError("ceiling", "budget_exceeded"))).toBe("budget");
    expect(classifyFailure(new Error("boom"), "quality_gate_m07_failed")).toBe("quality_gate");
    expect(classifyFailure(new Error("fetch failed"))).toBe("transient");
  });

  it("never stores a value that could have come out of a document", () => {
    const scrubbed = safeMessage("expected 12.345.678,90 near cfo@empresa.com.br; got R$ 45.000.000 in 2026-12-31 cell B7");
    expect(scrubbed).not.toContain("12.345.678");
    expect(scrubbed).not.toContain("empresa.com.br");
    expect(scrubbed).not.toContain("45.000.000");
    expect(scrubbed).toContain("<amount>");
    expect(scrubbed).toContain("<email>");
    expect(scrubbed).toContain("cell B7");
    expect(safeMessage("x".repeat(1000))).toHaveLength(300);
  });

  it("marks database timeouts and transport failures as retryable by default", () => {
    expect(describeJobFailure(new Error("canceling statement due to statement timeout"), {code: "case_analysis_failed", stage: "case"}).retryable).toBe(true);
    expect(describeJobFailure(new Error("violates not-null constraint"), {code: "case_analysis_failed", stage: "case"}).retryable).toBe(false);
    expect(describeJobFailure(new Error("fetch failed"), {code: "sync_failed", stage: "sync", retryable: false}).retryable).toBe(false);
  });

  it("refuses a bare category at the queue boundary", () => {
    expect(jobFailureRecordSchema.safeParse({code: "agent_processing_failed", spend: {costUsd: 0.02}}).success).toBe(false);
    expect(jobFailureRecordSchema.safeParse({reason: "case_analysis_failed", code: "case_analysis_failed"}).success).toBe(false);
    expect(jobFailureRecordSchema.safeParse(describeJobFailure(new Error("boom"), {code: "x_failed", stage: "s"})).success).toBe(true);
  });

  it("treats a rejected file as invalid input, not as an authorization failure", () => {
    const record = describeJobFailure(new Error("file rejected by the scanner: Eicar-Test-Signature"), {code: "infected", stage: "scan", retryable: false});
    expect(record.cause.class).toBe("invalid_input");
    expect(record.retryable).toBe(false);
  });
});
