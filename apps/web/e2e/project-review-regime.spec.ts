import {randomBytes} from "node:crypto";
import {expect, test, type Page, type Request} from "@playwright/test";
import messages from "../messages/pt-BR.json";
import {addReadOnlyMember, approveSyntheticAnswer, asRegimeOwner, createRegimeWork, localReviewRegimeSql, signUpRegimeAccount, type ReviewRegimeFixture} from "./support/project-review-regime";

const copy = messages.ProjectReviewRoles;
async function openReview(page: Page, f: ReviewRegimeFixture, suffix = "") {
  await page.goto(`/pt-BR/app/projects/${f.workId}${suffix}`);
  await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
  const panel = page.getByTestId("project-review-roles");
  await expect(panel).toBeVisible();
  return panel;
}

test("content review policy persists without intake, honors exact acts, and rejects a stale UI pair", async ({page, browser}) => {
  const sql = localReviewRegimeSql();
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const ownerEmail = `e2e-regime-owner-${id}@example.com`;
  await signUpRegimeAccount(page, ownerEmail, `Offroad-E2E-${id}!`);
  const f = createRegimeWork(sql, ownerEmail, id);
  expect(sql(`select count(*) from public.document_intake_sessions where capital_project_id='${f.workId}';`)).toBe("0");
  expect(sql(`select count(*) from public.processing_runs where work_id='${f.workId}';`)).toBe("0");
  // Both existing early returns reach the same standalone surface, even with ?view=work.
  let panel = await openReview(page, f);
  await expect(panel).toContainText(copy.contentTitle);
  await expect(panel).toHaveAttribute("data-regime", "open");
  panel = await openReview(page, f, "?view=work");
  await expect(panel).toHaveAttribute("data-regime", "open");
  const ownRow = panel.locator(`tr[data-user-id="${f.actorId}"]`);
  // These controlled fields update from refreshed server props after the action commits.
  await expect(ownRow.locator('input[value="approver"]')).not.toBeChecked();
  await ownRow.locator('input[value="approver"]').click();
  await expect(ownRow.locator('input[value="approver"]')).toBeChecked();
  await expect(panel.locator('select[name="project_self_approval"]')).toBeEnabled();
  await panel.locator('select[name="project_self_approval"]').selectOption("allowed");
  await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective", "true");
  await expect(panel.locator('select[name="project_assignment_required"]')).toBeEnabled();
  await panel.locator('select[name="project_assignment_required"]').selectOption("not_required");
  await expect(panel).toHaveAttribute("data-regime", "individual");
  await expect(panel.locator('input[name="organization_assignment_required"]')).toBeEnabled();
  await expect(panel.locator('input[name="organization_assignment_required"]')).not.toBeChecked();
  await panel.locator('input[name="organization_assignment_required"]').click();
  await expect(panel.locator('input[name="organization_assignment_required"]')).toBeChecked();
  await expect(panel.locator('select[name="project_assignment_required"]')).toBeEnabled();
  await panel.locator('select[name="project_assignment_required"]').selectOption("inherit");
  await expect(panel).toHaveAttribute("data-regime", "assigned");
  await expect(panel.locator('input[name="organization_self_approval"]')).toBeEnabled();
  await expect(panel.locator('input[name="organization_self_approval"]')).not.toBeChecked();
  await panel.locator('input[name="organization_self_approval"]').click();
  await expect(panel.locator('input[name="organization_self_approval"]')).toBeChecked();
  await expect(panel.locator('select[name="project_self_approval"]')).toBeEnabled();
  await panel.locator('select[name="project_self_approval"]').selectOption("inherit");
  await expect(panel.locator('select[name="project_self_approval"]')).toHaveValue("inherit");
  await expect(panel.locator('select[name="project_self_approval"]')).toBeEnabled();
  await page.reload();
  await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
  await expect(panel).toHaveAttribute("data-regime", "assigned");
  await expect(panel.locator('select[name="project_assignment_required"]')).toHaveValue("inherit");
  await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective", "true");
  const reviewId = approveSyntheticAnswer(sql, f);
  expect(JSON.parse(sql(`select json_build_object('required',policy_snapshot->'assignmentRequired','self',policy_snapshot->'selfApprovalAllowed',
    'declared',self_approval_declared,'prepared',prepared_by=reviewer_id,'mode',review_mode) from public.artifact_reviews where id='${reviewId}';`)))
    .toEqual({required: true, self: true, declared: true, prepared: true, mode: "assigned"});

  // Another committed request changes the inherited policy after this page was rendered.
  sql(asRegimeOwner(f, `select public.set_organization_review_policy_v1('${f.organizationId}',false);`));
  const fingerprint = () => sql(`select private.review_policy_projection_v2('${f.organizationId}','${f.workId}')->>'policy_fingerprint';`);
  const committed = fingerprint();
  const actions: Request[] = [];
  const observe = (request: Request) => {if (request.method() === "POST" && request.headers()["next-action"]) actions.push(request);};
  page.on("request", observe);
  try {
    await panel.locator('select[name="project_assignment_required"]').selectOption("not_required");
    await expect(panel.getByRole("alert")).toHaveText(copy.errors.policy_changed);
    await expect(panel.locator('select[name="project_assignment_required"]')).toHaveValue("inherit");
    await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective", "false");
    await expect(panel.locator('select[name="project_assignment_required"]')).toBeEnabled();
    expect(actions).toHaveLength(1);
    expect(fingerprint()).toBe(committed);
  } finally {page.off("request", observe);}
  await page.reload();
  await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
  await expect(panel.locator('select[name="project_assignment_required"]')).toHaveValue("inherit");
  await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective", "false");
  expect(sql(`select policy_snapshot->>'selfApprovalAllowed' from public.artifact_reviews where id='${reviewId}';`)).toBe("true");

  const memberContext = await browser.newContext();
  try {
    const reader = await memberContext.newPage();
    const readerEmail = `e2e-regime-reader-${id}@example.com`;
    await signUpRegimeAccount(reader, readerEmail, `Offroad-E2E-reader-${id}!`);
    addReadOnlyMember(sql, f, readerEmail);
    const readerPanel = await openReview(reader, f, `?workspace=${f.organizationId}`);
    await expect(readerPanel).toContainText(copy.contentReadOnly);
    await expect(readerPanel.locator('select[name="project_assignment_required"]')).toHaveCount(0);
    await expect(readerPanel.locator('input[name="review_role"]').first()).toBeDisabled();
    // A real RPC permission failure is a local failure injection, restored even after assertion failure.
    expect(sql("select has_function_privilege('authenticated','public.read_capital_project_review_context_v2(uuid)','execute');")).toBe("t");
    sql("revoke execute on function public.read_capital_project_review_context_v2(uuid) from authenticated;");
    try {
      await reader.reload();
      await reader.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
      await expect(reader.getByText(copy.unavailable, {exact: true})).toBeVisible();
      await expect(reader.getByTestId("project-review-roles")).toHaveCount(0);
    } finally {sql("grant execute on function public.read_capital_project_review_context_v2(uuid) to authenticated;");}
  } finally {await memberContext.close();}

  // Existing intake with no current run takes the conversational path rather than inventing a plan.
  sql(`insert into public.document_intake_sessions(organization_id,capital_project_id,started_by,journey,locale,project_name)
    values('${f.organizationId}','${f.workId}','${f.actorId}','company','pt-BR','Synthetic intake without a processing run');`);
  expect(sql(`select current_run_id is null from public.document_intake_sessions where capital_project_id='${f.workId}';`)).toBe("t");
  panel = await openReview(page, f);
  await expect(panel).toHaveAttribute("data-regime", "assigned");
  await expect(panel.locator('select[name="project_assignment_required"]')).toHaveValue("inherit");
  expect(sql(`select count(*) from public.processing_jobs where work_id='${f.workId}';`)).toBe("0");
  await test.info().attach("content-review-regime", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
});
