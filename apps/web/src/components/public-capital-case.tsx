"use client";

import {useId, useState} from "react";
import {Check, Plus, FileSpreadsheet, FileText, Presentation, ScrollText, Landmark, Factory, Building2, TriangleAlert} from "lucide-react";
import type {WebsiteAdvisorExample, BoardScenarioKey} from "@/lib/website-advisor-example";
import styles from "./public-capital-case.module.css";

export type CapitalCaseCopy = typeof import("../../messages/pt-BR.json")["Website"]["capitalCase"];
type CaseProps={copy:CapitalCaseCopy;analysis:WebsiteAdvisorExample};
export function caseText(text:string,values:Record<string,unknown>) {
  return text.replace(/\{(\w+)\}/g,(_,key:string)=>{const value=values[key];if(typeof value!=="string"&&typeof value!=="number")throw Error(`Missing case value: ${key}`);return String(value);});
}

export function CapitalReceivables({copy:c,analysis:a}:CaseProps) {
  const [path,setPath]=useState<"fidc"|"discount"|"revolver">("fidc");
  const [restricted,setRestricted]=useState(false);
  const r=c.receivables;const selected=r[path];const d=a.receivables;const id=useId();
  return <div className={styles.receivables}>
    <div className={styles.quantification}><h4>{r.numericTitle}</h4><div className={styles.numericPicker} role="group" aria-label={r.numericTitle}><button type="button" aria-pressed={!restricted} onClick={()=>setRestricted(false)}>{r.full}</button><button type="button" aria-pressed={restricted} onClick={()=>setRestricted(true)}>{r.restricted}</button></div><div className={styles.cashPair} aria-live="polite"><div><span>{r.face}</span><strong>{restricted?d.eligible:d.face}</strong></div><span className={styles.equals} aria-hidden="true">× 80%</span><div><span>{r.cash}</span><strong>{restricted?d.restricted:d.full}</strong></div></div><p className={styles.unit}>{c.unit}</p><p>{r.numericNote}</p></div>
    <div className={styles.routePicker} role="group" aria-label={c.decision}>{(["fidc","discount","revolver"] as const).map((key,index)=><button type="button" key={key} onClick={()=>setPath(key)} aria-pressed={key===path} aria-controls={`${id}-route`}><span>0{index+1}</span>{r[key].title}</button>)}</div>
    <div key={path} id={`${id}-route`} className={styles.route} role="region" aria-label={selected.title}><h4>{selected.benefit}</h4><p>{selected.how}</p><details className={styles.deep}><summary>{c.advantage} / {c.constraint}<Plus size={16} aria-hidden="true"/></summary><h5>{c.advantage}</h5><p>{selected.advantage}</p><h5>{c.constraint}</h5><p>{selected.constraint}</p></details><div className={styles.judgment}><span>{c.decision}</span><p>{selected.decision}</p></div></div>
    <details className={styles.nextDocuments}><summary>{r.nextTitle}<Plus size={16} aria-hidden="true"/></summary><p>{r.next}</p><p className={styles.small}>{r.accounting} <a href="https://conteudo.cvm.gov.br/export/sites/cvm/menu/regulados/normascontabeis/cpc/CPC_48_Rev_13.pdf" target="_blank" rel="noreferrer">{r.accountingLink}</a></p></details>
  </div>;
}

