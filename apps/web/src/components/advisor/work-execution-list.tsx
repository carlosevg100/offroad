import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {WorkExecutionListItem} from "@/lib/execution/read";
import "./work-execution.css";

/** When it was requested and its state, with a link to the execution; the internal identifier stays
 * in the link, never in the text. Result bytes are read one execution at a time. */
export async function WorkExecutionList({locale, projectId, items, nextCursor, query}: {locale: string; projectId: string; items: WorkExecutionListItem[]; nextCursor: string | null; query: string}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions"});
  const when = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short"});
  const path = `/${locale}/app/projects/${projectId}/executions`;
  return <section><h2>{t("list.title")}</h2>
    {!items.length ? <p>{t("list.empty")}</p> : <ul className="execution-records">{items.map(item => <li key={item.executionId}>
      <strong>{when.format(new Date(item.createdAt))}</strong><span className="execution-state">{t(`states.${item.state}`)}</span>
      {item.reason ? <p>{t.has(`reasons.${item.reason}`) ? t(`reasons.${item.reason}`) : item.reason}</p> : null}
      <p><Link href={`${path}/${item.executionId}`}>{t("list.open")}</Link></p>
    </li>)}</ul>}
    {nextCursor ? <Link href={`${path}?${query}${query ? "&" : ""}before=${nextCursor}`}>{t("list.next")}</Link> : null}
  </section>;
}
