"use client";
import {useRef,useState,useTransition} from "react";
import {useLocale,useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import type {InstitutionalSetupReview} from "@/lib/advisor/institutional-setup-reviews";
import {reviewAdvisorInstitutionalConfiguration} from "@/app/[locale]/app/advisor-actions";
import {displayAssumptionValue} from "./institutional-configuration-review";
import {institutionalIssuePresentation} from "@/lib/advisor/institutional-issue-presentation";
import {InstitutionalIssues} from "./institutional-issues";
import styles from "./institutional-setup-form.module.css";
export function InstitutionalSetupReviewWork({projectId,reviews}:{projectId:string;reviews:InstitutionalSetupReview[]}) {
  const t=useTranslations("InstitutionalSetupReview"), setup=useTranslations("InstitutionalSetup"), common=useTranslations("InstitutionalConfigurationReview");
  const locale=useLocale(),router=useRouter(); const [pending,startTransition]=useTransition(); const [error,setError]=useState(false); const requests=useRef(new Map<string,string>());
  function decide(c:InstitutionalSetupReview,decision:"approved"|"rejected") {
    const key=`${c.candidateId}:${c.configurationFingerprint}:${decision}`; if(!requests.current.has(key))requests.current.set(key,crypto.randomUUID());
    setError(false); startTransition(async()=>{try{const result=await reviewAdvisorInstitutionalConfiguration({locale,projectId,candidateId:c.candidateId,expectedParentFingerprint:c.parentFingerprint,expectedCandidateFingerprint:c.configurationFingerprint,decision,requestId:requests.current.get(key)});if(!result.ok)setError(true);else router.refresh();}catch{setError(true);}});
  }
  if(!reviews.length)return null;
  return <section className={styles.form} data-testid="institutional-setup-review"><h2>{t("title")}</h2><p>{t("intro")}</p>{error?<p role="alert">{common("error")}</p>:null}{reviews.map(c=><article key={c.candidateId} className={styles.source}>
    <h3>{t("revision",{revision:c.revision})} · {c.currency} · {c.periods.join("–")}</h3><p>{common(`status.${c.status}`)}</p>
    <details open><summary>{setup("sources")}</summary>{c.sources.map((s,i)=><div key={i}><strong>{s.name}</strong><p>{t("sourceVersion",{version:s.version,date:s.asOfDate})} · {s.currency}</p><p>{s.locator}</p><p>{s.rationale}</p></div>)}</details>
    <details><summary>{setup("history")}</summary><dl>{c.historical.map((h,i)=><div key={i}><dt>{setup.has(`historical.${h.name}`)?setup(`historical.${h.name}`):h.name}</dt><dd>{h.value===null?common("notProvided"):displayAssumptionValue(h.value,false,locale)} {c.currency} · {h.entityName} · {h.periodEnd} · {h.sourceName}</dd></div>)}</dl></details>
    <details><summary>{setup("forecast")}</summary>{c.assumptions.map(a=><div key={a.id} className={styles.premise}><h4>{a.label[locale==="pt-BR"?"pt":"en"]}</h4><dl>{c.periods.map(year=><div key={year}><dt>{year}</dt><dd>{a.values[year]===undefined?common("notProvided"):displayAssumptionValue(a.values[year],a.unit==="percent",locale)} {a.unit==="currency"?c.currency:a.unit==="percent"?"":common(`units.${a.unit}`)}</dd></div>)}</dl><p>{a.rationale}</p></div>)}</details>
    <details><summary>{setup("debt")}</summary>{c.debt.length?c.debt.map((d,index)=><div key={d.instrumentId}><h4>{setup("debt")} {index+1} · {setup.has(`indexers.${d.indexer}`)?setup(`indexers.${d.indexer}`):d.indexer}</h4><p>{setup("indexationTreatment")}: {setup(d.indexationTreatment)} · {setup("couponTreatment")}: {setup(d.couponTreatment)} · {setup("couponBase")}: {setup(d.couponBase)}</p><p>{setup("openingPrincipal")}: {d.openingPrincipal} {c.currency}</p>{d.periods.map(p=><p key={p.period}>{p.period}: {setup("indexationRate")} {displayAssumptionValue(p.indexationRate,true,locale)} · {setup("couponRate")} {displayAssumptionValue(p.couponRate,true,locale)} · {setup("drawdown")} {p.drawdown} · {setup("scheduledPrincipal")} {p.scheduledPrincipal??common("notProvided")} · {setup("prepayment")} {p.prepayment??common("notProvided")}</p>)}{c.debtRateLineage.filter(r=>r.instrumentId===d.instrumentId).map(r=><p key={r.period}>{r.period} · {setup("indexationRate")}: {c.sources.find(source => source.id === r.indexationSourceId)?.name ?? common("notProvided")} ({r.indexationAsOfDate}, {r.indexationMethodology}) · {setup("couponRate")}: {c.sources.find(source => source.id === r.couponSourceId)?.name ?? common("notProvided")} ({r.couponAsOfDate}, {r.couponMethodology})</p>)}</div>):<p>{c.absence?.debtInstruments?.rationale??common("notProvided")}</p>}</details>
    <details><summary>{setup("capex")}</summary>{c.capex.length?c.capex.map(a=><p key={a.id}>{c.assumptions.find(p=>p.id===a.amountAssumptionId)?.label[locale==="pt-BR"?"pt":"en"]} · {setup(a.classification)} · {setup("usefulLife")}: {a.usefulLifeYears} · {setup(a.depreciationConvention==="half_year"?"half_year":"next_period")}</p>):<p>{c.absence?.capex?.rationale??common("notProvided")}</p>}</details>
    <details open><summary>{t("checks")}</summary>{c.findings.length?<InstitutionalIssues issues={c.findings.map(f=>({...institutionalIssuePresentation(f.id,"",f.period),severity:f.severity}))} />:<p>{t("noFindings")}</p>}<p>{t("checkBoundary")}</p></details>
    {c.status==="review_required"?<><p>{c.canApprove?t("approvalBoundary"):t("unavailable")}</p><div className={styles.actions}><button type="button" disabled={pending||!c.canApprove} onClick={()=>decide(c,"approved")}>{t("approve")}</button><button type="button" disabled={pending} onClick={()=>decide(c,"rejected")}>{common("reject")}</button></div></>:null}
  </article>)}</section>;
}
