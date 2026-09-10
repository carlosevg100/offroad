import {execFileSync} from "node:child_process";
import {randomBytes, randomUUID} from "node:crypto";
import {join} from "node:path";
import {expect, test, type APIRequestContext} from "@playwright/test";
import {capitalProjectPlanSnapshot} from "../../../packages/work-plan/src/capital-jobs";
import {dataRoomFiles} from "./support/data-room";
import {waitForOneTimeCode} from "./support/mail";

// The financier analytical workspace end to end: a capital_provider organization starts its own
// analysis, accepts the workspace terms with an information-usage declaration, creates a project
// and a folder, answers a gap, continues in the same project and keeps the funds and mandates
// panel reachable. Origination, representation, disclosure and every isolation boundary are
// exercised through the product's own screens and through direct RPC calls.
//
// No paid model call is involved: the private entry job queues no initial turn, so the journey
// only needs the deterministic project shell the database creates.

const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const nullUuid = "00000000-0000-0000-0000-000000000000";

function setup(mode: "workspace" | "other_tenant" | "information_request" | "revoke", email: string, project = nullUuid) {
  const output = execFileSync("psql", [
    databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1",
    "-v", `mode=${mode}`, "-v", `email=${email}`, "-v", `project=${project}`,
    "-f", join(__dirname, "support", "financier-workspace-local.sql"),
  ], {encoding: "utf8"});
  const id = output.trim().split("\n").findLast((line) => /^[0-9a-f-]{36}$/.test(line.trim()))?.trim();
  expect(id, `financier setup ${mode} returned no id`).toBeTruthy();
  return id!;
}

async function accessToken(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {apikey: supabaseKey, "Content-Type": "application/json"},
    data: {email, password},
  });
  expect(response.ok(), `sign in failed for ${email}: ${await response.text()}`).toBeTruthy();
  return (await response.json()).access_token as string;
}

/** One direct RPC call, exactly as the product makes it, with or without an identity. */
async function rpc(request: APIRequestContext, name: string, body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = {apikey: supabaseKey, "Content-Type": "application/json"};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await request.post(`${supabaseUrl}/rest/v1/rpc/${name}`, {headers, data: body});
  const payload = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = payload ? JSON.parse(payload) as Record<string, unknown> : null;
  } catch {
    parsed = null;
  }
  return {status: response.status(), payload, code: typeof parsed?.code === "string" ? parsed.code : "", message: typeof parsed?.message === "string" ? parsed.message : ""};
}

async function rest(request: APIRequestContext, path: string, token: string) {
  const response = await request.get(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {apikey: supabaseKey, Authorization: `Bearer ${token}`},
  });
  expect(response.ok(), `read failed for ${path}: ${await response.text()}`).toBeTruthy();
  return await response.json() as Record<string, unknown>[];
}

/** Every refusal must be the database's, with the SQLSTATE the contract documents. */
async function expectRefusal(
  request: APIRequestContext,
  label: string,
  name: string,
  body: Record<string, unknown>,
  codes: string[],
  token?: string,
) {
  const result = await rpc(request, name, body, token);
  expect(codes, `${label} was not refused: ${result.status} ${result.payload}`).toContain(result.code);
  return result;
}

/**
 * Without an identity the call never reaches the function body: `anon` holds no execute
 * privilege on these commands, so the refusal arrives as a transport error. The database-level
 * refusal of the same calls (SQLSTATE 42501) is proven in
 * supabase/tests/financier_analytical_workspace.sql.
 */
async function expectAnonymousRefusal(request: APIRequestContext, label: string, name: string, body: Record<string, unknown>) {
  const result = await rpc(request, name, body);
  expect(result.status, `${label} was not refused: ${result.payload}`).toBeGreaterThanOrEqual(400);
  return result;
}

