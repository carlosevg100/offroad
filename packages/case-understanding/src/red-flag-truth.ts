import {redFlagProcedures} from "@offroad/credit-playbook";
import type {ReconciledFact, ReconciliationException} from "@offroad/reconciliation";
import Decimal from "decimal.js";
import {z} from "zod";

import {fingerprintJson} from "./manifest";

const flagIdSchema=z.string().regex(/^RF-(0[1-9]|1\d|20)$/);
const severitySchema=z.enum(["information","low","medium","high","critical"]);
const detectorStatusSchema=z.enum(["clear","candidate","not_computable","not_applicable"]);
const findingStatusSchema=z.enum(["clear","candidate","confirmed","false_positive","treated","accepted_risk","not_computable","not_applicable"]);

export type RedFlagPolicy={
  version:string;
  status:"draft"|"active"|"expired"|"invalidated";
  validFrom:string;
  validUntil:string|null;
  thresholds:{
    inventoryRevenueGrowthGapPct?:string;
    pmrIncreaseDays?:string;
    stableRevenueChangePct?:string;
    highCashToDebtPct?:string;
    highDebtCostPct?:string;
    managementBiasPct?:string;
    periodEndRevenuePct?:string;
    changingInformationVersions?:number;
  };
};

export type RedFlagDetectorObservation={
  flagId:`RF-${string}`;
  status:z.infer<typeof detectorStatusSchema>;
  severity:z.infer<typeof severitySchema>;
  detail:string;
  supportIds:string[];
  observedAt:string;
};

export type RedFlagReview={
  flagId:`RF-${string}`;
  flagFingerprint:string;
  decision:"confirmed"|"false_positive"|"treated"|"accepted_risk";
  rationale:string;
  evidenceIds:string[];
  decidedBy:string;
  decidedAt:string;
};

export type MandateDecision={
  assessmentFingerprint:string;
  decision:"continue"|"continue_with_conditions"|"decline";
  reasonCodes:string[];
  conditions:string[];
  pathBack:string|null;
  decidedBy:string;
  decidedAt:string;
};

export type DeclineCommunication={
  mandateDecisionFingerprint:string;
  channel:string;
  recipient:string;
  sentBy:string;
  sentAt:string;
  messageFingerprint:string;
};

const findingSchema=z.object({
  flagId:flagIdSchema,
  title:z.string().min(1),
  family:z.enum(["quality_of_revenue","culture_of_numbers","economic_perimeter","conduct","governance","standalone"]),
  detectorStatus:detectorStatusSchema,
  status:findingStatusSchema,
  severity:severitySchema,
  detail:z.string().min(1),
  evidenceIds:z.array(z.string().min(1)),
  knownFalsePositives:z.array(z.string().min(1)),
  confirmationQuestions:z.array(z.string().min(1)),
  treatment:z.string().min(1),
  downstreamEffects:z.array(z.string().min(1)),
  blocksExternalOutputs:z.boolean(),
  fingerprint:z.string().regex(/^[0-9a-f]{64}$/),
  review:z.object({decision:z.enum(["confirmed","false_positive","treated","accepted_risk"]),rationale:z.string(),evidenceIds:z.array(z.string()),decidedBy:z.string(),decidedAt:z.string()}).nullable(),
  reviewStatus:z.enum(["not_required","pending","current","stale"]),
}).strict();
export type RedFlagFinding=z.infer<typeof findingSchema>;

