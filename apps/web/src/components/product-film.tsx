"use client";

import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileText,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";
import {useEffect, useState} from "react";

type FilmScene = {
  body: string;
  label: string;
  title: string;
};

type ProductFilmProps = {
  labels: {
    eyebrow: string;
    opportunity: string;
    pause: string;
    play: string;
    scenes: [FilmScene, FilmScene, FilmScene, FilmScene];
    synthetic: string;
    title: string;
  };
  locale: "en-US" | "pt-BR";
};

const SCENE_DURATION = 5200;

const FILM_UI = {
  "pt-BR": {
    amount: "Montante solicitado",
    calculated: "Calculado · v1.2",
    cashFlow: "Capacidade pelo fluxo de caixa",
    collateral: "Capacidade pelas garantias",
    company: "Empresa",
    constraintNote: "Restrições obrigatórias verificadas antes do ranking",
    continue: "Continuar",
    debtMeta: "Reconciliado",
    draft: "Rascunho salvo",
    dscr: "DSCR / cenário adverso",
    ebitda: "EBITDA ajustado",
    equipment: "Financiamento de equipamentos",
    evidenceCoverage: "Cobertura de evidências",
    evidenceKicker: "REGISTRO DE EVIDÊNCIAS",
    evidenceNote: "3 fontes críticas reconciliadas",
    evidenceTitle: "Cada fato material permanece ligado à fonte.",
    expansion: "Expansão · ativos reais",
    financialsMeta: "14 abas · processado",
    fit: "ADERÊNCIA",
    growth: "Crescimento / expansão",
    intakeKicker: "CADASTRO DA EMPRESA",
    intakeTitle: "Informe a empresa e a necessidade de financiamento.",
    mandate: "MANDATO",
    market: "Capacidade de mercado",
    matchingKicker: "INTELIGÊNCIA DE CAPITAL",
    matchingTitle: "Aderência ao mandato, com racional explícito.",
    mismatch: "Restrição",
    proposalMeta: "38 páginas · indexado",
    provider: "PROVEDOR",
    purpose: "Finalidade do financiamento",
    qualified: "Qualificado",
    qualifiedCount: "2 QUALIFICADOS",
    recommendation: "RECOMENDAÇÃO OFFROAD",
    refinance: "Refinanciamento",
    request: "Pedido da empresa",
    revenue: "RECEITA / LTM",
    seniorReceivables: "Sênior com garantia · recebíveis",
    seniorSecured: "R$ 54 mi · Sênior com garantia · 48 meses",
    sourcePage: "DRE · p. 12",
    status: "STATUS",
    structureKicker: "CENÁRIOS DE ESTRUTURA",
    structureTitle: "Capacidade antes da recomendação.",
    usdOnly: "Mandato somente em USD",
    website: "Website",
    workingCapital: "Capital de giro",
  },
  "en-US": {
    amount: "Amount sought",
    calculated: "Calculated · v1.2",
    cashFlow: "Cash-flow capacity",
    collateral: "Collateral capacity",
    company: "Company name",
    constraintNote: "Hard constraints checked before ranking",
    continue: "Continue",
    debtMeta: "Reconciled",
    draft: "Draft saved",
    dscr: "DOWNSIDE DSCR",
    ebitda: "ADJ. EBITDA",
    equipment: "Equipment finance",
    evidenceCoverage: "Evidence coverage",
    evidenceKicker: "EVIDENCE RECORD",
    evidenceNote: "3 critical sources reconciled",
    evidenceTitle: "Every material fact stays linked to source.",
    expansion: "Expansion · real assets",
    financialsMeta: "14 sheets · parsed",
    fit: "FIT",
    growth: "Growth / expansion",
    intakeKicker: "COMPANY INTAKE",
    intakeTitle: "Enter the company and financing request.",
    mandate: "MANDATE",
    market: "Market capacity",
    matchingKicker: "CAPITAL INTELLIGENCE",
    matchingTitle: "Mandate alignment, with explicit rationale.",
    mismatch: "Constraint",
    proposalMeta: "38 pages · indexed",
    provider: "PROVIDER",
    purpose: "Purpose of funding",
    qualified: "Qualified",
    qualifiedCount: "2 QUALIFIED",
    recommendation: "OFFROAD RECOMMENDATION",
    refinance: "Refinance",
    request: "Management request",
    revenue: "REVENUE / LTM",
    seniorReceivables: "Senior secured · receivables",
    seniorSecured: "BRL 54m · Senior secured · 48 months",
    sourcePage: "P&L · p. 12",
    status: "STATUS",
    structureKicker: "STRUCTURE SCENARIOS",
    structureTitle: "Capacity before recommendation.",
    usdOnly: "USD mandate only",
    website: "Website",
    workingCapital: "Working capital",
  },
} as const;

