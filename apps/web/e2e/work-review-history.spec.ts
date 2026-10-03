import {randomBytes,randomUUID}from"node:crypto";
import {expect,test,type Page}from"@playwright/test";
import copy from"../messages/pt-BR.json";
import {workReviewDashboardSchema} from "../src/lib/advisor/work-review-dashboard";
import{asRegimeOwner,createRegimeWork,localReviewRegimeSql,signUpRegimeAccount,type ReviewRegimeFixture,type RegimeSql}from"./support/project-review-regime";
const literal=(value:string)=>`convert_from(decode('${Buffer.from(value).toString("hex")}','hex'),'UTF8')`;
function last(sql:RegimeSql,f:ReviewRegimeFixture,body:string){return sql(asRegimeOwner(f,body)).split("\n").at(-1)!;}
function author(sql:RegimeSql,f:ReviewRegimeFixture,template:string,text:string){
 const manifest={schemaVersion:"artifact-manifest.2026.09.26-v1",kind:"answer",audience:"internal",format:"json",bytes:null,method:null,execution:null,inputSnapshot:null,institutionalResult:null,sources:[],claims:[],traces:[],template:{templateVersionId:template,fingerprint:"1".repeat(64)},provenance:{producer:"synthetic-human-review-e2e",jobId:null,taskRunId:null,messageId:null,capability:null},legacy:null};
 // Explicitly source-free human explanation. No native receipt or model lineage.
 const blocks=[{blockKey:"explanation",kind:"paragraph",content:{text},claims:[]}];
 return JSON.parse(last(sql,f,`select public.create_artifact_revision_v1('${f.workId}','answer','work-review-ui','internal',${literal(JSON.stringify(manifest))}::jsonb,${literal(JSON.stringify(blocks))}::jsonb,'[]',null,null);`))as{artifact_id:string;revision_id:string;manifest_fingerprint:string;revision_no:number};
}
function schemaDiagnostic(parsed:ReturnType<typeof workReviewDashboardSchema.safeParse>){
 if(parsed.success)return 'PASS';
 const fields=new Set(['schemaVersion','workId','organizationId','viewerId','canReport','canManage','revisions','decisions','decisionsTruncated','nextDecisionCursor','assignments','nextCursor','revisionId','artifactId','kind','revisionNo','manifestFingerprint','withheld','pending','preparedBy','reviews','basisReviewId','change','canReaffirm','outcome','reasons','id','act','reviewerId','createdAt','note','canContest','decision','decisionKey','revision','fingerprint','origin','decidedBy','effects','precedence','state','fromUserId','eligible','userId','label']);
 return JSON.stringify(parsed.error.issues.slice(0,12).map(issue=>issue.path.map(part=>typeof part==='number'?'[]':typeof part==='string'&&fields.has(part)?part:'unknown-field').join('.')));
}
async function panel(page:Page,f:ReviewRegimeFixture){await page.goto(`/pt-BR/app/projects/${f.workId}?workspace=${f.organizationId}`);await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();const history=page.getByTestId("work-review-history");await expect(history).toBeVisible();return history;}