export const redFlagTruthSetSchema=z.object({
  version:z.literal("2026.08.26-v1"),
  referenceDate:z.string(),
  caseFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
  policy:z.object({version:z.string().nullable(),status:z.string(),current:z.boolean()}),
  findings:z.array(findingSchema).length(20),
  families:z.array(z.object({id:z.string(),activeFlagIds:z.array(flagIdSchema),severity:severitySchema,requiresDeskDecision:z.boolean()}).strict()),
  mandate:z.object({
    assessmentFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    recommendation:z.enum(["continue","continue_with_conditions","decline_review_required"]),
    recommendationReasons:z.array(z.string()),
    decision:z.object({decision:z.enum(["continue","continue_with_conditions","decline"]),reasonCodes:z.array(z.string()),conditions:z.array(z.string()),pathBack:z.string().nullable(),decidedBy:z.string(),decidedAt:z.string()}).nullable(),
    decisionStatus:z.enum(["missing","current","stale"]),
    externalOutputsAllowed:z.boolean(),
    qualifiedIntroductionAllowed:z.boolean(),
  }).strict(),
  declineCommunication:z.object({required:z.boolean(),completed:z.boolean(),status:z.enum(["not_required","missing","current","stale"])}).strict(),
  blockers:z.array(z.string()),
  missingInputs:z.array(z.string()),
  procedureCoverage:z.array(z.object({procedureId:flagIdSchema,status:z.enum(["completed","partial","blocked","not_computable","not_applicable"]),findingFingerprint:z.string().regex(/^[0-9a-f]{64}$/)}).strict()).length(20),
  fingerprint:z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type RedFlagTruthSet=z.infer<typeof redFlagTruthSetSchema>;

type CatalogueEntry={title:string;family:RedFlagFinding["family"];defaultSeverity:RedFlagFinding["severity"];falsePositives:string[];questions:string[];treatment:string;effects:string[]};
const C:Record<string,CatalogueEntry>={
  "RF-01":{title:"Estoque crescendo acima da receita",family:"quality_of_revenue",defaultSeverity:"high",falsePositives:["Compra estratégica comprovada","Sazonalidade coerente com histórico"],questions:["Quais linhas e idades explicam o aumento?","A provisão acompanha perdas e obsolescência?"],treatment:"Explicar a causa física ou ajustar provisão e elegibilidade da garantia.",effects:["financial_analysis","security_package","materials"]},
  "RF-02":{title:"PMR esticando com receita estável",family:"quality_of_revenue",defaultSeverity:"high",falsePositives:["Mudança contratual comprovada com cliente de baixo risco"],questions:["Para quais clientes e faixas o PMR aumentou?","Há renegociados classificados no a vencer?"],treatment:"Usar carteira líquida e reavaliar concentração, perdas e garantia.",effects:["financial_analysis","security_package","materials"]},
  "RF-03":{title:"Margem descolada dos pares",family:"quality_of_revenue",defaultSeverity:"medium",falsePositives:["Mix, verticalização ou contrato físico comprovado"],questions:["Qual causa operacional explica a diferença?","Custos foram capitalizados ou receita antecipada?"],treatment:"Documentar a causa ou normalizar a margem no downside.",effects:["financial_analysis","projections","materials"]},
  "RF-04":{title:"Caixa alto com dívida cara",family:"standalone",defaultSeverity:"medium",falsePositives:["Caixa vinculado","Caixa em entidade diferente","Sazonalidade comprovada"],questions:["Qual o saldo médio mensal e a parcela livre?","Onde estão caixa e dívida no grupo?"],treatment:"Reclassificar caixa indisponível e recalcular dívida líquida.",effects:["debt_analysis","capacity"]},
  "RF-05":{title:"Troca de auditor",family:"culture_of_numbers",defaultSeverity:"medium",falsePositives:["Mudança por custo ou escopo documentada"],questions:["Qual foi o motivo formal?","O parecer anterior continha ressalva ou ênfase?"],treatment:"Antecipar o racional suportado nos materiais.",effects:["materials","mandate_screening"]},
  "RF-06":{title:"Republicação",family:"culture_of_numbers",defaultSeverity:"high",falsePositives:["Adoção normativa sem efeito econômico material"],questions:["Quais linhas e períodos mudaram?","A causa foi norma nova ou erro?"],treatment:"Quantificar efeito e usar somente a base reapresentada governada.",effects:["financial_analysis","materials"]},
  "RF-07":{title:"Gerencial sistematicamente melhor",family:"culture_of_numbers",defaultSeverity:"high",falsePositives:["Diferença de escopo totalmente conciliada"],questions:["Quais três linhas explicam o viés?","As diferenças revertem no período seguinte?"],treatment:"Excluir gerencial não conciliado e aplicar viés ao downside.",effects:["financial_analysis","projections","materials"]},
  "RF-08":{title:"Receita concentrada no fim do período",family:"quality_of_revenue",defaultSeverity:"high",falsePositives:["Sazonalidade histórica","Entrega ou medição comprovada"],questions:["Houve devolução nos sessenta dias seguintes?","Quais termos de entrega e devolução se aplicam?"],treatment:"Retirar receita sem entrega suportada da base LTM.",effects:["financial_analysis","capacity","materials"]},
  "RF-09":{title:"Circularidade com partes relacionadas",family:"economic_perimeter",defaultSeverity:"critical",falsePositives:["Transação arm's length e perímetro totalmente reconciliado"],questions:["Qual o mapa de fluxos e garantias do grupo?","O preço e a finalidade são verificáveis?"],treatment:"Analisar o perímetro econômico e fechar vazamentos na estrutura.",effects:["debt_analysis","structure","materials","mandate_decision"]},
  "RF-10":{title:"Litígio entre sócios",family:"governance",defaultSeverity:"critical",falsePositives:["Litígio remoto sem efeito decisório no horizonte da dívida"],questions:["Quais poderes e ativos estão bloqueados?","Qual o estágio e o efeito nas garantias?"],treatment:"Aguardar solução ou comprovar estrutura independente do conflito.",effects:["structure","mandate_screening","mandate_decision"]},
  "RF-11":{title:"Sucessão aberta",family:"governance",defaultSeverity:"high",falsePositives:["Segunda linha e continuidade efetivas"],questions:["Quem opera sem o fundador?","Há seguro-chave, delegação e plano formal?"],treatment:"Compatibilizar prazo e mitigantes com o risco de pessoa.",effects:["structure","mandate_screening"]},
  "RF-12":{title:"Garantia cruzada com empresa problemática",family:"economic_perimeter",defaultSeverity:"critical",falsePositives:["Garantia liberada ou exposição juridicamente inexistente"],questions:["Qual a exposição máxima e o gatilho?","A liberação é condição viável?"],treatment:"Liberar a garantia ou incorporar integralmente o contágio.",effects:["debt_analysis","structure","mandate_decision"]},
  "RF-13":{title:"Contingência reclassificada na véspera",family:"culture_of_numbers",defaultSeverity:"high",falsePositives:["Decisão ou opinião legal nova e datada"],questions:["Qual fato novo sustenta a reclassificação?","O padrão se repete em outras contingências?"],treatment:"Sem fundamento novo, preservar a classificação anterior na análise.",effects:["financial_analysis","materials"]},
  "RF-14":{title:"A informação que muda",family:"economic_perimeter",defaultSeverity:"high",falsePositives:["Versionamento formal com reconciliação completa"],questions:["Qual versão vem da fonte primária?","O que mudou, quando e por quem?"],treatment:"Congelar a base conciliada e registrar todas as divergências.",effects:["reconciliation","materials","mandate_decision"]},
  "RF-15":{title:"Resistência ao analítico",family:"conduct",defaultSeverity:"critical",falsePositives:["Indisponibilidade operacional com substituto verificável"],questions:["O que o analítico deveria testar?","Qual substituto auditável pode ser fornecido?"],treatment:"Obter substituto verificável ou declinar o mandato.",effects:["intake","analysis","mandate_decision"]},
  "RF-16":{title:"Pressa incompatível com verificações",family:"conduct",defaultSeverity:"high",falsePositives:["Urgência objetiva e documentada"],questions:["Qual evento criou a urgência?","Existe vencimento ou processo paralelo não declarado?"],treatment:"Preservar verificações ou estruturar ponte suportável.",effects:["intake","structure","mandate_decision"]},
  "RF-17":{title:"O caso que já circulou",family:"conduct",defaultSeverity:"high",falsePositives:["Circulação limitada, autorizada e com a mesma base"],questions:["Quem recebeu qual material?","Quais objeções e números circularam?"],treatment:"Corrigir formalmente a base ou esperar antes de reapresentar.",effects:["market_distribution","mandate_decision"]},
  "RF-18":{title:"Flags compostas",family:"standalone",defaultSeverity:"critical",falsePositives:["Componente encerrado ou pertencente a fingerprint anterior"],questions:["Quais componentes permanecem ativos?","Qual tratamento conjunto foi aprovado?"],treatment:"Submeter família severa à decisão explícita da mesa.",effects:["mandate_decision","materials","market_distribution"]},
  "RF-19":{title:"Critérios de declínio do mandato",family:"standalone",defaultSeverity:"critical",falsePositives:["Remediação corrente encerrou todas as causas"],questions:["A causa é remediável e está no escopo da Offroad?","Qual caminho de volta existe?"],treatment:"A mesa decide continuar, condicionar ou declinar o mandato da Offroad.",effects:["mandate_decision","external_release"]},
  "RF-20":{title:"Como se declina",family:"standalone",defaultSeverity:"high",falsePositives:["Nenhuma decisão de declínio corrente"],questions:["A razão e o caminho de volta estão claros?","A linguagem evita parecer de crédito?"],treatment:"Comunicar diretamente e registrar mensagem, data, ator e condição de reabertura.",effects:["client_communication","commercial_memory"]},
};

const bool=(value:string|undefined)=>value==="true"||value==="yes"||value==="sim"||value==="1";
const fact=(facts:readonly ReconciledFact[],paths:string[])=>facts.find((entry)=>paths.includes(entry.key.fieldPath));
const numeric=(facts:readonly ReconciledFact[],path:string)=>{const row=fact(facts,[path]);return row?.valueType==="number"?new Decimal(row.value):null;};
const support=(entry:ReconciledFact|undefined)=>entry?[entry.key.fieldPath]:[];
const directObservation=(facts:readonly ReconciledFact[],flagId:string,paths:string[],detail:string):RedFlagDetectorObservation|null=>{
  const row=fact(facts,paths);
  if(!row)return null;
  const active=row.valueType==="boolean"?bool(row.value):!/\b(não|nao|none|false|inexistente|sem litígio)\b/i.test(row.value);
  return {flagId:`RF-${flagId}` as `RF-${string}`,status:active?"candidate":"clear",severity:C[`RF-${flagId}`]!.defaultSeverity,detail,supportIds:support(row),observedAt:row.key.periodEnd??row.accepted.periodEnd??"unknown"};
};

function builtInObservations(facts:readonly ReconciledFact[],policy:RedFlagPolicy|null,referenceDate:string):RedFlagDetectorObservation[]{
  const rows:RedFlagDetectorObservation[]=[];
  const add=(row:RedFlagDetectorObservation|null)=>{if(row)rows.push(row);};
  const years=[...new Set(facts.map((entry)=>entry.key.fieldPath.match(/^historical_financials\.(\d{4})\./)?.[1]).filter((value):value is string=>Boolean(value)))].sort();
  const current=years.at(-1),prior=years.at(-2);
  const threshold=policy?.status==="active"?policy.thresholds:null;
  if(current&&prior&&threshold?.inventoryRevenueGrowthGapPct){
    const ci=numeric(facts,`historical_financials.${current}.inventory`),pi=numeric(facts,`historical_financials.${prior}.inventory`),cr=numeric(facts,`historical_financials.${current}.revenue`),pr=numeric(facts,`historical_financials.${prior}.revenue`);
    if(ci&&pi&&!pi.isZero()&&cr&&pr&&!pr.isZero()){
      const gap=ci.div(pi).minus(1).minus(cr.div(pr).minus(1)).times(100);
      rows.push({flagId:"RF-01",status:gap.gte(threshold.inventoryRevenueGrowthGapPct)?"candidate":"clear",severity:C["RF-01"]!.defaultSeverity,detail:`inventory_revenue_growth_gap_pct=${gap.toFixed(4)}`,supportIds:[`historical_financials.${current}.inventory`,`historical_financials.${prior}.inventory`,`historical_financials.${current}.revenue`,`historical_financials.${prior}.revenue`],observedAt:referenceDate});
    }
  }
  if(current&&threshold?.highCashToDebtPct&&threshold.highDebtCostPct){
    const cash=numeric(facts,`historical_financials.${current}.cash`),debt=numeric(facts,`historical_financials.${current}.gross_debt`),cost=numeric(facts,`historical_financials.${current}.average_debt_cost_pct`);
    if(cash&&debt&&!debt.isZero()&&cost){
      const ratio=cash.div(debt).times(100);
      rows.push({flagId:"RF-04",status:ratio.gte(threshold.highCashToDebtPct)&&cost.gte(threshold.highDebtCostPct)?"candidate":"clear",severity:C["RF-04"]!.defaultSeverity,detail:`cash_to_debt_pct=${ratio.toFixed(4)};average_debt_cost_pct=${cost.toFixed(4)}`,supportIds:[`historical_financials.${current}.cash`,`historical_financials.${current}.gross_debt`,`historical_financials.${current}.average_debt_cost_pct`],observedAt:referenceDate});
    }
  }
  add(directObservation(facts,"05",["company.auditor.changed_last_3y","audit.auditor_changed"],"auditor_change_declared"));
  add(directObservation(facts,"06",["audit.financials_restated","company.financials.restated"],"financial_restatement_declared"));
  add(directObservation(facts,"09",["related_parties.circularity_identified","company.related_parties.circularity"],"related_party_circularity_identified"));
  add(directObservation(facts,"10",["company.shareholders.litigation","company.governance.shareholder_dispute"],"shareholder_litigation_identified"));
  add(directObservation(facts,"11",["company.succession.open","company.key_person.no_continuity_plan"],"open_succession_identified"));
  add(directObservation(facts,"12",["debt.cross_guarantee.problematic_entity","debt.guarantees.problematic_related_party"],"cross_guarantee_contagion_identified"));
  add(directObservation(facts,"13",["contingencies.reclassified_before_transaction","company.contingencies.reclassified"],"contingency_reclassification_identified"));
  const divergent=facts.filter((entry)=>entry.disputed&&entry.conflicts.length+1>=(threshold?.changingInformationVersions??Number.POSITIVE_INFINITY));
  if(threshold?.changingInformationVersions!==undefined)rows.push({flagId:"RF-14",status:divergent.length>0?"candidate":"clear",severity:C["RF-14"]!.defaultSeverity,detail:`material_fields_with_versions=${divergent.length}`,supportIds:divergent.map((entry)=>entry.key.fieldPath),observedAt:referenceDate});
  add(directObservation(facts,"15",["intake.analytical_information_refused","company.information.essential_analytic_refused"],"essential_analytic_refused"));
  add(directObservation(facts,"16",["transaction.urgency.rejects_checks","intake.pressure_to_skip_checks"],"pressure_to_skip_checks"));
  add(directObservation(facts,"17",["transaction.previously_circulated","market.case_previously_circulated"],"previous_market_circulation_identified"));
  return rows;
}

export function buildRedFlagTruthSet(input:{
  referenceDate:string;
  caseFingerprint:string;
  facts:readonly ReconciledFact[];
  exceptions:readonly ReconciliationException[];
  policy?:RedFlagPolicy|null;
  detectorObservations?:readonly RedFlagDetectorObservation[];
  reviews?:readonly RedFlagReview[];
  mandateDecision?:MandateDecision|null;
  declineCommunication?:DeclineCommunication|null;
}):RedFlagTruthSet{
  const policy=input.policy??null;
  const policyCurrent=Boolean(policy&&policy.status==="active"&&policy.validFrom<=input.referenceDate&&(!policy.validUntil||policy.validUntil>=input.referenceDate));
  const observationMap=new Map<string,RedFlagDetectorObservation>();
  for(const observation of [...builtInObservations(input.facts,policyCurrent?policy:null,input.referenceDate),...(input.detectorObservations??[])]){
    flagIdSchema.parse(observation.flagId);detectorStatusSchema.parse(observation.status);severitySchema.parse(observation.severity);
    observationMap.set(observation.flagId,observation);
  }
  const reviewMap=new Map<string,RedFlagReview[]>();
  for(const review of input.reviews??[])reviewMap.set(review.flagId,[...(reviewMap.get(review.flagId)??[]),review]);
  const initial:RedFlagFinding[]=Array.from({length:17},(_,index)=>`RF-${String(index+1).padStart(2,"0")}`).map((flagId)=>{
    const catalogue=C[flagId]!;
    const observation=observationMap.get(flagId);
    const detectorStatus:RedFlagFinding["detectorStatus"]=observation?.status??(!policyCurrent?"not_computable":"not_computable");
    const severity=observation?.severity??catalogue.defaultSeverity;
    const detail=observation?.detail??(policyCurrent?"detector_inputs_unavailable":"red_flag_policy_missing_or_not_current");
    const evidenceIds=observation?.supportIds??[];
    const fingerprint=fingerprintJson({flagId,detectorStatus,severity,detail,evidenceIds:[...evidenceIds].sort(),caseFingerprint:input.caseFingerprint,policyVersion:policy?.version??null});
    const reviews=[...(reviewMap.get(flagId)??[])].sort((a,b)=>a.decidedAt.localeCompare(b.decidedAt));
    const latest=reviews.at(-1)??null;
    const current=latest?.flagFingerprint===fingerprint?latest:null;
    const reviewStatus:RedFlagFinding["reviewStatus"]=detectorStatus!=="candidate"?"not_required":current?"current":latest?"stale":"pending";
    const status:RedFlagFinding["status"]=detectorStatus!=="candidate"?detectorStatus:current?.decision??"candidate";
    const active=status==="candidate"||status==="confirmed";
    return findingSchema.parse({flagId,title:catalogue.title,family:catalogue.family,detectorStatus,status,severity,detail,evidenceIds,knownFalsePositives:catalogue.falsePositives,confirmationQuestions:catalogue.questions,treatment:catalogue.treatment,downstreamEffects:catalogue.effects,blocksExternalOutputs:(active||status==="not_computable")&&(severity==="high"||severity==="critical"),fingerprint,review:current?{decision:current.decision,rationale:current.rationale,evidenceIds:current.evidenceIds,decidedBy:current.decidedBy,decidedAt:current.decidedAt}:null,reviewStatus});
  });
  const familyIds=["quality_of_revenue","culture_of_numbers","economic_perimeter","conduct"] as const;
  const families=familyIds.map((id)=>{
    const activeFlagIds=initial.filter((entry)=>entry.family===id&&(entry.status==="confirmed"||entry.status==="accepted_risk")).map((entry)=>entry.flagId);
    return {id,activeFlagIds,severity:activeFlagIds.length>=2?"critical" as const:activeFlagIds.length===1?"high" as const:"information" as const,requiresDeskDecision:activeFlagIds.length>=2};
  });
  const severeFamilies=families.filter((entry)=>entry.requiresDeskDecision);
  const rf18Observation:RedFlagDetectorObservation={flagId:"RF-18",status:severeFamilies.length>0?"candidate":"clear",severity:"critical",detail:severeFamilies.length>0?`severe_families=${severeFamilies.map((entry)=>entry.id).join(",")}`:"no_composite_family",supportIds:severeFamilies.flatMap((entry)=>entry.activeFlagIds.map((id)=>initial.find((finding)=>finding.flagId===id)!.fingerprint)),observedAt:input.referenceDate};
  const synthetic=(observation:RedFlagDetectorObservation):RedFlagFinding=>{
    const catalogue=C[observation.flagId]!;
    const fingerprint=fingerprintJson({...observation,caseFingerprint:input.caseFingerprint,policyVersion:policy?.version??null});
    const latest=[...(reviewMap.get(observation.flagId)??[])].sort((a,b)=>a.decidedAt.localeCompare(b.decidedAt)).at(-1)??null;
    const current=latest?.flagFingerprint===fingerprint?latest:null;
    const status:RedFlagFinding["status"]=observation.status!=="candidate"?observation.status:current?.decision??"candidate";
    return findingSchema.parse({flagId:observation.flagId,title:catalogue.title,family:catalogue.family,detectorStatus:observation.status,status,severity:observation.severity,detail:observation.detail,evidenceIds:observation.supportIds,knownFalsePositives:catalogue.falsePositives,confirmationQuestions:catalogue.questions,treatment:catalogue.treatment,downstreamEffects:catalogue.effects,blocksExternalOutputs:status==="candidate"||status==="confirmed",fingerprint,review:current?{decision:current.decision,rationale:current.rationale,evidenceIds:current.evidenceIds,decidedBy:current.decidedBy,decidedAt:current.decidedAt}:null,reviewStatus:observation.status!=="candidate"?"not_required":current?"current":latest?"stale":"pending"});
  };
  const rf18=synthetic(rf18Observation);
  const criticalUnresolved=[...initial,rf18].filter((entry)=>(entry.status==="candidate"||entry.status==="confirmed")&&entry.severity==="critical");
  const highUnresolved=[...initial,rf18].filter((entry)=>(entry.status==="candidate"||entry.status==="confirmed")&&entry.severity==="high");
  const declineCodes=[...new Set([
    ...criticalUnresolved.map((entry)=>entry.flagId),
    ...severeFamilies.map((entry)=>`family:${entry.id}`),
    ...input.exceptions.filter((entry)=>entry.severity==="critical"&&entry.blocksExternalOutputs).map((entry)=>`exception:${entry.ruleId}`),
  ])].sort();
  const recommendation=declineCodes.length>0?"decline_review_required" as const:highUnresolved.length>0?"continue_with_conditions" as const:"continue" as const;
  const rf19=synthetic({flagId:"RF-19",status:recommendation==="decline_review_required"?"candidate":"clear",severity:"critical",detail:`recommendation=${recommendation}`,supportIds:declineCodes,observedAt:input.referenceDate});
  const assessmentFingerprint=fingerprintJson({caseFingerprint:input.caseFingerprint,policyVersion:policy?.version??null,findings:[...initial,rf18,rf19].map((entry)=>({id:entry.flagId,fingerprint:entry.fingerprint,status:entry.status}))});
  const decision=input.mandateDecision?.assessmentFingerprint===assessmentFingerprint?input.mandateDecision:null;
  const decisionStatus:RedFlagTruthSet["mandate"]["decisionStatus"]=decision?"current":input.mandateDecision?"stale":"missing";
  const decisionFingerprint=decision?fingerprintJson(decision):null;
  const declineRequired=decision?.decision==="decline";
  const communication=input.declineCommunication;
  const communicationCurrent=Boolean(declineRequired&&communication&&communication.mandateDecisionFingerprint===decisionFingerprint);
  const rf20=synthetic({flagId:"RF-20",status:declineRequired&&!communicationCurrent?"candidate":declineRequired?"clear":"not_applicable",severity:"high",detail:declineRequired?(communicationCurrent?"decline_communication_recorded":"decline_communication_missing"):"no_current_decline_decision",supportIds:decisionFingerprint?[decisionFingerprint]:[],observedAt:input.referenceDate});
  const findings=[...initial,rf18,rf19,rf20];
  const blockers=[
    ...findings.filter((entry)=>entry.blocksExternalOutputs).map((entry)=>`red_flag:${entry.flagId}:${entry.status}`),
    ...(recommendation==="decline_review_required"&&!decision?["mandate_decision:required"]:[]),
    ...(decision?.decision==="decline"?["mandate_decision:declined"]:[]),
  ];
  const decisionAllows=decision?.decision==="continue"||decision?.decision==="continue_with_conditions";
  const externalOutputsAllowed=blockers.length===0||Boolean(decisionAllows&&findings.every((entry)=>!entry.blocksExternalOutputs||entry.status==="accepted_risk"||entry.status==="treated"));
  const payload={version:"2026.08.26-v1" as const,referenceDate:input.referenceDate,caseFingerprint:input.caseFingerprint,policy:{version:policy?.version??null,status:policy?.status??"missing",current:policyCurrent},findings,families,mandate:{assessmentFingerprint,recommendation,recommendationReasons:recommendation==="decline_review_required"?declineCodes:highUnresolved.map((entry)=>entry.flagId),decision:decision?{decision:decision.decision,reasonCodes:decision.reasonCodes,conditions:decision.conditions,pathBack:decision.pathBack,decidedBy:decision.decidedBy,decidedAt:decision.decidedAt}:null,decisionStatus,externalOutputsAllowed,qualifiedIntroductionAllowed:externalOutputsAllowed&&decision?.decision!=="decline"},declineCommunication:{required:declineRequired,completed:communicationCurrent,status:!declineRequired?"not_required" as const:communicationCurrent?"current" as const:communication?"stale" as const:"missing" as const},blockers:[...new Set(blockers)].sort(),missingInputs:[...new Set(findings.filter((entry)=>entry.status==="not_computable").map((entry)=>`detector:${entry.flagId}`))].sort(),procedureCoverage:redFlagProcedures.map((procedure)=>{const procedureId=procedure.knowledge.houseProcedureIds[0]!;const finding=findings.find((entry)=>entry.flagId===procedureId)!;return {procedureId,status:finding.status==="not_computable"?"not_computable" as const:finding.status==="not_applicable"?"not_applicable" as const:finding.status==="candidate"?"partial" as const:finding.blocksExternalOutputs?"blocked" as const:"completed" as const,findingFingerprint:finding.fingerprint};})};
  return redFlagTruthSetSchema.parse({...payload,fingerprint:fingerprintJson(payload)});
}