export function ProductFilm({labels, locale}: ProductFilmProps) {
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const scene = labels.scenes[activeScene];
  const ui = FILM_UI[locale];

  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveScene((current) => (current + 1) % labels.scenes.length);
    }, SCENE_DURATION);

    return () => window.clearInterval(timer);
  }, [labels.scenes.length, playing]);

  const selectScene = (index: number) => {
    setActiveScene(index);
    setPlaying(false);
  };

  return (
    <section className="product-film" aria-label={labels.title}>
      <div className="product-film__intro">
        <p className="premium-kicker">{labels.eyebrow}</p>
        <h2>{labels.title}</h2>
      </div>

      <div className="product-film__frame">
        <div className="product-film__story">
          <div className="product-film__timeline" role="tablist" aria-label={labels.title}>
            {labels.scenes.map((item, index) => (
              <button
                aria-selected={activeScene === index}
                className="product-film__chapter"
                data-active={activeScene === index || undefined}
                key={item.label}
                onClick={() => selectScene(index)}
                role="tab"
                type="button"
              >
                <span>0{index + 1}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
          <div className="product-film__narrative">
            <span>0{activeScene + 1} / 04</span>
            <h3>{scene.title}</h3>
            <p>{scene.body}</p>
          </div>
          <div className="product-film__playback">
            <button
              aria-label={playing ? labels.pause : labels.play}
              onClick={() => setPlaying((current) => !current)}
              type="button"
            >
              {playing ? <Pause aria-hidden="true" size={13} /> : <Play aria-hidden="true" size={13} />}
            </button>
            <div aria-hidden="true">
              {labels.scenes.map((item, index) => (
                <span data-current={index === activeScene || undefined} key={item.label}>
                  <i style={index === activeScene && playing ? {animationDuration: `${SCENE_DURATION}ms`} : undefined} />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="product-film__screen">
          <header className="film-toolbar">
            <div><span className="film-toolbar__signal" /><strong>{labels.opportunity}</strong></div>
            <span>{labels.synthetic}</span>
          </header>
          <div className="film-stage" key={activeScene}>
            {activeScene === 0 ? <IntakeScene ui={ui} /> : null}
            {activeScene === 1 ? <EvidenceScene ui={ui} /> : null}
            {activeScene === 2 ? <StructureScene ui={ui} /> : null}
            {activeScene === 3 ? <MatchingScene ui={ui} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

type FilmUi = (typeof FILM_UI)[keyof typeof FILM_UI];

function IntakeScene({ui}: {ui: FilmUi}) {
  return (
    <div className="film-scene film-scene--intake">
      <div className="film-scene__heading"><span>{ui.intakeKicker}</span><strong>{ui.intakeTitle}</strong></div>
      <div className="film-form-grid">
        <label><span>{ui.company}</span><strong>Rede Horizonte</strong></label>
        <label><span>{ui.website}</span><strong>redehorizonte.com.br</strong></label>
        <label className="film-form-grid__wide"><span>{ui.amount}</span><strong>R$ 80.000.000</strong></label>
      </div>
      <span className="film-field-label">{ui.purpose}</span>
      <div className="film-purpose-grid">
        <span data-selected>{ui.growth} <i /></span><span>{ui.workingCapital} <i /></span><span>{ui.equipment} <i /></span><span>{ui.refinance} <i /></span>
      </div>
      <div className="film-form-footer"><span>{ui.draft}</span><button type="button">{ui.continue} <ArrowRight size={13} /></button></div>
    </div>
  );
}

function EvidenceScene({ui}: {ui: FilmUi}) {
  return (
    <div className="film-scene film-scene--evidence">
      <div className="film-scene__heading"><span>{ui.evidenceKicker}</span><strong>{ui.evidenceTitle}</strong></div>
      <div className="film-evidence-layout">
        <div className="film-evidence-summary">
          <span>{ui.evidenceCoverage}</span>
          <strong>94%</strong>
          <div><i style={{width: "94%"}} /></div>
          <small>{ui.evidenceNote}</small>
        </div>
        <div className="film-document-list">
          <article><FileSpreadsheet size={17} /><div><strong>FY25 Financials.xlsx</strong><span>{ui.financialsMeta}</span></div><Check size={14} /></article>
          <article><FileText size={17} /><div><strong>Deal proposal.pdf</strong><span>{ui.proposalMeta}</span></div><Check size={14} /></article>
          <article><FileSpreadsheet size={17} /><div><strong>Debt schedule.xlsx</strong><span>{ui.debtMeta}</span></div><Check size={14} /></article>
        </div>
      </div>
      <div className="film-metrics">
        <article><span>{ui.revenue}</span><strong>R$ 184,7 mi</strong><small>{ui.sourcePage}</small></article>
        <article><span>{ui.ebitda}</span><strong>R$ 31,2 mi</strong><small>{ui.calculated}</small></article>
        <article><span>{ui.dscr}</span><strong>1,74x</strong><small>Downside</small></article>
      </div>
    </div>
  );
}

function StructureScene({ui}: {ui: FilmUi}) {
  const capacities = [[ui.request, 100, "R$ 80 mi"], [ui.cashFlow, 79, "R$ 63 mi"], [ui.collateral, 68, "R$ 54 mi"], [ui.market, 78, "R$ 62 mi"]] as const;

  return (
    <div className="film-scene film-scene--structure">
      <div className="film-scene__heading"><span>{ui.structureKicker}</span><strong>{ui.structureTitle}</strong></div>
      <div className="film-capacity">
        {capacities.map(([label, width, value]) => (
          <div key={label}><span>{label}</span><div><i style={{width: `${width}%`}} /></div><strong>{value}</strong></div>
        ))}
      </div>
      <div className="film-recommendation"><span>{ui.recommendation}</span><strong>{ui.seniorSecured}</strong><ArrowRight aria-hidden="true" size={16} /></div>
    </div>
  );
}

function MatchingScene({ui}: {ui: FilmUi}) {
  return (
    <div className="film-scene film-scene--matching">
      <div className="film-scene__heading"><span>{ui.matchingKicker}</span><strong>{ui.matchingTitle}</strong></div>
      <div className="film-matches">
        <header><span>{ui.provider}</span><span>{ui.mandate}</span><span>{ui.status}</span><span>{ui.fit}</span></header>
        <article><span>01</span><div><strong>Aurora Credit</strong><small>{ui.seniorReceivables}</small></div><span><i /> {ui.qualified}</span><strong>94%</strong></article>
        <article><span>02</span><div><strong>Vale Verde</strong><small>{ui.expansion}</small></div><span><i /> {ui.qualified}</span><strong>86%</strong></article>
        <article data-muted><span>03</span><div><strong>Canyon Opportunities</strong><small>{ui.usdOnly}</small></div><span>{ui.mismatch}</span><strong>—</strong></article>
      </div>
      <div className="film-evidence-line"><ShieldCheck size={16} /><span>{ui.constraintNote}</span><strong>{ui.qualifiedCount}</strong></div>
    </div>
  );
}
