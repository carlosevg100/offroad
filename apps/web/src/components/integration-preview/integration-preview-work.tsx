import {useTranslations} from "next-intl";
import {formatPreviewNumber} from "./preview-value-format";
import {FlaskConical} from "lucide-react";

/**
 * The work panel of a preview run: one section per method, read straight from the artifact the
 * executor produced. Nothing here is prose written for the screen; every value, state, gap and
 * anchor is the executor's own output. Each section names the method, its version and its
 * maturity, and the panel opens with the preview mark so no reader mistakes it for released work.
 */
export type PreviewArtifactView = {
  id: string;
  type: string;
  version: number;
  status: string;
  createdAt: string;
  content: unknown;
};

type Props = {artifacts: PreviewArtifactView[]; locale: "pt-BR" | "en-US"; materialHref?: string};

const order = ["preview_debt_ledger", "preview_financial_statements", "preview_covenants", "preview_maturity_wall", "preview_interest_schedule", "preview_exit_costs", "preview_scenarios", "preview_alternatives", "preview_meeting_brief", "preview_material"];
export function isSupportedPreviewArtifact(type: string): boolean { return order.includes(type); }

const knownStates = ["complete", "resolved", "closes", "declared", "compared", "diagnosed", "conditioned", "incomplete", "partial", "open_divergences", "identity_failed", "blocked", "planned", "awaiting_confirmation"];

