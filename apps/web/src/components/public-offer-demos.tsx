"use client";

import Image from "next/image";
import {useEffect, useId, useRef, useState, type CSSProperties} from "react";
import {Check, FileText, FileSpreadsheet, Presentation, ScrollText, Link2, RotateCcw, Landmark, TriangleAlert, Plus, X, CircleUserRound} from "lucide-react";
import type {WebsiteOfferExample} from "@/lib/website-example";
import type {FinancialBaseline} from "./public-workbench";
import type {WebsiteAdvisorExample} from "@/lib/website-advisor-example";
import {CapitalReceivables, CapitalBoard, CapitalCashChart, caseText, type CapitalCaseCopy} from "./public-capital-case";
import styles from "./public-offer-demos.module.css";

type Demo = typeof import("../../messages/pt-BR.json")["Website"]["offering"]["demo"];
export const advisorTopics = ["receivables","board","pricing"] as const;
export const analystDocuments = ["model","deck","memo","debt"] as const;
type DocumentKind = typeof analystDocuments[number];
const documentIcons = {model:FileSpreadsheet,deck:Presentation,memo:FileText,debt:ScrollText};
const formats = {model:"XLSX",deck:"PPTX",memo:"DOCX",debt:"XLSX"};

export function fillOfferText(text:string, data:WebsiteOfferExample) {
  return text.replace(/\{(\w+)\}/g, (_,key:string) => {
    const value = data[key as keyof WebsiteOfferExample];
    if (typeof value !== "string" && typeof value !== "number") throw new Error(`Missing public example field: ${key}`);
    return String(value);
  });
}

/** SSR stays visible. A finite animation starts only when the example enters view. */
function useDemoEntrance() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {node.dataset.play = "true";observer.disconnect();}
    }, {threshold:0.15});
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function PublicAdvisorDemo({copy:c,data,analysis,caseCopy,initialTopic="receivables"}: {
  copy:Demo["advisor"];data:WebsiteOfferExample;analysis:WebsiteAdvisorExample;caseCopy:CapitalCaseCopy;initialTopic?:typeof advisorTopics[number];
}) {
  const [topic,setTopic] = useState(initialTopic);
  const id = useId();
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const current = c[topic];
  const prompt=topic==="receivables"?caseText(caseCopy.receivables.prompt,analysis.receivables):topic==="board"?caseText(caseCopy.board.prompt,analysis.board):fillOfferText(current.question,data);
  const response=topic==="receivables"?caseText(caseCopy.previewReceivables,analysis.receivables):topic==="board"?caseCopy.board.opening:current.response;
  return <div className={styles.advisor}>
    <div className={styles.topicPicker} role="group" aria-label={c.selector}>{advisorTopics.map(key => <button type="button" key={key} aria-pressed={key===topic} aria-controls={`${id}-conversation`} onClick={() => setTopic(key)}>{c[key].label}</button>)}</div>
    <div className={styles.conversation} id={`${id}-conversation`} role="region" aria-label={current.label}>
      <div className={styles.conversationPage} key={topic}>
        <div className={styles.question}><span>{c.you}</span><p>{prompt}</p></div>
        <div className={styles.response} aria-live="polite"><div className={styles.responseBrand}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/>{c.offroad}</div><p>{response}</p>
          {topic==="board"?<div className={styles.advisorPreview}><CapitalCashChart copy={caseCopy} analysis={analysis}/></div>:<ol className={styles.investigation}>{(["one","two","three"] as const).map((key,index) => <li key={key} style={{"--order":index} as CSSProperties}><span aria-hidden="true">{String(index+1).padStart(2,"0")}</span>{topic==="receivables"?caseCopy.receivables[(["fidc","discount","revolver"] as const)[index]].title:current[key]}</li>)}</ol>}
          <button type="button" className={styles.exploreAnalysis} ref={trigger} aria-haspopup="dialog" onClick={()=>dialog.current?.showModal()}>{caseCopy.openAnalysis}<Plus size={16} aria-hidden="true"/></button>
        </div>
      </div>
    </div><p className={styles.caption}>{caseCopy.demo}</p>
    <dialog ref={dialog} className={styles.analysisDialog} aria-labelledby={`${id}-dialog-title`} onClose={()=>trigger.current?.focus()}><div className={styles.dialogHeader}><span>{caseCopy.demo}</span><button type="button" onClick={()=>dialog.current?.close()} aria-label={caseCopy.closeAnalysis}><X size={22} aria-hidden="true"/></button></div><div className={styles.dialogBody}><h3 id={`${id}-dialog-title`}>{current.label}</h3><blockquote>{prompt}</blockquote>{topic==="receivables"?<><p>{caseCopy.receivables.opening}</p><CapitalReceivables copy={caseCopy} analysis={analysis}/></>:topic==="board"?<CapitalBoard copy={caseCopy} analysis={analysis}/>:<><p>{current.response}</p><ol>{(["one","two","three"] as const).map(key=><li key={key}>{current[key]}</li>)}</ol><p>{current.next}</p></>}</div></dialog>
  </div>;
}

