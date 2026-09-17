"use client";
import {useTranslations} from "next-intl";
import type {AdoptionDifference} from "@offroad/case-understanding";
export function EvidenceDifference({differences,unavailable}:{differences:AdoptionDifference[]|null;unavailable:boolean}) {
 const t=useTranslations("App.adoptionBasis");
 if(unavailable) return <p role="status">{t("comparisonUnavailable")}</p>;
 if(!differences) return null;
 return <section><h2>{t("differences")}</h2><ul>{differences.filter(d=>d.state!=="unchanged").map(d=><li key={d.slotKey}><strong>{(d.after??d.before)?.fieldPath}</strong> · {t(`states.${d.state}`)}<p>{JSON.stringify(d.before?.value.value??null)} → {JSON.stringify(d.after?.value.value??null)}</p></li>)}</ul></section>;
}
