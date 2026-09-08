import {getTranslations} from "next-intl/server";
import type {BalanceSourceAssessment} from "@offroad/receivables-analysis";

/** Anchored observations only: no row values, arithmetic or implied approval. */
export async function BalanceSourceProposals({assessment, locale}: {assessment: BalanceSourceAssessment; locale: string}) {
  if (!assessment.proposals.length && !assessment.issues.length) return null;
  const t = await getTranslations({locale, namespace: "BalanceSourceProposals"});
  return <section className="receivables-support-periods" data-testid="balance-source-proposals" aria-label={t("title")}>
    <h3>{t("title")}</h3><p>{t("boundary")}</p>
    {assessment.issues.length ? <ul>{assessment.issues.map((issue, index) => <li key={`${issue}:${index}`}>{t(`issue.${issue}`)}</li>)}</ul> : null}
    <p>{t("reportingDate")}: <time dateTime={assessment.reportingDate}>{assessment.reportingDate}</time></p>
    {assessment.proposals.map((proposal, index) => <details key={`${proposal.id}:${index}`}>
      <summary><strong>{proposal.sourceLabel}</strong> · {proposal.sheet ? `${t("sheet")}: ${proposal.sheet}` : proposal.page ? `${t("page")}: ${proposal.page}` : t("sourceContainer")} · {t("pending")}</summary>
      <h4>{t("headers")}</h4><dl>{proposal.columns.map((column, i) => <div key={`${column.header.id}:${i}`}><dt>{t(`role.${column.role}`)}</dt><dd>{column.header.text}{column.header.truncated ? ` · ${t("truncated")}` : null}<small> · {t("anchor")}: {column.header.id}</small></dd></div>)}</dl>
      <h4>{t("context")}</h4>{proposal.context.length ? <dl>{proposal.context.map((item, i) => <div key={`${item.kind}:${item.anchor.id}:${i}`}><dt>{t(`kind.${item.kind}`)}</dt><dd>{item.anchor.text}{item.anchor.truncated ? ` · ${t("truncated")}` : null}<small> · {t("anchor")}: {item.anchor.id}</small></dd></div>)}</dl> : <p>{t("noContext")}</p>}
      <ul>{proposal.issues.map((issue, i) => <li key={`${issue}:${i}`}>{t(`issue.${issue}`)}</li>)}</ul>
      <details><summary>{t("trace")}</summary><dl><div><dt>{t("version")}</dt><dd>{proposal.documentVersion ?? t("unknown")}</dd></div><div><dt>{t("sourceId")}</dt><dd>{proposal.sourceId}</dd></div><div><dt>{t("sourceHash")}</dt><dd>{proposal.sourceHash}</dd></div><div><dt>{t("sourceContainer")}</dt><dd>{proposal.containerId}</dd></div></dl></details>
    </details>)}
  </section>;
}
