import {receivablesPoolUnderwritingSchema} from "@offroad/receivables-analysis";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

const hash = z.string().regex(/^[a-f0-9]{64}$/);

const evidenceRefSchema = z.object({
  section: z.string().min(1),
  sourceClass: z.string().min(1),
  sourceId: z.string().min(1),
  anchor: z.string().min(1),
});

/**
 * The organization's own released R01 result. `state` is the answer to "may I show this now?":
 * only `current` carries a result, and `superseded` says the confirmed portfolio selection, the
 * sources or the run changed after the calculation, so the stored numbers are history.
 */
export const receivablesReleasedResultSchema = z.object({
  schemaVersion: z.literal("receivables-released-result.v1"),
  state: z.enum(["not_granted", "absent", "superseded", "current"]),
  supersededReason: z.enum(["run_replaced", "scope_stale", "scope_replaced", "sources_changed"]).nullable().default(null),
  previous: z.object({
    createdAt: z.string().min(1),
    outputFingerprint: hash,
    evidenceScopeFingerprint: hash,
    sourceDatasetHash: hash,
  }).nullable().default(null),
  result: z.object({
    id: z.uuid(),
    createdAt: z.string().min(1),
    taskId: z.literal("R01"),
    executorKey: z.string().min(1),
    executorVersion: z.string().min(1),
    methodMaturity: z.enum(["tested", "ready_for_founder", "production"]),
    evidenceScope: z.object({id: z.uuid(), fingerprint: hash}),
    sourceDatasetHash: hash,
    inputFingerprint: hash,
    outputFingerprint: hash,
    release: z.object({
      organizationId: z.uuid(),
      procedure: z.object({id: z.string().min(1), version: z.string().min(1), maturity: z.string().min(1)}),
      methodMaturity: z.string().min(1),
      allowedUses: z.array(z.string().min(1)),
      maximumEffect: z.literal("none"),
      confirmedScope: z.object({id: z.uuid(), fingerprint: hash}),
      sourceDatasetHash: hash,
    }),
    artifact: z.object({
      artifactType: z.literal("receivables_pool_underwriting"),
      schemaVersion: z.literal("method.underwrite-receivables-pool.v1"),
      status: z.literal("released"),
      inputFingerprint: hash,
      outputFingerprint: hash,
      content: receivablesPoolUnderwritingSchema,
      evidenceRefs: z.array(evidenceRefSchema),
    }),
    qualityResults: z.array(z.object({
      id: z.string().min(1),
      status: z.enum(["passed", "failed"]),
      detail: z.string().default(""),
    })),
  }).nullable().default(null),
}).superRefine((value, context) => {
  // A released result is either current with content or explicitly absent. Nothing in between.
  if (value.state === "current" && !value.result) {
    context.addIssue({code: "custom", message: "a current released result must carry its content"});
  }
  if (value.state !== "current" && value.result) {
    context.addIssue({code: "custom", message: "only a current released result may carry content"});
  }
});
export type ReceivablesReleasedResult = z.infer<typeof receivablesReleasedResultSchema>;

/**
 * Reads the caller organization's released result. The database resolves the grant, the tenant and
 * the supersession; anything this reader cannot validate is reported as "no release", never as a
 * partial one, so an unreadable payload can never be rendered as an analysis.
 */
export async function loadReceivablesReleasedResult(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<ReceivablesReleasedResult> {
  const closed = {
    schemaVersion: "receivables-released-result.v1",
    state: "not_granted",
    supersededReason: null,
    previous: null,
    result: null,
  } as const;
  const {data, error} = await supabase.rpc("read_receivables_released_result_v1", {p_session_id: sessionId});
  if (error) return closed;
  const parsed = receivablesReleasedResultSchema.safeParse(data);
  return parsed.success ? parsed.data : closed;
}