export function PublicAnalystDemo({copy:c,data,financials:f,exampleLabel,replayLabel,initialDocument=null}: {
  copy:Demo["analyst"];data:WebsiteOfferExample;financials:FinancialBaseline;exampleLabel:string;replayLabel:string;initialDocument?:DocumentKind|null;
}) {
  const [document,setDocument] = useState<DocumentKind|null>(initialDocument);
  const [replay,setReplay] = useState(0);
  const outputRefs = useRef<Partial<Record<DocumentKind,HTMLButtonElement|null>>>({});
  const id = useId();
  const ref = useDemoEntrance();
  return <div className={styles.analyst} ref={ref}>
    <div className={styles.direction}><CircleUserRound size={21} strokeWidth={1.4} aria-hidden="true"/><div><span>{c.directionLabel}</span><p>{c.direction}</p></div></div>
    <div className={styles.deliveryHeader}><span>{fillOfferText(c.received,data)}</span><button type="button" onClick={() => setReplay(value=>value+1)}><RotateCcw size={15} aria-hidden="true"/>{replayLabel}</button></div>
    <div key={replay} className={styles.sequence}>
      <div className={styles.inputs}><div><FileText size={19} aria-hidden="true"/><span>{c.pdf}</span></div><div><FileSpreadsheet size={19} aria-hidden="true"/><span>{c.spreadsheet}</span></div><div><ScrollText size={19} aria-hidden="true"/><span>{c.deed}</span></div></div>
      <p className={styles.inputNote}>{c.moreFiles}</p>
      <div className={styles.engine}><div className={styles.engineBrand}><span><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/></span>{c.engine}</div><div className={styles.pipeline} aria-label={c.delivery}>{(["extract","reconcile","model","prepare"] as const).map((key,index) => <div key={key} style={{"--order":index} as CSSProperties}><span aria-hidden="true"/>{c[key]}</div>)}</div></div>
      <div className={styles.outputs}>{analystDocuments.map((key,index) => {const Icon=documentIcons[key];return <button type="button" key={key} ref={node=>{outputRefs.current[key]=node;}} className={styles.output} aria-label={`${c.inspect}: ${c[`${key}Title`]}`} aria-expanded={document===key} aria-controls={`${id}-document`} onClick={() => setDocument(current=>current===key?null:key)} style={{"--order":index} as CSSProperties}><div className={styles.fileTop}><Icon size={23} strokeWidth={1.4} aria-hidden="true"/><span>{formats[key]}</span></div><strong>{c[`${key}Title`]}</strong><span className={styles.sourceBadge}><Link2 size={13} aria-hidden="true"/>{c.source}</span></button>;})}</div>
    </div>
    <div id={`${id}-document`} hidden={!document} className={styles.documentDetail} role="region" aria-label={document?c[`${document}Title`]:c.delivery}>
      {document && <><div className={styles.documentHead}><span>{c.review}</span><button type="button" onClick={()=>{outputRefs.current[document]?.focus();setDocument(null);}} aria-label={c.close}><X size={18} aria-hidden="true"/></button></div><h4>{c[`${document}Title`]}</h4><p>{c[`${document}Detail`]}</p>
        {document==="model" ? <><table className={styles.model}><tbody><tr><th scope="row">{c.reported}</th><td>{f.reported}</td></tr><tr><th scope="row">{c.adjustment}</th><td>{f.adjustment}</td></tr><tr><th scope="row">{c.adjusted}</th><td>{f.adjusted}</td></tr></tbody></table><small>{c.modelUnit} · {c.trace}</small></> : <ol className={styles.documentOutline}>{(["One","Two","Three"] as const).map(key=><li key={key}>{c[`${document}${key}`]}</li>)}</ol>}
      </>}
    </div>
    <div className={styles.reviewRole}><CircleUserRound size={18} strokeWidth={1.4} aria-hidden="true"/>{c.reviewRole}</div><p className={styles.darkCaption}>{exampleLabel}</p>
  </div>;
}

export function PublicConnectionDemo({copy:c,data}: {copy:Demo["connection"];data:WebsiteOfferExample}) {
  const ref=useDemoEntrance();
  return <div className={styles.connection} ref={ref}>
    <div className={styles.lenderPaper}>
      <div className={styles.lenderIdentity}><div className={styles.lenderIcon}><Landmark size={25} strokeWidth={1.3} aria-hidden="true"/></div><div><span>{c.fictional}</span><h4>{data.fund}</h4><p>{c.strategy}</p></div></div>
      <div className={styles.mandate}><span className={styles.smallLabel}>{c.mandate}</span><dl><div><dt>{c.ticket}</dt><dd>{fillOfferText(c.ticketValue,data)}</dd></div><div><dt>{c.tenor}</dt><dd>{fillOfferText(c.tenorValue,data)}</dd></div><div><dt>{c.collateral}</dt><dd>{c.collateralValue}</dd></div></dl></div>
      <div className={styles.scoreRow}><div className={styles.scoreRing}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" pathLength="100"/><circle className={styles.scoreArc} cx="50" cy="50" r="43" pathLength="100" strokeDasharray="100" strokeDashoffset={data.scoreMaximum-data.score}/></svg><span><strong>{data.score}</strong><small>/{data.scoreMaximum}</small></span></div><div><span className={styles.smallLabel}>{c.score}</span><strong>{c.conditional}</strong><p>{c.scoreNote}</p></div></div>
      <div className={styles.transaction}><span>{c.deal}</span><strong>{fillOfferText(c.dealValue,data)}</strong></div>
      <ul className={styles.fitCriteria}>{data.criteria.map(item=><li key={item.key} data-outcome={item.outcome}><div className={styles.criterionStatus}>{item.outcome==="fits"?<Check size={15} aria-hidden="true"/>:<TriangleAlert size={15} aria-hidden="true"/>}<span>{item.outcome==="fits"?c.fits:c.adjust}</span></div><div><strong>{c[item.key]}</strong><p>{fillOfferText(c[`${item.key}Value`],data)}</p></div></li>)}</ul>
      <details className={styles.rationale}><summary>{c.rationale}<Plus size={17} aria-hidden="true"/></summary><p>{c.explanation}</p><span className={styles.smallLabel}>{c.weights}</span><ul>{data.criteria.map(item=><li key={item.key}><span>{c[item.key]}</span><strong>{item.earned}/{item.weight}</strong></li>)}</ul></details>
    </div><p className={styles.caption}>{c.disclosure}</p>
  </div>;
}