export function CapitalCashChart({copy:c,analysis:a,selected="integrated"}:{copy:CapitalCaseCopy;analysis:WebsiteAdvisorExample;selected?:BoardScenarioKey}) {
  const b=a.board;const base=b.scenarios.base.values;const values=b.scenarios[selected].values;
  const y=(value:number)=>25+(175-value)*.42;const x=(index:number)=>40+index*160;
  const line=(points:number[])=>points.map((value,index)=>`${index?"L":"M"}${x(index)},${y(value)}`).join(" ");
  const id=useId();
  return <figure className={styles.chart}><figcaption>{c.board.chartTitle}<span>{c.unit}</span></figcaption><div className={styles.chartLegend}><span><i/>{c.board[selected].label}</span>{selected!=="base"&&<span><i data-baseline/>{c.board.baseline}</span>}<span><i data-floor/>{c.board.floor} {b.minimumCash}</span></div>
    <svg viewBox="0 0 560 220" role="img" aria-labelledby={`${id}-chart`}><title id={`${id}-chart`}>{c.board.chartTitle}: {b.years.map((year,index)=>`${year}: ${values[index]}`).join(", ")}</title>{[-200,0,150].map(tick=><g key={tick}><line x1="36" x2="530" y1={y(tick)} y2={y(tick)} className={styles.gridline}/></g>)}<line x1="36" x2="530" y1={y(b.minimumCash)} y2={y(b.minimumCash)} className={styles.minimum}/>{selected!=="base"&&<path d={line(base)} className={styles.baseline}/>}<path key={selected} d={line(values)} className={styles.cashLine}/>{values.map((value,index)=><circle key={index} cx={x(index)} cy={y(value)} r={index===2?5:3.5} className={styles.cashPoint}/>)}</svg>
    <div className={styles.chartNumbers}>{b.years.map((year,index)=><div key={year}><span>{year}</span><strong data-alert={values[index]<b.minimumCash}>{index?b.scenarios[selected].rows[index-1].cash:values[0]}</strong></div>)}</div>
  </figure>;
}

export function CapitalBoard({copy:c,analysis:a,initialScenario="integrated",compact=false}:CaseProps&{initialScenario?:BoardScenarioKey;compact?:boolean}) {
  const [scenario,setScenario]=useState<BoardScenarioKey>(initialScenario);const [year,setYear]=useState(1);const [stress,setStress]=useState(false);const b=a.board;const s=b.scenarios[scenario];const t=c.board;const current=t[scenario];const row=s.rows[year];const id=useId();
  return <div className={styles.board}>
    <div className={styles.scenarioPicker} role="group" aria-label={t.scenarioLabel}>{(["base","plant","integrated","defer"] as const).map(key=><button type="button" key={key} aria-pressed={key===scenario} aria-controls={`${id}-scenario`} onClick={()=>setScenario(key)}>{t[key].label}</button>)}</div>
    <div id={`${id}-scenario`} role="region" aria-label={current.title}><CapitalCashChart copy={c} analysis={a} selected={scenario}/><div className={styles.scenarioReadout} aria-live="polite"><h4>{current.title}</h4><p>{caseText(current.action,s)}</p><div className={styles.decisionStatus} data-pass={s.allYearsMeetFloor}>{s.allYearsMeetFloor?<Check size={17} aria-hidden="true"/>:<TriangleAlert size={17} aria-hidden="true"/>}<span>{s.allYearsMeetFloor?t.passes:t.fails}</span></div><p>{current.tradeoff}</p></div></div>
    {!compact&&<div className={styles.recommendation}><span>{t.recommend}</span><p>{t.recommendation}</p></div>}
    <details className={styles.deep}><summary>{t.sourcesTitle}<Plus size={16} aria-hidden="true"/></summary><div className={styles.yearPicker} role="group" aria-label={t.year}>{s.rows.map((item,index)=><button type="button" key={item.year} aria-pressed={year===index} onClick={()=>setYear(index)}>{item.year}</button>)}</div><table className={styles.bridge}><caption>{current.title} · {row.year} · {c.unit}</caption><tbody><tr><th scope="row">{t.openingCash}</th><td>{row.opening}</td></tr>{row.sources.map(line=><tr key={line.id}><th scope="row">{t[line.id as "operating"|"draw"]}</th><td>+ {line.value}</td></tr>)}{row.uses.filter(line=>Number(line.value.replace(",","."))!==0).map(line=><tr key={line.id}><th scope="row">{line.id==="maturity"?t.scheduledMaturity:t[line.id as "maintenance"]}</th><td>− {line.value}</td></tr>)}<tr className={styles.total}><th scope="row">{t.closingCash}</th><td>{row.cash}</td></tr></tbody></table><p>{t.operatingNote}</p><ul className={styles.sourceList}><li>{t.sourceBudget}</li><li>{t.sourceDebt}</li><li>{t.sourceCapex}</li></ul></details>
    <details className={styles.deep}><summary>{t.covenantTitle}<Plus size={16} aria-hidden="true"/></summary><p>{t.covenantNote}</p><div className={styles.yearPicker} role="group" aria-label={t.covenantTitle}><button type="button" aria-pressed={!stress} onClick={()=>setStress(false)}>{t.baseEbitda}</button><button type="button" aria-pressed={stress} onClick={()=>setStress(true)}>{t.downside}</button></div><div className={styles.covenantValues} aria-live="polite"><div><span>{t.leverage}</span><strong>{stress?b.downsideLeverage:b.leverage}x</strong></div><div><span>{t.covenant}</span><strong>{b.covenantLimit}x</strong></div></div><p>{t.covenantRule}</p></details>
    <p className={styles.small}>{t.chartNote}</p>
  </div>;
}

