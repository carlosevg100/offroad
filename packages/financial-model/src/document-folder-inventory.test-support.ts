import {createHash} from "node:crypto";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {DocumentFolderInventoryInput, DocumentReading} from "./document-folder-inventory";
import type {AnalysisSelection} from "./adopted-analysis-binding";
import {analysisTestId} from "./adopted-analysis.test-support";
import type {DocumentFolderInventoryAnalyses} from "./adopted-document-folder-inventory";
import type {DocumentFolderInventoryFacts, DocumentFolderUpdateFacts} from "./document-folder-inventory-premises";

/** Aurora Alimentos, folder "Financeiro 2025-26" read on 1/set/2026 (ficha C09, synthetic). Each file is
 * built as the extraction would read it from content, from the ficha's answer key (inventario_gabarito.py),
 * never from the file name. Amounts in BRL; monthly trial balances in reais, the semester report's DRE in
 * thousands. The monthly EBITDA split (4,3; 4,4; 4,5; 4,6; 4,4; 4,8) is a calibration choice: the ficha
 * gives only the semester total of R$ 27 milhões and the R$ 1,2 milhão reclassification of May. */
const sha = (content: string) => createHash("sha256").update(`aurora-c09:${content}`).digest("hex");
const at = (page: number | null, section: string | null = null) => ({page, section});
const mi = "1000000";
type Partial = Omit<DocumentReading, "legibility" | "substitutesPages" | "units" | "figures" | "clauses" | "observations" | "debtTable" | "instrument" | "asset" | "sha256" | "referenceDate"> &
  {content?: string} & Partial2;
type Partial2 = {[K in "legibility" | "substitutesPages" | "units" | "figures" | "clauses" | "observations" | "debtTable" | "instrument" | "asset" | "referenceDate"]?: DocumentReading[K]};
/** The date each file speaks from, and where it comes from. "stated" and "stated_month" are what the ficha says (the
 * month's last day when only the month is given); "derived_from_period" and "derived_from_term_start" are taken from the
 * reading's own period and are listed as derivations in FICHA-LOTE4-ORGANIZE-DOCUMENT-FOLDER.md. */
export const auroraReferenceDates: Record<string, DocumentReading["referenceDate"]> = {
  f01: {kind: "closing", date: "2026-03-18", origin: "stated"}, f02: {kind: "update", date: "2026-02-28", origin: "stated_month"},
  f03: {kind: "closing", date: "2024-12-31", origin: "derived_from_period"}, f04: {kind: "closing", date: "2025-12-31", origin: "derived_from_period"},
  f05: {kind: "closing", date: "2025-12-31", origin: "derived_from_period"}, f06: {kind: "closing", date: "2026-01-31", origin: "derived_from_period"},
  f07: {kind: "closing", date: "2026-02-28", origin: "derived_from_period"}, f08: {kind: "closing", date: "2026-04-30", origin: "derived_from_period"},
  f09: {kind: "closing", date: "2026-05-31", origin: "derived_from_period"}, f10: {kind: "closing", date: "2026-05-31", origin: "derived_from_period"},
  f11: {kind: "closing", date: "2026-06-30", origin: "derived_from_period"}, f12: {kind: "closing", date: "2026-07-31", origin: "stated_month"},
  f13: {kind: "update", date: "2025-12-31", origin: "stated_month"}, f14: {kind: "update", date: "2026-07-31", origin: "stated_month"},
  f15: {kind: "update", date: "2026-03-31", origin: "stated_month"}, f16: {kind: "position", date: "2026-06-30", origin: "derived_from_period"},
  f17: {kind: "position", date: "2025-12-31", origin: "derived_from_period"}, f18: {kind: "update", date: "2021-10-31", origin: "stated_month"},
  f19: {kind: "update", date: "2023-06-30", origin: "stated_month"}, f20: {kind: "update", date: "2024-09-30", origin: "stated_month"},
  f21: {kind: "update", date: "2022-01-01", origin: "derived_from_term_start"}, f22: {kind: "update", date: "2025-01-01", origin: "derived_from_term_start"},
  f23: {kind: "update", date: "2024-01-01", origin: "derived_from_term_start"}, f24: {kind: "update", date: "2026-03-31", origin: "stated_month"},
  f25: {kind: "update", date: "2026-04-30", origin: "stated_month"}, f26: {kind: "position", date: "2026-06-30", origin: "derived_from_period"},
  f27: {kind: "update", date: "2023-08-31", origin: "stated_month"}, f28: {kind: "update", date: "2025-12-31", origin: "derived_from_period"},
  f29: null, f30: {kind: "closing", date: "2026-03-18", origin: "stated"},
  s01: {kind: "update", date: "2024-09-30", origin: "stated_month"}, s02: {kind: "closing", date: "2026-03-31", origin: "derived_from_period"},
};
function doc(d: Partial): DocumentReading {
  const {content, ...rest} = d;
  return {sha256: sha(content ?? d.fileId), legibility: {pageCount: null, unreadablePages: [], wholeFile: null}, substitutesPages: null, units: [], figures: [], clauses: [],
    observations: [], debtTable: null, instrument: null, asset: null, referenceDate: auroraReferenceDates[d.fileId] ?? null, ...rest};
}
const aurora = "aurora";
const v = (label: string, status: DocumentReading["version"]["status"], ordinal: number | null = null, lastUpdated: string | null = null) => ({label, status, ordinal, lastUpdated});
const p = (label: string, start: string | null, end: string | null) => ({label, start, end});
const e = (label: string, primaryId: string | null = aurora) => ({primaryId, label});
const month = (n: number, fileId: string, fileName: string, ebitda: string, version = v("fechado", "closed")) => {
  const m = String(n).padStart(2, "0"), end = new Date(Date.UTC(2026, n, 0)).toISOString().slice(0, 10);
  const short = ["jan", "fev", "mar", "abr", "mai", "jun"][n - 1];
  return doc({fileId, fileName, format: "xlsx", kind: "trial_balance", description: "Balancete mensal", entity: e("Aurora, consolidado"), period: p(`${short}/26`, `2026-${m}-01`, end),
    version, content: `${fileId}-balancete-${m}-${version.ordinal ?? 0}`, units: [{section: "Balancete", currency: "BRL", scale: "1"}],
    figures: [{id: "ebitda", metric: "ebitda", value: ebitda, scale: "1", at: at(null, "Resultado")}]});
};

