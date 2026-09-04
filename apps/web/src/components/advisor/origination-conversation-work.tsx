import type {
  OriginationConversationArtifact,
  OriginationSeniorReadoutArtifact,
  OriginationSeniorReadoutV2Artifact,
} from "@offroad/domain-contracts";
import {Check, ChevronRight, ExternalLink, Lightbulb} from "lucide-react";

import {OriginationDecision} from "@/app/[locale]/app/projects/[projectId]/origination-decision";

type Props = {
  artifact: OriginationConversationArtifact;
  artifactId: string;
  decision?: {decision: string} | null;
  fingerprint: string;
  locale: "pt-BR" | "en-US";
  projectId: string;
  status: string;
};

const copy = {
  "pt-BR": {
    answer: "LEITURA OFFROAD",
    title: "Minha leitura para a conversa",
    company: "Companhia e contexto",
    alternatives: "Alternativas estratégicas para discutir",
    questions: "O que eu confirmaria na reunião",
    unknowns: "O que ainda não está público",
    sources: "Fontes",
    why: "Por que faz sentido",
    needs: "Para confirmar",
    weakens: "O que pode mudar a tese",
    confirm: "Continuar a partir desta leitura",
    confirmed: "Leitura confirmada",
    requestChanges: "Quero ajustar a leitura",
    requested: "Ajuste solicitado",
    note: "Correção ou contexto adicional",
    notePlaceholder: "Diga o que devemos rever ou considerar.",
    errors: {invalid: "Revise a decisão.", save: "Não foi possível registrar.", stale: "Esta leitura mudou; atualize a página."},
  },
  "en-US": {
    answer: "OFFROAD READOUT",
    title: "My read for the conversation",
    company: "Company and context",
    alternatives: "Strategic alternatives to discuss",
    questions: "What I would confirm in the meeting",
    unknowns: "What is not public yet",
    sources: "Sources",
    why: "Why it may fit",
    needs: "To confirm",
    weakens: "What may change the thesis",
    confirm: "Continue from this readout",
    confirmed: "Readout confirmed",
    requestChanges: "Adjust the readout",
    requested: "Changes requested",
    note: "Correction or additional context",
    notePlaceholder: "Tell us what to revisit or consider.",
    errors: {invalid: "Review the decision.", save: "Could not save it.", stale: "This readout changed; refresh the page."},
  },
} as const;

