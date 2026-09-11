"use client";
import {useState} from "react";
import {useFormatter,useLocale,useTranslations} from "next-intl";
import type {ProviderCaseFitArtifact} from "@offroad/fund-mandate";
import styles from "./provider-research-work.module.css";

type Candidate = ProviderCaseFitArtifact["candidates"][number];

/** A result written before the classification contract keeps its own honest reading. */
const classificationOf = (candidate: Candidate) =>
  candidate.fit?.classification ?? (candidate.verdict === "excluded" ? "excluded" : "hypothesis");

export function ProviderCaseFitWork({fit,archived=false}:{fit:ProviderCaseFitArtifact;archived?:boolean}) {
 const t=useTranslations("ProviderCaseFitWork");const format=useFormatter();const lang=useLocale()==='pt-BR'?'pt':'en';
 const [query,setQuery]=useState('');const [includeExcluded,setIncludeExcluded]=useState(false);
 const candidates=fit.candidates.filter(c=>(includeExcluded||classificationOf(c)!=='excluded')&&c.providerName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const day=(value:string)=>format.dateTime(new Date(value),{dateStyle:'medium',timeZone:'UTC'});
 return <section className={styles.research} data-testid="provider-case-fit-work">
  <header><span>{t('kicker')}</span><h2>{t('title')}</h2><p>{t('description')}</p><small>{t('asOf',{date:day(fit.asOf)})}</small></header>
  <div className={styles.coverage}><strong>{t('coverage',{count:fit.candidates.length})}</strong><p>{t('ranking')}</p><p>{t('boundary')}</p><p>{t('classificationLegend')}</p></div>
  <label className={styles.search}><span>{t('search')}</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <label><input type="checkbox" checked={includeExcluded} onChange={e=>setIncludeExcluded(e.target.checked)}/>{t('includeExcluded')}</label>
  <div className={styles.providers}>{candidates.map(candidate=>{
   const classification=classificationOf(candidate);
   const record=candidate.mandateRecord ?? null;
   return <article data-classification={classification} data-testid="case-fit-candidate" key={candidate.providerId}>
   <header><h3>{candidate.order}. {candidate.providerName}</h3><span>{t(archived?"archivedStatus":`classification.${classification}`)}</span></header>
   {/* Where this candidate comes from, and whether anybody confirmed it. */}
   <p data-testid="case-fit-origin">{t(`evidence.${candidate.fit?.evidenceSource ?? 'public_record'}`)}
    {record?.confirmedAt
      ? ` · ${t('mandateVersion',{version:record.versionNumber,date:day(record.confirmedAt),status:t(`mandateStatus.${record.effectiveStatus}`)})}`
      : ` · ${t('mandateUnconfirmed')}`}</p>
   {classification==='hypothesis'?<p>{t('hypothesisNote')}</p>:null}
   {candidate.fit?.incompatibilities.length?<p>{t('incompatibilities',{items:candidate.fit.incompatibilities.map(id=>t(`criterionName.${id}`)).join(', ')})}</p>:null}
   <p>{t('gaps',{company:candidate.companyGaps.length,mandate:candidate.mandateGaps.length})}</p>
   {candidate.blockers.length?<p>{t('confirmationRequired')}</p>:null}
   {candidate.fit?<dl data-testid="case-fit-adherence">{candidate.fit.adherence.map(item=><div key={item.subject}>
    <dt>{t(`subject.${item.subject}`)}</dt>
    <dd>{t(`outcome.${item.outcome}`)}
     <small>{t('caseValue')}: {item.request??t('unknown')} · {t('mandateValue')}: {item.mandate??t('unknown')}</small>
     <small>{item.origin?t('itemOrigin',{source:t(`source.${item.origin}`),date:item.observedAt?day(item.observedAt):t('unknown')}):t('itemOriginMissing')}</small>
    </dd></div>)}</dl>:null}
   <details><summary>{t('criteria')}</summary><dl>{candidate.criteria.map(criterion=><div key={criterion.id}>
    <dt>{criterion.labels[lang]} · {t(`outcome.${criterion.outcome}`)}</dt><dd>{criterion.explanation[lang]}
     <small>{t('caseValue')}: {criterion.request??t('unknown')} · {t('mandateValue')}: {criterion.mandate??t('unknown')}</small>
     {criterion.evidence.map((evidence,index)=><small key={index}>{t(`source.${evidence.provenance}`)} · {day(evidence.observedAt)} · {evidence.note.startsWith("provider_mandates/") ? t("confirmedMandateRecord") : evidence.note.startsWith("mandate_versions/") ? t("recordedMandate") : evidence.note}</small>)}
    </dd></div>)}</dl></details>
  </article>;})}</div>
  {!candidates.length?<p role="status">{t(fit.candidates.length?'noResults':'empty')}</p>:null}
  <footer><p>{t('reviewBoundary')}</p></footer>
 </section>;
}
