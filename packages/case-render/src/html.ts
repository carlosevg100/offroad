import type {Material, MaterialBlock, MaterialKind} from "@offroad/case-materials";

/**
 * The material as a document somebody prints, signs, and puts in front of a committee.
 *
 * Everything upstream produced structure, headings, metrics, tables, claims with their
 * support ids. This turns that structure into an A4 document in the Offroad template, and it
 * is deliberately a pure string function: no DOM, no headless browser, no render service. It
 * runs in a route handler on the edge of a request and costs nothing, which matters because a
 * document nobody can produce on demand is a document nobody uses.
 *
 * Two things are load-bearing and easy to get wrong:
 *
 * **Every value is escaped.** Most of the text here was written by a model over a company's
 * documents. A legal name with an ampersand, a covenant clause with a `<`, a model that
 * decides to emit a tag, any of them turns an unescaped template into a broken or hostile
 * page. Nothing reaches the output without passing through `escapeHtml`.
 *
 * **The citations print.** A claim carries the ids of the facts behind it, and those markers
 * survive into the PDF along with an appendix that resolves them. A credit memo whose numbers
 * cannot be traced back to a document is exactly the artifact this product exists to replace,
 * dropping the markers "because they look technical" would be dropping the product.
 */

export type Lang = "pt" | "en";

export type RenderMeta = {
  /** Redacted upstream when the company has not authorised disclosure. */
  companyName?: string;
  /** ISO date the document was produced. Printed, because a credit memo without a date is worthless. */
  issuedOn: string;
  /** Resolves a support id to the fact and the document behind it, for the appendix. */
  sources?: Array<{id: string; label: string; document?: string}>;
  /** Adds the print dialog on load; off for previews. */
  autoPrint?: boolean;
};