const gapKeys = ["block_reasons", "incomplete_reasons", "unsupported", "unproven_conditions", "legal_conditions", "uncovered_terms", "uncovered_series", "assumptions", "open_divergences", "alignment_questions"];
const tableKeys: Record<string, string[]> = {
  preview_debt_ledger: ["ledger_rows"],
  preview_financial_statements: ["reconciliations", "identities"],
  preview_covenants: ["covenants"],
  preview_maturity_wall: ["walls", "sources"],
  preview_interest_schedule: ["schedule_by_series"],
  preview_exit_costs: ["exit_costs"],
  preview_scenarios: ["scenarios", "assumption_register"],
  preview_alternatives: ["alternatives"],
  preview_meeting_brief: [],
  preview_material: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tableRows(output: Record<string, unknown>, key: string) {
  const value = output[key];
  if (!Array.isArray(value) || value.length === 0) return null;
  const records: Record<string, unknown>[] = value.map((row) => isRecord(row) ? row : {value: row});
  return {columns: [...new Set(records.flatMap(Object.keys))], rows: records, total: records.length};
}

export function IntegrationPreviewWork({artifacts, locale, materialHref}: Props) {
  const t = useTranslations("IntegrationPreviewWork");
  const fieldLabel = (key: string) => t.has(`fields.${key}`) ? t(`fields.${key}`) : key;
  const knownStateLabel = (value: string) => knownStates.includes(value) ? t(`states.${value}`) : value;
  function valueView(value: unknown, field?: string): React.ReactNode {
    if (typeof value === "string" && (field === "state" || field === "status")) return knownStateLabel(value);
    if (typeof value === "string" && field && /(?:^id$|Id$|_id$|Fingerprint$|_fingerprint$|Path$|_path$|Url$|_url$|^(clause|page|period|year|version|series|document|locator|path|fingerprint|url|href|title|reference|anchor)$)/.test(field)) return value;
    if (value === null || value === undefined) return t("missing");
    if (typeof value === "boolean") return t(value ? "yes" : "no");
    if (Array.isArray(value)) return <details><summary>{t("details")} ({formatPreviewNumber(value.length, locale)})</summary><ol>{value.map((item, index) => <li key={index}>{valueView(item)}</li>)}</ol></details>;
    if (isRecord(value)) return <details><summary>{typeof value.value === "string" || typeof value.value === "number" ? <>{formatPreviewNumber(value.value, locale)}{typeof value.unit === "string" ? ` ${value.unit}` : ""} · </> : null}{t("details")}</summary><dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{valueView(item, key)}</dd></div>)}</dl></details>;
    return typeof value === "string" || typeof value === "number" ? formatPreviewNumber(value, locale) : String(value);
  }
  function renderTable(table: NonNullable<ReturnType<typeof tableRows>>, complete: boolean, title: string) {
    const columns = complete ? table.columns : table.columns.slice(0, 8);
    const rows = complete ? table.rows : table.rows.slice(0, 12);
    return <div role="region" aria-label={title} tabIndex={0} style={{overflowX: "auto"}}><table><caption>{title}</caption><thead><tr>{columns.map((column) => <th scope="col" key={column}>{fieldLabel(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{valueView(row[column], column)}</td>)}</tr>)}</tbody></table></div>;
  }
  const latestByType = new Map<string, PreviewArtifactView>();
  for (const artifact of [...artifacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latestByType.set(artifact.type, artifact);
  const sections = order.flatMap((type) => (latestByType.has(type) ? [latestByType.get(type)!] : []));
  return (
    <article className="preview-work" data-testid="integration-preview-work">
      <header className="preview-work__header">
        <span className="preview-work__kicker"><FlaskConical aria-hidden="true" size={13} /> {t("kicker")}</span>
        <h2>{t("title")}</h2>
        <p>{t("intro")}</p>
      </header>
      {sections.map((artifact) => {
        const content = isRecord(artifact.content) ? artifact.content : {};
        const preview = isRecord(content.preview) ? content.preview : {};
        const output = isRecord(content.output) ? content.output : {};
        const state = typeof output.state === "string" ? output.state : "blocked";
        const stateLabel = knownStates.includes(state) ? t(`states.${state}`) : state;
        const premises = isRecord(preview.premisesApplied) ? Object.entries(preview.premisesApplied) : [];
        const tables = (tableKeys[artifact.type] ?? []).map((key) => ({key, table: tableRows(output, key)})).filter((entry) => entry.table);
        const brief = artifact.type === "preview_meeting_brief" && isRecord(output.deliverable) ? output.deliverable : null;
        const pagePlan = artifact.type === "preview_meeting_brief" && isRecord(output.page_plan) ? output.page_plan : null;
        const synthesis = artifact.type === "preview_material" && Array.isArray(output.sections) ? output.sections as Array<{id: string; title: string; paragraphs: Array<{text: string; references: string[]}>}> : null;
        const synthesisSource = artifact.type === "preview_material" && isRecord(output.source) ? output.source : null;
        return (
          <section className={`preview-work__section is-${state}`} data-artifact-type={artifact.type} key={artifact.id} style={{minWidth: 0, overflowWrap: "anywhere"}}>
            <header style={{flexWrap: "wrap"}}>
              <div>
                <h3>{t(`methods.${artifact.type}`)}</h3>
                <small>{t("method")} {String(preview.methodId ?? "")} · {t("version")} {String(preview.methodVersion ?? "")} · {t("maturity")} {String(preview.methodMaturity ?? "")} · {t("artifact")} v{artifact.version}</small>
              </div>
              <span className="preview-work__state" data-state={state}>{t("state")}: {stateLabel}</span>
            </header>
            {premises.length ? <p className="preview-work__premises"><strong>{t("premises")}:</strong> {premises.map(([key, value]) => `${fieldLabel(key)} = ${formatPreviewNumber(typeof value === "number" || typeof value === "string" ? value : String(value), locale)}`).join("; ")}</p> : null}
            {brief ? <div className="preview-work__blocks">
              {(Array.isArray(brief.blocks) ? brief.blocks : []).map((block) => isRecord(block) ? <div className={`preview-work__block is-${String(block.state)}`} key={String(block.id)}>
                <strong>{String(block.label)}</strong>
                {Array.isArray(block.headlines) && block.headlines.length ? <ul>{block.headlines.map((headline, index) => isRecord(headline) ? <li key={index}>{String(headline.text)}</li> : null)}</ul> : null}
                {typeof block.gap === "string" ? <small>{block.gap}</small> : null}
              </div> : null)}
            {pagePlan ? <div className="preview-work__pages"><strong>{knownStateLabel(String(pagePlan.state))}</strong>{Array.isArray(pagePlan.pages) ? <ol>{pagePlan.pages.map((page, index) => isRecord(page) ? <li key={index}>{String(page.title)}{Array.isArray(page.blocks) ? `: ${page.blocks.map(String).join(", ")}` : ""}</li> : null)}</ol> : null}{typeof pagePlan.reason === "string" ? <small>{pagePlan.reason}</small> : null}</div> : null}
            </div> : null}
              {synthesis ? (
              <div className="preview-work__synthesis" data-source={String(synthesisSource?.kind ?? "")}>
                {materialHref ? <p className="preview-work__downloads"><a href={`${materialHref}?format=docx`}>{t("download")}</a></p> : null}
                {synthesisSource ? <p className="preview-work__note">{t("source")}: {String(synthesisSource.kind)}{synthesisSource.model ? ` · ${String(synthesisSource.model)}` : ""}{typeof synthesisSource.costUsd === "number" ? ` · US$ ${formatPreviewNumber(synthesisSource.costUsd, locale)}` : ""}</p> : null}
                {synthesis.map((section) => (
                  <section key={section.id}>
                    <h4>{section.title}</h4>
                    {section.paragraphs.map((paragraph, index) => <div key={`${section.id}-${index}`}>
                      <p>{paragraph.text}</p>
                      {Array.isArray(paragraph.references) && paragraph.references.length ? <div className="preview-work__paragraph-references"><strong>{t("references")}</strong><ul>{paragraph.references.map((reference, position) => <li key={position}><code>{reference}</code></li>)}</ul></div> : null}
                    </div>)}
                  </section>
                ))}
              </div>
            ) : null}
            {typeof output.unit === "string" ? <p><strong>{t("unit")}:</strong> {output.unit}</p> : null}
            {!brief ? <dl className="preview-work__figures">
              {Object.entries(output).filter(([key, value]) => !["schema_version", "state", "unit"].includes(key) && (value === null || ["string", "number", "boolean"].includes(typeof value))).map(([key, value]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{valueView(value, key)}</dd></div>)}
            </dl> : null}
            {tables.map(({key, table}) => table ? <div className="preview-work__table" key={key} style={{minWidth: 0}}>
              {renderTable(table, false, fieldLabel(key))}
              {table.total > 12 || table.columns.length > 8 ? <details><summary>{t("allRows", {count: table.total, columns: table.columns.length})}</summary>{renderTable(table, true, fieldLabel(key))}</details> : null}
            </div> : null)}
            {gapKeys.some((key) => Array.isArray(output[key]) && output[key].length > 0) ? <div className="preview-work__gaps"><strong>{t("gaps")}</strong>{gapKeys.map((key) => {
              const items = output[key];
              return Array.isArray(items) && items.length ? <div key={key}><em>{fieldLabel(key)}</em><ul>{items.slice(0, 10).map((item, index) => <li key={index}>{valueView(item)}</li>)}</ul>{items.length > 10 ? <details><summary>{t("allGaps", {count: items.length - 10})}</summary><ul>{items.slice(10).map((item, index) => <li key={index}>{valueView(item)}</li>)}</ul></details> : null}</div> : null;
            })}</div> : null}
            <details><summary>{t("raw")}</summary>{valueView(output)}</details>
            {isRecord(preview.evidence) ? <p className="preview-work__evidence"><strong>{t("evidence")}:</strong> {String(preview.evidence.caseId ?? "")} · {String(preview.evidence.basis ?? "")} · {String(preview.evidence.note ?? "")}</p> : null}
          </section>
        );
      })}
    </article>
  );
}
