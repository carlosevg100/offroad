import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe,it,expect} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {InstitutionalIssues} from "./institutional-issues";
import {institutionalSetupIssues,institutionalResultIssues} from "@/lib/advisor/institutional-issue-presentation";
describe("institutional correction guidance",()=>{
 it.each(["pt-BR","en-US"] as const)("maps source fields and corrections without raw codes in %s",locale=>{
  const messages=locale==="pt-BR"?pt:en;
  const issues=institutionalSetupIssues({status:"missing_inputs",assessment:{prepared:{missingInputs:[{code:"fact_missing",targetPath:"openingBalanceSheet.unrestrictedCash",detail:"internal.raw.payload"}]}}});
  const html=renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><InstitutionalIssues issues={issues}/></NextIntlClientProvider>);
  expect(html).toContain(messages.InstitutionalIssues.reason.missingFact);expect(html).toContain(messages.InstitutionalSetup.historical.unrestrictedCash);expect(html).toContain('href="#work-institutional-setup"');expect(html).not.toContain("fact_missing");expect(html).not.toContain("internal.raw.payload");expect(html).not.toContain("openingBalanceSheet");
 });
 it("maps blocked arithmetic and terminal worker outcomes without inventing domain verdicts",()=>{
  expect(institutionalSetupIssues({status:"calculation_blocked",assessment:{review:{findings:[{id:"balance.opening",severity:"blocker"}]}}})[0].reason).toBe("openingBalance");
  for(const code of ["institutional_result_dispatch_missing","institutional_result_output_missing","institutional_result_job_failed","institutional_result_job_cancelled","institutional_result_job_poison"])expect(institutionalResultIssues([code])[0].reason).toBe("execution");
  expect(institutionalResultIssues(["future_unknown_internal_code"])[0].reason).toBe("unclassified");
 });
 it("does not present incomplete or successful submissions as corrections",()=>{
  expect(institutionalSetupIssues(null)).toEqual([]);expect(institutionalSetupIssues({status:"review_required",assessment:null})).toEqual([]);expect(institutionalSetupIssues({status:"queued",assessment:null})).toEqual([]);
 });
});