export function CapitalHistory({copy:c,analysis:a}:CaseProps) {
  const b=a.board;const h=b.history[2];const t=c.board;
  const definitions={...h,margin:b.margin,limit:b.covenantLimit,headroom:b.ebitdaHeadroom};
  const rows=[{key:"revenue",value:h.revenue,source:t.sourceHistory},{key:"ebitda",value:h.ebitda,source:t.sourceHistory},{key:"margin",value:b.margin,source:caseText(t.marginFormula,definitions)},{key:"netDebt",value:h.netDebt,source:t.sourceHistory},{key:"leverage",value:`${h.leverage}x`,source:caseText(t.leverageFormula,definitions)},{key:"headroom",value:b.ebitdaHeadroom,source:caseText(t.headroomFormula,definitions)},{key:"maturity",value:b.maturity,source:t.sourceDebt}] as const;
  return <div className={styles.history}><p className={styles.unit}>{c.unit}</p>{rows.map(row=><details key={row.key}><summary><span>{t[row.key]}</span><strong>{row.value}</strong><Plus size={14} aria-hidden="true"/></summary><p>{row.source}</p></details>)}<details className={styles.deep}><summary>{t.historyTitle}<Plus size={16} aria-hidden="true"/></summary><table className={styles.historyTable}><thead><tr><th>{t.year}</th><th>{t.revenue}</th><th>{t.ebitda}</th><th>{t.netDebt}</th></tr></thead><tbody>{b.history.map(row=><tr key={row.year}><th>{row.year}</th><td>{row.revenue}</td><td>{row.ebitda}</td><td>{row.netDebt}</td></tr>)}</tbody></table></details></div>;
}

export function CapitalMaterials({copy:c}: {copy:CapitalCaseCopy}) {
  const icons={boardPack:Presentation,modelPack:FileSpreadsheet,creditPack:FileText,termsPack:ScrollText};
  return <div className={styles.materials}>{(["boardPack","modelPack","creditPack","termsPack"] as const).map(key=>{const Icon=icons[key];return <details key={key}><summary><Icon size={24} strokeWidth={1.3} aria-hidden="true"/><span>{c.journey[key]}</span><Plus size={15} aria-hidden="true"/></summary><p>{c.journey[`${key}Detail`]}</p></details>;})}</div>;
}

export function CapitalComparison({copy:c,analysis:a}:CaseProps) {
  const [selected,setSelected]=useState<Exclude<BoardScenarioKey,"base">>("integrated");const scenario=a.board.scenarios[selected];
  return <div className={styles.comparison}><div className={styles.comparisonHead}><span>{c.board.scenarioLabel}</span><span>{c.board.cash2027}</span><span>{c.board.cash2028}</span></div><div role="group" aria-label={c.board.scenarioLabel}>{(["plant","integrated","defer"] as const).map(key=><button type="button" key={key} aria-pressed={selected===key} onClick={()=>setSelected(key)}><span>{c.board[key].label}</span><strong>{a.board.scenarios[key].cash2027}</strong><strong>{a.board.scenarios[key].cash2028}</strong></button>)}</div><div className={styles.scenarioReadout} aria-live="polite"><h4>{c.board[selected].title}</h4><p>{caseText(c.board[selected].action,scenario)}</p><p>{c.board[selected].tradeoff}</p></div></div>;
}

export function CapitalConnection({copy:c}: {copy:CapitalCaseCopy}) {
  const icons=[Landmark,Factory,Building2];
  return <div className={styles.capitalRoutes}>{(["One","Two","Three"] as const).map((key,index)=>{const Icon=icons[index];return <article key={key}><Icon size={25} strokeWidth={1.3} aria-hidden="true"/><div><h4>{c.journey[`lender${key}`]}</h4><p>{c.journey[`lender${key}Why`]}</p></div></article>;})}</div>;
}
