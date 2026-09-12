"use client";

import {useId, useState} from "react";
import Image from "next/image";
import {FileText, FileSpreadsheet, Presentation, FolderClosed, CircleCheck, CircleHelp, LockKeyhole} from "lucide-react";
import type {FinancialBaseline} from "./public-workbench";
import styles from "./public-capital-journey.module.css";

type Website = typeof import("../../messages/pt-BR.json")["Website"];
export const capitalJourneyStages = ["start", "investigate", "model", "prepare", "connect"] as const;
export type CapitalJourneyStage = typeof capitalJourneyStages[number];

export function PublicCapitalJourney({copy: c, financialCopy: f, financials, initialStage = "start"}: {
  copy: Website["narrative"]["journey"]; financialCopy: Website["workbench"]; financials: FinancialBaseline; initialStage?: CapitalJourneyStage;
}) {
  const [stage, setStage] = useState<CapitalJourneyStage>(initialStage);
  const id = useId();
  const s = c[stage];
  return <div className={styles.journey}>
    <div className={styles.steps} role="group" aria-label={c.selector}>{capitalJourneyStages.map((key, i) => <button type="button" key={key} id={`${id}-${key}`} aria-pressed={stage === key} aria-controls={`${id}-panel`} onClick={() => setStage(key)}><span aria-hidden="true">0{i + 1}</span>{c[key].label}</button>)}</div>
    <div className={styles.exampleBar}><span><FolderClosed size={16} aria-hidden="true"/>{c.business}</span><span>{c.example}</span></div>
    <div className={styles.stage} id={`${id}-panel`} role="region" aria-labelledby={`${id}-${stage}`} aria-live="polite" aria-atomic="true">
      <div className={styles.discussion}>
        <span className={styles.meta}>{c.promptLabel}</span><blockquote>{s.prompt}</blockquote>
        <div className={styles.replyLabel}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/><span>{c.responseLabel}</span></div><p>{s.response}</p>
      </div>
      <div className={styles.artifact}>
        <span className={styles.meta}>{c.outputLabel}</span>
        <div className={styles.paper}>
          <div className={styles.paperHead}><span>{c.business}</span><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/></div>
          <h3>{s.title}</h3>
          {stage === "start" && <ul className={styles.files}>{(["one", "two", "three"] as const).map((key,i) => <li key={key}>{i === 1 ? <FileSpreadsheet size={23} strokeWidth={1.4} aria-hidden="true"/> : <FileText size={23} strokeWidth={1.4} aria-hidden="true"/>}<span>{s[key]}</span><span className={styles.fileType} aria-hidden="true">{i === 1 ? "XLSX" : "PDF"}</span></li>)}</ul>}
          {stage === "investigate" && <><p className={styles.basis}>{c.basis}</p><table className={styles.model}><caption className={styles.srOnly}>{s.title}</caption><tbody>{(["reported", "adjustment", "adjusted", "debt", "leverage"] as const).map(key => <tr key={key} data-total={key === "adjusted" || key === "leverage"}><th scope="row">{f[key]}</th><td>{financials[key]}</td></tr>)}</tbody></table><p className={styles.source}>{c.source}</p></>}
          {stage === "model" && <><p className={styles.basis}>{c.rationale}</p><ol className={styles.analysisList}>{(["One", "Two", "Three"] as const).map((key,i) => <li key={key}><span className={styles.listIndex}>0{i + 1}</span><div><h4>{s[(["one","two","three"] as const)[i]]}</h4><p>{c[`model${key}`]}</p></div></li>)}</ol></>}
          {stage === "prepare" && <ul className={styles.deliverables}>{(["One", "Two", "Three"] as const).map((key,i) => <li key={key}>{i === 0 ? <Presentation size={24} strokeWidth={1.4} aria-hidden="true"/> : i === 1 ? <FileSpreadsheet size={24} strokeWidth={1.4} aria-hidden="true"/> : <FileText size={24} strokeWidth={1.4} aria-hidden="true"/>}<div><h4>{s[(["one","two","three"] as const)[i]]}</h4><p>{c[`prepare${key}`]}</p></div></li>)}</ul>}
          {stage === "connect" && <ul className={styles.deliverables}>{(["One", "Two", "Three"] as const).map((key,i) => <li key={key}>{i === 0 ? <CircleCheck size={24} strokeWidth={1.4} aria-hidden="true"/> : i === 1 ? <CircleHelp size={24} strokeWidth={1.4} aria-hidden="true"/> : <LockKeyhole size={24} strokeWidth={1.4} aria-hidden="true"/>}<div><h4>{s[(["one","two","three"] as const)[i]]}</h4><p>{c[`connect${key}`]}</p></div></li>)}</ul>}
          <p className={styles.paperNote}>{s.note}</p>
        </div>
      </div>
    </div>
  </div>;
}