export function auroraFolderReadings(): DocumentReading[] {
  const df2025 = (fileId: string, fileName: string) => doc({fileId, fileName, format: "pdf", kind: "annual_financial_statements",
    description: "Demonstrações financeiras auditadas, com parecer sem ressalva", entity: e("Aurora Alimentos S.A., individual e consolidado"),
    period: p("exercício 2025", "2025-01-01", "2025-12-31"), version: v("auditada, assinada em 18/mar/26", "audited", null, "2026-03-18"), content: "df-2025-auditada",
    legibility: {pageCount: 48, unreadablePages: [], wholeFile: null},
    figures: [{id: "ebitda", metric: "ebitda", value: "52", scale: mi, at: at(6)}, {id: "receita-liquida", metric: "net_revenue", value: "420", scale: mi, at: at(5)},
      {id: "receita-bruta", metric: "gross_revenue", value: "450", scale: mi, at: at(31)}, {id: "pdd", metric: "allowance_for_doubtful_accounts", value: "1.9", scale: mi, at: at(22)},
      {id: "estoque", metric: "inventory_write_off", value: "0.9", scale: mi, at: at(24)}]});
  return [
    df2025("f01", "DF_2025_final.pdf"),
    doc({fileId: "f02", fileName: "DF 2025 versao banco.pdf", format: "pdf", kind: "annual_financial_statements", description: "Demonstrações de 2025 sem parecer, versão anterior aos ajustes de auditoria",
      entity: e("Aurora Alimentos S.A., consolidado"), period: p("exercício 2025", "2025-01-01", "2025-12-31"), version: v("minuta de fev/26, não auditada", "draft", null, "2026-02-20"),
      figures: [{id: "ebitda", metric: "ebitda", value: "54.8", scale: mi, at: at(5)}, {id: "receita-liquida", metric: "net_revenue", value: "420", scale: mi, at: at(4)}]}),
    doc({fileId: "f03", fileName: "DFs 2024.pdf", format: "pdf", kind: "annual_financial_statements", description: "Demonstrações financeiras auditadas", entity: e("Aurora Alimentos S.A., individual e consolidado"),
      period: p("exercício 2024", "2024-01-01", "2024-12-31"), version: v("auditada", "audited")}),
    doc({fileId: "f04", fileName: "Aurora Log balanço 2025.xlsx", format: "xlsx", kind: "annual_financial_statements", description: "Balanço e resultado da controlada",
      entity: e("Aurora Logística Ltda., 100% da Aurora", "aurora-log"), period: p("exercício 2025", "2025-01-01", "2025-12-31"), version: v("gerencial, não auditado em separado", "management"),
      units: [{section: "Balanço", currency: "BRL", scale: mi}], figures: [{id: "caixa", metric: "cash", value: "4.1", scale: mi, at: at(null, "Balanço")}]}),
    doc({fileId: "f05", fileName: "Carta recomendacoes auditoria 2025.pdf", format: "pdf", kind: "auditor_management_letter", description: "Carta de controles internos da auditoria",
      entity: e("Aurora Alimentos S.A."), period: p("2025", "2025-01-01", "2025-12-31"), version: v("final", "final"),
      observations: [{id: "controles", at: at(2), topic: "internal_controls", statement: "Aponta conciliação bancária fora do prazo e ausência de controle de garantias prestadas. Relevante para qualquer diligência de credor."}]}),
    month(1, "f06", "balancete jan26.xlsx", "4300000"),
    month(2, "f07", "balancete fev26.xlsx", "4400000"),
    month(4, "f08", "balancete abr26.xlsx", "4600000"),
    month(5, "f09", "balancete mai26.xlsx", "5600000", v("versão 1", "closed", 1)),
    {...month(5, "f10", "balancete mai26 v2 revisado.xlsx", "4400000", v("versão 2, vigente", "closed", 2)),
      observations: [{id: "revisao", at: at(null, "Notas"), topic: "revision_note", statement: "reclassifica R$ 1,2 mi de despesa financeira para despesa operacional"}]},
    month(6, "f11", "balancete jun26.xlsx", "4800000"),
    doc({fileId: "f12", fileName: "Gerencial 1S26.xlsx", format: "xlsx", kind: "management_report", description: "Relatório gerencial do semestre", entity: e("Aurora, consolidado"),
      period: p("1S26", "2026-01-01", "2026-06-30"), version: v("fechado em jul/26", "closed", null, "2026-07-15"),
      units: [{section: "DRE", currency: "BRL", scale: "1000"}, {section: "Caixa", currency: "BRL", scale: "1"}],
      figures: [{id: "ebitda", metric: "ebitda", value: "27000", scale: "1000", at: at(null, "DRE")}],
      observations: [{id: "prazo-embalagem", at: at(null, "Fornecedores"), topic: "supplier_terms", statement: "Prazo médio do fornecedor de embalagem: 60 dias."}]}),
    doc({fileId: "f13", fileName: "Orcamento 2026 aprovado.xlsx", format: "xlsx", kind: "budget", description: "Orçamento anual aprovado pelo conselho", entity: e("Aurora, consolidado"),
      period: p("2026", "2026-01-01", "2026-12-31"), version: v("aprovado em dez/25", "approved"), figures: [{id: "ebitda", metric: "ebitda", value: "58", scale: mi, at: at(null, "Resumo")}]}),
    doc({fileId: "f14", fileName: "orcamento 2026 rev jul.xlsx", format: "xlsx", kind: "budget", description: "Revisão do orçamento", entity: e("Aurora, consolidado"),
      period: p("2026", "2026-01-01", "2026-12-31"), version: v("revisão de trabalho, não aprovada", "working_revision"), figures: [{id: "ebitda", metric: "ebitda", value: "55.5", scale: mi, at: at(null, "Resumo")}]}),
    doc({fileId: "f15", fileName: "fluxo 13 semanas.xlsx", format: "xlsx", kind: "cash_flow_forecast", description: "Fluxo de caixa de 13 semanas", entity: e("Aurora, consolidado"),
      period: p("mar/26 a mai/26", "2026-03-02", "2026-05-31"), version: v("desatualizado", "outdated", null, "2026-03-02")}),
    doc({fileId: "f16", fileName: "tabela de divida jun26.xlsx", format: "xlsx", kind: "debt_schedule", description: "Tabela de dívida", entity: e("Aurora, consolidado"),
      period: p("jun/26", "2026-06-30", "2026-06-30"), version: v("gerencial", "management"),
      debtTable: {scale: mi, reportedTotal: "140", at: at(null, "Dívida"), lines: [
        {id: "debenture", lineKind: "debenture", label: "debênture da 1ª emissão", drawn: "60", limit: null, counted: "60"}, {id: "ccb", lineKind: "bank_credit", label: "CCB do Bradesco", drawn: "40", limit: null, counted: "40"},
        {id: "finame", lineKind: "development_bank", label: "Finame", drawn: "30", limit: null, counted: "30"}, {id: "conta-garantida", lineKind: "overdraft", label: "conta garantida do Itaú", drawn: "0", limit: "10", counted: "10"}]}}),
    doc({fileId: "f17", fileName: "Copia de Copia de tabela final (2).xlsx", format: "xlsx", kind: "debt_schedule", description: "Tabela de dívida", entity: e("Aurora, consolidado"),
      period: p("dez/25", "2025-12-31", "2025-12-31"), version: v("versão anterior", "management")}),
    doc({fileId: "f18", fileName: "Escritura debenture 2021.pdf", format: "pdf", kind: "debenture_indenture", description: "Escritura da 1ª emissão de debêntures", entity: e("Aurora Alimentos S.A."),
      period: p("out/2021", "2021-10-01", "2021-10-31"), version: v("original", "registered"), instrument: {ref: "deb-aurora-1", label: "debênture da 1ª emissão", amends: null},
      clauses: [{type: "financial_covenant", id: "covenant", at: at(18), statement: "Dívida líquida / EBITDA de no máximo 2,75x, apurado anualmente.", metric: "net_debt_to_ebitda", maxRatio: "2.75"},
        {type: "negative_pledge", id: "garantia-negativa", at: at(21), statement: "Vedação de garantias a outros credores, sem exceção de valor.", exceptionAmount: null, scale: null}]}),
    doc({fileId: "f19", fileName: "1o aditamento escritura 2023.pdf", format: "pdf", kind: "debenture_indenture", description: "Primeiro aditamento à escritura", entity: e("Aurora Alimentos S.A."),
      period: p("jun/2023", "2023-06-01", "2023-06-30"), version: v("assinado e registrado", "registered"), instrument: {ref: "deb-aurora-1-ad1", label: "1º aditamento", amends: "deb-aurora-1"},
      clauses: [{type: "financial_covenant", id: "covenant", at: at(2), statement: "Dívida líquida / EBITDA de no máximo 3,0x.", metric: "net_debt_to_ebitda", maxRatio: "3.0"},
        {type: "negative_pledge", id: "garantia-negativa", at: at(3), statement: "Exceção de R$ 15 milhões em valor agregado de garantias.", exceptionAmount: "15", scale: mi}]}),
    doc({fileId: "f20", fileName: "CCB Bradesco 2024 scan.pdf", format: "pdf", kind: "bank_credit_note", description: "Cédula de crédito bancário", entity: e("Aurora Alimentos S.A."),
      period: p("set/2024", "2024-09-01", "2024-09-30"), version: v("assinada", "signed"), instrument: {ref: "ccb-bradesco-2024", label: "CCB do Bradesco", amends: null},
      legibility: {pageCount: 14, unreadablePages: [{page: 7, reason: "illegible_scan", expectedContent: "a cláusula de reforço da cessão", expectedFrom: at(2)}], wholeFile: null}}),
    doc({fileId: "f21", fileName: "Finame contrato.pdf", format: "pdf", kind: "development_bank_financing", description: "Contrato de financiamento Finame", entity: e("Aurora Alimentos S.A."),
      period: p("2022", "2022-01-01", "2022-12-31"), version: v("assinado", "signed"), instrument: {ref: "finame-2022", label: "Finame", amends: null}}),
    doc({fileId: "f22", fileName: "Contrato cliente A.pdf", format: "pdf", kind: "customer_contract", description: "Contrato de fornecimento com o maior cliente (32% da carteira)", entity: e("Aurora e rede de varejo A"),
      period: p("2025 a 2027", "2025-01-01", "2027-12-31"), version: v("assinado", "signed"), instrument: {ref: "contrato-rede-a", label: "contrato da rede A", amends: null},
      clauses: [{type: "assignment_prohibition", id: "cessao", at: at(9), statement: "Veda a cessão dos recebíveis sem anuência do cliente.", counterparty: "a rede A", receivablesShare: "0.32"}]}),
    doc({fileId: "f23", fileName: "Contrato embalagem fornecedor.pdf", format: "pdf", kind: "supplier_contract", description: "Contrato de fornecimento de embalagem", entity: e("Aurora e fornecedor de embalagem"),
      period: p("até dez/2026, renovação automática anual", "2024-01-01", "2026-12-31"), version: v("assinado", "signed"), instrument: {ref: "contrato-embalagem", label: "contrato de embalagem", amends: null},
      clauses: [{type: "payment_term", id: "prazo", at: at(4), statement: "Prazo de pagamento de 60 dias.", days: 60},
        {type: "auto_renewal", id: "renovacao", at: at(11), statement: "Renovação automática em dez/26 salvo aviso até 2/out/26.", termEnd: "2026-12-31", noticeDeadline: "2026-10-02"}]}),
    doc({fileId: "f24", fileName: "Ata conselho mar26.pdf", format: "pdf", kind: "board_minutes", description: "Ata de reunião do conselho de administração", entity: e("Aurora Alimentos S.A."),
      period: p("mar/2026", "2026-03-01", "2026-03-31"), version: v("assinada", "signed"),
      clauses: [{type: "debt_policy", id: "politica", at: at(3), statement: "Aprova política de endividamento com dívida líquida / EBITDA de no máximo 2,5x", metric: "net_debt_to_ebitda", maxRatio: "2.5"}]}),
    doc({fileId: "f25", fileName: "Ata AGO 2026.pdf", format: "pdf", kind: "shareholders_minutes", description: "Ata da assembleia geral ordinária", entity: e("Aurora Alimentos S.A."),
      period: p("abr/2026", "2026-04-01", "2026-04-30"), version: v("assinada", "signed"),
      observations: [{id: "dividendos", at: at(2), topic: "shareholder_resolution", statement: "Sem distribuição de dividendos além do mínimo legal em 2026."}]}),
    doc({fileId: "f26", fileName: "aging clientes jun26.xlsx", format: "xlsx", kind: "receivables_aging", description: "Posição da carteira por cliente e vencimento", entity: e("Aurora, consolidado"),
      period: p("jun/26", "2026-06-30", "2026-06-30"), version: v("gerencial", "management")}),
    doc({fileId: "f27", fileName: "Laudo avaliacao imovel fabrica 2023.pdf", format: "pdf", kind: "appraisal_report", description: "Laudo de avaliação do imóvel industrial", entity: e("Aurora Alimentos S.A."),
      period: p("ago/2023", "2023-08-01", "2023-08-31"), version: v("final", "final"), asset: {id: "imovel-fabrica", label: "imóvel da fábrica"},
      figures: [{id: "valor", metric: "appraised_value", value: "48", scale: mi, at: at(12)}]}),
    doc({fileId: "f28", fileName: "Apresentacao institucional 2025.pptx", format: "pptx", kind: "institutional_presentation", description: "Apresentação institucional", entity: e("Aurora"),
      period: p("2025", "2025-01-01", "2025-12-31"), version: v("material de marketing", "marketing"), figures: [{id: "receita", metric: "revenue", value: "450", scale: mi, at: at(4)}]}),
    doc({fileId: "f29", fileName: "foto_nota.jpg", format: "jpg", kind: "invoice", description: "Foto de uma nota fiscal de compra de insumo", entity: e("não identificável", null),
      period: p("sem data legível", null, null), version: v("imagem", "image"), legibility: {pageCount: 1, unreadablePages: [], wholeFile: {reason: "no_extractable_content"}}}),
    {...df2025("f30", "DF_2025_final (1).pdf")},
  ];
}

