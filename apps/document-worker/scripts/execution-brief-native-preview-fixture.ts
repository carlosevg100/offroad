/** Isolated CI compiler, using the same preview activation and brief preparer. */
import {readFileSync} from "node:fs";
import {preview} from "@offroad/credit-playbook";
import {offroadTaskRegistryVersion} from "@offroad/work-plan";
import {buildPreviewActivation} from "../src/integration-preview";
import {prepareExecutionBrief} from "../src/execution-brief";
if(process.argv.includes("--plan")){
 process.stdout.write(JSON.stringify(preview.compileIntegrationPreviewPlan({composition:"prepare_material",entryJob:"origination_thesis",locale:"pt-BR",registryVersion:offroadTaskRegistryVersion})));process.exit(0);
}
const c=JSON.parse(readFileSync(0,"utf8"));
const request={turn:1,composition:"prepare_material" as const,audience:null,form:"internal_briefing" as const,pages:null,sponsorInstruction:null,undefinedAspects:[]};
const activation=buildPreviewActivation("prepare_material",request,{}, {locale:c.locale,message:c.message,recentMessages:[],artifactTypes:[],runActive:false,priorOutputs:new Map(),entryJob:"origination_thesis",messageId:c.message_id});
const prepared=prepareExecutionBrief({confirmedReceivablesScope:c.confirmed_receivables_scope,sessionId:c.session_id,governedSectorContextInputs:c.governed_sector_context_inputs,locale:c.locale,requestId:c.message_id,expectedInputFingerprint:c.approval_input_fingerprint,message:c.message,accessBasis:c.project.accessBasis,documents:c.documents.map((d:{id:string;name:string})=>({id:d.id,name:d.name})),sourcePackId:c.source_pack_id??null,activePlan:c.active_plan,previousVisibleBrief:c.latest_execution_brief?.visibleSnapshot},activation);
process.stdout.write(JSON.stringify({activation,...prepared}));
