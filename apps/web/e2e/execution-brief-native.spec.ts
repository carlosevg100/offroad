import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {expect, test} from "@playwright/test";
import messages from "../messages/pt-BR.json";

// Actual compiler/capture/v7 create the brief. This isolated local fixture stops
// before human approval; the browser performs that act through the product.
test("native execution brief binds an explicit human declaration and survives reload", async ({page}) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  for (const value of [databaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"])
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Native brief UI proof requires local synthetic services");
  const root = join(__dirname, "../../..");
  execFileSync("python3", ["-B", join(root, "scripts/ci/test-execution-brief-native-agent.py")], {
    cwd: root, env: {...process.env, DATABASE_URL: databaseUrl, BRIEF_UI_FIXTURE: "1"}, encoding: "utf8",
  });
  const sql = (query: string) => execFileSync("psql", [databaseUrl, "-XqAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  const org = "a8800000-0000-4000-8000-000000000002";
  const workId = sql(`select work_id from private.execution_brief_native_bindings where organization_id='${org}';`);
  expect(workId).toMatch(/^[0-9a-f-]{36}$/);
  expect(sql(`select count(*) from public.capital_project_execution_brief_dispatches where organization_id='${org}' and approved_brief_fingerprint is not null;`)).toBe("0");
  await page.goto("/pt-BR/login");
  await page.locator('input[name="email"]').fill("native-agent@example.invalid");
  await page.locator('input[name="password"]').fill("brief-isolated-local-ui-password");
  await page.locator("form.auth-form button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
  await page.goto(`/pt-BR/app/projects/${workId}`);
  const brief = page.getByTestId("execution-brief");
  await expect(brief).toBeVisible();
  const declare = brief.getByRole("checkbox", {name: messages.ArtifactRevisionReview.declaration, exact: true});
  const approve = brief.getByRole("button", {name: /Autorizar|Aprovar/});
  await expect(declare).not.toBeChecked();
  await expect(approve).toBeDisabled();
  await declare.check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(brief).toContainText(messages.ExecutionBriefCard.approval.approved.title);
  expect(sql(`select count(*) from public.capital_project_execution_brief_dispatches where organization_id='${org}' and approved_brief_fingerprint is not null;`)).toBe("1");
  expect(sql(`select count(*) from private.execution_brief_review_projections where organization_id='${org}';`)).toBe("1");
  expect(sql(`select count(*) from private.execution_brief_producer_completions where organization_id='${org}';`)).toBe("1");
  await page.reload();
  await expect(brief).toContainText(messages.ExecutionBriefCard.approval.approved.title);
  await expect(brief.getByRole("checkbox")).toHaveCount(0);
});