export const auroraEntities = [
  {id: "aurora", label: "Aurora Alimentos S.A.", groupId: "aurora", groupLabel: "Aurora", parentId: null, ownership: null},
  {id: "aurora-log", label: "Aurora Logística", groupId: "aurora", groupLabel: "Aurora", parentId: "aurora", ownership: "1"},
];
export const auroraDecisions = [
  {id: "plano-financiamento-2027", label: "Plano de financiamento de 2027", kind: "financing_plan" as const},
  {id: "linha-embalagem", label: "Revisão da linha de embalagem", kind: "investment_project" as const},
];
/** The vault already holds the indenture of 2021 and the Bradesco CCB, sent by the CFO in the 2027 financing conversation (C32). */
export const auroraVault = () => {
  const r = auroraFolderReadings(), of = (id: string) => r.find((x) => x.fileId === id)!.sha256;
  return [{documentId: "cofre-escritura-2021", sha256: of("f18"), label: "Escritura da 1ª emissão (C32)", instrumentRef: "deb-aurora-1"},
    {documentId: "cofre-ccb-bradesco", sha256: of("f20"), label: "CCB do Bradesco (C32)", instrumentRef: "ccb-bradesco-2024"}];
};

/** Turn 2: the legible page 7 of the CCB, the March trial balance and the answer about the draft. */
export function auroraTurnTwoReadings(): DocumentReading[] {
  return [
    doc({fileId: "s01", fileName: "ccb-bradesco-p7.pdf", format: "pdf", kind: "bank_credit_note", description: "Página 7 da cédula de crédito bancário", entity: e("Aurora Alimentos S.A."),
      period: p("set/2024", "2024-09-01", "2024-09-30"), version: v("assinada", "signed"), instrument: {ref: "ccb-bradesco-2024", label: "CCB do Bradesco", amends: null},
      substitutesPages: {instrumentRef: "ccb-bradesco-2024", pages: [7]},
      clauses: [{type: "collateral_top_up", id: "reforco", at: at(7), statement: "A página 7 prevê reforço da cessão em cinco dias úteis se a cobertura cair abaixo de 80% e não restringe o pré-pagamento previsto na cláusula 9."}]}),
    month(3, "s02", "balancete mar26.xlsx", "4500000"),
  ];
}
export const auroraTurnTwoInformed = [{id: "minuta-nao-circulou", questionId: "circulacao-f02", statement: "A minuta não foi para nenhum banco.", author: "Controller da Aurora", date: "2026-09-02"}];

