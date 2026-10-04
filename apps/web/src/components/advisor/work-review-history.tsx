"use client";
import {useEffect,useRef,useState,useTransition}from"react";
import {useRouter}from"next/navigation";
import {useTranslations}from"next-intl";
import {submitWorkReviewCommand,readMoreWorkReview}from"@/app/[locale]/app/projects/[projectId]/work-review-actions";
import {refreshWorkReviewPages,type WorkReviewDashboard}from"@/lib/advisor/work-review-dashboard";
export function WorkReviewHistory({dashboard,locale,projectId,labels}:{dashboard:WorkReviewDashboard|null;locale:"pt-BR"|"en-US";projectId:string;labels:Record<string,string>}){
 const t=useTranslations("WorkReviewHistory"),router=useRouter();const[storedPage,setPage]=useState(dashboard),[pending,start]=useTransition(),[error,setError]=useState<string|null>(null);const retry=useRef<{key:string;id:string}|null>(null);
 const[basis,setBasis]=useState(dashboard);const cursors=useRef<{revisions:string[];decisions:string[]}>({revisions:[],decisions:[]});
 // During refresh render only the fresh server page; older visited pages are
 // re-authorized before returning them to the view, including denial/withholding.
 const page=basis===dashboard?storedPage:dashboard;
 useEffect(()=>{if(basis===dashboard)return;let active=true;
  void refreshWorkReviewPages(dashboard,cursors.current,(beforeId,beforeDecisionId)=>readMoreWorkReview({locale,projectId,beforeId,beforeDecisionId})).then(next=>{if(active){setBasis(dashboard);setPage(next);}}).catch(()=>{if(active){setBasis(dashboard);setPage(null);}});
  return()=>{active=false;};
 },[basis,dashboard,locale,projectId]);
 const[note,setNote]=useState(""),[declared,setDeclared]=useState(false),[key,setKey]=useState(""),[decidedBy,setBy]=useState(""),[forum,setForum]=useState(""),[date,setDate]=useState("");
 function command(fields:Record<string,unknown>){const body={...fields,locale,projectId,note};const hash=JSON.stringify(body);if(retry.current?.key!==hash)retry.current={key:hash,id:crypto.randomUUID()};const commandId=retry.current.id;setError(null);start(async()=>{try{const result=await submitWorkReviewCommand({...body,commandId});if(result.ok){retry.current=null;router.refresh();}else setError(result.error);}catch{setError("save");}});}
 if(!page)return<p role="status">{t("unavailable")}</p>;
 const actor=(id:string|null)=>id&&labels[id]?labels[id]:t("historicalActor");
 return<section data-testid="work-review-history"><h3>{t("title")}</h3>
 <p>{t("scope")}</p><label>{t("reason")}<textarea name="review_history_reason" maxLength={2000} value={note}onChange={e=>setNote(e.target.value)}disabled={pending}/></label>
 <label><input name="review_history_declaration"type="checkbox"checked={declared}onChange={e=>setDeclared(e.target.checked)}disabled={pending}/>{t("declaration")}</label>
 <ul>{page.revisions.map(r=><li key={r.revisionId}data-review-withheld={r.withheld}>{r.withheld?t("withheld"):<><h4>{t("revision",{number:r.revisionNo})} · {t(r.pending?"pending":"reviewed")}</h4><p>{t("preparedBy",{name:actor(r.preparedBy)})}</p>
 {r.change?<p data-change-classification={r.change.outcome}>{t(`change.${r.change.outcome}`)}{r.change.reasons.map(reason=><span key={reason}> · {t.has(`reasons.${reason}`)?t(`reasons.${reason}`):t("change.other")}</span>)}</p>:null}
 <ul>{r.reviews.map(v=><li key={v.id}>{t.has(`acts.${v.act}`)?t(`acts.${v.act}`):t("historyAct")} · {actor(v.reviewerId)} · <time dateTime={v.createdAt}>{v.createdAt.slice(0,10)}</time>{v.note?<p>{v.note}</p>:null}</li>)}</ul>
 {r.canReaffirm&&r.basisReviewId?<button disabled={pending||!note.trim()}onClick={()=>command({act:"reaffirm",revisionId:r.revisionId,fingerprint:r.manifestFingerprint,basisReviewId:r.basisReviewId,declared})}>{t("reaffirm")}</button>:null}</>}</li>)}</ul>
 {page.nextCursor?<button disabled={pending}onClick={()=>{const cursor=page.nextCursor!;start(async()=>{const next=await readMoreWorkReview({locale,projectId,beforeId:cursor,beforeDecisionId:null});if(!next)setError("denied");else{cursors.current.revisions.push(cursor);setPage({...page,revisions:[...page.revisions,...next.revisions],nextCursor:next.nextCursor});}});}}>{t("more")}</button>:null}
 {page.canManage?page.assignments.map(a=><label key={a.fromUserId}>{t("reassignFrom",{name:actor(a.fromUserId)})}<select name="review_reassign_recipient"disabled={pending||!note.trim()||a.eligible.length===0}defaultValue=""onChange={e=>{if(e.target.value)command({act:"reassign",fromUserId:a.fromUserId,toUserId:e.target.value});}}><option value="">{t("selectRecipient")}</option>{a.eligible.map(m=><option value={m.userId}key={m.userId}>{m.label}</option>)}</select></label>):null}
 <h4>{t("decisions")}</h4><ul>{page.decisions.map(d=><li key={d.withheld?d.id:d.decision.id}>{d.withheld?t("withheld"):<><p>{d.decision.origin==="reported"?d.decision.decisionKey:t.has(`decisionKinds.${d.decision.kind}`)?t(`decisionKinds.${d.decision.kind}`):t("historyAct")} · {t(`origin.${d.decision.origin}`)} · {actor(d.decision.decidedBy)} · {d.decision.createdAt.slice(0,10)}</p>{d.decision.note?<p>{d.decision.note}</p>:null}<p>{t(`precedence.${d.precedence.state}`)}</p>{d.canContest?<button disabled={pending||!note.trim()}onClick={()=>command({act:"contest",decisionId:d.decision.id,fingerprint:d.decision.fingerprint})}>{t("contest")}</button>:null}</>}</li>)}</ul>{page.nextDecisionCursor?<button disabled={pending}onClick={()=>{const cursor=page.nextDecisionCursor!;start(async()=>{const next=await readMoreWorkReview({locale,projectId,beforeId:null,beforeDecisionId:cursor});if(!next)setError("denied");else{cursors.current.decisions.push(cursor);setPage({...page,decisions:[...page.decisions,...next.decisions],nextDecisionCursor:next.nextDecisionCursor,decisionsTruncated:next.decisionsTruncated});}});}}>{t("moreDecisions")}</button>:null}
 {page.canReport?<fieldset disabled={pending}><legend>{t("report")}</legend><p>{t("reportScope")}</p>
 <label>{t("decisionKey")}<input name="reported_decision_key"value={key}maxLength={2000}onChange={e=>setKey(e.target.value)}/></label>
 <label>{t("decidedBy")}<input name="reported_decided_by"value={decidedBy}maxLength={2000}onChange={e=>setBy(e.target.value)}/></label>
 <label>{t("forum")}<input name="reported_forum"value={forum}maxLength={2000}onChange={e=>setForum(e.target.value)}/></label>
 <label>{t("date")}<input name="reported_date"type="date"value={date}onChange={e=>setDate(e.target.value)}/></label>
 <button disabled={!note.trim()||!key.trim()||!decidedBy.trim()||!forum.trim()||!date}onClick={()=>command({act:"report",key,decidedBy,forum,decidedOn:date})}>{t("saveReport")}</button></fieldset>:null}
 {error?<p role="alert">{t(`errors.${error}`)}</p>:null}</section>;
}
