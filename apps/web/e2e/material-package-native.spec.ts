import {spawn, execFileSync} from "node:child_process";
import {constants, existsSync, readFileSync, openSync, fstatSync, closeSync, mkdirSync, rmSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {z} from "zod";
import {expect, test} from "@playwright/test";
import messages from "../messages/pt-BR.json";

test("native internal material approval and revocation use the same exact basis on project and opportunity", async ({page}) => {
  const db = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  for (const address of [db, api, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"])
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(address).hostname)) throw new Error("Synthetic material proof requires local services");
  const root = join(__dirname, "../../..");
  const namespace = randomUUID();
  const directory = `${process.platform === "darwin" ? "/private/tmp" : "/tmp"}/offroad-material-ui-${namespace}`;
  mkdirSync(directory, {mode: 0o700});
  const file = join(directory, "fixture.json");
  const child = spawn(process.execPath, [join(root, "scripts/ci/test-material-production-native-sdk.mjs")], {
    cwd: root, env: {...process.env, DATABASE_URL: db, OFFROAD_E2E_API_URL: api,
      OFFROAD_E2E_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      MATERIAL_UI_FIXTURE: "1", MATERIAL_UI_NAMESPACE: namespace, MATERIAL_UI_FIXTURE_OUTPUT: file}, stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false;
  let failure = "material_fixture_child_exited";
  child.once("close", () => {exited = true;});
  // Accept only closed diagnostic fields. Never retain raw output: it may contain
  // credentials from the 0600 fixture or request bodies from a failed assertion.
  const collect = () => {
    let pending = "";
    return (chunk: Buffer) => {
      pending = (pending + chunk.toString("utf8")).slice(-4096);
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "material_sdk_launcher_failed") {failure = line; continue;}
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (value.eval !== "material_native_sdk_http" || value.result !== "FAIL") continue;
          const closedLiteral = new Set(['capital_body_proof_conflict', 'capital_body_proof_invalid', 'capital_body_retention_denied', 'capital_body_upload_expired', 'capital_capture_denied', 'capital_capture_retry', 'capital_material_bundle_incomplete', 'capital_material_canonical_bytes_changed', 'capital_material_canonical_product_changed', 'capital_material_capture_denied', 'capital_material_capture_receipt_invalid', 'capital_material_commit_binding_changed', 'capital_material_compiler_report_denied', 'capital_material_context_retention_changed', 'capital_material_inputs_changed', 'capital_material_native_port_required', 'capital_material_output_kind_changed', 'capital_material_output_retention_changed', 'capital_material_physical_bytes_changed', 'capital_material_physical_commit_changed', 'capital_material_physical_read_denied', 'capital_material_physical_receipt_required', 'capital_material_physical_scope_changed', 'capital_material_physical_transport_required', 'capital_material_physical_version_changed', 'capital_material_prepare_receipt_invalid', 'capital_material_producer_already_started', 'capital_material_receipt_missing', 'capital_material_recovery_job_denied', 'capital_material_recovery_scope_changed', 'capital_material_research_already_sealed', 'capital_material_research_invalid', 'capital_material_retention_extended', 'capital_material_scope_denied', 'capital_material_seal_changed', 'capital_material_source_seal_changed', 'capital_material_source_seal_required', 'capital_material_storage_authority_denied', 'capital_material_storage_scope_changed', 'capital_material_storage_scope_denied', 'capital_material_terminal_binding_changed', 'capital_material_upload_denied', 'capital_material_upload_scope_changed', 'material_external_gate_state_invalid', 'material_plan_approval_basis_changed', 'material_plan_approval_conflict', 'material_plan_approval_denied', 'material_plan_approval_effect_unproven', 'material_plan_changed', 'material_plan_current_proposal_required', 'material_plan_read_denied', 'material_plan_replay_changed', 'material_plan_request_required', 'material_plan_retry', 'material_plan_source_denied', 'material_plan_source_unproven', 'material_plan_structure_required', 'material_production_body_conflict', 'material_production_body_denied', 'material_production_body_size_denied', 'material_production_context_changed', 'material_production_context_conflict', 'material_production_context_denied', 'material_production_context_unprepared', 'material_production_inputs_denied', 'material_production_inputs_not_sealed', 'material_production_job_denied', 'material_production_package_not_ready', 'material_production_report_invalid', 'material_production_retention_denied', 'material_production_retry', 'material_production_terminal_closed']);
          const closedPorts = new Set(['capture','retain','sealContext','sealSources','revalidate','prepareOutput','commit','recordTerminal','recover','read']);
          const safe = (field: unknown) => typeof field === "string" && /^[a-zA-Z0-9_]{1,80}$/.test(field) ? field : "unknown";
          const status = Number.isInteger(value.httpStatus) && Number(value.httpStatus) >= 100 && Number(value.httpStatus) <= 599 ? value.httpStatus : "unknown";
          const count = value.claimedCount === 0 || value.claimedCount === 1 ? value.claimedCount : "unknown";
          failure = `material_fixture_failed phase=${safe(value.phase)} code=${safe(value.code)} portName=${typeof value.portName==="string"&&closedPorts.has(value.portName)?value.portName:"unknown"} failureLiteral=${typeof value.failureLiteral==="string"&&closedLiteral.has(value.failureLiteral)?value.failureLiteral:"unknown"} zodCode=${safe(value.zodCode)} zodPath=${typeof value.zodPath==="string"&&/^(?:root|redacted|schemaVersion|state|recipeId|jobId|authorizedJobId|organizationId|workId|productionPlanId|productionPlanVersion|productionPlanFingerprint|inputFingerprint|contextFingerprint|sourceClosureFingerprint|calculationVersion|rendererVersion|context|allocationId|retainedPayloadId|kind|payloadFingerprint|byteLength|bucket|path|storageObjectId|storageVersion|expiresAt|purgeAt|sourceFingerprint|deliveryIds|researchStatus|reportRetainedPayloadId|stateRetainedPayloadId|packageRetainedPayloadId|bundleFingerprint|materialObjectId|revisionId|replayed|outputs|commit|report|caseState|terminal|reason|reportStatus|calculationReport|materialPackage|[0-9]{1,3})(?:\.(?:redacted|schemaVersion|state|recipeId|context|allocationId|retainedPayloadId|kind|payloadFingerprint|byteLength|bucket|path|storageObjectId|storageVersion|expiresAt|purgeAt|[0-9]{1,3})){0,11}$/.test(value.zodPath)?value.zodPath:"redacted"} rpc=${safe(value.rpc)} rpcCode=${safe(value.rpcCode)} sqlstate=${safe(value.sqlstate)} httpStatus=${status} claimedCount=${count} metadataRows=${Number.isInteger(value.metadataRows)&&Number(value.metadataRows)>=0&&Number(value.metadataRows)<=100?value.metadataRows:"unknown"} projectionVisible=${value.projectionVisible===true?"true":value.projectionVisible===false?"false":"unknown"} inputCurrent=${value.inputCurrent===true?"true":value.inputCurrent===false?"false":"unknown"} sourcesCurrent=${value.sourcesCurrent===true?"true":value.sourcesCurrent===false?"false":"unknown"} precursorCurrent=${value.precursorCurrent===true?"true":value.precursorCurrent===false?"false":"unknown"} physicalCount=${Number.isInteger(value.physicalCount)&&Number(value.physicalCount)>=0&&Number(value.physicalCount)<=3?value.physicalCount:"unknown"}`;
        } catch { /* Non-protocol output is deliberately discarded. */ }
      }
    };
  };
  child.stdout?.on("data", collect()); child.stderr?.on("data", collect());
  const sql = (query: string) => execFileSync("psql", [db, "-XqAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  try {
    await expect.poll(() => {
      if (existsSync(file)) return "ready";
      if (exited) throw new Error(failure);
      return "running";
    }, {timeout: 120000}).toBe("ready");
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let fixture: unknown;
    try {
      const metadata = fstatSync(fd);
      expect(metadata.isFile()).toBe(true);
      expect(metadata.mode & 0o777).toBe(0o600);
      expect(metadata.uid).toBe(process.getuid?.());
      expect(metadata.size).toBeLessThanOrEqual(16_384);
      fixture = JSON.parse(readFileSync(fd, "utf8"));
    } finally {closeSync(fd);}
    const f = z.object({schemaVersion: z.literal("material-native-ui-fixture.v1"), organizationId: z.uuid(), workId: z.uuid(),
      sessionId: z.uuid(), revisionId: z.uuid(), approved: z.literal(false), physical: z.boolean().optional(),
      email: z.email(), password: z.string().min(20)}).parse(fixture);
    // Historical customer onboarding is explicit fixture setup. The prospective
    // package, capture, Storage objects and approvals are produced by real APIs.
    sql(`insert into public.onboarding_progress(organization_id,user_id,journey,current_step,completed_at)
      select organization_id,user_id,'company','complete',clock_timestamp() from public.organization_memberships
      where organization_id='${f.organizationId}' and role='owner' and status='active'
      on conflict(organization_id,user_id,journey) do update set completed_at=excluded.completed_at,current_step='complete';`);
    const opportunityId = z.uuid().parse(sql(`select opportunity_id from public.document_intake_sessions where id='${f.sessionId}';`));
    await page.goto("/pt-BR/login");
    await page.locator('input[name="email"]').fill(f.email);
    await page.locator('input[name="password"]').fill(f.password);
    await page.locator("form.auth-form button[type=submit]").click();
    await expect(page).toHaveURL(/\/pt-BR\/(?:app|workspaces|onboarding)(?:\?|$)/);
    await page.goto("/pt-BR/workspaces");
    await page.getByRole("link", {name: "Route Tenant A", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/pt-BR/app\\?workspace=${f.organizationId}$`));
    await page.goto(`/pt-BR/app/projects/${f.workId}`);
    const review = page.getByTestId("material-package-native-review");
    await expect(review).toBeVisible();
    const declaration = review.getByRole("checkbox", {name: messages.ArtifactRevisionReview.declaration, exact: true});
    const approve = review.getByRole("button", {name: messages.ArtifactRevisionReview.approve, exact: true});
    await expect(declaration).not.toBeChecked(); await expect(approve).toBeDisabled();
    await declaration.check(); await approve.click();
    await expect(review).toContainText(messages.MaterialPackageReview.approved);
    expect(sql(`select count(*) from private.material_package_review_projections where organization_id='${f.organizationId}';`)).toBe("1");
    expect(sql(`select count(*) from public.deal_state_objects where organization_id='${f.organizationId}' and object_type='release_authorization';`)).toBe("0");
    await page.reload(); await expect(review).toContainText(messages.MaterialPackageReview.approved);
    await page.goto(`/pt-BR/app/opportunities/${opportunityId}`);
    await expect(review).toBeVisible(); await expect(review).toContainText(messages.MaterialPackageReview.approved);
    await review.getByRole("button", {name: messages.ArtifactRevisionReview.revoke, exact: true}).click();
    await expect(review).toContainText(messages.MaterialPackageReview.scope);
    await expect(review.getByRole("button", {name: messages.ArtifactRevisionReview.revoke, exact: true})).toHaveCount(0);
    expect(sql(`select count(*) from private.material_package_review_projections where organization_id='${f.organizationId}';`)).toBe("2");
    expect(sql(`select count(*) from public.processing_jobs where organization_id='${f.organizationId}' and payload->>'incremental_trigger'='material_package_approved' and kind='case_analysis' and status<>'cancelled';`)).toBe("0");
    expect(sql(`select count(*) from public.qualified_introductions where organization_id='${f.organizationId}';`)).toBe("0");
  } finally {
    if (!exited) {child.kill("SIGTERM"); await new Promise<void>(resolve => {const timer = setTimeout(resolve, 5000); child.once("exit", () => {clearTimeout(timer); resolve();});});}
    if (!exited) child.kill("SIGKILL");
    rmSync(directory, {recursive: true, force: true});
  }
});
