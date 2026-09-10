"use client";

import {useId, type MouseEvent} from "react";
import {useTranslations} from "next-intl";
import {DecisionSeriesChart} from "./decision-series-chart";
import {formatPreviewAnnualPercentage, formatPreviewNumber} from "./preview-value-format";
import type {DecisionArtifactContract} from "@offroad/case-understanding";
import {ArrowDownToLine, CircleDotDashed, FileSpreadsheet, LockKeyhole, Milestone, Presentation} from "lucide-react";

type Props = {
  contract: DecisionArtifactContract;
  locale: "pt-BR" | "en-US";
  materialHref?: string;
};

function displayValue(value: string | number | boolean | null, unit: string | null, locale: "pt-BR" | "en-US", t: ReturnType<typeof useTranslations>): string {
  if (value === null) return t("notComputable");
  if (typeof value === "boolean") return t(value ? "yes" : "no");
  if (unit === "decimal a.a.") return formatPreviewAnnualPercentage(value, locale) ?? String(value);
  const number = typeof value === "number" ? value : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
  if (number === null) return String(value);
  if (unit === "BRL thousand") {
    const formatter = new Intl.NumberFormat(locale, {style: "currency", currency: "BRL", maximumFractionDigits: 2});
    if (Math.abs(number) >= 1_000_000) return `${formatter.format(number / 1_000_000)} bi`;
    return `${formatter.format(number / 1_000)} mi`;
  }
  if (unit === "x") return `${new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(number)}x`;
  return `${new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(number)}${unit ? ` ${unit}` : ""}`;
}

