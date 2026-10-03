"use client";
import {useEffect,useState,useTransition} from "react";
import {readWorkUpdateAdoption,adoptWorkUpdate} from "@/app/[locale]/app/projects/[projectId]/work-update-actions";
type Basis=Extract<Awaited<ReturnType<typeof readWorkUpdateAdoption>>,{ok:true}>["basis"];
export function WorkUpdateAdoptionConfirmation({locale,updateId,expectedRevision,onAdopted,onCancel}:{locale:"pt-BR"|"en-US";updateId:string;expectedRevision:number;onAdopted:()=>void;onCancel:()=>void}){
 const en=locale==="en-US",[basis,setBasis]=useState<Basis|null>(null),[declared,setDeclared]=useState(false),[error,setError]=useState(false),[pending,start]=useTransition();
 const [commandId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{let current=true;void readWorkUpdateAdoption({locale,updateId,expectedRevision}).then(r=>{if(current){if(r.ok)setBasis(r.basis);else setError(true);}}).catch(()=>{if(current)setError(true);});return()=>{current=false;};},[locale,updateId,expectedRevision]);
 const self=!!basis?.preparedBy.includes(basis.viewerId);
 function confirm(){if(!basis)return;start(async()=>{setError(false);try{const result=await adoptWorkUpdate({locale,updateId,expectedRevision,commandId,expectedBasisFingerprint:basis.basisFingerprint,selfApprovalDeclared:declared});if(result.ok)onAdopted();else setError(true);}catch{setError(true);}});}
 return <div role="group" className="work-update__confirm">
  {basis?<p>{en?`${basis.adoptedResults.length} results will become the current base; ${basis.replacedResults.length} previous results will be replaced. This does not start another execution.`:`${basis.adoptedResults.length} resultados passam a ser a base corrente; ${basis.replacedResults.length} resultados anteriores serão substituídos. Isso não inicia outra execução.`}</p>:!error?<p role="status">{en?"Checking the result sources…":"Conferindo as fontes dos resultados…"}</p>:null}
  {self?<label><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)}/>{en?"I am adopting results prepared under my access.":"Declaro que estou adotando resultados preparados sob meu acesso."}</label>:null}
  <button type="button" disabled={pending||!basis||!basis.workAccess||self&&(!basis.policy.selfApprovalAllowed||!declared)} onClick={confirm}>{en?"Adopt this base":"Adotar esta base"}</button>
  <button type="button" disabled={pending} onClick={onCancel}>{en?"Cancel":"Cancelar"}</button>
  {error?<p role="alert">{en?"The results or your access changed. Open the adoption again.":"Os resultados ou seu acesso mudou. Abra a adoção novamente."}</p>:null}
 </div>;
}
