import {getTranslations} from "next-intl/server";
import type {DocumentFolderResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** The folder organized, as the blocks carry it, in the order the ficha answers: the size and how it was organized,
 * what matters for the decisions in course with the document of each finding, the versions, the inventory by subject
 * with each file's situation, what the documents say, what was not read, what is missing and the open question. A
 * later turn shows only what the arrival changed. The method's sentences are shown as written; nothing is computed
 * here and no document is declared validated. Amounts of an identity check in millions with two decimals. */
export async function DocumentFolderResult({locale, view}: {locale: string; view: DocumentFolderResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.documentFolder"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 2, locale);
  const day = (d: string | null) => d === null ? "·" : formatIsoDate(d, locale);
  const {framing, inventory} = view;
  const name = (fileId: string) => inventory.rows.find((r) => r.fileId === fileId)?.fileName ?? fileId;
  const names = (ids: readonly string[]) => ids.map(name).join("; ");
  const where = (s: {fileId: string; page: number | null; section: string | null}) => t("source", {file: name(s.fileId), where: s.page !== null ? t("page", {page: String(s.page)}) : s.section ?? ""});
  const statement = (id: string) => view.findings.find((f) => f.id === id)?.statement ?? null;
  const findings = view.decisionFindings.stated ? {title: t("decisionFindings"), rows: view.decisionFindings.rows}
    : view.generalFindings.stated ? {title: t("generalFindings"), rows: view.generalFindings.rows.map((r) => ({...r, sources: [] as {fileId: string; page: number | null; section: string | null}[]}))} : null;
  const groups = inventory.groups.length ? inventory.groups : [];
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
      <dt>{t("mode")}</dt><dd>{known("modes", framing.mode)}</dd>
    </dl>
    {framing.asOf ? <p>{t("asOf", {date: day(framing.asOf)})}</p> : null}
    {framing.historical ? <p role="status">{t("historical")}</p> : null}
    {framing.opening ? <p><strong>{t("headline", {files: String(framing.opening.files), duplicates: String(framing.opening.duplicates),
      superseded: String(framing.opening.superseded), inVault: String(framing.opening.inVault)})}</strong></p> : <p>{t("noReading")}</p>}

    {findings ? <>
      <h3>{findings.title}</h3>
      {findings.rows.length ? <ol>{findings.rows.map((f) => <li key={f.rank}>{f.statement}
        {f.sources.length ? <small> ({f.sources.map(where).join("; ")})</small> : null}</li>)}</ol> : <p>{t("noFindings")}</p>}
    </> : null}

    {view.versions.length ? <>
      <h3>{t("versions")}</h3>
      <ul>{view.versions.map((v) => <li key={v.familyId}>{known("resolutions", v.resolution)}.
        {v.prevails.length ? ` ${t("prevails", {files: names(v.prevails)})}` : ""}{v.superseded.length ? ` ${t("superseded", {files: names(v.superseded)})}` : ""}
        {v.sideBySide.length ? ` ${t("sideBySide", {files: names(v.sideBySide)})}` : ""}</li>)}</ul>
    </> : null}

    {groups.length ? <>
      <h3>{t("inventory")}</h3>
      {groups.map((g) => <div key={`${g.partition ?? ""}:${g.group}`} className="investment-table">
        <h4>{g.label}{g.partition ? ` · ${t("partition", {partition: g.partition})}` : ""}</h4>
        <table>
          <thead><tr><th scope="col">{t("columns.file")}</th><th scope="col">{t("columns.what")}</th><th scope="col">{t("columns.entity")}</th><th scope="col">{t("columns.version")}</th>
            <th scope="col">{t("columns.situation")}</th><th scope="col">{t("columns.findings")}</th></tr></thead>
          <tbody>{g.fileIds.map((id) => inventory.rows.find((r) => r.fileId === id)).filter((r) => r !== undefined).map((r) => <tr key={r.fileId}>
            <th scope="row">{r.fileName}</th><td>{r.description}</td><td>{r.entity} · {r.period}</td><td>{r.version}</td><td>{r.situationLabel}</td>
            <td>{r.findingIds.map(statement).filter((x) => x !== null).join(" ") || "·"}</td></tr>)}</tbody>
        </table>
      </div>)}
    </> : null}

    {view.documentary.length ? <>
      <h3>{t("documentary")}</h3>
      {view.documentary.map((d, n) => <blockquote key={`${d.findingId}:${n}`}><p>{d.text}</p><cite>{where(d)}</cite></blockquote>)}
    </> : null}

    {view.notRead.length ? <>
      <h3>{t("notRead")}</h3>
      <ul>{view.notRead.map((n) => <li key={n.fileId}><strong>{name(n.fileId)}</strong>: {n.statement}</li>)}</ul>
    </> : null}

    {view.purposeGaps.length ? <>
      <h3>{t("purposeGaps")}</h3>
      <ul>{view.purposeGaps.map((g, n) => <li key={n}><strong>{g.item}</strong>{g.conditional ? ` (${t("conditional")})` : ""}: {g.why}</li>)}</ul>
    </> : null}

    {view.questions.length ? <>
      <h3>{t("questions")}</h3>
      <ul>{view.questions.map((q, n) => <li key={n}>{q.text}</li>)}</ul>
    </> : null}

    {view.update ? <>
      <h3>{t("update")}</h3>
      {view.update.rowsUpdated.length ? <p>{t("rowsUpdated", {files: names(view.update.rowsUpdated)})}</p> : null}
      {view.update.rowsAdded.length ? <p>{t("rowsAdded", {files: names(view.update.rowsAdded)})}</p> : null}
      <p>{t("rowsPreserved", {count: String(view.update.rowsPreserved)})}</p>
      {view.update.newFindings.length ? <ul>{view.update.newFindings.map((f, n) => <li key={n}>{f.statement}{f.quoted ? <blockquote><p>{f.quoted.text}</p><cite>{where(f.quoted)}</cite></blockquote> : null}</li>)}</ul> : null}
      {view.update.identityChecks.length ? <ul>{view.update.identityChecks.map((c) => <li key={c.id}>{t("identityCheck", {id: c.id, reported: mi(c.reported), recomposed: mi(c.recomposed)})} {known("checkStatuses", c.status)}</li>)}</ul> : null}
      {view.update.informed.length ? <ul>{view.update.informed.map((i, n) => <li key={n}>{t("informed", {statement: i.statement, author: i.author, date: day(i.date)})}</li>)}</ul> : null}
      {view.update.stillOpen.length ? <p>{t("stillOpen", {items: view.update.stillOpen.join("; ")})}</p> : null}
    </> : null}

    {framing.documentsValidated === false ? <p>{t("notValidated")}</p> : null}
    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {known("gapReasons", g.reason)}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
