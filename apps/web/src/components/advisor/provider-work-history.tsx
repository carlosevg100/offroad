"use client";
import {useTranslations} from "next-intl";
import type {ProviderWorkHistoryEntry} from "@/lib/advisor/provider-work-history";
import {ProviderResearchWork} from "./provider-research-work";
import {ProviderCaseFitWork} from "./provider-case-fit-work";
export function ProviderWorkHistory({entries}:{entries:readonly ProviderWorkHistoryEntry[]}){
 const t=useTranslations('ProviderWorkHistory');
 return <section data-testid="provider-work-history"><h2>{t('title')}</h2><p>{t('boundary')}</p>{entries.map(entry=><details key={entry.id}><summary>{t(entry.fit?'fit':'research')} · {t('version',{version:entry.version})} · {t(['stale','superseded'].includes(entry.status)?'stale':'archived')}</summary>{entry.research?<ProviderResearchWork research={entry.research}/>:entry.fit?<ProviderCaseFitWork fit={entry.fit} archived/>:null}</details>)}</section>;
}