test("a financier analyses on its own, keeps its mandates and never gains representation", async ({page, request}) => {
  // Two accounts, a full browser journey and every negative in one transaction-free run.
  test.slow();
  for (const value of [databaseUrl, supabaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) {
      throw new Error("The financier workspace E2E requires local synthetic services.");
    }
  }
  expect(supabaseKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for the direct RPC checks").not.toBe("");

  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-financier-${id}@example.com`;
  const password = `Offroad-E2E-${id}!`;

  // 1. A real account, then the synthetic conversion into a financier workspace.
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA análise do financiador");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
  await page.locator('input[name="use_forms"][value="institutional_work"]').check();
  await page.locator('input[name="institution_name"]').fill("Gestora sintética de crédito");
  await page.locator('input[name="professional_roles"][value="banker"]').check();
  await page.locator('input[name="practice_areas"][value="dcm"]').check();
  await page.locator('input[name="primary_objectives"][value="prepare_meetings"]').check();
  await page.locator(".professional-context__actions .button:not(.button--ghost)").click();
  await expect(page.locator(".intake-start")).toBeVisible();
  const organizationId = setup("workspace", email);
  const token = await accessToken(request, email, password);

  // 2. Before the terms, private analysis is refused by the database, not by the interface.
  await expectRefusal(request, "private project before the workspace terms", "start_advisor_project_v1", {
    p_request_id: randomUUID(),
    p_locale: "pt-BR",
    p_project_name: "Revisão sem termos",
    p_entry_job: "review_existing_operation",
    p_prompt: "Revisar a proposta recebida antes de aceitar os termos.",
    p_access_basis: "authorized_private",
    p_plan: capitalProjectPlanSnapshot("review_existing_operation"),
  }, ["42501"], token);

  // 3. Onboarding offers own analysis without activating a mandate.
  await page.goto("/pt-BR/onboarding");
  const start = page.getByTestId("financier-start-analysis");
  await expect(start).toBeVisible();
  await expect(page.getByTestId("financier-register-mandates")).toBeVisible();
  await start.click();
  const terms = page.locator('.private-project-gate--terms[data-journey="capital_provider"]');
  await expect(terms).toBeVisible();
  await expect(terms).toContainText("sem representar a companhia analisada");
  await terms.locator('input[name="signatory_title"]').fill("Analista de crédito");
  await terms.locator('input[name="terms_agreed"]').check();
  await terms.locator('input[name="information_rights_declared"]').check();
  await terms.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/pt-BR\/app$/);

  // The acceptance records information usage, never authority to represent, and no mandate.
  const acceptances = await rest(request, `organization_legal_acceptances?select=authority_declared,information_rights_declared,information_rights_statement&organization_id=eq.${organizationId}`, token);
  expect(acceptances).toHaveLength(1);
  expect(acceptances[0]!.authority_declared).toBeNull();
  expect(acceptances[0]!.information_rights_declared).toBe(true);
  expect(String(acceptances[0]!.information_rights_statement)).toContain("sem representar a companhia analisada");
  expect(await rest(request, `funds?select=id&organization_id=eq.${organizationId}`, token)).toHaveLength(0);
  expect(await rest(request, `mandate_versions?select=id&organization_id=eq.${organizationId}`, token)).toHaveLength(0);

  // 4. The workspace home is the conversation; funds and mandates keep their own page.
  await expect(page.locator(".advisor-composer--start")).toBeVisible();
  await expect(page.getByTestId("mandates-panel")).toHaveCount(0);
  await expect(page.getByTestId("financier-terms-notice")).toHaveCount(0);
  await page.getByTestId("rail-mandates").click();
  await expect(page).toHaveURL(/\/pt-BR\/app\/mandates$/);
  await expect(page.getByTestId("mandates-panel")).toBeVisible();
  await page.goto("/pt-BR/app");

  // 5. The creation screens explain what is unavailable instead of offering a refused button.
  await page.goto("/pt-BR/app/new");
  await expect(page.getByTestId("financier-analysis-entry")).toBeVisible();
  await expect(page.locator(".private-project-gate--project")).toHaveCount(0);
  await expect(page.getByTestId("financier-unavailable-operations")).toContainText("Declaração de representação");
  await page.goto("/pt-BR/app/new/company-debt");
  await expect(page.getByTestId("financier-unavailable-entry")).toBeVisible();
  await page.goto("/pt-BR/app/new/origination");
  await expect(page.getByTestId("financier-unavailable-entry")).toBeVisible();

  // 6. The conversation creates the project. A private review queues no model work.
  await page.goto("/pt-BR/app");
  const requestText = "Revisar a proposta recebida da companhia antes do comitê de crédito.";
  const composer = page.locator(".advisor-composer--start");
  await composer.locator("textarea").fill(requestText);
  // The document the organization is authorized to analyse travels with the request, through
  // the product's own upload path; that is the only moment a conversational session collects files.
  await composer.locator('input[type="file"]').setInputFiles(dataRoomFiles.slice(0, 1));
  await expect(composer.locator(".advisor-composer__files > span")).toHaveCount(1);
  await composer.locator(".advisor-composer__send").click();
  await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
  const projectPath = new URL(page.url()).pathname;
  const projectId = projectPath.split("/").pop()!;
  await expect(page.locator(".advisor-thread")).toContainText(requestText);

  const sessions = await rest(request, `document_intake_sessions?select=id,journey,privacy_status,representation_kind,representation_status&capital_project_id=eq.${projectId}`, token);
  expect(sessions).toHaveLength(1);
  const sessionId = String(sessions[0]!.id);
  expect(sessions[0]!.journey).toBe("capital_provider");
  expect(sessions[0]!.privacy_status).toBe("private");
  expect(sessions[0]!.representation_kind).toBeNull();
  expect(sessions[0]!.representation_status).toBe("not_claimed");
  expect(await rest(request, `project_representation_evidence?select=id&intake_session_id=eq.${sessionId}`, token)).toHaveLength(0);

  // 6b. The attached document was registered in the organization's own tenant path, and the
  // private reading of the financier's session reaches the same understanding block as any
  // other private project: no representation was needed to read what it is allowed to read.
  const documents = await rest(request, `source_documents?select=id,organization_id,object_path&intake_session_id=eq.${sessionId}`, token);
  expect(documents).toHaveLength(1);
  expect(documents[0]!.organization_id).toBe(organizationId);
  expect(String(documents[0]!.object_path).startsWith(`${organizationId}/${sessionId}/`)).toBe(true);
  await expect(page.locator(".advisor-private-work__understanding")).toBeVisible({timeout: 120_000});

  // 7. A folder from the product's own rail: creation was blocked for financiers before.
  await page.goto("/pt-BR/app");
  await page.locator(".app-rail__label--action button").click();
  await page.locator('.app-rail__create input[name="group_name"]').fill(`Comitê ${id}`);
  await page.locator('.app-rail__create button[type="submit"]').click();
  await expect(page.locator(".app-rail__folder").filter({hasText: `Comitê ${id}`})).toBeVisible();
  // The project is in the navigation of the same workspace, reachable without the composer.
  await expect(page.locator(`.app-rail__scroll a[href="${projectPath}"]`)).toBeVisible();

  // 8. A gap is answered in the project, and a stale answer is refused.
  const requestId = setup("information_request", email, projectId);
  const requests = await rest(request, `capital_project_information_requests?select=id,updated_at,status&id=eq.${requestId}`, token);
  expect(requests).toHaveLength(1);
  const staleAnswer = {
    p_project_id: projectId,
    p_request_id: requestId,
    p_expected_updated_at: "2020-01-01T00:00:00+00:00",
    p_message_id: randomUUID(),
    p_locale: "pt-BR",
    p_answer_source: "custom",
    p_content: "Resposta enviada sobre uma versão antiga da pergunta.",
  };
  await expectRefusal(request, "stale answer after the request changed", "submit_advisor_information_response_v1", staleAnswer, ["40001"], token);
  const answered = await rpc(request, "submit_advisor_information_response_v1", {
    ...staleAnswer,
    p_expected_updated_at: requests[0]!.updated_at,
    p_message_id: randomUUID(),
    p_content: "O comitê é na próxima quinta-feira.",
  }, token);
  expect(answered.status, answered.payload).toBe(200);
  const afterAnswer = await rest(request, `capital_project_information_requests?select=status&id=eq.${requestId}`, token);
  expect(afterAnswer[0]!.status).toBe("answered");

  // 9. Continuity: the project, its conversation and its answer survive a reload.
  await page.goto(projectPath);
  await expect(page.locator(".advisor-thread")).toContainText(requestText);
  await page.reload();
  await expect(page.locator(".advisor-thread")).toContainText(requestText);
  expect(new URL(page.url()).pathname).toBe(projectPath);

  // 10. Origination, representation and disclosure stay closed for this workspace.
  await expectRefusal(request, "origination thesis", "start_advisor_project_v1", {
    p_request_id: randomUUID(), p_locale: "pt-BR", p_project_name: "Tese de originação",
    p_entry_job: "origination_thesis", p_prompt: "Preparar a reunião de originação com a companhia.",
    p_access_basis: "public_information", p_plan: capitalProjectPlanSnapshot("origination_thesis"),
  }, ["42501"], token);
  await expectRefusal(request, "representation-declared project", "start_workspace_capital_project_v2", {
    p_locale: "pt-BR", p_project_name: "Captação declarada", p_identity_policy: "identified_restricted",
    p_representation_declared: true, p_entry_job: "capital_planning", p_plan: capitalProjectPlanSnapshot("capital_planning"),
  }, ["42501"], token);
  await expectRefusal(request, "public company debt entry", "start_public_onboarding_capital_project", {
    p_locale: "pt-BR", p_project_name: "Companhia pública", p_entry_job: "company_debt_view",
    p_company_name: "Companhia Alvo", p_company_website: "https://alvo.example",
  }, ["42501"], token);
  await expectRefusal(request, "capital need declared for the company", "record_intake_capital_need_command", {
    p_organization_id: organizationId, p_session_id: sessionId, p_event_id: randomUUID(),
    p_use_of_proceeds: "working_capital",
  }, ["42501"], token);
  await expectRefusal(request, "opportunity confirmation", "confirm_document_intake", {
    p_organization_id: organizationId, p_session_id: sessionId, p_output_locale: "pt-BR",
  }, ["42501"], token);
  await expectRefusal(request, "qualified introduction", "prepare_qualified_introduction_plan", {
    p_organization_id: organizationId, p_session_id: sessionId, p_match_screen_fingerprint: "c".repeat(64),
  }, ["42501"], token);

  // 11. An organization switch inside the command is refused by the access guard before any
  // status or path check. Tampered file paths are refused by the same command after the
  // collecting check, so they are proven on a collecting session in
  // supabase/tests/financier_analytical_workspace.sql rather than here, where the worker may
  // already have moved the session on.
  const documentArgs = (organization: string, path: string) => ({
    p_organization_id: organization, p_session_id: sessionId, p_event_id: randomUUID(),
    p_document_id: randomUUID(), p_bucket_id: "opportunity-documents", p_object_path: path,
    p_original_name: "proposta.pdf", p_mime_type: "application/pdf", p_byte_size: 4096,
    p_sha256: "d".repeat(64),
  });
  await expectRefusal(request, "organization switch on document registration", "register_intake_document_command",
    documentArgs(nullUuid, `${nullUuid}/${sessionId}/switch.pdf`), ["42501"], token);

  // 12. Another financier tenant reads nothing and commands nothing here.
  const otherEmail = `e2e-financier-other-${id}@example.com`;
  const otherPassword = `Offroad-E2E-other-${id}!`;
  const signUp = await request.post(`${supabaseUrl}/auth/v1/signup`, {
    headers: {apikey: supabaseKey, "Content-Type": "application/json"},
    data: {email: otherEmail, password: otherPassword},
  });
  expect(signUp.ok(), await signUp.text()).toBeTruthy();
  const otherOrganizationId = setup("other_tenant", otherEmail);
  const otherToken = await accessToken(request, otherEmail, otherPassword);
  expect(await rest(request, `document_intake_sessions?select=id&id=eq.${sessionId}`, otherToken)).toHaveLength(0);
  expect(await rest(request, `capital_projects?select=id&id=eq.${projectId}`, otherToken)).toHaveLength(0);
  expect(await rest(request, `workspace_project_groups?select=id&organization_id=eq.${organizationId}`, otherToken)).toHaveLength(0);
  await expectRefusal(request, "other tenant registering into the financier session", "register_intake_document_command",
    documentArgs(organizationId, `${organizationId}/${sessionId}/other.pdf`), ["42501"], otherToken);
  await expectRefusal(request, "other tenant renaming the financier project", "manage_workspace_project", {
    p_session_id: sessionId, p_action: "rename", p_project_name: "Sequestro",
  }, ["P0002"], otherToken);
  await expectRefusal(request, "other tenant answering the financier gap", "submit_advisor_information_response_v1", {
    ...staleAnswer, p_message_id: randomUUID(), p_expected_updated_at: requests[0]!.updated_at,
  }, ["P0002"], otherToken);
  expect(otherOrganizationId).not.toBe(organizationId);

  // 13. No identity at all.
  await expectAnonymousRefusal(request, "anonymous bootstrap", "get_workspace_bootstrap", {});
  await expectAnonymousRefusal(request, "anonymous project creation", "start_advisor_project_v1", {
    p_request_id: randomUUID(), p_locale: "pt-BR", p_project_name: "Anônimo",
    p_entry_job: "capital_planning", p_prompt: "Sem identidade.", p_access_basis: "public_information",
    p_plan: capitalProjectPlanSnapshot("capital_planning"),
  });

  // 14. A revoked membership loses the workspace, its reads and its commands.
  setup("revoke", email);
  const revokedToken = await accessToken(request, email, password);
  await expectRefusal(request, "revoked member bootstrap", "get_workspace_bootstrap", {}, ["P0002"], revokedToken);
  expect(await rest(request, `document_intake_sessions?select=id&id=eq.${sessionId}`, revokedToken)).toHaveLength(0);
  await expectRefusal(request, "revoked member document registration", "register_intake_document_command",
    documentArgs(organizationId, `${organizationId}/${sessionId}/revoked.pdf`), ["42501"], revokedToken);
  await page.goto("/pt-BR/app");
  await expect(page.locator(".advisor-composer--start")).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/pt-BR\/app$/);
});
