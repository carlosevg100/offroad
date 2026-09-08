import {formatPreviewNumber} from "./preview-value-format";
import type {DecisionArtifactContract} from "@offroad/case-understanding";
import {ArrowDownToLine, CircleDotDashed, FileSpreadsheet, LockKeyhole, Milestone, Presentation} from "lucide-react";

type Props = {
  contract: DecisionArtifactContract;
  locale: "pt-BR" | "en-US";
  materialHref?: string;
};

const copy = {
  "pt-BR": {
    eyebrow: "Leitura de decisão",
    title: "O que a análise sustenta agora",
    internal: "Rascunho interno",
    asOf: "Data-base",
    exact: "Valor no objeto",
    why: "Como chegamos aqui",
    object: "Objeto assinado",
    sources: "Fontes utilizadas",
    assumptions: "Premissas que você pode alterar",
    gaps: "O que ainda muda a decisão",
    impact: "Impacto na análise",
    needed: "O que fecha este ponto",
    materiality: {blocker: "bloqueante", high: "alta", medium: "média", low: "baixa"},
    evidence: {observed_public: "observado · público", observed_private: "observado · privado", calculated: "calculado", assumption: "premissa", mixed: "misto", not_computable: "não calculável"},
    materials: "Materiais desta versão",
    workbook: "Baixar planilha",
    presentation: "Baixar apresentação",
    trace: "Todos os números acima apontam para o objeto, as fontes, as premissas e as lacunas que os sustentam.",
  },
  "en-US": {
    eyebrow: "Decision readout",
    title: "What the analysis supports now",
    internal: "Internal draft",
    asOf: "As of",
    exact: "Value in object",
    why: "How we got here",
    object: "Signed object",
    sources: "Sources used",
    assumptions: "Assumptions you can change",
    gaps: "What can still change the decision",
    impact: "Impact on the analysis",
    needed: "What closes this point",
    materiality: {blocker: "blocking", high: "high", medium: "medium", low: "low"},
    evidence: {observed_public: "observed · public", observed_private: "observed · private", calculated: "calculated", assumption: "assumption", mixed: "mixed", not_computable: "not computable"},
    materials: "Materials in this version",
    workbook: "Download workbook",
    presentation: "Download presentation",
    trace: "Every number above points back to the object, sources, assumptions and gaps that support it.",
  },
} as const;

function displayValue(value: string | number | boolean | null, unit: string | null, locale: "pt-BR" | "en-US"): string {
  if (value === null) return locale === "pt-BR" ? "Não calculável" : "Not computable";
  if (typeof value === "boolean") return value ? (locale === "pt-BR" ? "Sim" : "Yes") : (locale === "pt-BR" ? "Não" : "No");
  const number = typeof value === "number" ? value : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
  if (number === null) return String(value).replace(/-/g, " ");
  if (unit === "BRL thousand") {
    const formatter = new Intl.NumberFormat(locale, {style: "currency", currency: "BRL", maximumFractionDigits: 2});
    if (Math.abs(number) >= 1_000_000) return `${formatter.format(number / 1_000_000)} bi`;
    return `${formatter.format(number / 1_000)} mi`;
  }
  if (unit === "x") return `${new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(number)}x`;
  if (unit === "decimal a.a.") return `${new Intl.NumberFormat(locale, {style: "percent", maximumFractionDigits: 2}).format(number)} a.a.`;
  return `${new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(number)}${unit ? ` ${unit}` : ""}`;
}

