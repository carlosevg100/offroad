"use client";

import {useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {FileText, FileSpreadsheet, Presentation, FolderClosed} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import styles from "./public-workbench.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"]["workbench"];
const audiences = ["companies", "advisors", "investors"] as const;
const stages = ["one", "two", "three"] as const;
export type WorkbenchAudience = typeof audiences[number];
export type FinancialBaseline = {reported: string; adjustment: string; adjusted: string; debt: string; leverage: string};

export function PublicWorkbench({copy, locale, financials, initialAudience = "companies", fixedAudience = false}: {
  copy: Copy; locale: AppLocale; financials: FinancialBaseline; initialAudience?: WorkbenchAudience; fixedAudience?: boolean;
}) {
  const [audience, setAudience] = useState<WorkbenchAudience>(initialAudience);
  const [stage, setStage] = useState<typeof stages[number]>("one");
  const [pane, setPane] = useState<"conversation" | "document">("document");
  const story = copy[audience];
  const step = story[stage];
  const isModel = stage === "two" && audience !== "investors";
  return <div className={styles.workbench}>
    {!fixedAudience && <div className={styles.audiencePicker} role="group" aria-label={copy.audienceLabel}>{audiences.map(key => <button type="button" key={key} aria-pressed={audience === key} onClick={() => {setAudience(key); setStage("one");}}>{copy[key].label}</button>)}</div>}
    <div className={styles.storyHeading}><div><span className={styles.role}>{story.role}</span><h3>{story.title}</h3></div><p>{story.benefit}</p></div>
    <div className={styles.stagePicker} role="group" aria-label={copy.stageLabel}>{stages.map((key, index) => <button type="button" key={key} aria-pressed={stage === key} onClick={() => setStage(key)}><span aria-hidden="true">0{index + 1}</span>{story[key].label}</button>)}</div>
    <div className={styles.workspace}>
      <div className={styles.workspaceBar}><span><FolderClosed size={15} aria-hidden="true"/>Rede Horizonte</span><span>{copy.example} · {copy.synthetic}</span></div>
      <div className={styles.mobilePanePicker} role="group" aria-label={copy.paneLabel}><button type="button" aria-pressed={pane === "conversation"} onClick={() => setPane("conversation")}>{copy.conversationTab}</button><button type="button" aria-pressed={pane === "document"} onClick={() => setPane("document")}>{copy.documentTab}</button></div>
      <div className={styles.panes} data-mobile-pane={pane}>
        <section className={styles.conversation} aria-label={copy.example}>
          <div className={styles.appBrand}><Image src="/brand/offroad-lockup.png" width={1600} height={482} alt="Offroad"/></div>
          <div key={`${audience}-${stage}`} className={styles.exchange} aria-live="polite" aria-atomic="true">
            <div className={styles.prompt}><span>{copy.user}</span><p>{step.prompt}</p></div>
            <div className={styles.answer}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/><p>{step.reply}</p></div>
          </div>
          <div className={styles.sources}><span>{copy.sources}</span><div><span><FileSpreadsheet size={14} aria-hidden="true"/>{copy.sourceOne}</span><span><FileSpreadsheet size={14} aria-hidden="true"/>{copy.sourceTwo}</span><span><FileText size={14} aria-hidden="true"/>{copy.sourceThree}</span></div></div>
        </section>
        <section className={styles.documentPane} aria-label={copy.fileLabel}>
          <div className={styles.documentBar}>{isModel ? <FileSpreadsheet size={16} aria-hidden="true"/> : audience === "investors" ? <FileText size={16} aria-hidden="true"/> : <Presentation size={16} aria-hidden="true"/>}<span>{isModel ? copy.model : story.file}</span><span>{copy.preview}</span></div>
          {isModel ? <div className={styles.model}>
            <div className={styles.paperHeading}><span>Rede Horizonte</span><h4>{step.title}</h4><p>{copy.period} · {copy.million}</p></div>
            <table><caption className={styles.srOnly}>{copy.model}</caption><tbody>{(["reported", "adjustment", "adjusted", "debt", "leverage"] as const).map(key => <tr key={key} className={key === "adjusted" || key === "leverage" ? styles.total : undefined}><th scope="row">{copy[key]}</th><td>{financials[key]}</td></tr>)}</tbody></table>
            <p className={styles.sourceNote}>{copy.sourceNote}</p>
            <div className={styles.paperNote}>{step.note}</div>
          </div> : <div key={`${audience}-${stage}-paper`} className={`${styles.paper} ${audience === "investors" ? styles.memo : styles.deck}`}>
            <div className={styles.paperHeading}><span>Rede Horizonte</span><h4>{step.title}</h4><p>{copy.current}</p></div>
            <div className={styles.outline}>{(["One", "Two", "Three"] as const).map((key, index) => <div key={key}><span className={styles.ordinal}>{String(index + 1).padStart(2, "0")}</span><div><h5>{step[`row${key}`]}</h5><p>{step[`detail${key}`]}</p></div></div>)}</div>
            <div className={styles.paperNote}>{step.note}</div>
          </div>}
        </section>
      </div>
      <div className={styles.workspaceFoot}><span>{copy.evidence}</span><Link href={publicPath(locale, audience)}>{copy.explore}</Link></div>
    </div>
  </div>;
}
