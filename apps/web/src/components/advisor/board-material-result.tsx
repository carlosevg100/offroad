import {getTranslations} from "next-intl/server";
import type {BoardMaterialResultBlocksView} from "../../../../../packages/domain-contracts/src/lote4-board-material-result-blocks";
import {formatIsoDate} from "@/lib/execution/format";

/** The board discussion of a capital decision (C47), as the blocks carry it. Before the material: the deliberations in
 * urgency order with deadline and authority, the narrative and only the questions that change the material. With the
 * material: the deliberations, the pages with each title a conclusion, the summary for prior reading, the likely
 * questions with answers, the appendix, the identity check of every number against the reviewed result it is read
 * from, what is pending, each omission request and its outcome, and the versions kept. Every text is the method's own;
 * this page writes no number. Nothing was presented or sent to anyone. */
export async function BoardMaterialResult({locale, view}: {locale: string; view: BoardMaterialResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.boardMaterial"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const day = (d: string) => formatIsoDate(d, locale);
  const {framing} = view;
  const main = view.pages.filter((p) => p.placement === "main"), appendixPages = view.pages.filter((p) => p.placement === "appendix");
  const checked = view.identity.length;
  const page = (p: BoardMaterialResultBlocksView["pages"][number]) => <li key={p.id}>
    <strong>{t("pageTitle", {number: String(p.number), title: p.title})}</strong>
    {p.lines.length ? <ul>{p.lines.map((l, n) => <li key={n}>{l}</li>)}</ul> : null}
    {p.recommendation ? <p>{p.recommendation}</p> : null}
    {p.options.length ? <><p>{t("options")}</p><ul>{p.options.map((o, n) => <li key={n}>{o}</li>)}</ul></> : null}
  </li>;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    {framing.stage === "outline" ? <p>{t("outlineFirst")}</p> : framing.stage === "material" ? <p>{t("materialReady", {version: String(framing.version ?? 1)})}</p> : <p>{t("noReading")}</p>}

    {view.deliberations.length ? <>
      <h3>{t("deliberations")}</h3>
      <ol>{view.deliberations.map((d) => <li key={d.id}><strong>{d.title}</strong>: {d.text} <small>({known("authorities", d.authority)})</small>
        {d.deadlines.length ? <ul>{d.deadlines.map((x) => <li key={x.id}>{t("deadline", {action: x.action, date: day(x.date)})}</li>)}</ul> : null}</li>)}</ol>
    </> : null}

    {framing.stage === "outline" ? <>
      <h3>{t("narrative")}</h3>
      <p>{view.outline.narrative.map((r) => known("roles", r)).join("; ")}</p>
      {view.outline.questions.length ? <><h3>{t("questionsBefore")}</h3>
        <ul>{view.outline.questions.map((q, n) => <li key={n}>{known("outlineQuestions", q.code)}</li>)}</ul></> : null}
    </> : null}

    {main.length ? <>
      <h3>{t("pages", {count: String(main.length)})}</h3>
      {framing.agenda ? <p>{framing.agenda.fits === null ? t("agendaUnknown", {perPage: String(framing.agenda.minutesPerPage)})
        : framing.agenda.fits ? t("agendaFits", {minutes: String(framing.agenda.minutes), pages: String(framing.agenda.mainPages)})
        : t("agendaExceeds", {minutes: String(framing.agenda.minutes), pages: String(framing.agenda.mainPages), capacity: String(framing.agenda.capacity)})}</p> : null}
      <ol className="board-material-pages">{main.map(page)}</ol>
      {appendixPages.length ? <><h3>{t("appendixPages")}</h3><ol>{appendixPages.map(page)}</ol></> : null}
    </> : null}

    {view.summary ? <><h3>{t("summary")}</h3><p>{view.summary}</p></> : null}

    {view.questions.length ? <>
      <h3>{t("questions")}</h3>
      <dl>{view.questions.map((q) => <div key={q.id}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}</dl>
    </> : null}

    {view.appendix.length ? <>
      <h3>{t("appendix")}</h3>
      <ul>{view.appendix.map((a) => <li key={a.id}>{a.label}</li>)}</ul>
    </> : null}

    {checked ? <>
      <h3>{t("identity")}</h3>
      <p>{framing.allFiguresMatch && framing.materialFactsShown ? t("identityMatches", {count: String(checked), facts: String(framing.materialFacts ?? 0)}) : t("identityPartial", {count: String(checked)})}</p>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.shown")}</th><th scope="col">{t("columns.source")}</th><th scope="col">{t("columns.path")}</th></tr></thead>
          <tbody>{view.identity.map((r) => <tr key={r.figureId}><th scope="row">{r.display}</th><td>{known("sources", r.sourceId)}</td><td><code>{r.path}</code></td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.pending.indicative.length || view.pending.figures.length || view.pending.sources.length || view.pending.template ? <>
      <h3>{t("pending")}</h3>
      <ul>
        {view.pending.indicative.length ? <li>{t("indicative", {reason: view.pending.indicative[0]!.reason})}</li> : null}
        {view.pending.figures.map((f) => <li key={f.figureId}>{f.reason}</li>)}
        {view.pending.sources.map((s) => <li key={s.sourceId}>{t("sourcePartial", {source: known("sources", s.sourceId)})}</li>)}
        {view.pending.template ? <li>{known("templates", view.pending.template)}</li> : null}
      </ul>
    </> : null}

    {view.omissions.length ? <>
      <h3>{t("omissions")}</h3>
      <ul>{view.omissions.map((o) => <li key={o.id}>{t("omission", {requester: o.requestedBy, outcome: known("outcomes", o.outcome)})} {o.reason}</li>)}</ul>
    </> : null}

    {view.versions.length > 1 ? <p>{t("versionsKept", {count: String(view.versions.length)})}</p> : null}
    {framing.sentToThirdParties === false && framing.presented === false ? <p>{t("notSent")}</p> : null}

    <h3>{t("sourcesTitle")}</h3>
    <ul>{view.sources.map((s) => <li key={s.id}>{known("sources", s.id)} <small>({s.methodVersion})</small></li>)}</ul>

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {known("gapReasons", g.reason)}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