export function auroraKernelInput(overrides: Partial3 = {}): DocumentFolderInventoryInput {
  return {asOf: "2026-09-01", mode: "organize", currency: "BRL", subjectEntityId: "aurora", entities: auroraEntities, decisions: auroraDecisions, vault: auroraVault(),
    files: auroraFolderReadings(), informed: [], prior: null, ...overrides};
}
type Partial3 = {[K in keyof DocumentFolderInventoryInput]?: DocumentFolderInventoryInput[K]};

/** Synthetic adoptions on a basis of its own, with decision ids that never collide with another basis. */
function folderBasis(prefix: string, openingDate: string, endDate: string, first: number, versionId: number) {
  const id = analysisTestId, entries: AdoptionBasisEntry[] = []; let n = first;
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(versionId), setId: id(6), workId: id(7), purpose: "synthetic document folder inventory",
    contextKey: "pasta-financeiro", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const context = {envelope: {canonical: "", fingerprint: ""}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: id(1), perimeter: "consolidated", currency: "BRL", openingDate, endDate, numericInterpretations: [] as never[]};
  function contribute(path: string, value: AdoptionBasisEntry["value"]): AnalysisSelection {
    const decisionId = id(n++);
    entries.push({decisionId, slotKey: createHash("sha256").update(prefix + path).digest("hex"), kind: "hypothesis", fieldPath: prefix + path,
      dimensions: {entityId: id(1), perimeter: "consolidated", periodStart: openingDate, periodEnd: endDate, currency: "BRL", unit: "identity", scale: "1", scenario: "base", definitionVersionId: id(3)},
      value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(5), reason: "Synthetic explicitly adopted folder record"});
    return {decisionId, definitionVersionId: id(3), definitionKind: "managerial", missingReason: null};
  }
  const json = (path: string, value: unknown) => contribute(path, {type: "text", value: JSON.stringify(value)});
  function seal() {const canonical = JSON.stringify(snapshot); context.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}; return context.envelope;}
  return {entries, context, contribute, json, seal};
}
export const folderAnalysisId = analysisTestId(70), folderUpdateId = analysisTestId(71);
export const auroraFolderWindow = {openingDate: "2025-01-01", readingDate: "2026-09-01", updateDate: "2026-09-02"};

