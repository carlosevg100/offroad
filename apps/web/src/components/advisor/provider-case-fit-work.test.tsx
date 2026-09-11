import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe,expect,it,vi} from "vitest";
import {buildProviderCaseFit} from "@offroad/fund-mandate";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {ProviderCaseFitWork} from "./provider-case-fit-work";
import {selectClientMessages} from "@/i18n/client-messages";
import {ProviderCaseFitForm} from "./provider-case-fit-form";
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
vi.mock('@/lib/advisor/provider-case-fit-action',()=>({requestProviderCaseFit:vi.fn()}));
const id="10000000-0000-4000-8000-000000000001";
const fit=buildProviderCaseFit({organizationId:id,projectId:id,planId:id,planFingerprint:'a'.repeat(64),criteria:{schemaVersion:'provider-case-criteria.v1',asOf:'2026-09-10T00:00:00Z',currency:'BRL',source:{kind:'user_confirmed',referenceId:id}},providers:[{providerId:'synthetic',name:'Synthetic own mandate',sourceClass:'registered',ownerOrganizationId:id,mandate:{active:[],ticket:[],termMonths:[],sectors:[],geographies:[],instruments:[],collateral:[],currencies:[],leverageCeiling:[],minimumDscr:[]}}],mandateMaxAgeMonths:null});
const observation=<T,>(value:T)=>[{value,provenance:'declared' as const,observedAt:'2026-09-01T00:00:00Z',note:'provider_mandates/40000000-0000-4000-8000-000000000001; v4; official_document'}];
const confirmedFit=(overrides:Record<string,unknown>={})=>buildProviderCaseFit({organizationId:id,projectId:id,planId:id,planFingerprint:'a'.repeat(64),criteria:{schemaVersion:'provider-case-criteria.v1',asOf:'2026-09-10T00:00:00Z',currency:'BRL',amount:'500',termMonths:24,sector:'ports',geography:'BR',instruments:['ccb'],collateral:['imovel'],leverage:'3',dscr:'1.5',source:{kind:'user_confirmed',referenceId:id}},providers:[{providerId:'confirmed',name:'Gestora com mandato',sourceClass:'registered',ownerOrganizationId:id,mandateRecord:{versionNumber:4,status:'confirmed',effectiveStatus:'confirmed',validFrom:'2026-03-01',validUntil:'2027-03-01',confirmedAt:'2026-09-01T00:00:00Z',channel:'official_document',confirmationCount:2},mandate:{active:observation(true),ticket:observation({min:'100',max:'1000'}),termMonths:observation({min:1,max:60}),sectors:observation(['ports']),geographies:observation(['BR']),instruments:observation(['ccb']),collateral:observation(['imovel']),currencies:observation(['BRL']),leverageCeiling:observation('4'),minimumDscr:observation('1.2'),...overrides}}],mandateMaxAgeMonths:6});
const render=(locale:'pt-BR'|'en-US',value:ReturnType<typeof buildProviderCaseFit>)=>renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={selectClientMessages(locale==='pt-BR'?pt:en)} timeZone="UTC"><ProviderCaseFitWork fit={value}/></NextIntlClientProvider>);
describe('ProviderCaseFitWork',()=>{
 it.each(['pt-BR','en-US'] as const)('renders ranked review, criterion gaps and no contact action in %s',locale=>{
  const messages=locale==='pt-BR'?pt:en;const html=renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={selectClientMessages(messages)} timeZone="UTC"><ProviderCaseFitWork fit={fit}/></NextIntlClientProvider>);
  expect(html).toContain('Synthetic own mandate');expect(html).toContain(messages.ProviderCaseFitWork.criteria);expect(html).toContain(messages.ProviderCaseFitWork.reviewBoundary);expect(html).not.toContain('<button');expect(html).not.toContain(fit.caseFingerprint);
 });
 it.each(['pt-BR','en-US'] as const)('marks a confirmed mandate eligible and names its version, date and origin in %s',locale=>{
  const messages=locale==='pt-BR'?pt:en;const html=render(locale,confirmedFit());
  expect(html).toContain('data-classification="eligible"');
  expect(html).toContain(messages.ProviderCaseFitWork.classification.eligible);
  expect(html).toContain(messages.ProviderCaseFitWork.evidence.confirmed_mandate);
  expect(html).toContain(messages.ProviderCaseFitWork.subject.credit_profile);
  expect(html).toContain('data-testid="case-fit-adherence"');
  expect(html).toContain(messages.ProviderCaseFitWork.confirmedMandateRecord);
  expect(html).not.toContain(messages.ProviderCaseFitWork.hypothesisNote);
  expect(html).not.toMatch(/—/);
 });
 it('shows a fund with no confirmed mandate as a research hypothesis, never as eligible',()=>{
  const html=render('pt-BR',fit);
  expect(html).toContain('data-classification="hypothesis"');
  expect(html).toContain(pt.ProviderCaseFitWork.hypothesisNote);
  expect(html).toContain(pt.ProviderCaseFitWork.mandateUnconfirmed);
  expect(html).not.toContain('data-classification="eligible"');
 });
 it('keeps an incompatible instrument out of the selection until mismatches are shown',()=>{
  const excluded=confirmedFit({instruments:observation(['cri'])});
  const html=render('en-US',excluded);
  expect(html).not.toContain('data-classification="excluded"');
  expect(html).toContain(en.ProviderCaseFitWork.noResults);
  expect(excluded.candidates[0]!.fit).toMatchObject({classification:'excluded',incompatibilities:['instrument']});
 });
 it.each(['pt-BR','en-US'] as const)('requires explicit currency and case confirmation in %s',locale=>{
  const messages=locale==='pt-BR'?pt:en;const html=renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={selectClientMessages(messages)} timeZone="UTC"><ProviderCaseFitForm projectId={id} projectName="Existing case" expectedPlanFingerprint={'a'.repeat(64)}/></NextIntlClientProvider>);
  expect(html).toContain(messages.ProviderCaseFitForm.submit);expect(html).not.toContain("ProviderCaseFitForm.");expect(html).toContain(messages.ProviderCaseFitForm.confirm);expect(html).toContain(messages.ProviderCaseFitForm.fields.leverage);expect(html).toContain('value=""');expect(html).toContain('name="asOf"');expect(html).not.toContain('value="BRL" selected');
 });
});
