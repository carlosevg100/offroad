"use client";
import {useState,useTransition,useRef} from "react";
import {useLocale,useTranslations,useFormatter} from "next-intl";
import {useRouter} from "next/navigation";
import {reviewActionAllowed} from "@offroad/domain-contracts";
import {reviewInstitutionalArtifact} from "@/app/[locale]/app/projects/[projectId]/artifact-review-actions";
import type {InstitutionalReview} from "@/lib/artifacts/institutional-review";
import styles from "./project-review-roles.module.css";

export function ArtifactRevisionReview({context,projectId,resultId,userId}:{context:InstitutionalReview;projectId:string;resultId:string;userId:string}) {
 const t=useTranslations("ArtifactRevisionReview");const locale=useLocale();const f=useFormatter();const router=useRouter();
 const [pending,start]=useTransition();const [declared,setDeclared]=useState(false);const [note,setNote]=useState("");const [blockId,setBlock]=useState("");
 const [error,setError]=useState<"denied"|"changed"|"save"|null>(null);
 const attempt=useRef<{key:string;commandId:string}|null>(null);
 const r=context.snapshot.revision;
 const allowed=(act:"approve"|"comment"|"return"|"revoke_approval")=>reviewActionAllowed({act,regime:context.policy,roles:context.policy.roles,preparedBy:context.preparedBy,
  reviewerId:userId,selfApprovalDeclared:declared,workAccess:true,sourceAccess:true,hasSubstance:true,manageAccess:false}).allowed;
 function submit(act:"approve"|"comment"|"return"|"revoke_approval",basisReviewId:string|null=null){
  const key=JSON.stringify({revisionId:r.id,fingerprint:r.manifestFingerprint,act,declared,note,basisReviewId,blockId});
  if(attempt.current?.key!==key)attempt.current={key,commandId:crypto.randomUUID()};
  const commandId=attempt.current.commandId;setError(null);
  start(async()=>{try{const result=await reviewInstitutionalArtifact({locale,projectId,resultId,revisionId:r.id,fingerprint:r.manifestFingerprint,act,declared,commandId,
   note,basisReviewId,blockId:act==="comment"||act==="return"?blockId||null:null});if(!result.ok)setError(result.error);else{attempt.current=null;setNote("");router.refresh();}}catch{setError("save");}});
 }
 const active=context.reviews.filter(v=>(v.act==="approve"||v.act==="reaffirm")&&!context.reviews.some(x=>x.act==="revoke_approval"&&x.basisReviewId===v.id));
 return <section className={styles.roles} data-testid="artifact-revision-review">
  <h3>{t("title",{revision:r.revisionNo})}</h3>
  <p>{t(context.release==="released"?"approved":"pending")}</p><p>{t("scope")}</p>
  <p>{t(context.policy.assignmentRequired?"assigned":"individual")}</p>
  {context.preparedBy===userId&&context.policy.selfApprovalAllowed?<label><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)} disabled={pending}/>{t("declaration")}</label>:null}
  {context.preparedBy===userId&&!context.policy.selfApprovalAllowed?<p>{t("differentReviewer")}</p>:null}
  <label>{t("note")}<textarea value={note} maxLength={5000} onChange={e=>setNote(e.target.value)} disabled={pending}/></label>
  <label>{t("block")}<select value={blockId} onChange={e=>setBlock(e.target.value)} disabled={pending}><option value="">{t("whole")}</option>{context.snapshot.blocks.map(b=><option key={b.id} value={b.id}>{t("blockNumber",{number:b.blockNo})}</option>)}</select></label>
  <div><button disabled={pending||!allowed("approve")} onClick={()=>submit("approve")}>{t("approve")}</button>
   <button disabled={pending||!note.trim()||!allowed("comment")} onClick={()=>submit("comment")}>{t("comment")}</button>
   <button disabled={pending||!note.trim()||!allowed("return")} onClick={()=>submit("return")}>{t("return")}</button></div>
  <ul>{context.reviews.map(v=><li key={v.id}>{t(`acts.${v.act}`)} · {f.dateTime(new Date(v.createdAt),{dateStyle:"medium",timeZone:"UTC"})}{v.note?<p>{v.note}</p>:null}
    {active.some(a=>a.id===v.id)?<button disabled={pending||!allowed("revoke_approval")} onClick={()=>submit("revoke_approval",v.id)}>{t("revoke")}</button>:null}</li>)}</ul>
  {error?<p role="alert">{t(`errors.${error}`)}</p>:null}
 </section>;
}