/** The folder as adopted records, one per file reading, entity, decision and vault entry. */
export function auroraFolderBasis(options: {subjectEntityId?: string | undefined; files?: DocumentReading[] | undefined; decisions?: typeof auroraDecisions | undefined; vault?: ReturnType<typeof auroraVault> | undefined; entities?: typeof auroraEntities | undefined} = {}) {
  const f = folderBasis(`document_folder_inventory.${folderAnalysisId}.`, auroraFolderWindow.openingDate, auroraFolderWindow.readingDate, 1000, 500);
  const input = {...f.context, analysisId: folderAnalysisId, scenario: "base", subjectEntityId: f.contribute("subject.entity", {type: "text", value: options.subjectEntityId ?? "aurora"}),
    entities: (options.entities ?? auroraEntities).map(({id, ...v}) => ({id, value: f.json(`entity.${id}.record`, v)})),
    decisions: (options.decisions ?? auroraDecisions).map(({id, ...v}) => ({id, value: f.json(`decision.${id}.record`, v)})),
    vault: (options.vault ?? auroraVault()).map(({documentId, ...v}) => ({id: documentId, value: f.json(`vault.${documentId}.record`, v)})),
    files: (options.files ?? auroraFolderReadings()).map((r) => ({id: r.fileId, value: f.json(`file.${r.fileId}.reading`, r)}))};
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}
/** Turn 2 on its own basis, naming the folder's basis by fingerprint. */
export function auroraFolderUpdateBasis(baseFingerprint: string, options: {files?: DocumentReading[]; informed?: typeof auroraTurnTwoInformed} = {}) {
  const f = folderBasis(`document_folder_inventory_update.${folderUpdateId}.`, auroraFolderWindow.openingDate, auroraFolderWindow.updateDate, 3000, 501);
  const input = {...f.context, analysisId: folderUpdateId, scenario: "base", priorFingerprint: f.contribute("prior.fingerprint", {type: "text", value: baseFingerprint}),
    files: (options.files ?? auroraTurnTwoReadings()).map((r) => ({id: r.fileId, value: f.json(`file.${r.fileId}.reading`, r)})),
    informed: (options.informed ?? auroraTurnTwoInformed).map(({id, ...v}) => ({id, value: f.json(`informed.${id}.record`, v)}))};
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}
export function auroraFolderAnalyses(turnTwo = false): DocumentFolderInventoryAnalyses {
  const base = auroraFolderBasis().seal();
  return {base, update: turnTwo ? auroraFolderUpdateBasis(base.envelope.fingerprint).seal() : null} as DocumentFolderInventoryAnalyses;
}

