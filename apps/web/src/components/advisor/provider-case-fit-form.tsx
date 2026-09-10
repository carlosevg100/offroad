"use client";
import {useState,useTransition} from "react";
import {useLocale,useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {requestProviderCaseFit} from "@/lib/advisor/provider-case-fit-action";
import styles from "./provider-research-work.module.css";
const instruments=["debenture","nota_comercial","ccb","cri","cra","fidc","direct_loan","receivables_purchase","project_finance","equity_kicker_debt"] as const;
const collateral=["recebiveis","imovel","equipamento","estoque","aval_fianca","cessao_fiduciaria","alienacao_fiduciaria_quotas","conta_reserva","quirografario"] as const;
export function ProviderCaseFitForm({projectId,projectName,expectedPlanFingerprint}:{projectId?:string;projectName?:string;expectedPlanFingerprint?:string}){
 const t=useTranslations("ProviderCaseFitForm");const locale=useLocale();const router=useRouter();const [pending,startTransition]=useTransition();const [error,setError]=useState<string|null>(null);const [done,setDone]=useState(false);const [requestId]=useState(()=>crypto.randomUUID());
 return <details className={`${styles.research} ${styles.caseForm}`} data-testid="provider-case-fit-form"><summary>{t('title')}</summary><p>{t('description')}</p>
 <form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setError(null);const date=String(data.get('asOf')??'');if(!date||!Number.isFinite(new Date(date).getTime())){setError('invalid');return;}
 const values:Record<string,unknown>={schemaVersion:'provider-case-criteria.v1',asOf:new Date(date).toISOString(),currency:String(data.get('currency')??''),source:{kind:'user_confirmed',referenceId:requestId}};
 for(const key of ['amount','leverage','dscr']){const raw=String(data.get(key)??'').trim();if(raw)values[key]=raw.replace(',','.');}
 for(const key of ['termMonths','mandateMaxAgeMonths']){const raw=String(data.get(key)??'').trim();if(raw)values[key]=Number(raw);}
 for(const key of ['sector','geography']){const raw=String(data.get(key)??'').trim();if(raw)values[key]=raw;}
 for(const key of ['instruments','collateral']){const selected=data.getAll(key);if(selected.length)values[key]=selected;}
 startTransition(async()=>{const result=await requestProviderCaseFit({requestId,locale,projectName:projectName??String(data.get('projectName')??''),objective:String(data.get('objective')??''),criteria:values,...(projectId?{projectId,expectedPlanFingerprint}:{})});if(!result.ok){setError(result.error);return;}setDone(true);if(!projectId)router.push(`/${locale}/app/projects/${result.projectId}`);else router.refresh();});
 }}>
 {!projectName?<label className={styles.search}>{t('projectName')}<input name="projectName" required minLength={2} maxLength={80}/></label>:null}
 <label className={styles.search}>{t('objective')}<textarea name="objective" required minLength={2} maxLength={8000} defaultValue={t('objectiveDefault')}/></label>
 <label className={styles.search}>{t('asOf')}<input name="asOf" type="datetime-local" required/></label>
 <label className={styles.search}>{t('currency')}<select name="currency" required defaultValue=""><option value="" disabled>{t('choose')}</option>{['BRL','USD','EUR'].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
 <p>{t('optional')}</p>
 {['amount','termMonths','sector','geography','leverage','dscr','mandateMaxAgeMonths'].map(key=><label className={styles.search} key={key}>{t(`fields.${key}`)}<input name={key} inputMode={['sector','geography'].includes(key)?'text':'decimal'}/></label>)}
 <fieldset><legend>{t('instruments')}</legend>{instruments.map(value=><label key={value}><input type="checkbox" name="instruments" value={value}/>{t(`instrument.${value}`)}</label>)}</fieldset>
 <fieldset><legend>{t('collateral')}</legend>{collateral.map(value=><label key={value}><input type="checkbox" name="collateral" value={value}/>{t(`security.${value}`)}</label>)}</fieldset>
 <label><input type="checkbox" required/>{t('confirm')}</label>
 <button type="submit" disabled={pending||done}>{t(pending?'pending':done?'done':'submit')}</button>
 {error?<p role="alert">{t(`errors.${error}`)}</p>:null}{done?<p role="status">{t('next')}</p>:null}
 </form></details>;
}
