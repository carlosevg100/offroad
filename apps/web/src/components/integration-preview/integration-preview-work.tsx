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

const labels: Record<string, [string, string]> = {
  preview_debt_ledger: ["Dívida instrumento a instrumento", "Debt instrument by instrument"],
  preview_financial_statements: ["Conciliação de demonstrações", "Statement reconciliation"],
  preview_covenants: ["Covenants pelas escrituras", "Covenants from the indentures"],
  preview_maturity_wall: ["Vencimentos e cobertura", "Maturities and coverage"],
  preview_interest_schedule: ["Juros e correção por série", "Interest and indexation by series"],
  preview_exit_costs: ["Custo de saída por série", "Exit cost by series"],
  preview_scenarios: ["Cenários declarados", "Declared scenarios"],
  preview_alternatives: ["Alternativas antes e depois", "Alternatives before and after"],
  preview_meeting_brief: ["Plano da devolutiva e do material", "Readout and material plan"],
};
const order = Object.keys(labels);

const stateLabels: Record<string, [string, string]> = {
  complete: ["completo", "complete"], resolved: ["resolvido", "resolved"], closes: ["fecha", "closes"], declared: ["declarado", "declared"],
  compared: ["comparado", "compared"], diagnosed: ["diagnosticado", "diagnosed"], conditioned: ["condicionado", "conditioned"],
  incomplete: ["incompleto", "incomplete"], partial: ["parcial", "partial"], open_divergences: ["divergências abertas", "open divergences"],
  identity_failed: ["identidade não fecha", "identity failed"], blocked: ["bloqueado", "blocked"], planned: ["planejado", "planned"],
  awaiting_confirmation: ["aguardando confirmação", "awaiting confirmation"],
};

const copy = {
  "pt-BR": {
    kicker: "Validação interna, integration_preview",
    title: "Objetos do Caso 01 produzidos pelos métodos em estágio implemented",
    intro: "Cada seção é a saída do executor do método, sem redação por cima: estado declarado, números com origem, lacunas nomeadas. Nada aqui é liberação, parecer ou aprovação.",
    method: "Método", version: "versão", maturity: "estágio", state: "Estado", figures: "Números", gaps: "Lacunas e condições declaradas", evidence: "Evidência", table: "Linhas", more: "e mais", none: "nenhuma", premises: "Premissas aplicadas nesta corrida",
    artifact: "Artefato", updated: "atualizado em",
  },
  "en-US": {
    kicker: "Internal validation, integration_preview",
    title: "Case 01 objects produced by the methods in the implemented rung",
    intro: "Each section is the executor's output for the method, with no prose over it: declared state, numbers with their origin, named gaps. Nothing here is a release, an opinion or an approval.",
    method: "Method", version: "version", maturity: "rung", state: "State", figures: "Figures", gaps: "Declared gaps and conditions", evidence: "Evidence", table: "Rows", more: "and", none: "none", premises: "Premises applied in this run",
    artifact: "Artifact", updated: "updated at",
  },
} as const;

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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return /^-?\d+(\.\d+)?$/.test(value) ? value.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isRecord(value)) {
    if (typeof value.value === "string" && Object.keys(value).length <= 3) return formatValue(value.value);
    if (typeof value.document === "string") return `${value.document}${value.page ? ` p. ${String(value.page)}` : ""}${value.clause ? ` ${String(value.clause)}` : ""}`;
    return "{…}";
  }
  return String(value);
}

function scalarEntries(output: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(output)
    .filter(([key, value]) => !["schema_version", "trace", "state", "unit", "unit_anchor"].includes(key) && !gapKeys.includes(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null))
    .map(([key, value]) => [key.replace(/_/g, " "), formatValue(value)]);
}

function gapEntries(output: Record<string, unknown>): Array<{key: string; items: string[]}> {
  return gapKeys.flatMap((key) => {
    const value = output[key];
    if (!Array.isArray(value) || value.length === 0) return [];
    const items = value.map((item) => {
      if (typeof item === "string") return item;
      if (isRecord(item)) return [item.id ?? item.series_id ?? item.rowId ?? item.field ?? item.text ?? item.question, item.reason ?? item.condition ?? item.detail ?? item.note ?? item.state].filter((part) => typeof part === "string").join(": ") || JSON.stringify(item).slice(0, 200);
      return String(item);
    });
    return [{key: key.replace(/_/g, " "), items}];
  });
}

function rows(output: Record<string, unknown>, key: string): {columns: string[]; rows: string[][]; total: number} | null {
  const value = output[key];
  if (!Array.isArray(value) || value.length === 0 || !isRecord(value[0])) return null;
  const columns = Object.keys(value[0] as Record<string, unknown>).filter((column) => {
    const sample = (value[0] as Record<string, unknown>)[column];
    return typeof sample !== "object" || sample === null || (isRecord(sample) && (typeof sample.value === "string" || typeof sample.document === "string"));
  }).slice(0, 8);
  return {columns, rows: value.slice(0, 12).map((row) => columns.map((column) => formatValue((row as Record<string, unknown>)[column]))), total: value.length};
}

