import {createHash} from "node:crypto";
import {HeadObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
const health = {blockedCount: z.number().int().nonnegative(), oldestPendingSeconds: z.number().nonnegative()};
const claimSchema = z.discriminatedUnion("claimed", [z.strictObject({claimed: z.literal(false), ...health}),
  z.strictObject({claimed: z.literal(true), ...health, batchId: z.uuid(), organizationId: z.uuid(), capability: z.string().regex(/^[a-f0-9]{64}$/),
    canonicalPayload: z.string().min(1).max(1048576), sha256: z.string().regex(/^[a-f0-9]{64}$/), leaseExpiresAt: z.iso.datetime({offset: true})})]);
type Log = (event: string, detail?: Record<string, unknown>) => void;
export type AuditStoragePort = {send: (command: PutObjectCommand | HeadObjectCommand) => Promise<unknown>};

/** S3 Object Lock compliance retention is configured on the separate private bucket. The task
 * has Put/Get only on audit/v1/*: no bucket administration, object delete or retention bypass. */
export function createAuditArchive(client: SupabaseClient, workerToken: string, bucket: string, region: string, log: Log,
  port?: AuditStoragePort, now = Date.now) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || region !== "sa-east-1") throw new Error("audit_archive_config_invalid");
  const s3 = port ? null : new S3Client({region, maxAttempts: 2});
  const storage = port ?? {send: (command: PutObjectCommand | HeadObjectCommand) => command instanceof PutObjectCommand ? s3!.send(command) : s3!.send(command)};
  return {
    async poll(): Promise<boolean> {
      try {
        const result = await client.rpc("worker_claim_audit_batch_v1", {p_worker_token: workerToken});
        if (result.error) throw new Error("claim_denied");
        const claim = claimSchema.parse(result.data);
        log("audit_archive.health", {blockedCount: claim.blockedCount, oldestPendingSeconds: claim.oldestPendingSeconds});
        if (!claim.claimed) return false;
        const live = () => {if (Date.parse(claim.leaseExpiresAt) <= now()) throw new Error("lease_expired");};
        live();
        const bytes = Buffer.from(claim.canonicalPayload, "utf8"), sha = createHash("sha256").update(bytes).digest("hex");
        if (bytes.length > 1048576 || sha !== claim.sha256) throw new Error("batch_fingerprint_invalid");
        const key = `audit/v1/${claim.organizationId}/${claim.batchId}.json`, checksum = Buffer.from(sha, "hex").toString("base64");
        try {
          await storage.send(new PutObjectCommand({Bucket: bucket, Key: key, Body: bytes, ContentType: "application/json", ServerSideEncryption: "AES256",
            IfNoneMatch: "*", ChecksumSHA256: checksum, Metadata: {sha256: sha}}));
        } catch (error) {
          // A lost reply may already have written the same sealed identity. Only the exact
          // precondition conflict is eligible for reconciliation by a fresh signed HEAD.
          if (!(error && typeof error === "object" && "$metadata" in error && (error as {$metadata?: {httpStatusCode?: number}}).$metadata?.httpStatusCode === 412)) throw new Error("archive_write_failed");
        }
        live();
        const raw = await storage.send(new HeadObjectCommand({Bucket: bucket, Key: key, ChecksumMode: "ENABLED"}));
        const head = z.object({VersionId: z.string().min(1).max(512).refine(v => v !== "null"), ContentLength: z.literal(bytes.length),
          ChecksumSHA256: z.literal(checksum), ServerSideEncryption: z.literal("AES256"), ObjectLockMode: z.literal("COMPLIANCE"),
          ObjectLockRetainUntilDate: z.date().refine(date => date.getTime() > now())}).parse(raw);
        live();
        const ack = await client.rpc("worker_ack_audit_batch_v1", {p_worker_token: workerToken, p_batch_id: claim.batchId, p_capability: claim.capability,
          p_verified_sha256: sha, p_s3_version_id: head.VersionId});
        if (ack.error || !z.strictObject({completed: z.literal(true), replayed: z.boolean()}).safeParse(ack.data).success) throw new Error("archive_ack_unconfirmed");
        log("audit_archive.completed"); return true;
      } catch {
        log("audit_archive.failed", {reason: "authority_transport_or_receipt_failed"}); return false;
      }
    },
  };
}