export function OriginationConversationWork(props: Props) {
  if (props.artifact.schemaVersion === "origination-senior-readout.v2"
    || props.artifact.schemaVersion === "origination-senior-readout.v3") {
    return <SeniorReadout {...props} artifact={props.artifact} />;
  }
  const t = copy[props.locale];
  return <article className="advisor-banker-readout">
    <header>
      <span>{t.answer}</span>
      <h2>{t.title}</h2>
      <p>{props.artifact.executiveRead}</p>
    </header>

    <section className="advisor-banker-readout__company">
      <h3>{t.company}</h3>
      <p>{props.artifact.companySnapshot}</p>
      <div>{props.artifact.debtLensSignals.map((signal, index) => <article key={`${signal.finding}-${index}`}>
        <strong>{signal.finding}</strong>
        <p>{signal.relevance}</p>
        <CitationLinks sources={props.artifact.sources} urls={signal.sourceUrls} />
      </article>)}</div>
    </section>

    <section className="advisor-banker-readout__alternatives">
      <h3>{t.alternatives}</h3>
      {props.artifact.financingAngles.map((angle, index) => <article key={`${angle.title}-${index}`}>
        <div className="advisor-banker-readout__rank">{String(index + 1).padStart(2, "0")}</div>
        <div>
          <span>{angle.route}</span>
          <h4>{angle.title}</h4>
          <p>{angle.rationale}</p>
          <div className="advisor-banker-readout__conditions">
            <section><strong>{t.needs}</strong><ul>{angle.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section><strong>{t.weakens}</strong><ul>{angle.disconfirmers.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>
          <CitationLinks sources={props.artifact.sources} urls={angle.sourceUrls} />
        </div>
      </article>)}
    </section>

    <details className="advisor-banker-readout__questions">
      <summary><span><Lightbulb aria-hidden="true" size={15} />{t.questions}</span><ChevronRight aria-hidden="true" size={15} /></summary>
      <ol>{props.artifact.meetingQuestions.map((question, index) => <li key={`${question.question}-${index}`}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div><strong>{question.question}</strong><p>{question.whyItMatters}</p></div>
      </li>)}</ol>
    </details>

    <details className="advisor-banker-readout__unknowns">
      <summary><span>{t.unknowns}</span><ChevronRight aria-hidden="true" size={15} /></summary>
      <ul>{props.artifact.unknowns.map((item) => <li key={item}>{item}</li>)}</ul>
    </details>

    <details className="advisor-banker-readout__sources">
      <summary><span>{t.sources} · {props.artifact.sources.length}</span><ChevronRight aria-hidden="true" size={15} /></summary>
      <ol>{props.artifact.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={11} /></a></li>)}</ol>
    </details>

    {props.status === "pending_confirmation" ? <OriginationDecision artifactId={props.artifactId} copy={{
      confirm: t.confirm, confirmed: t.confirmed, errorInvalid: t.errors.invalid, errorSave: t.errors.save,
      errorStale: t.errors.stale, note: t.note, notePlaceholder: t.notePlaceholder,
      requestChanges: t.requestChanges, requested: t.requested, title: t.title,
    }} fingerprint={props.fingerprint} locale={props.locale} projectId={props.projectId} /> : props.decision ? <p className="origination-decision__record"><Check aria-hidden="true" size={14} />{props.decision.decision === "confirm" ? t.confirmed : t.requested}</p> : null}
  </article>;
}

function SeniorReadout(props: Props & {artifact: OriginationSeniorReadoutArtifact | OriginationSeniorReadoutV2Artifact}) {
  const t = copy[props.locale];
  const {artifact} = props;
  const debtLabels = props.locale === "pt-BR"
    ? ["Montante", "Vencimento", "Custo", "Indexador", "Moeda", "Amortização", "Garantias", "Covenants", "Pré-pagamento"]
    : ["Amount", "Maturity", "Cost", "Indexer", "Currency", "Amortization", "Collateral", "Covenants", "Prepayment"];
  const analyses = props.locale === "pt-BR" ? [
    ["Como a companhia ganha dinheiro", artifact.companyAnalysis.businessModel],
    ["Receita e clientes", artifact.companyAnalysis.revenueAndCustomers],
    ["Custos e margens", artifact.companyAnalysis.costAndMarginDrivers],
    ["Setor, posição e sazonalidade", `${artifact.companyAnalysis.sectorPosition}\n\n${artifact.companyAnalysis.seasonality}`],
    ["Performance operacional", artifact.performanceAnalysis.operatingPerformance],
    ["Caixa e capital de giro", artifact.performanceAnalysis.cashFlowAndWorkingCapital],
    ["Perspectivas e planos", artifact.performanceAnalysis.outlookAndPlans],
    ["Dívida e liquidez", `${artifact.capitalStructure.overview}\n\n${artifact.capitalStructure.liquidity}`],
  ] : [
    ["How the company makes money", artifact.companyAnalysis.businessModel],
    ["Revenue and customers", artifact.companyAnalysis.revenueAndCustomers],
    ["Costs and margins", artifact.companyAnalysis.costAndMarginDrivers],
    ["Sector, position and seasonality", `${artifact.companyAnalysis.sectorPosition}\n\n${artifact.companyAnalysis.seasonality}`],
    ["Operating performance", artifact.performanceAnalysis.operatingPerformance],
    ["Cash flow and working capital", artifact.performanceAnalysis.cashFlowAndWorkingCapital],
    ["Outlook and plans", artifact.performanceAnalysis.outlookAndPlans],
    ["Debt and liquidity", `${artifact.capitalStructure.overview}\n\n${artifact.capitalStructure.liquidity}`],
  ];
  return <article className="advisor-banker-readout advisor-banker-readout--senior">
    <header><span>{t.answer}</span><h2>{t.title}</h2><p>{artifact.executiveRead}</p></header>
    <section className="advisor-banker-readout__company">
      <h3>{t.company}</h3><p>{artifact.companyAnalysis.businessOverview}</p>
      <div>{analyses.map(([title, body]) => <article key={title}><strong>{title}</strong><p>{body}</p></article>)}</div>
    </section>
    {artifact.schemaVersion === "origination-senior-readout.v3"
      ? <ForwardCase artifact={artifact} locale={props.locale} />
      : null}
    {artifact.capitalStructure.debtStack.length ? <section className="advisor-banker-readout__debt-stack">
      <h3>{props.locale === "pt-BR" ? "Mapa da dívida" : "Debt stack"}</h3>
      <div>{artifact.capitalStructure.debtStack.map((debt, index) => <article key={`${debt.instrument}-${index}`}>
        <strong>{debt.instrument}</strong>
        <dl>{[[debtLabels[0], debt.amount], [debtLabels[1], debt.maturity], [debtLabels[2], debt.cost], [debtLabels[3], debt.indexer], [debtLabels[4], debt.currency], [debtLabels[5], debt.amortization], [debtLabels[6], debt.guarantees], [debtLabels[7], debt.covenants], [debtLabels[8], debt.prepayment]].filter((entry) => entry[1]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <CitationLinks sources={artifact.sources} urls={debt.sourceUrls} />
      </article>)}</div>
    </section> : null}
    <section className="advisor-banker-readout__alternatives">
      <h3>{t.alternatives}</h3>
      {[...artifact.strategicAlternatives].sort((a, b) => a.rank - b.rank).map((alternative) => <article key={`${alternative.rank}-${alternative.title}`}>
        <div className="advisor-banker-readout__rank">{String(alternative.rank).padStart(2, "0")}</div>
        <div><span>{alternative.objective}</span><h4>{alternative.title}</h4><p>{alternative.rationale}</p><p><strong>{props.locale === "pt-BR" ? "Estrutura: " : "Structure: "}</strong>{alternative.structure}</p><p><strong>{props.locale === "pt-BR" ? "Efeito no balanço: " : "Balance-sheet effect: "}</strong>{alternative.balanceSheetImpact}</p>
          <div className="advisor-banker-readout__conditions"><section><strong>{props.locale === "pt-BR" ? "Por que pode funcionar" : "Why it may work"}</strong><ul>{alternative.advantages.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t.needs}</strong><ul>{alternative.conditions.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
          <CitationLinks sources={artifact.sources} urls={alternative.sourceUrls} />
        </div>
      </article>)}
    </section>
    <details className="advisor-banker-readout__questions" open><summary><span><Lightbulb aria-hidden="true" size={15} />{t.questions}</span><ChevronRight aria-hidden="true" size={15} /></summary><ol>{artifact.meetingStrategy.decisionQuestions.map((question, index) => <li key={`${question.question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{question.question}</strong><p>{question.whyItMatters}</p></div></li>)}</ol></details>
    <details className="advisor-banker-readout__unknowns"><summary><span>{t.unknowns}</span><ChevronRight aria-hidden="true" size={15} /></summary><ul>{artifact.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></details>
    <details className="advisor-banker-readout__sources"><summary><span>{t.sources} · {artifact.sources.length}</span><ChevronRight aria-hidden="true" size={15} /></summary><ol>{artifact.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={11} /></a></li>)}</ol></details>
    {props.status === "pending_confirmation" ? <OriginationDecision artifactId={props.artifactId} copy={{confirm: t.confirm, confirmed: t.confirmed, errorInvalid: t.errors.invalid, errorSave: t.errors.save, errorStale: t.errors.stale, note: t.note, notePlaceholder: t.notePlaceholder, requestChanges: t.requestChanges, requested: t.requested, title: t.title}} fingerprint={props.fingerprint} locale={props.locale} projectId={props.projectId} /> : props.decision ? <p className="origination-decision__record"><Check aria-hidden="true" size={14} />{props.decision.decision === "confirm" ? t.confirmed : t.requested}</p> : null}
  </article>;
}

function ForwardCase({artifact, locale}: {artifact: OriginationSeniorReadoutArtifact; locale: "pt-BR" | "en-US"}) {
  const forward = artifact.preliminaryForwardCase;
  const pt = locale === "pt-BR";
  return <section className="advisor-banker-readout__forward">
    <header>
      <div><span>{pt ? "CENÁRIO PROSPECTIVO" : "FORWARD CASE"}</span><h3>{pt ? "Como a tese se comporta adiante" : "How the thesis behaves forward"}</h3></div>
      <small data-status={forward.status}>{forward.status === "directional" ? (pt ? "Direcional" : "Directional") : (pt ? "Ainda não calculável" : "Not yet computable")}</small>
    </header>
    <p>{forward.nature}</p>
    <div className="advisor-banker-readout__forward-horizon"><strong>{pt ? "Horizonte" : "Horizon"}</strong><span>{forward.horizon}</span></div>
    <div className="advisor-banker-readout__assumptions">
      {forward.assumptions.map((assumption) => <article key={assumption.id}>
        <header><strong>{assumption.driver}</strong><span>{pt ? "Editável no chat" : "Editable in chat"}</span></header>
        <dl>
          <div><dt>{pt ? "Cenário-base" : "Base case"}</dt><dd>{assumption.baseCase}</dd></div>
          <div><dt>Downside</dt><dd>{assumption.downside}</dd></div>
          <div><dt>{pt ? "Método e racional" : "Method and rationale"}</dt><dd>{assumption.methodology} {assumption.rationale}</dd></div>
        </dl>
        <CitationLinks sources={artifact.sources} urls={assumption.sourceUrls} />
      </article>)}
    </div>
    <details>
      <summary><span>{pt ? "Efeitos projetados e lacunas" : "Projected effects and gaps"}</span><ChevronRight aria-hidden="true" size={15} /></summary>
      <div className="advisor-banker-readout__forward-effects">
        {forward.projectedEffects.map((effect) => <article key={effect.metric}><strong>{effect.metric}</strong><p><b>{pt ? "Base: " : "Base: "}</b>{effect.baseCase}</p><p><b>Downside: </b>{effect.downside}</p><p>{effect.debtRelevance}</p><CitationLinks sources={artifact.sources} urls={effect.sourceUrls} /></article>)}
      </div>
      <div className="advisor-banker-readout__forward-gaps"><section><strong>{pt ? "Para elevar a convicção" : "To increase conviction"}</strong><ul>{forward.missingInputs.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{pt ? "Limites desta leitura" : "Limits of this readout"}</strong><ul>{forward.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
    </details>
  </section>;
}

function CitationLinks({sources, urls}: {sources: OriginationConversationArtifact["sources"]; urls: string[]}) {
  if (!urls.length) return null;
  const indexByUrl = new Map(sources.map((source, index) => [source.url, index + 1]));
  return <div className="advisor-banker-readout__citations">{urls.map((url) => <a aria-label={new URL(url).hostname} href={url} key={url} rel="noreferrer" target="_blank">{indexByUrl.get(url) ?? "·"}</a>)}</div>;
}
