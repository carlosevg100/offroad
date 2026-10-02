import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {
  freezeArtifactValue,
  capitalPublicCaptureContextResponseSchema,
  capitalPublicDeliveryResponseSchema,
  capitalPublicLicensedPayloadSchema,
} from "@offroad/domain-contracts";
import {createCapitalPublicCaptureStorage, type CapitalCaptureJobAuthority} from "./capital-public-capture-storage";

const originSchema = z.strictObject({
  licensingOrganizationId: z.uuid(), sourceVersionId: z.uuid(), rightsVersionId: z.uuid(), sourceBindingId: z.uuid(),
});
const requestSchema = z.strictObject({
  deliveryKey: z.string().min(1).max(160), requestId: z.uuid(),
  payload: capitalPublicLicensedPayloadSchema, origin: originSchema.optional(),
});
export type CapitalPublicDeliveryRequest = z.input<typeof requestSchema>;

function orderedPayload(payload: z.infer<typeof capitalPublicLicensedPayloadSchema>) {
  return JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))));
}

/** Opens one job-scoped metadata capsule. SQL resolves licenses and current authority;
 * the adapter exposes only bytes actually retained, reread and checked against that delivery.
 * It does not seal task/model input, persist a prompt, or declare an artifact complete.
 */
export async function openCapitalPublicCaptureAdapter(client: SupabaseClient, authority: CapitalCaptureJobAuthority, now: () => number = Date.now) {
  const job = Object.freeze({jobId: z.uuid().parse(authority.jobId), capabilityToken: z.string().min(1).parse(authority.capabilityToken)});
  const args = {p_job_id: job.jobId, p_capability_token: job.capabilityToken};
  const rpc = async (name: string, parameters: Record<string, unknown>) => {
    const result = await retryCapitalCaptureRpc(() => client.rpc(name, parameters));
    // Neither database messages nor caller content enter logs/errors.
    if (result.error) throw new Error("capital public delivery authority denied");
    return result.data;
  };
  const {capture} = capitalPublicCaptureContextResponseSchema.parse(await rpc("worker_load_capital_project_capture_context_v1", args));
  const storage = createCapitalPublicCaptureStorage(client, now);
  return Object.freeze({
    capture: freezeArtifactValue(capture),
    async deliver(input: CapitalPublicDeliveryRequest) {
      // Clone and freeze before the first await: a caller cannot change the payload
      // or origin after capture, even when upload/download yield to another task.
      const request = freezeArtifactValue(requestSchema.parse(input));
      const delivery = capitalPublicDeliveryResponseSchema.parse(await rpc("worker_capture_capital_project_delivery_v1", {
        ...args, p_capture_id: capture.id, p_delivery_key: request.deliveryKey, p_payload: request.payload,
        p_origin_refs: [{kind: "published_public_payload", ...request.origin}],
      }));
      if (delivery.unresolvedReasons.length !== 1 || delivery.unresolvedReasons[0] !== "retention_storage_not_resolved") {
        // A missing license/closure is an explicit gap. No original or partial bytes
        // reach a consumer, and retention cannot legitimize an unresolved origin.
        return freezeArtifactValue({state: "unresolved" as const, captureId: capture.id, deliveryId: delivery.deliveryId,
          payloadFingerprint: delivery.payloadFingerprint, reasons: delivery.unresolvedReasons});
      }
      const retention = await storage.retain({...job, deliveryId: delivery.deliveryId, requestId: request.requestId, payload: request.payload});
      const bytes = await storage.read(job, retention.retainedPayloadId, retention);
      if (createHash("sha256").update(bytes).digest("hex") !== delivery.payloadFingerprint) throw new Error("capital public delivery bytes mismatch");
      const payload = capitalPublicLicensedPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)) as unknown);
      // PostgreSQL owns JSONB canonical hashing. Compare values independently so a
      // wrong capture response cannot label a different, valid retained payload.
      if (orderedPayload(payload) !== orderedPayload(request.payload)) throw new Error("capital public delivery payload mismatch");
      return freezeArtifactValue({state: "retained" as const, captureId: capture.id, deliveryId: delivery.deliveryId,
        payloadFingerprint: delivery.payloadFingerprint, retention, payload});
    },
  });
}
