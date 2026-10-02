import {spawn, execFileSync} from "node:child_process";
import {existsSync, readFileSync, statSync, unlinkSync} from "node:fs";
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
  const root = join(__dirname, "../../.."), file = `${process.platform === "darwin" ? "/private/tmp" : "/tmp"}/offroad-material-ui-${randomUUID()}.json`;
  const child = spawn(process.execPath, [join(root, "scripts/ci/test-material-production-native-sdk.mjs")], {
    cwd: root, env: {...process.env, DATABASE_URL: db, OFFROAD_E2E_API_URL: api,
      OFFROAD_E2E_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      MATERIAL_UI_FIXTURE: "1", MATERIAL_UI_FIXTURE_OUTPUT: file}, stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false; child.once("exit", () => {exited = true;});
  // Keep secret credentials in the local 0600 fixture file, never in test logs.
  child.stdout?.resume(); child.stderr?.resume();
  const sql = (query: string) => execFileSync("psql", [db, "-XqAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  try {
    await expect.poll(() => existsSync(file) ? "ready" : exited ? "failed" : "running", {timeout: 120000}).toBe("ready");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const f = z.object({schemaVersion: z.literal("material-native-ui-fixture.v1"), organizationId: z.uuid(), workId: z.uuid(),
      sessionId: z.uuid(), revisionId: z.uuid(), approved: z.literal(false), physical: z.boolean().optional(),
      email: z.email(), password: z.string().min(20)}).parse(JSON.parse(readFileSync(file, "utf8")));
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
    if (existsSync(file)) unlinkSync(file);
  }
});
