"use client";
import {useState} from "react";
import {useFormatter,useLocale,useTranslations} from "next-intl";
import type {ProviderCaseFitArtifact} from "@offroad/fund-mandate";
import styles from "./provider-research-work.module.css";
export function ProviderCaseFitWork({fit,archived=false}:{fit:ProviderCaseFitArtifact;archived?:boolean}) {
 const t=useTranslations("ProviderCaseFitWork");const format=useFormatter();const lang=useLocale()==='pt-BR'?'pt':'en';
 const [query,setQuery]=useState('');const [includeExcluded,setIncludeExcluded]=useState(false);
 const candidates=fit.candidates.filter(c=>(includeExcluded||c.verdict!=='excluded')&&c.providerName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <section className={styles.research} data-testid="provider-case-fit-work">
  <header><span>{t('kicker')}</span><h2>{t('title')}</h2><p>{t('description')}</p><small>{t('asOf',{date:format.dateTime(new Date(fit.asOf),{dateStyle:'medium',timeZone:'UTC'})})}</small></header>
  <div className={styles.coverage}><strong>{t('coverage',{count:fit.candidates.length})}</strong><p>{t('ranking')}</p><p>{t('boundary')}</p></div>
  <label className={styles.search}><span>{t('search')}</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <label><input type="checkbox" checked={includeExcluded} onChange={e=>setIncludeExcluded(e.target.checked)}/>{t('includeExcluded')}</label>
  <div className={styles.providers}>{candidates.map(candidate=><article key={candidate.providerId}>
   <header><h3>{candidate.order}. {candidate.providerName}</h3><span>{t(archived?"archivedStatus":`status.${candidate.reviewReadiness}`)}</span></header>
   <p>{t('gaps',{company:candidate.companyGaps.length,mandate:candidate.mandateGaps.length})}</p>
   {candidate.blockers.length?<p>{t('confirmationRequired')}</p>:null}
   <details><summary>{t('criteria')}</summary><dl>{candidate.criteria.map(criterion=><div key={criterion.id}>
    <dt>{criterion.labels[lang]} · {t(`outcome.${criterion.outcome}`)}</dt><dd>{criterion.explanation[lang]}
     <small>{t('caseValue')}: {criterion.request??t('unknown')} · {t('mandateValue')}: {criterion.mandate??t('unknown')}</small>
     {criterion.evidence.map((evidence,index)=><small key={index}>{t(`source.${evidence.provenance}`)} · {format.dateTime(new Date(evidence.observedAt),{dateStyle:'medium',timeZone:'UTC'})} · {evidence.note.startsWith("mandate_versions/") ? t("recordedMandate") : evidence.note}</small>)}
    </dd></div>)}</dl></details>
  </article>)}</div>
  {!candidates.length?<p role="status">{t(fit.candidates.length?'noResults':'empty')}</p>:null}
  <footer><p>{t('reviewBoundary')}</p></footer>
 </section>;
}
