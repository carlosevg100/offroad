"use client";

import {useId, useState} from "react";
import Image from "next/image";
import {FileText, FileSpreadsheet, FolderClosed} from "lucide-react";
import type {WebsiteAdvisorExample} from "@/lib/website-advisor-example";
import {CapitalHistory, CapitalBoard, CapitalComparison, CapitalMaterials, CapitalConnection, type CapitalCaseCopy} from "./public-capital-case";
import styles from "./public-capital-journey.module.css";

type Website = typeof import("../../messages/pt-BR.json")["Website"];
export const capitalJourneyStages = ["start", "investigate", "model", "prepare", "connect"] as const;
export type CapitalJourneyStage = typeof capitalJourneyStages[number];

export function PublicCapitalJourney({copy:c,caseCopy,analysis,initialStage="start"}: {
  copy:Website["narrative"]["journey"];caseCopy:CapitalCaseCopy;analysis:WebsiteAdvisorExample;initialStage?:CapitalJourneyStage;
}) {
  const [stage,setStage]=useState<CapitalJourneyStage>(initialStage);
  const id=useId();const s=c[stage];
  return <div className={styles.journey}>
    <div className={styles.steps} role="group" aria-label={c.selector}>{capitalJourneyStages.map((key,index)=><button type="button" key={key} id={`${id}-${key}`} aria-pressed={stage===key} aria-controls={`${id}-panel`} onClick={()=>setStage(key)}><span aria-hidden="true">0{index+1}</span>{c[key].label}</button>)}</div>
    <div className={styles.exampleBar}><span><FolderClosed size={16} aria-hidden="true"/>{c.business}</span><span>{c.example}</span></div>
    <div key={stage} className={styles.stage} id={`${id}-panel`} role="region" aria-labelledby={`${id}-${stage}`}>
      <div className={styles.discussion}><span className={styles.meta}>{c.promptLabel}</span><blockquote>{s.prompt}</blockquote><div className={styles.replyLabel}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/><span>{c.responseLabel}</span></div><p>{s.response}</p></div>
      <div className={styles.artifact}><div className={styles.paper}><div className={styles.paperHead}><span>{c.business}</span><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/></div><h3>{s.title}</h3>
        {stage==="start"&&<ul className={styles.files}>{(["one","two","three","four"] as const).map((key,index)=><li key={key}>{index===2?<FileSpreadsheet size={23} strokeWidth={1.4} aria-hidden="true"/>:<FileText size={23} strokeWidth={1.4} aria-hidden="true"/>}<div><span>{c.start[key]}</span><p>{caseCopy.journey[(["startOneWhy","startTwoWhy","startThreeWhy","startFourWhy"] as const)[index]]}</p></div><span className={styles.fileType} aria-hidden="true">{index===2?"XLSX":"PDF"}</span></li>)}</ul>}
        {stage==="investigate"&&<CapitalHistory copy={caseCopy} analysis={analysis}/>}
        {stage==="model"&&<CapitalBoard copy={caseCopy} analysis={analysis} initialScenario="base" compact/>}
        {stage==="prepare"&&<><CapitalComparison copy={caseCopy} analysis={analysis}/><CapitalMaterials copy={caseCopy}/></>}
        {stage==="connect"&&<CapitalConnection copy={caseCopy}/>}
        <p className={styles.paperNote}>{s.note}</p>
      </div></div>
    </div>
  </div>;
}
