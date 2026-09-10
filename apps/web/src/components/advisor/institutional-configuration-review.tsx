"use client";
import {useState, useTransition} from "react";
import {useLocale, useTranslations, useFormatter} from "next-intl";
import {useRouter} from "next/navigation";
import type {InstitutionalConfigurationReview} from "@/lib/advisor/institutional-configuration-reviews";
import {reviewAdvisorInstitutionalConfiguration} from "@/app/[locale]/app/advisor-actions";
import reviewStyles from "./institutional-configuration-review.module.css";
import styles from "./provider-research-work.module.css";

/** Decimal-string shift avoids rounding a proposed percentage for display. */
export function displayAssumptionValue(value: string, percent: boolean, locale: string): string {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const shifted = percent ? `${whole}${fraction.padEnd(2, "0").slice(0, 2)}`.replace(/^0+(?=\d)/, "") : whole;
  const rest = (percent ? fraction.slice(2) : fraction).replace(/0+$/, "");
  return `${negative ? "-" : ""}${shifted}${rest ? `${locale === "pt-BR" ? "," : "."}${rest}` : ""}${percent ? "%" : ""}`;
}
export function InstitutionalConfigurationReviewWork({projectId, reviews}: {projectId: string; reviews: InstitutionalConfigurationReview[]}) {
  const t = useTranslations("InstitutionalConfigurationReview");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function review(candidate: InstitutionalConfigurationReview, decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await reviewAdvisorInstitutionalConfiguration({locale, projectId, candidateId: candidate.candidateId, expectedParentFingerprint: candidate.parentFingerprint, expectedCandidateFingerprint: candidate.configurationFingerprint, decision});
      if (!result.ok) setError(t(result.error === "stale" ? "stale" : "error"));
      else router.refresh();
    });
  }
  return <section className={styles.research} aria-label={t("title")}>
    <header><p>{t("introduction")}</p></header>
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.providers}>{reviews.map(candidate => <article key={candidate.candidateId}>
      <header><h3>{candidate.label[locale === "pt-BR" ? "pt" : "en"]} · {candidate.period}</h3><span>{t(`status.${candidate.status}`)}</span></header>
      <dl>
        <div><dt>{t("prior")}</dt><dd>{candidate.priorValue === null ? t("notProvided") : displayAssumptionValue(candidate.priorValue, candidate.unit === "percent", locale)}</dd></div>
        <div><dt>{t("proposed")}</dt><dd>{displayAssumptionValue(candidate.proposedValue, candidate.unit === "percent", locale)}</dd></div>
        <div><dt>{t("unit")}</dt><dd>{candidate.unit === "currency" ? candidate.currency : t(`units.${candidate.unit}`)}</dd></div>
        <div><dt>{t("source")}</dt><dd>{t("userResponse")} · {format.dateTime(new Date(candidate.answeredAt), {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"})} UTC</dd></div>
      </dl>
      {candidate.status === "review_required" && !candidate.canApprove ? <p>{t("staleParent")}</p> : null}
      {candidate.status === "review_required" ? <div className={reviewStyles.actions}><button type="button" disabled={pending || !candidate.canApprove} onClick={() => review(candidate, "approved")}>{t("approve")}</button> <button type="button" disabled={pending} onClick={() => review(candidate, "rejected")}>{t("reject")}</button></div> : null}
    </article>)}</div>
    <footer><p>{t("boundary")}</p></footer>
  </section>;
}
