"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {readAssessmentReview,reviewAssessment} from "@/app/[locale]/app/projects/[projectId]/assessment-review-actions";
type Basis=Extract<Awaited<ReturnType<typeof readAssessmentReview>>,{ok:true}>["basis"];
export function AssessmentReview({locale,projectId,assessmentId}:{locale:"pt-BR"|"en-US";projectId:string;assessmentId:string}){
 const en=locale==="en-US",router=useRouter();
 const [basis,setBasis]=useState<Basis|null>(null),[error,setError]=useState(false),[declared,setDeclared]=useState(false),[freezeRejected,setFreezeRejected]=useState(false),[commandId,setCommandId]=useState<string|null>(null),[pending,start]=useTransition();
 const scope={locale,projectId,assessmentId};
 function open(){start(async()=>{setError(false);const result=await readAssessmentReview(scope);if(result.ok){setBasis(result.basis);setDeclared(false);setCommandId(crypto.randomUUID());}else setError(true);});}
 function decide(outcome:"approved"|"rejected"){if(!basis||!commandId)return;start(async()=>{
  setError(false);const result=await reviewAssessment({...scope,commandId,revision:basis.revision,decisionFingerprint:basis.decisionFingerprint,proposalFingerprint:basis.proposalFingerprint,outcome,freeze:outcome==="approved"||freezeRejected,selfApprovalDeclared:declared});
  if(result.ok){setBasis(null);router.refresh();}else setError(true);
 });}
 const self=basis?.preparedBy===basis?.viewerId;
 return <div className="assessment-review">
  {!basis?<button type="button" disabled={pending} onClick={open}>{en?"Review analysis":"Revisar análise"}</button>:<div role="group" aria-label={en?"Review analysis":"Revisar análise"}>
   <p>{en?`Revision ${basis.revision} · ${basis.totalSourceCount} governed sources. Confirmation preserves this analysis; it does not start work.`:`Revisão ${basis.revision} · ${basis.totalSourceCount} fontes governadas. Confirmar preserva esta análise; não inicia trabalho.`}</p>
   {self?<label><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)}/>{en?"I confirm that I am reviewing an analysis prepared under my access.":"Declaro que estou revisando uma análise preparada sob meu acesso."}</label>:null}
   <label><input type="checkbox" checked={freezeRejected} onChange={e=>setFreezeRejected(e.target.checked)}/>{en?"Preserve the rejection for this analysis.":"Preservar a rejeição desta análise."}</label>
   <button type="button" disabled={pending||!basis.workAccess||self&&(!basis.policy.selfApprovalAllowed||!declared)} onClick={()=>decide("approved")}>{en?"Confirm and preserve":"Confirmar e preservar"}</button>
   <button type="button" disabled={pending||!basis.workAccess} onClick={()=>decide("rejected")}>{en?"Reject":"Rejeitar"}</button>
   <button type="button" disabled={pending} onClick={()=>setBasis(null)}>{en?"Cancel":"Cancelar"}</button>
  </div>}
  {error?<p role="alert">{en?"The analysis or your access changed. Open the review again.":"A análise ou seu acesso mudou. Abra a revisão novamente."}</p>:null}
 </div>;
}
