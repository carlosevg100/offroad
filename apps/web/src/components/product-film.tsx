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
};

const SCENE_DURATION = 5200;

export function ProductFilm({labels}: ProductFilmProps) {
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const scene = labels.scenes[activeScene];

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
            {activeScene === 0 ? <IntakeScene /> : null}
            {activeScene === 1 ? <EvidenceScene /> : null}
            {activeScene === 2 ? <StructureScene /> : null}
            {activeScene === 3 ? <MatchingScene /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntakeScene() {
  return (
    <div className="film-scene film-scene--intake">
      <div className="film-scene__heading"><span>BORROWER INTAKE</span><strong>Enter the company and financing request.</strong></div>
      <div className="film-form-grid">
        <label><span>Company name</span><strong>Rede Horizonte</strong></label>
        <label><span>Website</span><strong>redehorizonte.com.br</strong></label>
        <label className="film-form-grid__wide"><span>Amount sought</span><strong>R$ 80,000,000</strong></label>
      </div>
      <span className="film-field-label">Purpose of funding</span>
      <div className="film-purpose-grid">
        <span data-selected>Growth / Expansion <i /></span><span>Working capital <i /></span><span>Equipment finance <i /></span><span>Refinance <i /></span>
      </div>
      <div className="film-form-footer"><span>Draft saved</span><button type="button">Continue <ArrowRight size={13} /></button></div>
    </div>
  );
}

function EvidenceScene() {
  return (
    <div className="film-scene film-scene--evidence">
      <div className="film-scene__heading"><span>EVIDENCE LEDGER</span><strong>Every material fact stays linked to source.</strong></div>
      <div className="film-evidence-layout">
        <div className="film-evidence-score"><div><strong>94</strong><span>COVERAGE</span></div></div>
        <div className="film-document-list">
          <article><FileSpreadsheet size={17} /><div><strong>FY25 Financials.xlsx</strong><span>14 sheets · parsed</span></div><Check size={14} /></article>
          <article><FileText size={17} /><div><strong>Deal proposal.pdf</strong><span>38 pages · indexed</span></div><Check size={14} /></article>
          <article><FileSpreadsheet size={17} /><div><strong>Debt schedule.xlsx</strong><span>Reconciled</span></div><Check size={14} /></article>
        </div>
      </div>
      <div className="film-metrics">
        <article><span>REVENUE / LTM</span><strong>R$ 184.7m</strong><small>DRE · p. 12</small></article>
        <article><span>ADJ. EBITDA</span><strong>R$ 31.2m</strong><small>Calculated · v1.2</small></article>
        <article><span>DOWNSIDE DSCR</span><strong>1.74x</strong><small>Scenario · downside</small></article>
      </div>
    </div>
  );
}

function StructureScene() {
  const capacities = [["Management request", 100, "R$ 80m"], ["Cash-flow capacity", 79, "R$ 63m"], ["Collateral capacity", 68, "R$ 54m"], ["Market capacity", 78, "R$ 62m"]] as const;

  return (
    <div className="film-scene film-scene--structure">
      <div className="film-scene__heading"><span>STRUCTURE LAB</span><strong>Capacity before recommendation.</strong></div>
      <div className="film-capacity">
        {capacities.map(([label, width, value]) => (
          <div key={label}><span>{label}</span><div><i style={{width: `${width}%`}} /></div><strong>{value}</strong></div>
        ))}
      </div>
      <div className="film-recommendation"><span>OFFROAD RECOMMENDATION</span><strong>R$ 54m · Senior secured · 48 months</strong><ArrowRight aria-hidden="true" size={16} /></div>
    </div>
  );
}

function MatchingScene() {
  return (
    <div className="film-scene film-scene--matching">
      <div className="film-scene__heading"><span>CAPITAL INTELLIGENCE</span><strong>Mandate fit, explained.</strong></div>
      <div className="film-matches">
        <header><span>PROVIDER</span><span>MANDATE</span><span>STATUS</span><span>FIT</span></header>
        <article><span>01</span><div><strong>Aurora Credit</strong><small>Senior secured · Receivables</small></div><span><i /> Qualified</span><strong>94%</strong></article>
        <article><span>02</span><div><strong>Vale Verde</strong><small>Expansion · Real assets</small></div><span><i /> Qualified</span><strong>86%</strong></article>
        <article data-muted><span>03</span><div><strong>Canyon Opportunities</strong><small>USD mandate only</small></div><span>Mismatch</span><strong>—</strong></article>
      </div>
      <div className="film-evidence-line"><ShieldCheck size={16} /><span>Hard constraints checked before ranking</span><strong>2 QUALIFIED</strong></div>
    </div>
  );
}
