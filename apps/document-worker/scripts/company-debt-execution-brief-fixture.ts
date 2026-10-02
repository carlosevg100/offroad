/** Rollback-only fixture: uses the production deterministic compiler, never a model. */
import {readFileSync} from 'node:fs';
import {capitalProjectPlanSnapshot} from '@offroad/work-plan';
import {prepareExecutionBrief} from '../src/execution-brief.js';
if(process.argv.includes('--plan')) { process.stdout.write(JSON.stringify(capitalProjectPlanSnapshot('company_debt_view'))); process.exit(0); }
const c=JSON.parse(readFileSync(0,'utf8'));
const activation={job:'company_debt_view' as const,company:{name:'Companhia Sintética Farol',website:null},brief:{focus:'Compreender dívida, liquidez e lacunas de evidência pública.',knownContext:'Sem executar contato com credores.'}};
const prepared=prepareExecutionBrief({confirmedReceivablesScope:c.confirmed_receivables_scope,sessionId:c.session_id,governedSectorContextInputs:c.governed_sector_context_inputs,locale:c.locale,requestId:c.message_id,expectedInputFingerprint:c.approval_input_fingerprint,message:c.message,accessBasis:c.project.accessBasis,documents:c.documents.map((d:any)=>({id:d.id,name:d.name})),sourcePackId:c.source_pack_id??null,activePlan:c.active_plan,previousVisibleBrief:c.latest_execution_brief?.visibleSnapshot},activation);
process.stdout.write(JSON.stringify({activation,...prepared}));
