import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe,expect,it,vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import {parseInstitutionalSetupReviews} from "@/lib/advisor/institutional-setup-reviews";
import {setupReviewFixture} from "@/lib/advisor/institutional-setup-reviews.fixture";
import type {InstitutionalConfigurationReviewBasis} from "@/lib/advisor/institutional-configuration-review-command";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/[locale]/app/advisor-actions",()=>({reviewAdvisorInstitutionalConfiguration:vi.fn()}));
import {InstitutionalSetupReviewWork} from "./institutional-setup-review";
const context=setupReviewFixture();
const review=parseInstitutionalSetupReviews(context)[0];
const basis:InstitutionalConfigurationReviewBasis={workId:context.projectId,candidateId:review.candidateId,configurationFingerprint:review.configurationFingerprint,parentFingerprint:null,lineageFingerprint:"c".repeat(64),preparedBy:context.projectId,viewerId:"10000000-0000-4000-8000-000000000099",workAccess:true,policy:{assignmentRequired:false,selfApprovalAllowed:false,roles:[]},status:"review_required",sourceCount:2,nativeDecisionId:null,approvalEffective:false};
function render(reviewBasis?:InstitutionalConfigurationReviewBasis,legacyPermission=true){return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC"><InstitutionalSetupReviewWork projectId={context.projectId} reviews={[{...review,reviewBasis}]} reviewPermissions={{canApprove:legacyPermission}}/></NextIntlClientProvider>);}
describe("native setup review authority",()=>{
 it("does not accept legacy permission without the exact native basis",()=>{
  const html=render();expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);expect(html).not.toMatch(/<button type="button">/);
 });
 it("uses current native policy rather than the legacy permission projection",()=>{
  const html=render(basis,false);expect(html).not.toContain('disabled=""');
  const assigned=render({...basis,policy:{assignmentRequired:true,selfApprovalAllowed:false,roles:["reviewer"]}});
  expect(assigned).toContain(pt.InstitutionalSetupReview.roleRequired);
  expect(assigned).toMatch(/<button[^>]*disabled=""[^>]*>/);
  expect(assigned).toContain(`<button type="button">${pt.InstitutionalConfigurationReview.reject}`);
 });
 it("keeps permitted self approval unchecked and prevents an implicit declaration",()=>{
  const html=render({...basis,viewerId:basis.preparedBy,policy:{...basis.policy,selfApprovalAllowed:true}});
  expect(html).toContain('type="checkbox"');expect(html).not.toContain('checked=""');
  expect(html).toContain(pt.ArtifactRevisionReview.declaration);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
 });
});
