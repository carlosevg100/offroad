"use client";

import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileText,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
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
};

const SCENE_DURATION = 4600;

export function ProductFilm({labels}: ProductFilmProps) {
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(true);

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
      <div className="product-film__story">
        <p className="kicker">{labels.eyebrow}</p>
        <h2>{labels.title}</h2>
        <div className="product-film__timeline" role="tablist" aria-label={labels.title}>
          {labels.scenes.map((scene, index) => (
            <button
              aria-selected={activeScene === index}
              className="product-film__chapter"
              data-active={activeScene === index || undefined}
              key={scene.label}
              onClick={() => selectScene(index)}
              role="tab"
              type="button"
            >
              <span>0{index + 1}</span>
              <strong>{scene.label}</strong>
              <small>{scene.title}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="product-film__screen">
        <header className="film-toolbar">
          <div>
            <span className="film-toolbar__signal" />
            <strong>{labels.opportunity}</strong>
          </div>
          <span>{labels.synthetic}</span>
        </header>

        <div className="film-stage" key={activeScene}>
          {activeScene === 0 ? <IntakeScene /> : null}
          {activeScene === 1 ? <EvidenceScene /> : null}
          {activeScene === 2 ? <StructureScene /> : null}
          {activeScene === 3 ? <MatchingScene /> : null}
        </div>

        <footer className="film-controls">
          <button
            aria-label={playing ? labels.pause : labels.play}
            onClick={() => setPlaying((current) => !current)}
            type="button"
          >
            {playing ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
          </button>
          <div className="film-controls__progress" aria-hidden="true">
            {labels.scenes.map((scene, index) => (
              <span data-complete={index < activeScene || undefined} data-current={index === activeScene || undefined} key={scene.label}>
                <i style={index === activeScene && playing ? {animationDuration: `${SCENE_DURATION}ms`} : undefined} />
              </span>
            ))}
          </div>
          <span>0{activeScene + 1} / 04</span>
        </footer>
      </div>
    </section>
  );
}

function IntakeScene() {
  return (
    <div className="film-scene film-scene--intake">
      <div className="film-scene__heading"><span>Borrower intake</span><strong>Rede Horizonte</strong></div>
      <div className="film-document-grid">
        <article><FileSpreadsheet aria-hidden="true" size={18} /><div><strong>FY25 Financials.xlsx</strong><span>Parsed · 14 sheets</span></div><Check aria-hidden="true" size={15} /></article>
        <article><FileText aria-hidden="true" size={18} /><div><strong>Deal proposal.pdf</strong><span>Indexed · 38 pages</span></div><Check aria-hidden="true" size={15} /></article>
        <article><FileSpreadsheet aria-hidden="true" size={18} /><div><strong>Debt schedule.xlsx</strong><span>Reconciled</span></div><Check aria-hidden="true" size={15} /></article>
        <article className="film-document-grid__drop"><Sparkles aria-hidden="true" size={18} /><span>24 files organized into one opportunity</span></article>
      </div>
    </div>
  );
}

function EvidenceScene() {
  return (
    <div className="film-scene film-scene--evidence">
      <div className="film-scene__heading"><span>Evidence ledger</span><strong>Financial truth, source anchored</strong></div>
      <div className="film-metrics">
        <article><span>Receita LTM</span><strong>R$ 184,7 mi</strong><small>DRE · p. 12</small></article>
        <article><span>EBITDA ajustado</span><strong>R$ 31,2 mi</strong><small>Calculated · v1.2</small></article>
        <article><span>DSCR downside</span><strong>1,74x</strong><small>Scenario · downside</small></article>
      </div>
      <div className="film-evidence-line"><ShieldCheck aria-hidden="true" size={18} /><span>3 / 3 material facts verified</span><strong>Ready for review</strong></div>
    </div>
  );
}

function StructureScene() {
  const capacities = [["Management request", 100, "R$ 80 mi"], ["Cash-flow capacity", 79, "R$ 63 mi"], ["Collateral capacity", 68, "R$ 54 mi"], ["Market capacity", 78, "R$ 62 mi"]] as const;

  return (
    <div className="film-scene film-scene--structure">
      <div className="film-scene__heading"><span>Structure lab</span><strong>Capacity before recommendation</strong></div>
      <div className="film-capacity">
        {capacities.map(([label, width, value]) => (
          <div key={label}><span>{label}</span><div><i style={{width: `${width}%`}} /></div><strong>{value}</strong></div>
        ))}
      </div>
      <div className="film-recommendation"><span>Offroad recommendation</span><strong>R$ 54 mi · Senior secured · 48 months</strong><ArrowRight aria-hidden="true" size={17} /></div>
    </div>
  );
}

function MatchingScene() {
  return (
    <div className="film-scene film-scene--matching">
      <div className="film-scene__heading"><span>Capital intelligence</span><strong>Mandate fit, explained</strong></div>
      <div className="film-matches">
        <article><span>01</span><div><strong>Aurora Credit</strong><small>BRL · Senior secured · Receivables</small></div><div><small>Fit</small><strong>94%</strong></div></article>
        <article><span>02</span><div><strong>Vale Verde</strong><small>BRL · Expansion · Real assets</small></div><div><small>Fit</small><strong>86%</strong></div></article>
        <article data-muted><span>03</span><div><strong>Canyon Opportunities</strong><small>Currency mismatch</small></div><div><small>Mismatch</small><strong>—</strong></div></article>
      </div>
    </div>
  );
}