const copy = {
  issued: {pt: "Emitido em", en: "Issued on"},
  prepared: {pt: "Preparado por", en: "Prepared by"},
  confidential: {pt: "Confidencial", en: "Confidential"},
  sources: {pt: "Fontes", en: "Sources"},
  sourcesNote: {
    pt: "Cada marcador no texto remete a um número desta lista, e cada número remete ao documento de origem.",
    en: "Each marker in the text refers to a number in this list, and each number refers to the source document.",
  },
  kind: {
    teaser: {pt: "Resumo da operação", en: "Transaction summary"},
    credit_profile: {pt: "Perfil de crédito", en: "Credit profile"},
    package: {pt: "Material completo", en: "Full package"},
    credit_memo: {pt: "Memorando de Crédito", en: "Credit Memorandum"},
    term_sheet: {pt: "Term Sheet indicativo", en: "Indicative Term Sheet"},
    diligence_qa: {pt: "Q&A de diligência", en: "Diligence Q&A"},
    data_room_index: {pt: "Sala de dados de saída", en: "Outbound data room"},
  } satisfies Record<MaterialKind, {pt: string; en: string}>,
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders support ids as numbered markers against the appendix.
 *
 * Numbers rather than raw ids because `historical_financials.2025.ebitda` in the middle of a
 * sentence is noise to a reader and the id is meaningless to them anyway; the appendix carries
 * the full path and the document. Unknown ids still print, an unresolved marker is a visible
 * defect, and silently dropping it would hide a broken trace.
 */
function marker(supportIds: readonly string[] | undefined, order: Map<string, number>): string {
  if (!supportIds || supportIds.length === 0) return "";
  const numbers = supportIds.map((id) => {
    if (!order.has(id)) order.set(id, order.size + 1);
    return order.get(id)!;
  });
  return `<sup class="cite">${numbers.join(",")}</sup>`;
}

function renderBlock(block: MaterialBlock, lang: Lang, order: Map<string, number>): string {
  switch (block.type) {
    case "heading":
      return `<h2>${escapeHtml(block.text[lang])}</h2>`;

    case "paragraph":
      return `<p>${escapeHtml(block.text[lang])}${marker(block.supportIds, order)}</p>`;

    case "metrics":
      return `<div class="metrics">${block.items
        .map(
          (item) =>
            `<div class="metric"><span class="metric__label">${escapeHtml(item.label[lang])}</span>` +
            `<strong class="metric__value">${escapeHtml(item.formatted[lang])}${marker(item.supportIds, order)}</strong></div>`,
        )
        .join("")}</div>`;

    case "table": {
      // A column whose every cell reads as a number is set right-aligned in tabular figures,
      // which is how a desk reads a table: the eye runs down the digits, not across the text.
      const numeric = block.head.map((_, column) =>
        block.rows.length > 0 && block.rows.every((row) => /^([R$€US\s]*[-+]?[\d.,]+\s*(%|x|dias|meses)?|\d{4}-\d{2}-\d{2})$/.test((row[column] ?? "").trim())),
      );
      const cellClass = (column: number) => (numeric[column] ? ' class="num"' : "");
      return (
        `<figure class="table"><figcaption>${escapeHtml(block.caption[lang])}</figcaption><table><thead><tr>` +
        block.head.map((cell, column) => `<th${cellClass(column)}>${escapeHtml(cell[lang])}</th>`).join("") +
        `</tr></thead><tbody>` +
        block.rows
          .map((row) => `<tr>${row.map((cell, column) => `<td${cellClass(column)}>${escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("") +
        `</tbody></table></figure>`
      );
    }

    case "kv":
      return (
        `<figure class="kv">${block.caption ? `<figcaption>${escapeHtml(block.caption[lang])}</figcaption>` : ""}<table><tbody>` +
        block.rows
          .map(
            (row) =>
              `<tr><th scope="row">${escapeHtml(row.label[lang])}</th><td>${escapeHtml(row.value[lang])}${marker(row.supportIds, order)}` +
              `${row.note ? `<span class="kv__note">${escapeHtml(row.note[lang])}</span>` : ""}</td></tr>`,
          )
          .join("") +
        `</tbody></table></figure>`
      );

    case "callout":
      return (
        `<aside class="callout"><h3>${escapeHtml(block.title[lang])}</h3><dl>` +
        block.items.map((item) => `<div><dt>${escapeHtml(item.label[lang])}</dt><dd>${escapeHtml(item.value[lang])}</dd></div>`).join("") +
        `</dl></aside>`
      );

    case "list":
      return `<ul class="points">${block.items.map((item) => `<li>${escapeHtml(item[lang])}</li>`).join("")}</ul>`;

    case "disclaimer":
      return `<p class="disclaimer">${escapeHtml(block.text[lang])}</p>`;
  }
}

/** A4 in the Offroad template: quiet, dense, printable, no chrome that costs ink. */
const styles = `
:root {
  --ink: #151a20;
  --ink-soft: #343c45;
  --muted: #707984;
  --line: #d7dce0;
  --soft: #e7ebed;
  --accent: #253743;
  --accent-soft: #e7eef1;
  --paper: #ffffff;
}

@page { size: A4; margin: 18mm 16mm 20mm; }

* { box-sizing: border-box; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  background: var(--paper);
  color: var(--ink);
  font-family: Inter, -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  margin: 0 auto;
  max-width: 178mm;
  padding: 18mm 0 24mm;
}

/* Masthead: the reader must know whose document this is and when it was true. */
.masthead {
  align-items: baseline;
  border-bottom: 2px solid var(--accent);
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  justify-content: space-between;
  padding-bottom: 10px;
}

.masthead__brand {
  font-size: 12pt;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.masthead__meta { color: var(--muted); font-size: 8.5pt; letter-spacing: 0.06em; text-transform: uppercase; }

.title { margin: 26px 0 20px; }

.title__kind { color: var(--muted); font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase; }

.title h1 {
  font-family: Newsreader, Georgia, "Times New Roman", serif;
  font-size: 24pt;
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin: 6px 0 0;
  text-wrap: balance;
}

.title__company { color: var(--ink-soft); font-size: 11pt; margin: 6px 0 0; }

h2 {
  border-top: 1px solid var(--line);
  break-after: avoid;
  font-family: Newsreader, Georgia, serif;
  font-size: 14pt;
  font-weight: 500;
  margin: 26px 0 10px;
  padding-top: 12px;
}

p { margin: 0 0 10px; orphans: 3; widows: 3; }

/* Tables: quiet rules, tabular digits, numbers flush right. */
.table { margin: 14px 0 18px; }
.table figcaption, .kv figcaption { color: var(--muted); font-size: 8.5pt; letter-spacing: 0.06em; margin-bottom: 6px; text-transform: uppercase; }
.table table, .kv table { border-collapse: collapse; font-size: 9.25pt; width: 100%; }
.table th, .table td { border-bottom: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; }
.table thead th { border-bottom: 1.5px solid var(--accent); color: var(--ink-soft); font-size: 8.25pt; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.table th.num, .table td.num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.table tbody tr:last-child td { border-bottom: 1.5px solid var(--line); }

/* Key-value terms: the term sheet's backbone. */
.kv { margin: 12px 0 18px; }
.kv th { color: var(--ink-soft); font-weight: 600; padding: 7px 12px 7px 0; text-align: left; vertical-align: top; width: 30%; border-bottom: 1px solid var(--line); }
.kv table td, .kv table th { text-align: left; }
.kv td { border-bottom: 1px solid var(--line); padding: 7px 0; vertical-align: top; }
.kv__note { color: var(--muted); display: block; font-size: 8.5pt; line-height: 1.45; margin-top: 3px; }

/* Callout: key terms at the top, basis of preparation at the end. */
.callout { background: var(--accent-soft); border-left: 3px solid var(--accent); break-inside: avoid; margin: 18px 0; padding: 12px 16px 8px; }
.callout h3 { color: var(--accent); font-size: 8.5pt; letter-spacing: 0.14em; margin: 0 0 8px; text-transform: uppercase; }
.callout dl { display: grid; gap: 4px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
.callout div { display: grid; gap: 1px; padding: 4px 0; border-bottom: 1px solid rgb(37 55 67 / 12%); }
.callout dt { color: var(--muted); font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; }
.callout dd { font-size: 10pt; font-weight: 500; margin: 0; }

sup.cite {
  color: var(--accent);
  font-size: 7pt;
  font-weight: 600;
  padding-left: 2px;
  vertical-align: super;
}

/* Figures the eye lands on first: the numbers a committee reads before the prose. */
.metrics {
  break-inside: avoid;
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(auto-fit, minmax(46mm, 1fr));
  background: var(--line);
  border: 1px solid var(--line);
  margin: 14px 0 18px;
}

.metric { background: var(--paper); display: grid; gap: 3px; padding: 10px 12px; }

.metric__label { color: var(--muted); font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; }

.metric__value { font-size: 13pt; font-variant-numeric: tabular-nums; font-weight: 600; }

.table { break-inside: avoid; margin: 14px 0 18px; }

.table figcaption { color: var(--muted); font-size: 8.5pt; letter-spacing: 0.08em; margin-bottom: 6px; text-transform: uppercase; }

table { border-collapse: collapse; font-size: 9.5pt; width: 100%; }

thead { display: table-header-group; }

th {
  background: var(--accent-soft);
  border-bottom: 1px solid var(--line);
  font-size: 8.5pt;
  letter-spacing: 0.04em;
  padding: 7px 9px;
  text-align: left;
  text-transform: uppercase;
}

td { border-bottom: 1px solid var(--soft); font-variant-numeric: tabular-nums; padding: 7px 9px; }

td:not(:first-child), th:not(:first-child) { text-align: right; }

.points { margin: 0 0 14px; padding-left: 18px; }

.points li { margin-bottom: 5px; }

.disclaimer {
  border-left: 2px solid var(--line);
  color: var(--muted);
  font-size: 8.5pt;
  line-height: 1.45;
  margin: 18px 0 0;
  padding-left: 12px;
}

/* The appendix is the product: every marker in the text resolves to a document here. */
.sources { break-inside: auto; margin-top: 30px; }

.sources h2 { margin-bottom: 6px; }

.sources__note { color: var(--muted); font-size: 8.5pt; margin-bottom: 10px; }

.sources ol { font-size: 8.5pt; margin: 0; padding-left: 20px; }

.sources li { break-inside: avoid; margin-bottom: 4px; }

.sources__doc { color: var(--muted); }

/* Chrome repeats a fixed footer on every printed page; screen keeps it out of the flow. */
.footer {
  border-top: 1px solid var(--line);
  bottom: 0;
  color: var(--muted);
  display: flex;
  font-size: 7.5pt;
  justify-content: space-between;
  left: 0;
  letter-spacing: 0.08em;
  padding-top: 6px;
  position: fixed;
  right: 0;
  text-transform: uppercase;
}

@media screen {
  body { background: #f0f2f3; }
  .sheet { background: var(--paper); box-shadow: 0 24px 64px rgb(13 22 30 / 10%); padding: 20mm; }
  .footer { position: static; margin-top: 24px; }
}
`;

/**
 * One material, one printable document.
 *
 * The appendix is built from the markers actually emitted, in the order they appear, so a
 * document never carries a source list longer than the claims it makes.
 */
export function renderMaterialHtml(input: {material: Material; lang: Lang; meta: RenderMeta}): string {
  const {material, lang, meta} = input;
  const order = new Map<string, number>();
  const body = material.blocks.map((block) => renderBlock(block, lang, order)).join("\n");

  const known = new Map((meta.sources ?? []).map((source) => [source.id, source]));
  const appendix = [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => {
      const source = known.get(id);
      const label = escapeHtml(source?.label ?? id);
      const document = source?.document ? ` <span class="sources__doc">· ${escapeHtml(source.document)}</span>` : "";
      return `<li>${label}${document}</li>`;
    })
    .join("");

  const company = meta.companyName ? `<p class="title__company">${escapeHtml(meta.companyName)}</p>` : "";
  const documentTitle = `${material.title[lang]}${meta.companyName ? `, ${meta.companyName}` : ""}`;

  return `<!doctype html>
<html lang="${lang === "pt" ? "pt-BR" : "en-US"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:wght@400;500&display=swap">
<style>${styles}</style>
</head>
<body>
<div class="sheet">
  <header class="masthead">
    <span class="masthead__brand">Offroad Capital</span>
    <span class="masthead__meta">${escapeHtml(copy.confidential[lang])} · ${escapeHtml(copy.issued[lang])} ${escapeHtml(meta.issuedOn)}</span>
  </header>

  <div class="title">
    <span class="title__kind">${escapeHtml(copy.kind[material.kind][lang])}</span>
    <h1>${escapeHtml(material.title[lang])}</h1>
    ${company}
  </div>

${body}

${
  appendix
    ? `  <section class="sources">
    <h2>${escapeHtml(copy.sources[lang])}</h2>
    <p class="sources__note">${escapeHtml(copy.sourcesNote[lang])}</p>
    <ol>${appendix}</ol>
  </section>`
    : ""
}

  <footer class="footer">
    <span>Offroad Capital · ${escapeHtml(copy.confidential[lang])}</span>
    <span>${escapeHtml(meta.issuedOn)}</span>
  </footer>
</div>
${meta.autoPrint ? '<script>window.addEventListener("load", () => window.print());</script>' : ""}
</body>
</html>`;
}
