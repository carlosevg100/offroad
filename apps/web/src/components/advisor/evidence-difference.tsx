"use client";
import {useTranslations} from "next-intl";
import {formatBasisValue} from "./adoption-basis-format";
import type {AdoptionDifference} from "@offroad/case-understanding";
export function EvidenceDifference({locale,differences,unavailable}:{locale:string;differences:AdoptionDifference[]|null;unavailable:boolean}) {
 const t=useTranslations("App.adoptionBasis");
 const display=(value:{type:string;value:unknown}|null)=>formatBasisValue(value,locale,{absent:t("absent"),yes:t("yes"),no:t("no")});
 if(unavailable) return <p role="status">{t("comparisonUnavailable")}</p>;
 if(!differences) return null;
 return <section><h2>{t("differences")}</h2><ul>{differences.filter(d=>d.state!=="unchanged").map(d=><li key={d.slotKey}><strong>{(d.after??d.before)?.fieldPath}</strong> · {t(`states.${d.state}`)}<p>{display(d.before?.value??null)} → {display(d.after?.value??null)}</p></li>)}</ul></section>;
}
