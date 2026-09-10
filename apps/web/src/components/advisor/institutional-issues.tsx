"use client";
import {useTranslations} from "next-intl";
import type {InstitutionalIssuePresentation} from "@/lib/advisor/institutional-issue-presentation";
export function InstitutionalIssues({issues}:{issues:InstitutionalIssuePresentation[]}){
 const t=useTranslations("InstitutionalIssues"),setup=useTranslations("InstitutionalSetup"),review=useTranslations("InstitutionalSetupReview");
 if(!issues.length)return null;
 return <section data-testid="institutional-issues" aria-label={t("title")}><h3>{t("title")}</h3><ul>{issues.map((issue,i)=><li key={i}><strong>{issue.severity?`${review(`severity.${issue.severity}`)}: `:""}{t(`reason.${issue.reason}`)}</strong>{issue.period?` · ${issue.period}`:""}{issue.reason!=="execution"?<p>{t("where",{area:issue.field?setup(`historical.${issue.field}`):setup(issue.area)})}</p>:null}</li>)}</ul><a href="#work-institutional-setup">{t("correct")}</a></section>;
}
