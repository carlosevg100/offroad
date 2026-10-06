import {randomBytes, randomUUID} from "node:crypto";
import {expect, test} from "@playwright/test";
import {asRegimeOwner, createRegimeWork, localReviewRegimeSql, signUpRegimeAccount} from "./support/project-review-regime";

/** Runs against the disposable local stack: real cookie, server reads and committed policy. */
test("a signed-in creator loses the work immediately after an explicit read denial", async ({page}) => {
  const sql=localReviewRegimeSql(), suffix=`${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email=`e2e-regime-revocation-${suffix}@example.com`;
  await signUpRegimeAccount(page,email,`Offroad-revocation-${suffix}!`);
  const f=createRegimeWork(sql,email,suffix), route=`/pt-BR/app/projects/${f.workId}?workspace=${f.organizationId}`;
  await page.goto(route);
  await expect(page.locator(".advisor-work-surface").first()).toBeAttached();
  sql(asRegimeOwner(f,`select public.set_resource_policy_grant_v1('${f.workId}','${f.actorId}',null,'read','deny');`));
  const response=await page.request.get(route);
  // Next.js streams notFound() with HTTP 200 once the layout has flushed. Prove
  // denial by absence of the private title in the complete response and of its UI.
  expect([200,403,404]).toContain(response.status());
  expect(await response.text()).not.toContain(`Synthetic content review ${suffix}`);
  await page.goto(route);
  await expect(page.locator(".advisor-work-surface")).toHaveCount(0);
  expect(sql(`select count(*) from private.revocation_runs where organization_id='${f.organizationId}';`)).not.toBe("0");
});

test("expiry denies the same cookie while a legal hold preserves the work", async ({page}) => {
  const sql=localReviewRegimeSql(), suffix=`${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email=`e2e-regime-expiry-${suffix}@example.com`;
  await signUpRegimeAccount(page,email,`Offroad-expiry-${suffix}!`);
  const f=createRegimeWork(sql,email,suffix), route=`/pt-BR/app/projects/${f.workId}?workspace=${f.organizationId}`;
  await page.goto(route);await expect(page.locator(".advisor-work-surface").first()).toBeAttached();
  sql(asRegimeOwner(f,`select public.place_legal_hold_v1('${f.workId}','${randomUUID()}');`));
  // An expired revision is injected only in the disposable local DB; no clock sleeps or remote data.
  sql(`insert into private.retention_rules(organization_id,resource_id,revision,mode,expires_at,basis_reference,created_by)values('${f.organizationId}','${f.workId}',1,'expire',clock_timestamp()-interval '1 second','${randomUUID()}','${f.actorId}');`);
  const response=await page.request.get(route);expect([200,403,404]).toContain(response.status());
  expect(await response.text()).not.toContain(`Synthetic content review ${suffix}`);
  await page.goto(route);await expect(page.locator(".advisor-work-surface")).toHaveCount(0);
  expect(sql(`select count(*)from public.capital_projects where id='${f.workId}';`)).toBe("1");
  expect(sql(`select private.resource_legal_hold_v1('${f.organizationId}','${f.workId}');`)).toBe("t");
});
