import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe,it,expect,vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {InstitutionalSetupForm} from "./institutional-setup-form";
import {InstitutionalSetupReviewWork} from "./institutional-setup-review";
import {parseInstitutionalSetupReviews} from "@/lib/advisor/institutional-setup-reviews";
import {setupReviewFixture} from "@/lib/advisor/institutional-setup-reviews.fixture";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/[locale]/app/institutional-setup-actions",()=>({submitInstitutionalSetup:vi.fn()}));
vi.mock("@/app/[locale]/app/advisor-actions",()=>({reviewAdvisorInstitutionalConfiguration:vi.fn()}));
const seededState = vi.hoisted(() => ({values: [] as unknown[]}));
vi.mock("react", async importOriginal => {
 const actual = await importOriginal<typeof import("react")>();
 return {...actual, useState: (initial: unknown) => actual.useState(seededState.values.length ? seededState.values.shift() : initial)};
});
describe("institutional guided setup",()=>{
 it("selects a debt-only document by UUID and derives dates from its required review",()=>{
  const context=setupReviewFixture();
  const source=context.currentSources[0]!;
  source.sourceDocument="11111111-1111-4111-8111-111111111111";
  context.candidates=[{id:context.projectId,label:"Revenue",field_path:"revenue",normalized_value:"100",value_type:"number",source_document_id:"another-document",period_start:"2026-01-01",period_end:"2026-12-31",entity_name:"Synthetic",entity_scope:"consolidated",source_anchor:{page:1},anchor_verified:true,review_state:"accepted",currency:"BRL",unit:"currency",value_scale:1,extraction_document_version:"1",extraction_source_sha256:source.hash}];
  seededState.values=["2026","1",{}, {"debt.0.2027.indexationSource":source.sourceDocument,"debt.0.2027.couponSource":source.sourceDocument},{[source.sourceDocument]:"2026-12-31"},"none","present",1,1,null];
  const html=renderToStaticMarkup(<NextIntlClientProvider locale="en-US" messages={en} timeZone="UTC"><InstitutionalSetupForm context={context}/></NextIntlClientProvider>);
  expect(html).toContain(`name="source.${source.sourceDocument}.date"`);
  expect(html).toContain(`name="source.${source.sourceDocument}.rationale"`);
  expect(html).toContain(`<option value="${source.sourceDocument}" selected="">${source.originalName}</option>`);
  for(const rate of ["indexation","coupon"]) {
   expect(html).toContain(`<select name="debt.0.2027.${rate}Source" required="">`);
   expect(html).toContain(`readOnly="" name="debt.0.2027.${rate}Date" value="2026-12-31"`);
  }
 });
 it.each(["pt-BR","en-US"] as const)("renders no-data boundary and full review in %s",locale=>{
  const context=setupReviewFixture(),messages=locale==="pt-BR"?pt:en;
  const html=renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><InstitutionalSetupForm context={context}/><InstitutionalSetupReviewWork projectId={context.projectId} reviews={parseInstitutionalSetupReviews(context)}/></NextIntlClientProvider>);
  expect(html).toContain(messages.InstitutionalSetup.noFacts);expect(html).toContain(messages.InstitutionalSetupReview.approve);expect(html).toContain("Synthetic accounts");expect(html).toContain(messages.InstitutionalSetupReview.checkBoundary);expect(html).not.toContain(context.sourceManifestFingerprint);expect(html).not.toContain('"assumptionBook"');
 });
 it("requires choosing historical facts and never prefills zeros or absence",()=>{
  const context=setupReviewFixture();context.candidates=[{id:context.projectId,label:"Synthetic revenue",field_path:"revenue",normalized_value:"123000",value_type:"number",source_document_id:context.currentSources[0].sourceDocument,period_start:"2026-01-01",period_end:"2026-12-31",entity_name:"Synthetic",entity_scope:"consolidated",source_anchor:{page:1},anchor_verified:true,review_state:"accepted",currency:"BRL",unit:"currency",value_scale:1000,extraction_document_version:"1",extraction_source_sha256:context.currentSources[0].hash}];
  const html=renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC"><InstitutionalSetupForm context={context}/></NextIntlClientProvider>);
  expect(html).toContain("123000 BRL");expect(html).toContain('name="baseYear"');expect(html).not.toContain('value="0"');expect(html).not.toMatch(/value="none" selected/);expect(html).not.toContain('name="configuration"');
 });
});
