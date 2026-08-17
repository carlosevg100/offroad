"use client";

import {
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Layers3,
  ListChecks,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import type {CSSProperties} from "react";
import {useEffect, useState} from "react";

type FlowField = {
  label: string;
  value: string;
};

export type CapitalFlowLabels = {
  benefits: string[];
  challenges: string[];
  companyBody: string;
  companyEyebrow: string;
  companyTitle: string;
  documents: string[];
  finalStatus: string;
  inputLabel: string;
  investorBody: string;
  investorEyebrow: string;
  investorTitle: string;
  investorTypes: string[];
  mandateLabels: string[];
  offroadEyebrow: string;
  offroadSignature: string;
  offroadTitle: string;
  opportunityLabel: string;
  outputFields: FlowField[];
  outputTitle: string;
  processSteps: string[];
  purposes: string[];
  sourceLabels: [string, string];
  status: string;
  title: string;
};

const LOOP_STEPS = 13;
const PROCESS_START = 3;

export function CapitalFlow({labels}: {labels: CapitalFlowLabels}) {
  const [tick, setTick] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(media.matches);
    const interval = window.setInterval(() => {
      if (!media.matches) setTick((current) => current + 1);
    }, 1150);

    syncPreference();
    media.addEventListener("change", syncPreference);

    return () => {
      window.clearInterval(interval);
      media.removeEventListener("change", syncPreference);
    };
  }, []);

  const loopStep = tick % LOOP_STEPS;
  const phase = reducedMotion ? 10 : Math.min(loopStep, 10);
  const sourceLabel = labels.sourceLabels[Math.floor(tick / LOOP_STEPS) % labels.sourceLabels.length];

  return (
    <aside
      aria-label={labels.title}
      className="capital-flow"
      data-phase={phase}
      data-reduced-motion={reducedMotion || undefined}
    >
      <header className="capital-flow__header">
        <span>{labels.title}</span>
        <strong><i />{labels.status}</strong>
      </header>

      <div className="capital-flow__narrative">
        <article className="flow-card flow-card--source">
          <header className="flow-card__header">
            <span><Building2 aria-hidden="true" size={15} />{labels.companyEyebrow}</span>
            <small>{sourceLabel}</small>
          </header>
          <h2>{labels.companyTitle}</h2>
          <div className="flow-purpose-list" aria-label={labels.companyTitle}>
            {labels.purposes.map((purpose, index) => (
              <span className={index === 0 && phase >= 1 ? "is-selected" : undefined} key={purpose}>
                {purpose}{index === 0 && phase >= 1 ? <Check aria-hidden="true" size={11} /> : null}
              </span>
            ))}
          </div>
          <p>{labels.companyBody}</p>

          <div className="flow-documents" aria-label={labels.inputLabel}>
            <strong>{labels.inputLabel}</strong>
            <div>
              {labels.documents.map((document, index) => {
                const Icon = index === 0 ? FileBarChart2 : index === 1 ? FileSpreadsheet : FileText;
                return <span key={document} style={{"--document-index": index} as CSSProperties}><Icon aria-hidden="true" size={12} />{document}</span>;
              })}
            </div>
          </div>

          <ul className="flow-challenges">
            {labels.challenges.map((challenge) => <li key={challenge}>{challenge}</li>)}
          </ul>
        </article>

        <FlowConnector active={phase >= 2} label={labels.inputLabel} />

        <article className="flow-card flow-card--offroad">
          <header className="flow-card__header">
            <span><Layers3 aria-hidden="true" size={15} />{labels.offroadEyebrow}</span>
            <small>OFFROAD ENGINE</small>
          </header>
          <h2>{labels.offroadTitle}</h2>

          <ol className="flow-process">
            {labels.processSteps.map((step, index) => {
              const stepPhase = PROCESS_START + index;
              const isActive = phase === stepPhase;
              const isComplete = phase > stepPhase;
              const Icon = index === 0 ? ListChecks : index === 1 ? ScanSearch : index === 2 ? Layers3 : index === 3 ? FileText : ShieldCheck;
              return (
                <li className={isActive ? "is-active" : isComplete ? "is-complete" : undefined} key={step}>
                  <span>{isComplete ? <Check aria-hidden="true" size={12} /> : <Icon aria-hidden="true" size={12} />}</span>
                  <strong>{step}</strong>
                  <i />
                </li>
              );
            })}
          </ol>

          <div className="flow-output" data-visible={phase >= 8 || undefined}>
            <header><span>{labels.opportunityLabel}</span><strong>{labels.outputTitle}</strong></header>
            <div>
              {labels.outputFields.map((field) => (
                <span key={field.label}><small>{field.label}</small><strong>{field.value}</strong></span>
              ))}
            </div>
          </div>
          <p className="flow-offroad-signature"><CircleCheck aria-hidden="true" size={14} />{labels.offroadSignature}</p>
        </article>

        <FlowConnector active={phase >= 8} label={labels.opportunityLabel} />

        <article className="flow-card flow-card--investors">
          <header className="flow-card__header">
            <span><Landmark aria-hidden="true" size={15} />{labels.investorEyebrow}</span>
            <small>MANDATE SCREEN</small>
          </header>
          <h2>{labels.investorTitle}</h2>
          <div className="flow-investor-types">
            {labels.investorTypes.map((type) => <span key={type}>{type}</span>)}
          </div>

          <ul className="flow-benefits">
            {labels.benefits.map((benefit, index) => (
              <li className={phase >= Math.min(9 + index, 10) ? "is-active" : undefined} key={benefit}>
                <Check aria-hidden="true" size={11} />{benefit}
              </li>
            ))}
          </ul>

          <div className="flow-mandates">
            {labels.mandateLabels.map((label, index) => (
              <span className={phase >= 9 + Math.min(index, 1) ? "is-aligned" : undefined} key={label}>
                <i />{label}
              </span>
            ))}
          </div>
          <p>{labels.investorBody}</p>
        </article>
      </div>

      <footer className="capital-flow__status" data-ready={phase >= 10 || undefined}>
        <span><i />{labels.finalStatus}</span>
        <small>OFFROAD CAPITAL · QUALIFIED INTRODUCTION</small>
      </footer>
    </aside>
  );
}

function FlowConnector({active, label}: {active: boolean; label: string}) {
  return (
    <div aria-hidden="true" className="flow-connector" data-active={active || undefined}>
      <span>{label}</span>
      <i><b /></i>
      <ArrowRight size={15} />
    </div>
  );
}