function exactValue(value: string | number | boolean | null, unit: string | null, locale: "pt-BR" | "en-US", t: ReturnType<typeof useTranslations>): string {
  if (value === null) return t("notComputable");
  if (typeof value === "string" || typeof value === "number") return `${formatPreviewNumber(value, locale)}${unit ? ` ${unit}` : ""}`;
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

export function DecisionArtifactWork({contract, locale, materialHref}: Props) {
  const t = useTranslations("decisionReadout");
  const prefix = useId();
  const anchor = (kind: string, ...ids: string[]) => `${prefix}-${kind}-${ids.map((id) => Array.from(new TextEncoder().encode(id), (byte) => byte.toString(16).padStart(2, "0")).join("")).join("-")}`;
  const conversation = contract.views.find((view) => view.surface === "conversation");
  const claims = new Map(contract.claims.map((item) => [item.id, item]));
  const series = new Map(contract.series?.map((item) => [item.id, item]) ?? []);
  const hasStoredArtifact = (surface: "workbook" | "presentation") => {
    const fingerprint = contract.views.find((view) => view.surface === surface)?.artifactFingerprint;
    return typeof fingerprint === "string" && /^[a-f0-9]{64}$/.test(fingerprint);
  };
  const workbookReady = hasStoredArtifact("workbook");
  const presentationReady = hasStoredArtifact("presentation");
  type References = {sourceIds: string[]; assumptionIds: string[]; gapIds: string[]};
  const origins: Array<{id: string; label: string; refs: References}> = [];
  for (const block of conversation?.blocks ?? []) {
    origins.push({id: anchor("block", block.id), label: block.title, refs: block});
    for (const id of new Set(block.claimIds)) {
      const claim = claims.get(id);
      if (claim) origins.push({id: anchor("claim", block.id, id), label: claim.label, refs: claim});
    }
    for (const id of new Set(block.seriesIds ?? [])) {
      series.get(id)?.points.forEach((point, index) => origins.push({id: anchor("point", block.id, id, String(index)), label: `${series.get(id)!.label} · ${point.label}`, refs: point}));
    }
  }
  const revealTarget = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Reveal the addressed evidence before native fragment navigation moves focus.
    let parent = document.getElementById(id)?.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
  };
  const references = (refs: References) => <nav className="decision-work__block-links" aria-label={t("references")}>
    {([['source', refs.sourceIds, contract.sources], ['assumption', refs.assumptionIds, contract.assumptions], ['gap', refs.gapIds, contract.gaps]] as const).flatMap(([kind, ids, items]) => [...new Set(ids)].map((id) => {
      const item = items.find((entry) => entry.id === id);
      return item ? <a key={`${kind}:${id}`} href={`#${anchor(kind, id)}`} onClick={revealTarget(anchor(kind, id))}>{"title" in item ? item.title : item.label}</a> : null;
    }))}
  </nav>;
  const backlinks = (kind: "sourceIds" | "assumptionIds" | "gapIds", id: string) => <nav className="decision-work__backlinks">{origins.filter((origin) => origin.refs[kind].includes(id)).map((origin) => <a key={origin.id} href={`#${origin.id}`} onClick={revealTarget(origin.id)}>{t("back", {label: origin.label})}</a>)}</nav>;
  const date = (value: string) => new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "UTC"}).format(new Date(`${value}T00:00:00Z`));
  return <article className="decision-work" data-testid="preview-decision-artifact">
    <header className="decision-work__header">
      <div><span className="decision-work__eyebrow"><Milestone aria-hidden="true" size={13} /> {t("eyebrow")}</span><h2>{t("title")}</h2><p>{t("trace")}</p></div>
      <div className="decision-work__status"><span><LockKeyhole aria-hidden="true" size={12} /> {t(`status.${contract.status}`)}</span><span>{t(`release.${contract.release.state}`)}</span><small>{t("asOf")} {date(contract.asOf)}</small></div>
    </header>
    <div className="decision-work__blocks">
      {(conversation?.blocks ?? []).map((block) => <section className="decision-work__block" data-block-kind={block.kind} key={block.id} id={anchor("block", block.id)} tabIndex={-1} aria-labelledby={anchor("heading", block.id)}>
        <h3 id={anchor("heading", block.id)}>{block.title}</h3>
        <div className="decision-work__metrics">{[...new Set(block.claimIds)].map((id) => {
          const claim = claims.get(id);
          return claim ? <div className="decision-work__metric" key={id} id={anchor("claim", block.id, id)} tabIndex={-1}>
            <span>{claim.label}</span><strong>{displayValue(claim.value, claim.unit, locale, t)}</strong>
            <small data-evidence-state={claim.evidenceState}><CircleDotDashed aria-hidden="true" size={11} /> {t(`evidence.${claim.evidenceState}`)}</small>
            <details><summary>{t("why")} · {claim.label}</summary><dl>
              <div><dt>{t("exact")}</dt><dd>{exactValue(claim.value, claim.unit, locale, t)}</dd></div>
              <div><dt>{t("definition")}</dt><dd>{claim.object.type} · {claim.object.path}</dd></div>
              <div><dt>{t("object")}</dt><dd>{claim.object.id}<code>{claim.object.fingerprint}</code></dd></div>
            </dl>{references(claim)}</details>
          </div> : null;
        })}</div>
        {[...new Set(block.seriesIds ?? [])].map((id) => {
          const item = series.get(id);
          return item ? <div className="decision-work__series" key={id}><DecisionSeriesChart series={item} locale={locale} missingLabel={t("notComputable")} /><div className="decision-work__series-table" role="region" aria-label={item.label} tabIndex={0}><table><caption>{item.label}{item.unit ? ` · ${item.unit}` : ""}</caption><thead><tr><th scope="col">{t("period")}</th><th scope="col">{t("exact")}</th><th scope="col">{t("evidenceLabel")}</th><th scope="col">{t("references")}</th></tr></thead><tbody>{item.points.map((point, index) => <tr key={index} id={anchor("point", block.id, id, String(index))} tabIndex={-1}><th scope="row">{point.label}</th><td>{exactValue(point.value, item.unit, locale, t)}</td><td>{t(`evidence.${point.evidenceState}`)}</td><td>{references(point)}</td></tr>)}</tbody></table></div><details><summary>{t("definition")}</summary><p>{item.object.id} · {item.object.type} · {item.object.path}</p><code>{item.object.fingerprint}</code></details></div> : null;
        })}
        {references(block)}
      </section>)}
    </div>
    {contract.assumptions.length ? <section className="decision-work__section"><h3>{t("assumptions")}</h3><div className="decision-work__rows">{contract.assumptions.map((item) => <div className="decision-work__row" key={item.id} id={anchor("assumption", item.id)} tabIndex={-1}><div><strong>{item.label}</strong><p>{item.unit === "decimal a.a." ? displayValue(item.value, item.unit, locale, t) : exactValue(item.value, item.unit, locale, t)}</p>{item.unit === "decimal a.a." ? <small>{t("exact")}: {exactValue(item.value, item.unit, locale, t)}</small> : null}<small>{item.basis}</small><small>{t(item.editable ? "editable" : "fixed")}</small>{references({sourceIds: item.sourceIds, assumptionIds: [], gapIds: []})}{backlinks("assumptionIds", item.id)}</div></div>)}</div></section> : null}
    {contract.gaps.length ? <section className="decision-work__section decision-work__section--gaps"><h3>{t("gaps")}</h3><div className="decision-work__gaps">{contract.gaps.map((item) => <article key={item.id} id={anchor("gap", item.id)} tabIndex={-1}><div><span data-materiality={item.materiality}>{t(`materiality.${item.materiality}`)}</span><h4>{item.label}</h4></div><p><b>{t("impact")}.</b> {item.impact}</p><p><b>{t("needed")}.</b> {item.requestedInput}</p>{backlinks("gapIds", item.id)}</article>)}</div></section> : null}
    {contract.sources.length ? <section className="decision-work__section"><details className="decision-work__source-register"><summary><h3>{t("sources")} <span>({contract.sources.length})</span></h3></summary>{contract.sources.map((item) => <div className="decision-work__source" key={item.id} id={anchor("source", item.id)} tabIndex={-1}><h4>{item.title}</h4><p>{t(`classification.${item.classification}`)} · {t("asOf")} {date(item.asOf)}</p><p>{item.locator}</p>{backlinks("sourceIds", item.id)}</div>)}</details></section> : null}
    {materialHref && (workbookReady || presentationReady) ? <footer className="decision-work__materials"><div><ArrowDownToLine aria-hidden="true" size={16} /><span>{t("materials")}</span></div><nav>{workbookReady ? <a href={`${materialHref}?format=xlsx`}><FileSpreadsheet aria-hidden="true" size={15} /> {t("workbook")}</a> : null}{presentationReady ? <a href={`${materialHref}?format=pptx`}><Presentation aria-hidden="true" size={15} /> {t("presentation")}</a> : null}</nav></footer> : null}
  </article>;
}
