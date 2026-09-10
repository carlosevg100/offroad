import {createHash} from "node:crypto";
import {z} from "zod";
import type {ApprovedInstitutionalScenario} from "./institutional-runtime";
import {institutionalModelConfigurationSchema,institutionalReviewedSourceSchema} from "./institutional-configuration";
import {buildInstitutionalFinancialModel,type InstitutionalModelInput,type InstitutionalModelPeriod} from "./institutional-model";
import {reviewInstitutionalFinancialModel} from "./review";
import {toGovernedXlsxBuffer} from "./governed-workbook";
import type {Cell,FinancialModel,ModelSheet} from "./model";

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const decimal=z.string().regex(/^-?\d+(?:\.\d+)?$/).max(100);
const config=institutionalModelConfigurationSchema;
export const institutionalCalculatedInputSchema=config.extend({
 openingBalanceSheet:z.strictObject({period:z.string().regex(/^\d{4}$/),unrestrictedCash:decimal,restrictedCash:decimal,receivables:decimal,inventory:decimal,otherCurrentAssets:decimal,netPpe:decimal,otherAssets:decimal,payables:decimal,otherCurrentLiabilities:decimal,grossDebt:decimal,otherLiabilities:decimal,equity:decimal}),
 revenueSegments:z.array(config.shape.revenueSegments.element.extend({baseRevenue:decimal})).min(1).max(100),
 operatingCosts:z.array(z.discriminatedUnion("method",[z.strictObject({id:z.string(),method:z.literal("percent_of_revenue"),ratioAssumptionId:z.string()}),z.strictObject({id:z.string(),method:z.literal("base_and_growth"),baseCost:decimal,growthAssumptionId:z.string()})])).min(1).max(100),
 taxes:config.shape.taxes.extend({openingTaxLossCarryforward:decimal,openingDisallowedInterestCarryforward:decimal}),
});
const lineageSchema=z.strictObject({targetPath:z.string(),fieldPath:z.string(),periodStart:z.iso.date().optional(),periodEnd:z.iso.date(),entityName:z.string(),entityScope:z.string(),value:decimal,sourceDocument:z.string(),sourceVersion:z.string(),sourceHash:hash,sourceAsOfDate:z.iso.date(),anchor:z.unknown()});
const auditSchema=z.object({rendererVersion:z.string(),formulaCount:z.number(),crossSheetFormulaCount:z.number(),editableInputCount:z.number(),historicalCellCount:z.number(),styledCellCount:z.number(),populatedCellCount:z.number(),hardcodeViolations:z.array(z.object({sheet:z.string(),cell:z.string(),reason:z.string()})),formulaCoveragePassed:z.boolean(),styleCoveragePassed:z.boolean(),visualInspection:z.literal("not_run"),releaseEligible:z.literal(false),contentSha256:hash});
const scenarioSchema=z.strictObject({configurationId:z.uuid(),revision:z.number().int().positive(),configurationFingerprint:hash,reviewedBy:z.uuid(),reviewedAt:z.iso.datetime({offset:true}),inputFingerprint:hash,input:institutionalCalculatedInputSchema,lineage:z.array(lineageSchema),sourceBindings:z.array(institutionalReviewedSourceSchema),outputFingerprint:hash});
export const institutionalWorkbookArtifactSchema=z.strictObject({modelKind:z.literal("institutional"),version:z.literal("institutional-workbook-snapshot.v1"),fingerprint:hash,periods:z.array(z.string()),sheetNames:z.strictObject({pt:z.array(z.string()),en:z.array(z.string())}),supportIds:z.array(z.string()),deskAssumptions:z.array(z.string()).length(0),workbooks:z.strictObject({pt:z.strictObject({sha256:hash,byteSize:z.number().int().positive()}),en:z.strictObject({sha256:hash,byteSize:z.number().int().positive()})}),renderAudits:z.strictObject({pt:auditSchema,en:auditSchema}),institutional:z.strictObject({schemaVersion:z.literal("institutional-workbook-artifact.v1"),exportMode:z.literal("approved_snapshot"),activeScenarioId:z.uuid(),sourceManifestFingerprint:hash,scenarios:z.array(scenarioSchema).min(1).max(12)})});
export type InstitutionalWorkbookArtifact=z.infer<typeof institutionalWorkbookArtifactSchema>;
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
const outputHash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const txt=(value:string):Cell=>({role:"label",value,format:"text"});
// Decimal strings remain exact in the exported snapshot, including values beyond Excel's 15-digit limit.
const recorded=(value:string|null):Cell=>({role:"note",value:value??"",format:"text"});
const metrics:readonly [keyof InstitutionalModelPeriod,string,string][]=[
 ["revenue","Receita","Revenue"],["operatingCosts","Custos operacionais","Operating costs"],["ebitda","EBITDA","EBITDA"],["depreciation","Depreciação","Depreciation"],["ebit","EBIT","EBIT"],["financeExpense","Despesa financeira","Finance expense"],["accountingEbt","Resultado antes dos tributos","Earnings before tax"],["cashTax","Tributos pagos","Cash tax"],["netIncome","Resultado líquido","Net income"],
 ["unrestrictedCash","Caixa disponível","Unrestricted cash"],["restrictedCash","Caixa restrito","Restricted cash"],["receivables","Contas a receber","Receivables"],["inventory","Estoques","Inventory"],["otherCurrentAssets","Outros ativos circulantes","Other current assets"],["netPpe","Imobilizado líquido","Net PP&E"],["otherAssets","Outros ativos","Other assets"],["totalAssets","Ativo total","Total assets"],["payables","Fornecedores","Payables"],["otherCurrentLiabilities","Outros passivos circulantes","Other current liabilities"],["closingGrossDebt","Dívida bruta final","Closing gross debt"],["otherLiabilities","Outros passivos","Other liabilities"],["equity","Patrimônio líquido","Equity"],["totalLiabilitiesAndEquity","Passivo e patrimônio líquido","Liabilities and equity"],
 ["changeInNetWorkingCapital","Variação do capital de giro","Change in working capital"],["maintenanceCapex","Capex de manutenção","Maintenance capex"],["growthCapex","Capex de expansão","Growth capex"],["cfads","Caixa disponível para serviço da dívida","Cash available for debt service"],["principalPaid","Principal pago","Principal paid"],["cashCoupon","Juros pagos","Cash coupon"],["cashIndexation","Correção monetária paga","Cash indexation"],["debtService","Serviço da dívida","Debt service"],["debtDrawdown","Captações","Debt drawdown"],["distributions","Distribuições","Distributions"],
 ["balanceCheck","Conciliação do balanço","Balance check"],["dscr","DSCR","DSCR"],["netDebtToEbitda","Dívida líquida / EBITDA","Net debt / EBITDA"],["liquidityHeadroom","Folga de liquidez","Liquidity headroom"],["taxLossCarryforward","Prejuízos fiscais acumulados","Tax loss carryforward"],["disallowedInterestCarryforward","Juros não deduzidos acumulados","Disallowed interest carryforward"],
];
function snapshotModel(scenarios:InstitutionalWorkbookArtifact["institutional"]["scenarios"],lang:"pt"|"en"):FinancialModel{
 const sheets:ModelSheet[]=[];
 for(const [index,scenario] of scenarios.entries()){
  const input=JSON.parse(JSON.stringify(scenario.input)) as InstitutionalModelInput;
  const result=buildInstitutionalFinancialModel(input);
  if(outputHash(result)!==scenario.outputFingerprint||reviewInstitutionalFinancialModel(input,result).status==="blocked")throw new Error("institutional_snapshot_calculation_mismatch");
  const name={pt:`Cenário ${index+1}`,en:`Scenario ${index+1}`};
  sheets.push({key:`institutional_${index}`,name,widths:[44,...result.periods.map(()=>22)],rows:[
   {key:"title",cells:[{role:"header",value:input.assumptionBook.scenarioName},...result.periods.map(p=>({role:"header" as const,value:p.period}))]},
   {key:"scope",cells:[txt(lang==="pt"?"Resultado aprovado; alterações exigem nova revisão na plataforma.":"Approved snapshot; changes require a new review in the platform.")]},
   ...metrics.map(([key,pt,en])=>({key,cells:[txt(lang==="pt"?pt:en),...result.periods.map(p=>recorded(p[key] as string|null))]})),

  ]});
 }
 sheets.push({key:"assumptions",name:{pt:"Premissas aprovadas",en:"Approved assumptions"},widths:[18,35,18,18,24,75],rows:[{key:"head",cells:(lang==="pt"?["Cenário","Premissa","Unidade","Período","Valor exato","Justificativa"]:["Scenario","Assumption","Unit","Period","Exact value","Rationale"]).map(value=>({role:"header",value}))},...scenarios.flatMap(s=>s.input.assumptionBook.assumptions.flatMap(a=>Object.entries(a.values).map(([period,value])=>({key:`${s.configurationId}.${a.id}.${period}`,cells:[txt(s.input.assumptionBook.scenarioName),txt(a.label[lang]),txt(a.unit),txt(period),recorded(value),txt(a.rationale)]}))))]});
 sheets.push({key:"review_register",name:{pt:"Registro de aprovação",en:"Approval register"},widths:[30,100],rows:scenarios.flatMap(s=>[
  {key:`${s.configurationId}.head`,cells:[{role:"header" as const,value:s.input.assumptionBook.scenarioName},{role:"header" as const,value:lang==="pt"?"Registro aprovado":"Approved record"}]},
  ...[[lang==="pt"?"Revisado em":"Reviewed at",s.reviewedAt],[lang==="pt"?"Revisor":"Reviewer",s.reviewedBy],[lang==="pt"?"Configuração":"Configuration",s.configurationId],["Configuration SHA-256",s.configurationFingerprint],["Output SHA-256",s.outputFingerprint]].map(([label,value],i)=>({key:`${s.configurationId}.review.${i}`,cells:[txt(label!),txt(value!)]})),
  ...s.sourceBindings.flatMap((source,index)=>[
   {key:`${s.configurationId}.source.${index}.head`,cells:[{role:"header" as const,value:lang==="pt"?`Fonte revisada ${index+1}`:`Reviewed source ${index+1}`},{role:"header" as const,value:source.sourceDocument}]},
   ...[[lang==="pt"?"Versão":"Version",source.version],[lang==="pt"?"Data-base":"As of",source.asOfDate],[lang==="pt"?"Moeda e escala":"Currency and scale",`${source.currency} · ${lang==="pt"?"unidades":"units"}`],[lang==="pt"?"Evidência dos metadados":"Metadata evidence",source.metadataEvidence.locator],[lang==="pt"?"Justificativa":"Rationale",source.metadataEvidence.rationale],[lang==="pt"?"Revisado em":"Reviewed at",source.reviewedAt],[lang==="pt"?"Revisor":"Reviewer",source.reviewedBy],["SHA-256",source.hash]].map(([label,value],i)=>({key:`${s.configurationId}.source.${index}.${i}`,cells:[txt(label!),txt(value!)]})),
  ]),
 ])});
 sheets.push({key:"sources",name:{pt:"Fontes e conciliação",en:"Sources and reconciliation"},widths:[30,100],rows:scenarios.flatMap(s=>s.lineage.flatMap((line,i)=>[
  {key:`${s.configurationId}.${i}.head`,cells:[{role:"header" as const,value:`${lang==="pt"?"Fonte":"Source"} ${i+1}`},{role:"header" as const,value:s.input.assumptionBook.scenarioName}]},
  ...[[lang==="pt"?"Destino":"Target",line.targetPath],[lang==="pt"?"Perímetro":"Entity scope",`${line.entityName} / ${line.entityScope}`],[lang==="pt"?"Período":"Period",`${line.periodStart??""} → ${line.periodEnd}`],[lang==="pt"?"Valor exato":"Exact value",line.value],[lang==="pt"?"Documento":"Document",line.sourceDocument],[lang==="pt"?"Versão":"Version",line.sourceVersion],["SHA-256",line.sourceHash],[lang==="pt"?"Localizador":"Locator",JSON.stringify(line.anchor)]].map(([label,value],j)=>({key:`${s.configurationId}.${i}.${j}`,cells:[txt(label!),j===3?{role:"historical" as const,value:value!}:txt(value!)]})),
 ]))});
 return {sheets,periods:[...new Set(scenarios.flatMap(s=>s.input.assumptionBook.periods))],deskAssumptions:[]};
}
export async function renderInstitutionalFinancialWorkbook(scenarios:InstitutionalWorkbookArtifact["institutional"]["scenarios"],lang:"pt"|"en",activeScenarioId:string){
 const active=scenarios.find(s=>s.configurationId===activeScenarioId);if(!active)throw new Error("institutional_active_scenario_missing");
 const model=snapshotModel(scenarios,lang);
 const rendered=await toGovernedXlsxBuffer(model,lang,{title:lang==="pt"?"Demonstrações e cenários aprovados":"Approved financial statements and scenarios",asOfDate:active.input.assumptionBook.asOfDate,currency:active.input.currency,scale:"units",classification:"confidential",artifactClass:"institutional_snapshot"});
 return {...rendered,model};
}
export async function buildInstitutionalWorkbookArtifact(scenarios:readonly ApprovedInstitutionalScenario[],sourceManifestFingerprint:string):Promise<InstitutionalWorkbookArtifact>{
 const bound=scenarios.map(s=>scenarioSchema.parse({configurationId:s.configurationId,revision:s.revision,configurationFingerprint:s.configurationFingerprint,reviewedBy:s.reviewedBy,reviewedAt:s.reviewedAt,inputFingerprint:s.prepared.inputFingerprint,input:s.prepared.input,lineage:s.prepared.lineage,sourceBindings:s.sourceBindings,outputFingerprint:outputHash(s.model)}));
 const activeScenarioId=bound[0]?.configurationId;if(!activeScenarioId)throw new Error("institutional_approved_scenario_missing");
 const [pt,en]=await Promise.all([renderInstitutionalFinancialWorkbook(bound,"pt",activeScenarioId),renderInstitutionalFinancialWorkbook(bound,"en",activeScenarioId)]);
 const payload={modelKind:"institutional" as const,version:"institutional-workbook-snapshot.v1" as const,periods:pt.model.periods,sheetNames:{pt:pt.model.sheets.map(s=>s.name.pt),en:en.model.sheets.map(s=>s.name.en)},supportIds:[...new Set(bound.flatMap(s=>s.lineage.map(l=>l.sourceDocument)))].sort(),deskAssumptions:[],workbooks:{pt:{sha256:pt.audit.contentSha256,byteSize:pt.bytes.byteLength},en:{sha256:en.audit.contentSha256,byteSize:en.bytes.byteLength}},renderAudits:{pt:pt.audit,en:en.audit},institutional:{schemaVersion:"institutional-workbook-artifact.v1" as const,exportMode:"approved_snapshot" as const,activeScenarioId,sourceManifestFingerprint,scenarios:bound}};
 return institutionalWorkbookArtifactSchema.parse({...payload,fingerprint:digest(payload)});
}
/** Validate the persisted receipt synchronously without rendering any workbook bytes. */
export function parseVerifiedInstitutionalWorkbookArtifact(value:unknown):InstitutionalWorkbookArtifact|null{
 const parsed=institutionalWorkbookArtifactSchema.safeParse(value);if(!parsed.success)return null;
 const {fingerprint,...payload}=parsed.data;return digest(payload)===fingerprint?parsed.data:null;
}
export async function renderApprovedInstitutionalFinancialWorkbook(value:unknown,lang:"pt"|"en"):Promise<Uint8Array|null>{
 const artifact=parseVerifiedInstitutionalWorkbookArtifact(value);if(!artifact)return null;
 const payload=artifact;
 try{const {bytes}=await renderInstitutionalFinancialWorkbook(payload.institutional.scenarios,lang,payload.institutional.activeScenarioId);const expected=payload.workbooks[lang];return bytes.byteLength===expected.byteSize&&createHash("sha256").update(bytes).digest("hex")===expected.sha256?bytes:null;}catch{return null;}
}