export function IntegrationPreviewWork({artifacts, locale, materialHref}: Props) {
  const t = copy[locale];
  const latestByType = new Map<string, PreviewArtifactView>();
  for (const artifact of [...artifacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latestByType.set(artifact.type, artifact);
  const sections = order.flatMap((type) => (latestByType.has(type) ? [latestByType.get(type)!] : []));
  return (
    <article className="preview-work" data-testid="integration-preview-work">
      <header className="preview-work__header">
        <span className="preview-work__kicker"><FlaskConical aria-hidden="true" size={13} /> {t.kicker}</span>
        <h2>{t.title}</h2>
        <p>{t.intro}</p>
      </header>
      {sections.map((artifact) => {
        const content = isRecord(artifact.content) ? artifact.content : {};
        const preview = isRecord(content.preview) ? content.preview : {};
        const output = isRecord(content.output) ? content.output : {};
        const state = typeof output.state === "string" ? output.state : "blocked";
        const stateLabel = stateLabels[state]?.[locale === "en-US" ? 1 : 0] ?? state;
        const premises = isRecord(preview.premisesApplied) ? Object.entries(preview.premisesApplied) : [];
        const tables = (tableKeys[artifact.type] ?? []).map((key) => ({key, table: rows(output, key)})).filter((entry) => entry.table);
        const brief = artifact.type === "preview_meeting_brief" && isRecord(output.deliverable) ? output.deliverable : null;
        const pagePlan = artifact.type === "preview_meeting_brief" && isRecord(output.page_plan) ? output.page_plan : null;
        const synthesis = artifact.type === "preview_material" && Array.isArray(output.sections) ? output.sections as Array<{id: string; title: string; paragraphs: Array<{text: string; references: string[]}>}> : null;
        const synthesisSource = artifact.type === "preview_material" && isRecord(output.source) ? output.source : null;
        return (
          <section className={`preview-work__section is-${state}`} data-artifact-type={artifact.type} key={artifact.id}>
            <header>
              <div>
                <h3>{labels[artifact.type]?.[locale === "en-US" ? 1 : 0] ?? artifact.type}</h3>
                <small>{t.method} {String(preview.methodId ?? "")} · {t.version} {String(preview.methodVersion ?? "")} · {t.maturity} {String(preview.methodMaturity ?? "")} · {t.artifact} v{artifact.version}</small>
              </div>
              <span className="preview-work__state" data-state={state}>{t.state}: {stateLabel}</span>
            </header>
            {premises.length ? <p className="preview-work__premises"><strong>{t.premises}:</strong> {premises.map(([key, value]) => `${key} = ${String(value)}`).join("; ")}</p> : null}
            {brief ? <div className="preview-work__blocks">
              {(Array.isArray(brief.blocks) ? brief.blocks : []).map((block) => isRecord(block) ? <div className={`preview-work__block is-${String(block.state)}`} key={String(block.id)}>
                <strong>{String(block.label)}</strong>
                {Array.isArray(block.headlines) && block.headlines.length ? <ul>{block.headlines.map((headline, index) => isRecord(headline) ? <li key={index}>{String(headline.text)}</li> : null)}</ul> : null}
                {typeof block.gap === "string" ? <small>{block.gap}</small> : null}
              </div> : null)}
              {synthesis ? (
              <div className="preview-work__synthesis" data-source={String(synthesisSource?.kind ?? "")}>
                {materialHref ? <p className="preview-work__downloads"><a href={`${materialHref}?format=docx`}>{locale === "en-US" ? "Download the Word file" : "Baixar o arquivo Word"}</a> · <a href={`${materialHref}?format=xlsx`}>{locale === "en-US" ? "Download the spreadsheet" : "Baixar a planilha"}</a></p> : null}
                {synthesisSource ? <p className="preview-work__note">{locale === "en-US" ? "Source" : "Fonte"}: {String(synthesisSource.kind)}{synthesisSource.model ? ` · ${String(synthesisSource.model)}` : ""}{typeof synthesisSource.costUsd === "number" ? ` · US$ ${synthesisSource.costUsd.toFixed(4)}` : ""}</p> : null}
                {synthesis.map((section) => (
                  <section key={section.id}>
                    <h4>{section.title}</h4>
                    {section.paragraphs.map((paragraph, index) => <p key={`${section.id}-${index}`}>{paragraph.text}</p>)}
                  </section>
                ))}
              </div>
            ) : null}
            {pagePlan ? <div className="preview-work__pages"><strong>{String(pagePlan.state)}</strong>{Array.isArray(pagePlan.pages) ? <ol>{pagePlan.pages.map((page, index) => isRecord(page) ? <li key={index}>{String(page.title)}{Array.isArray(page.blocks) ? `: ${page.blocks.map(String).join(", ")}` : ""}</li> : null)}</ol> : null}{typeof pagePlan.reason === "string" ? <small>{pagePlan.reason}</small> : null}</div> : null}
            </div> : null}
            {!brief && scalarEntries(output).length ? <dl className="preview-work__figures">
              {scalarEntries(output).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
            </dl> : null}
            {tables.map(({key, table}) => <div className="preview-work__table" key={key}>
              <strong>{key.replace(/_/g, " ")} <small>({table!.total} {t.table.toLowerCase()})</small></strong>
              <div><table><thead><tr>{table!.columns.map((column) => <th key={column}>{column.replace(/_/g, " ")}</th>)}</tr></thead><tbody>{table!.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
              {table!.total > 12 ? <small>{t.more} {table!.total - 12}</small> : null}
            </div>)}
            {gapEntries(output).length ? <div className="preview-work__gaps"><strong>{t.gaps}</strong>{gapEntries(output).map((gap) => <div key={gap.key}><em>{gap.key}</em><ul>{gap.items.slice(0, 10).map((item, index) => <li key={index}>{item}</li>)}</ul>{gap.items.length > 10 ? <small>{t.more} {gap.items.length - 10}</small> : null}</div>)}</div> : null}
            {isRecord(preview.evidence) ? <p className="preview-work__evidence"><strong>{t.evidence}:</strong> {String(preview.evidence.caseId ?? "")} · {String(preview.evidence.basis ?? "")} · {String(preview.evidence.note ?? "")}</p> : null}
          </section>
        );
      })}
    </article>
  );
}
