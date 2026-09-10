import {readProviderCaseFitArtifact} from "@offroad/fund-mandate";
import type {ProviderResearchRow} from "./provider-research-reader";
export function currentProviderCaseFit(rows:readonly ProviderResearchRow[],runs:readonly {id:string;status:string}[],binding:{organizationId:string;projectId:string;planId:string;planFingerprint:string}|null) {
 if(!binding)return null;
 const row=rows.filter(r=>r.artifact_type==='provider_case_fit'&&r.plan_id===binding.planId).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!row||!['draft','pending_confirmation','confirmed','approved'].includes(row.status)||row.schema_version!=='provider-case-fit.v1'||!runs.some(run=>run.id===row.task_run_id&&run.status==='succeeded'))return null;
 const fit=readProviderCaseFitArtifact(row.content,binding);
 return fit?{row,fit}:null;
}