function exactValue(value: string | number | boolean | null, unit: string | null, locale: "pt-BR" | "en-US"): string {
  if (value === null) return "—";
  if (typeof value === "string" || typeof value === "number") return `${formatPreviewNumber(value, locale)}${unit ? ` ${unit}` : ""}`;
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

export function DecisionArtifactWork({contract, locale, materialHref}: Props) {
  const t = copy[locale];
  const sources = new Map(contract.sources.map((source) => [source.id, source]));
  const assumptions = new Map(contract.assumptions.map((assumption) => [assumption.id, assumption]));
  const gaps = new Map(contract.gaps.map((gap) => [gap.id, gap]));
  const conversation = contract.views.find((view) => view.surface === "conversation");
  // Match the canonical contract fingerprint schema; an absent view is not a stored file.
  const hasStoredArtifact = (surface: "workbook" | "presentation") => {
    const fingerprint = contract.views.find((view) => view.surface === surface)?.artifactFingerprint;
    return typeof fingerprint === "string" && /^[a-f0-9]{64}$/.test(fingerprint);
  };
  const workbookReady = hasStoredArtifact("workbook");
  const presentationReady = hasStoredArtifact("presentation");
  const visibleClaimIds = new Set(conversation?.blocks.flatMap((block) => block.claimIds) ?? []);
  const claims = contract.claims.filter((claim) => visibleClaimIds.has(claim.id));

  return (
    <article className="decision-work" data-testid="preview-decision-artifact">
      <header className="decision-work__header">
        <div>
          <span className="decision-work__eyebrow"><Milestone aria-hidden="true" size={13} /> {t.eyebrow}</span>
          <h2>{t.title}</h2>
          <p>{t.trace}</p>
        </div>
        <div className="decision-work__status">
          <span><LockKeyhole aria-hidden="true" size={12} /> {t.internal}</span>
          <small>{t.asOf} {new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "UTC"}).format(new Date(`${contract.asOf}T00:00:00Z`))}</small>
        </div>
      </header>

      <section className="decision-work__metrics" aria-label={t.title}>
        {claims.map((claim) => (
          <div className="decision-work__metric" key={claim.id}>
            <span>{claim.label}</span>
            <strong>{displayValue(claim.value, claim.unit, locale)}</strong>
            <small data-evidence-state={claim.evidenceState}><CircleDotDashed aria-hidden="true" size={11} /> {t.evidence[claim.evidenceState]}</small>
            <details>
              <summary>{t.why}</summary>
              <dl>
                <div><dt>{t.exact}</dt><dd>{exactValue(claim.value, claim.unit, locale)}</dd></div>
                <div><dt>{t.object}</dt><dd>{claim.object.type} · {claim.object.path}<code>{claim.object.fingerprint.slice(0, 12)}</code></dd></div>
              </dl>
              {claim.sourceIds.length ? <div className="decision-work__trace-list"><b>{t.sources}</b>{claim.sourceIds.map((id) => sources.get(id)).filter(Boolean).map((source) => <p key={source!.id}>{source!.title}<small>{source!.locator}</small></p>)}</div> : null}
              {claim.assumptionIds.length ? <div className="decision-work__trace-list"><b>{t.assumptions}</b>{claim.assumptionIds.map((id) => assumptions.get(id)).filter(Boolean).map((assumption) => <p key={assumption!.id}>{assumption!.label}: {displayValue(assumption!.value, assumption!.unit, locale)}<small>{assumption!.basis}</small></p>)}</div> : null}
              {claim.gapIds.length ? <div className="decision-work__trace-list"><b>{t.gaps}</b>{claim.gapIds.map((id) => gaps.get(id)).filter(Boolean).map((gap) => <p key={gap!.id}>{gap!.label}<small>{gap!.impact}</small></p>)}</div> : null}
            </details>
          </div>
        ))}
      </section>

      {contract.assumptions.length ? <section className="decision-work__section">
        <header><span>01</span><h3>{t.assumptions}</h3></header>
        <div className="decision-work__rows">
          {contract.assumptions.map((assumption) => <div className="decision-work__row" key={assumption.id}>
            <div><strong>{assumption.label}</strong><small>{assumption.basis}</small></div>
            <span>{displayValue(assumption.value, assumption.unit, locale)}</span>
          </div>)}
        </div>
      </section> : null}

      {contract.gaps.length ? <section className="decision-work__section decision-work__section--gaps">
        <header><span>02</span><h3>{t.gaps}</h3></header>
        <div className="decision-work__gaps">
          {contract.gaps.map((gap) => <article key={gap.id}>
            <div><span data-materiality={gap.materiality}>{t.materiality[gap.materiality]}</span><h4>{gap.label}</h4></div>
            <p><b>{t.impact}.</b> {gap.impact}</p>
            <p><b>{t.needed}.</b> {gap.requestedInput}</p>
          </article>)}
        </div>
      </section> : null}

      {materialHref && (workbookReady || presentationReady) ? <footer className="decision-work__materials">
        <div><ArrowDownToLine aria-hidden="true" size={16} /><span>{t.materials}</span></div>
        <nav>
          {workbookReady ? <a href={`${materialHref}?format=xlsx`}><FileSpreadsheet aria-hidden="true" size={15} /> {t.workbook}</a> : null}
          {presentationReady ? <a href={`${materialHref}?format=pptx`}><Presentation aria-hidden="true" size={15} /> {t.presentation}</a> : null}
        </nav>
      </footer> : null}
    </article>
  );
}
