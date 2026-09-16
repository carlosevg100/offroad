import {execFileSync} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {createClient} from "@supabase/supabase-js";
import {createJobStorageClient} from "../../../document-worker/src/job-storage";
import {documentJobSchema} from "../../../document-worker/src/queue";
import {runGovernedGate} from "../../../document-worker/src/scan";
import {dataRoomFiles} from "./data-room";

/** The synthetic classifier cannot attest bytes. Exercise the real worker E0 boundary first. */
export async function verifyLocalFixtureSources(sessionId: string, ownerEmail: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId)) throw new Error("Invalid synthetic session ID");
  const databaseUrl = process.env.OFFROAD_E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const db = new URL(databaseUrl); const api = new URL(apiUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) || db.port !== "54322" || db.pathname !== "/postgres"
    || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) || api.port !== "54321") {
    throw new Error("Source verification fixtures require the isolated local stack");
  }
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) throw new Error("Local publishable key required");
  const capability = randomBytes(32).toString("hex");
  const raw = execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`, "-v", `owner_email=${ownerEmail}`, "-v", `capability=${capability}`, "-f", join(__dirname, "source-verification-local.sql")], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
  const jobs = (JSON.parse(raw) as unknown[]).map(job => documentJobSchema.parse({...job as object, capability_token: capability}));
  const worker = createClient(apiUrl, publishableKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const login = await worker.auth.signInWithPassword({email: "local-worker@offroad.invalid", password: "local-worker-password-2026"});
  if (login.error) throw new Error("Local verification worker sign-in failed");
  const storage = createJobStorageClient(worker);
  // This scanner is explicitly synthetic and only accepts the committed test corpus bytes.
  // It does not establish production malware-scanning quality.
  const allowed = new Set(dataRoomFiles.map(path => createHash("sha256").update(readFileSync(path)).digest("hex")));
  for (const job of jobs) {
    const bytes = await storage.download(job);
    const gated = await runGovernedGate({bytes, binding: {
      organizationId: job.organization_id, sourceDocumentId: job.payload.source_document_id,
      documentVersion: job.payload.document_version, expectedSha256: job.payload.sha256!, expectedByteSize: job.payload.byte_size!,
      originalName: job.payload.original_name, declaredMediaType: job.payload.mime_type ?? null, operationId: job.job_id,
    }, scanner: {name: "synthetic-local-corpus-allowlist", scan: async observed => ({clean: allowed.has(createHash("sha256").update(observed).digest("hex"))})}});
    if (!gated.authorization || gated.receipt.verdict !== "clean") throw new Error("Synthetic source byte verification failed");
    const result = await worker.rpc("worker_record_document_result", {p_job_id: job.job_id, p_capability_token: capability, p_scan_result: gated.receipt, p_profile: null, p_layer: null});
    if (result.error) throw new Error("Delegated source receipt was rejected");
  }
  await worker.auth.signOut();
  // Only E0 ran; do not claim a completed document pipeline or enqueue follow-up analysis.
  execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", `update public.processing_jobs set status='cancelled',lease_expires_at=null,capability_sha256=null where processing_run_id in (select id from public.processing_runs where intake_session_id='${sessionId}'::uuid and pipeline_version='local-fixture-byte-verification-only'); update public.processing_runs set status='cancelled' where intake_session_id='${sessionId}'::uuid and pipeline_version='local-fixture-byte-verification-only';`], {stdio: ["ignore", "pipe", "pipe"]});
}