test("two real humans use exact review history, reaffirm, reassignment and closed reports",async({page,browser})=>{
 const sql=localReviewRegimeSql(),suffix=`${Date.now().toString(36)}${randomBytes(4).toString("hex")}`,ownerEmail=`e2e-regime-history-owner-${suffix}@example.com`,reviewerEmail=`e2e-regime-history-reviewer-${suffix}@example.com`;
 await signUpRegimeAccount(page,ownerEmail,`Offroad-review-owner-${suffix}!`);
 const f=createRegimeWork(sql,ownerEmail,suffix),secondContext=await browser.newContext();
 try{
  const secondPage=await secondContext.newPage();await signUpRegimeAccount(secondPage,reviewerEmail,`Offroad-review-second-${suffix}!`);
  const reviewer=sql(`select id from auth.users where email=${literal(reviewerEmail)};`);expect(reviewer).toMatch(/^[a-f0-9-]{36}$/);const second={...f,actorId:reviewer};
  const invitation=last(sql,f,`select public.invite_workspace_member_v1(${literal(reviewerEmail)},'member');`);expect(invitation).toMatch(/^[a-f0-9-]{36}$/);
  expect(last(sql,second,`select public.accept_workspace_invite_v1('${invitation}');`)).toBe(f.organizationId);
  last(sql,f,`select public.set_resource_policy_grant_v1('${f.workId}','${reviewer}',null,'work','allow');
   select public.set_capital_project_review_assignment_v1('${f.workId}','${f.actorId}','preparer',true);
   select public.set_capital_project_review_assignment_v1('${f.workId}','${f.actorId}','approver',true);
   select public.set_capital_project_review_assignment_v1('${f.workId}','${reviewer}','preparer',true);
   select public.set_capital_project_review_assignment_v1('${f.workId}','${reviewer}','approver',true);`);
  const r1=author(sql,f,'layout-1','Synthetic unchanged explanation');
  const approval=JSON.parse(last(sql,second,`select public.review_artifact_revision_v1('${r1.revision_id}','${r1.manifest_fingerprint}','approve',null,'Second human exact approval',false,'${randomUUID()}');`))as{reviewId:string};
  const r2=author(sql,f,'layout-2','Synthetic unchanged explanation');
  // Compare the same authenticated public SQL and HTTP contract before any UI selector.
  // Diagnostics contain codes and schema issue categories only, never bodies or credentials.
  const direct=workReviewDashboardSchema.safeParse(JSON.parse(last(sql,second,`select public.read_work_review_dashboard_v1('${f.workId}',null,null);`)));
  expect(direct.success, `authenticated SQL strict dashboard DTO paths=${schemaDiagnostic(direct)}`).toBe(true);
  const api=process.env.NEXT_PUBLIC_SUPABASE_URL!,publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(api).hostname))throw new Error('Review diagnostic requires disposable loopback API');
  const signed=await secondPage.request.post(`${api}/auth/v1/token?grant_type=password`,{headers:{apikey:publishableKey},data:{email:reviewerEmail,password:`Offroad-review-second-${suffix}!`}});
  expect(signed.status(),'real reviewer password Auth').toBe(200);
  const auth=await signed.json() as {access_token:string};
  const response=await secondPage.request.post(`${api}/rest/v1/rpc/read_work_review_dashboard_v1`,{headers:{apikey:publishableKey,authorization:`Bearer ${auth.access_token}`,'x-offroad-workspace':f.organizationId},data:{p_work_id:f.workId,p_before_id:null,p_before_decision_id:null}});
  const body:unknown=await response.json();
  const errorCode=body&&typeof body==='object'&&'code' in body&&['42501','42P01','42883','PGRST202','PGRST301'].includes(String(body.code))?String(body.code):'other';
  expect(response.status(),`public dashboard HTTP status; closed code=${errorCode}`).toBe(200);
  const received=workReviewDashboardSchema.safeParse(body);
  expect(received.success,`real public HTTP strict dashboard DTO paths=${schemaDiagnostic(received)}`).toBe(true);
  if(received.success){expect(received.data.workId).toBe(f.workId);expect(received.data.organizationId).toBe(f.organizationId);expect(received.data.viewerId).toBe(reviewer);}
  let history=await panel(secondPage,second);
  await expect(history).toContainText(copy.WorkReviewHistory.change.cosmetic);await expect(history).toContainText('Second human exact approval');
  await history.locator('textarea[name="review_history_reason"]').fill('Same evidence; layout only');
  await history.getByRole('button',{name:copy.WorkReviewHistory.reaffirm,exact:true}).click();
  // Server props refresh without reload must remove the now-completed pending act.
  await expect(history.getByRole('button',{name:copy.WorkReviewHistory.reaffirm,exact:true})).toHaveCount(0);
  await expect(history).toContainText('Same evidence; layout only');
  expect(sql(`select count(*)from public.artifact_reviews where revision_id='${r2.revision_id}'and act='reaffirm'and reviewer_id='${reviewer}'and basis_review_id='${approval.reviewId}';`)).toBe('1');
  const r3=author(sql,f,'layout-3','Synthetic materially changed explanation');history=await panel(page,f);
  await expect(history).toContainText(copy.WorkReviewHistory.change.material);await expect(history.getByRole('button',{name:copy.WorkReviewHistory.reaffirm,exact:true})).toHaveCount(0);
  const original=sql(`select row_to_json(r)::text from public.artifact_reviews r where id='${approval.reviewId}';`);
  await history.locator('textarea[name="review_history_reason"]').fill('Reassign the pending revision to its eligible reviewer');
  // Labels may be disambiguated by the role panel; select the actual eligible target.
  const select=history.locator(`select[name="review_reassign_recipient"]:has(option[value="${reviewer}"])`).first();
  await expect(select).toBeEnabled();await select.selectOption(reviewer);
  await expect(history).toContainText('Reassign the pending revision to its eligible reviewer');
  expect(sql(`select row_to_json(r)::text from public.artifact_reviews r where id='${approval.reviewId}';`)).toBe(original);
  expect(sql(`select count(*)from public.artifact_reviews where revision_id='${r3.revision_id}'and act='reassign'and prepared_by='${f.actorId}';`)).toBe('1');
  last(sql,second,`select public.review_artifact_revision_v1('${r3.revision_id}','${r3.manifest_fingerprint}','approve',null,'Fresh material approval by second human',false,'${randomUUID()}');`);
  await history.locator('textarea[name="review_history_reason"]').fill('Human report only; no external action');
  await history.locator('input[name="reported_decision_key"]').fill('Synthetic board choice');await history.locator('input[name="reported_decided_by"]').fill('Synthetic board');await history.locator('input[name="reported_forum"]').fill('Synthetic meeting');await history.locator('input[name="reported_date"]').fill('2026-10-02');
  await history.getByRole('button',{name:copy.WorkReviewHistory.saveReport,exact:true}).click();await expect(history).toContainText('Synthetic board choice');await expect(history).toContainText(copy.WorkReviewHistory.origin.reported);
  history=await panel(secondPage,second);await history.locator('textarea[name="review_history_reason"]').fill('Contest the report without choosing a winner');await history.getByRole('button',{name:copy.WorkReviewHistory.contest,exact:true}).click();await expect(history).toContainText(copy.WorkReviewHistory.precedence.contested);
  expect(sql(`select count(*)from public.work_decisions where organization_id='${f.organizationId}'and work_id='${f.workId}'and effects<>array['none']::text[];`)).toBe('0');
  expect(sql(`select count(*)from public.processing_jobs where work_id='${f.workId}';`)).toBe('0');
  last(sql,f,`select public.set_resource_policy_grant_v1('${f.workId}','${reviewer}',null,'work','deny');`);
  await secondPage.reload();await expect(secondPage.getByTestId('work-review-history')).toHaveCount(0);
  await test.info().attach('work-review-human-history',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 }finally{await secondContext.close();}
});
