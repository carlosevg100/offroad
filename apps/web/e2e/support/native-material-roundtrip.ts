/** Local prospective fixture: the same SDK producer, Storage receipts and commit as stage 20. */
import {spawn, execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {constants, existsSync, openSync, fstatSync, readFileSync, closeSync, mkdirSync, rmSync} from "node:fs";
import {join} from "node:path";
import {z} from "zod";

const uuid = z.uuid();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const fixtureSchema = z.object({
  schemaVersion: z.literal("material-native-ui-fixture.v1"), organizationId: uuid,
  workId: uuid, sessionId: uuid, recipeId: uuid, revisionId: uuid,
  bundleFingerprint: fingerprint, manifestFingerprint: fingerprint,
  approved: z.literal(false), email: z.email(), password: z.string().min(20), apiUrl: z.url(),
});

export interface NativeMaterialRoundtripFixture {
  organizationId: string;
  projectId: string;
  sessionId: string;
  userId: string;
  sourceVersionId: string;
  artifactId: string;
  materialRevisionId: string;
  materialFingerprint: string;
  manifestFingerprint: string;
  email: string;
  password: string;
  stop(): Promise<void>;
}

/** Only the explicitly declared, same-owner GitHub local consumer can be paused. */
function pauseDeclaredLocalConsumer(): () => void {
  const declared = process.env.OFFROAD_E2E_WORKER_PID;
  if (declared === undefined) return () => undefined;
  if (process.env.CI !== "true" || !/^[1-9][0-9]{0,9}$/.test(declared) || !process.env.RUNNER_TEMP)
    throw new Error("native_material_fixture_worker_pid_denied");
  const pid = Number(declared);
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)
    throw new Error("native_material_fixture_worker_pid_denied");
  const expectedEntry = join(process.env.RUNNER_TEMP, "worker/dist/main.js");
  const processInfo = execFileSync("ps", ["-p", declared, "-o", "uid=", "-o", "args="],
    {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
  const match = /^([0-9]+)\s+(.+)$/.exec(processInfo);
  const command = match?.[2]?.split(/\s+/) ?? [];
  if (!match || Number(match[1]) !== process.getuid?.() || !command.includes(expectedEntry)
      || !command[0]?.endsWith("node"))
    throw new Error("native_material_fixture_worker_process_denied");
  process.kill(pid, "SIGSTOP");
  let paused = true;
  return () => {
    if (!paused) return;
    paused = false;
    try {process.kill(pid, "SIGCONT");}
    catch (error) {if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;}
  };
}

export async function startNativeMaterialRoundtripFixture(): Promise<NativeMaterialRoundtripFixture> {
  const db = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  for (const address of [db, api, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"])
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(address).hostname))
      throw new Error("Native material fixture requires local synthetic services");
  const root = join(__dirname, "../../../..");
  const namespace = randomUUID();
  const directory = `${process.platform === "darwin" ? "/private/tmp" : "/tmp"}/offroad-material-ui-${namespace}`;
  mkdirSync(directory, {mode: 0o700});
  const file = join(directory, "fixture.json");
  let resume: () => void;
  try {resume = pauseDeclaredLocalConsumer();}
  catch (error) {rmSync(directory, {recursive: true, force: true}); throw error;}
  let child: ReturnType<typeof spawn>;
  try {child = spawn(process.execPath, [join(root, "scripts/ci/test-material-production-native-sdk.mjs")], {
    cwd: root, env: {...process.env, DATABASE_URL: db, OFFROAD_E2E_API_URL: api,
      OFFROAD_E2E_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      MATERIAL_UI_FIXTURE: "1", MATERIAL_UI_NAMESPACE: namespace, MATERIAL_UI_FIXTURE_OUTPUT: file},
    stdio: ["ignore", "pipe", "pipe"],
  });} catch (error) {resume(); rmSync(directory, {recursive: true, force: true}); throw error;}
  let exited = false;
  let diagnostic = "native_material_fixture_child_exited";
  child.once("close", () => {exited = true;});
  child.once("error", () => {exited = true; diagnostic = "native_material_fixture_spawn_failed";});
  // Consume output without keeping credentials, query text or arbitrary error messages.
  const collect = () => {
    let pending = "";
    return (chunk: Buffer) => {
      pending = (pending + chunk.toString("utf8")).slice(-4096);
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "material_sdk_launcher_failed") {diagnostic = line; continue;}
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (value.eval !== "material_native_sdk_http" || value.result !== "FAIL") continue;
          const safe = (field: unknown) => typeof field === "string" && /^[a-zA-Z0-9_]{1,80}$/.test(field) ? field : "unknown";
          diagnostic = `native_material_fixture_failed phase=${safe(value.phase)} code=${safe(value.code)} rpc=${safe(value.rpc)} sqlstate=${safe(value.sqlstate)}`;
        } catch { /* Non-protocol output is deliberately discarded. */ }
      }
    };
  };
  child.stdout?.on("data", collect()); child.stderr?.on("data", collect());
  const stop = async () => {
    if (!exited) {
      child.kill("SIGTERM");
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 5000);
        child.once("close", () => {clearTimeout(timer); resolve();});
      });
    }
    if (!exited) child.kill("SIGKILL");
    rmSync(directory, {recursive: true, force: true});
  };
  const sql = (query: string) => execFileSync("psql", [db, "-XqAt", "-v", "ON_ERROR_STOP=1"],
    {input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]}).trim();
  try {
    const deadline = Date.now() + 120_000;
    while (!existsSync(file)) {
      if (exited) throw new Error(diagnostic);
      if (Date.now() > deadline) throw new Error("native_material_fixture_timeout");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw: unknown;
    try {
      const metadata = fstatSync(fd);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== process.getuid?.() || metadata.size > 16_384)
        throw new Error("native_material_fixture_file_denied");
      raw = JSON.parse(readFileSync(fd, "utf8"));
    } finally {closeSync(fd);}
    const f = fixtureSchema.parse(raw);
    if (f.apiUrl !== api) throw new Error("native_material_fixture_api_changed");
    // Local onboarding setup is explicit; the product, physical bytes and approvals
    // above were produced through their actual authenticated prospective APIs.
    sql(`insert into public.onboarding_progress(organization_id,user_id,journey,current_step,completed_at)
      select organization_id,user_id,'company','complete',clock_timestamp() from public.organization_memberships
      where organization_id='${f.organizationId}' and role='owner' and status='active'
      on conflict(organization_id,user_id,journey) do update set completed_at=excluded.completed_at,current_step='complete';`);
    const basis = z.object({userId: uuid, sourceVersionId: uuid, artifactId: uuid,
      materialFingerprint: fingerprint, manifestFingerprint: fingerprint}).parse(JSON.parse(sql(`
      select jsonb_build_object('userId',r.human_subject_id,'sourceVersionId',
        (select p.source_version_id from private.material_production_source_pins p
         where(p.organization_id,p.recipe_id)=(r.organization_id,r.id) order by p.source_version_id limit 1),
        'artifactId',v.artifact_id,'materialFingerprint',b.bundle_fingerprint,'manifestFingerprint',v.manifest_fingerprint)
      from private.material_production_recipes r join private.material_production_bindings b
        on(b.organization_id,b.recipe_id)=(r.organization_id,r.id)
      join public.artifact_revisions v on(v.organization_id,v.id)=(b.organization_id,b.revision_id)
      where(r.organization_id,r.id,b.revision_id)=('${f.organizationId}'::uuid,'${f.recipeId}'::uuid,'${f.revisionId}'::uuid);`)));
    if (basis.manifestFingerprint !== f.manifestFingerprint) throw new Error("native_material_fixture_revision_changed");
    return {organizationId: f.organizationId, projectId: f.workId, sessionId: f.sessionId,
      materialRevisionId: f.revisionId, email: f.email, password: f.password, ...basis, stop};
  } catch (error) {await stop(); throw error;}
  finally {resume();}
}
