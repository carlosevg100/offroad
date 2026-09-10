import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe,expect,it,vi} from "vitest";
import {buildProviderCaseFit} from "@offroad/fund-mandate";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {ProviderCaseFitWork} from "./provider-case-fit-work";
import {ProviderCaseFitForm} from "./provider-case-fit-form";
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
vi.mock('@/lib/advisor/provider-case-fit-action',()=>({requestProviderCaseFit:vi.fn()}));
const id="10000000-0000-4000-8000-000000000001";
const fit=buildProviderCaseFit({organizationId:id,projectId:id,planId:id,planFingerprint:'a'.repeat(64),criteria:{schemaVersion:'provider-case-criteria.v1',asOf:'2026-09-10T00:00:00Z',currency:'BRL',source:{kind:'user_confirmed',referenceId:id}},providers:[{providerId:'synthetic',name:'Synthetic own mandate',sourceClass:'registered',ownerOrganizationId:id,mandate:{active:[],ticket:[],termMonths:[],sectors:[],geographies:[],instruments:[],collateral:[],currencies:[],leverageCeiling:[],minimumDscr:[]}}],mandateMaxAgeMonths:null});
describe('ProviderCaseFitWork',()=>{
 it.each(['pt-BR','en-US'] as const)('renders ranked review, criterion gaps and no contact action in %s',locale=>{
  const messages=locale==='pt-BR'?pt:en;const html=renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><ProviderCaseFitWork fit={fit}/></NextIntlClientProvider>);
  expect(html).toContain('Synthetic own mandate');expect(html).toContain(messages.ProviderCaseFitWork.criteria);expect(html).toContain(messages.ProviderCaseFitWork.reviewBoundary);expect(html).not.toContain('<button');expect(html).not.toContain(fit.caseFingerprint);
 });
 it.each(['pt-BR','en-US'] as const)('requires explicit currency and case confirmation in %s',locale=>{
  const messages=locale==='pt-BR'?pt:en;const html=renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><ProviderCaseFitForm projectId={id} projectName="Existing case" expectedPlanFingerprint={'a'.repeat(64)}/></NextIntlClientProvider>);
  expect(html).toContain(messages.ProviderCaseFitForm.confirm);expect(html).toContain(messages.ProviderCaseFitForm.fields.leverage);expect(html).toContain('value=""');expect(html).toContain('name="asOf"');expect(html).not.toContain('value="BRL" selected');
 });
});