/** The same folder as facts with their origin, for the premises path. */
export function auroraFolderFacts(): DocumentFolderInventoryFacts {
  const ctx = {entityId: analysisTestId(1), perimeter: "consolidated", currency: "BRL", definitionVersionId: analysisTestId(3), openingDate: auroraFolderWindow.openingDate, readingDate: auroraFolderWindow.readingDate};
  return {inventoryId: analysisTestId(7000), ...ctx, subjectEntityId: {value: "aurora", origin: "document" as const, source: "cadastro societário da companhia"},
    entities: auroraEntities.map((value) => ({value, origin: "document" as const, source: "cadastro societário da companhia"})),
    decisions: auroraDecisions.map((value) => ({value, origin: "house" as const, source: "contexto do projeto: decisões em curso"})),
    vault: auroraVault().map((value) => ({value, origin: "house" as const, source: "documentos já no sistema, enviados na conversa do financiamento de 2027"})),
    files: auroraFolderReadings().map((value) => ({value, origin: "document" as const, source: "leitura do conteúdo do arquivo pela extração, com página ou aba de origem"}))};
}
export function auroraFolderUpdateFacts(priorFingerprint: string): DocumentFolderUpdateFacts {
  return {updateId: analysisTestId(7100), entityId: analysisTestId(1), perimeter: "consolidated", currency: "BRL", definitionVersionId: analysisTestId(3),
    openingDate: auroraFolderWindow.openingDate, readingDate: auroraFolderWindow.updateDate,
    priorFingerprint: {value: priorFingerprint, origin: "house", source: "base da pasta organizada no turno anterior"},
    files: auroraTurnTwoReadings().map((value) => ({value, origin: "document" as const, source: "leitura do conteúdo do arquivo pela extração, com página ou aba de origem"})),
    informed: auroraTurnTwoInformed.map((value) => ({value, origin: "informed" as const, source: "mensagem da controller no turno 2"}))};
}
