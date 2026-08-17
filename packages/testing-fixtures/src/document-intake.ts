export type IntakeFieldGroup =
  | "company"
  | "transaction"
  | "historical_financials"
  | "interim_financials"
  | "projections"
  | "project"
  | "leverage"
  | "collateral";

export type IntakeCandidateDraft = {
  key: string;
  sourceName: string;
  fieldPath: string;
  fieldGroup: IntakeFieldGroup;
  label: string;
  rawValue: string;
  normalizedValue: string | number | boolean | string[];
  valueType: "text" | "number" | "date" | "boolean" | "list";
  unit?: string;
  currency?: "BRL" | "USD" | "EUR";
  periodStart?: string;
  periodEnd?: string;
  informationClass: "audited" | "reviewed" | "accounting" | "management" | "bank_statement" | "projection" | "company_document" | "calculated";
  evidenceRank: number;
  sourceAnchor: {page?: number; sheet?: string; cell?: string; range?: string; section?: string; formula?: string};
  confidence: number;
  extractionMethod: "native_text" | "ocr" | "spreadsheet_cell" | "deterministic_calculation" | "user_entry";
  isPrimary?: boolean;
};

export type IntakeIssueDraft = {
  type: "conflict" | "missing" | "validation";
  priority: "critical" | "analysis" | "diligence" | "complementary";
  fieldGroup?: IntakeFieldGroup;
  fieldPath?: string;
  candidateKeys?: string[];
  title: string;
  description: string;
  resolutionHint?: string;
};

export const redeHorizonteRequiredFiles = [
  "00_Ficha_Cadastral_Rede_Horizonte.docx",
  "01_Carta_CFO_Pedido_e_Racional_Expansao.docx",
  "02_Demonstracoes_Financeiras_Auditadas_2023_2025.pdf",
  "03_Export_ERP_Contabilidade_2024_Jul2026.xlsx",
  "04_Mapa_Divida_Garantias_Jul2026.xlsx",
  "05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx",
  "06_Parecer_Contabil_Informacoes_Intermediarias_Jul2026.pdf",
  "07_Memorial_Descritivo_Expansao_3_Lojas.pdf",
] as const;

export const redeHorizonteFileHashes: Record<(typeof redeHorizonteRequiredFiles)[number], string> = {
  "00_Ficha_Cadastral_Rede_Horizonte.docx": "7986231b1f6f224957ecdbba57dac9c8529cfca51f054e4002fbc335102ba44a",
  "01_Carta_CFO_Pedido_e_Racional_Expansao.docx": "037a0734272d09982a1af360ac4208c3a68f6a55f3f70416b687d0c7ddd65509",
  "02_Demonstracoes_Financeiras_Auditadas_2023_2025.pdf": "b41aa3edc1ba60ab440adae0f95ebfa0061fd15b492e95ff12a4e34db4be68f0",
  "03_Export_ERP_Contabilidade_2024_Jul2026.xlsx": "1c46f5376f6f71cec2adeb375976b1c57c0bc23fd3cdbbee1b472501c797fc2b",
  "04_Mapa_Divida_Garantias_Jul2026.xlsx": "e5a9db039d372e72e668da77df1959716d2435fb135411af1046a288ebec6031",
  "05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx": "d2bbb79f6de57b0f15c6d4ab7f3b21c1427c9e6a01c62c9831115cf256280a5b",
  "06_Parecer_Contabil_Informacoes_Intermediarias_Jul2026.pdf": "9dca71cb1fc06e3b8c85dea44ca8452e7c20ba4b492c0e69f8abce0c05c19b15",
  "07_Memorial_Descritivo_Expansao_3_Lojas.pdf": "d1469dbf6a75d82494544bd149f793f23fe7bcc6030c5b2608f2ad8b46e23fc5",
};

const ficha = redeHorizonteRequiredFiles[0];
const carta = redeHorizonteRequiredFiles[1];
const auditadas = redeHorizonteRequiredFiles[2];
const erp = redeHorizonteRequiredFiles[3];
const divida = redeHorizonteRequiredFiles[4];
const plano = redeHorizonteRequiredFiles[5];
const parecer = redeHorizonteRequiredFiles[6];
const memorial = redeHorizonteRequiredFiles[7];

const candidates: IntakeCandidateDraft[] = [
  {key: "legal-name", sourceName: ficha, fieldPath: "company.legal_name", fieldGroup: "company", label: "Razão social", rawValue: "Rede Horizonte Alimentos S.A.", normalizedValue: "Rede Horizonte Alimentos S.A.", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Identificação da empresa"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "display-name", sourceName: ficha, fieldPath: "company.display_name", fieldGroup: "company", label: "Nome fantasia", rawValue: "Rede Horizonte Supermercados", normalizedValue: "Rede Horizonte Supermercados", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Identificação da empresa"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "identifier", sourceName: ficha, fieldPath: "company.legal_identifier", fieldGroup: "company", label: "CNPJ", rawValue: "12.345.678/0001-95", normalizedValue: "12345678000195", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Identificação da empresa"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "website", sourceName: ficha, fieldPath: "company.website", fieldGroup: "company", label: "Website", rawValue: "https://www.redehorizonte.com.br", normalizedValue: "https://www.redehorizonte.com.br", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Contato"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "city", sourceName: ficha, fieldPath: "company.city", fieldGroup: "company", label: "Cidade", rawValue: "Ribeirão Preto", normalizedValue: "Ribeirão Preto", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Sede"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "state", sourceName: ficha, fieldPath: "company.state", fieldGroup: "company", label: "Estado", rawValue: "SP", normalizedValue: "SP", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Sede"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "sector", sourceName: ficha, fieldPath: "company.sector", fieldGroup: "company", label: "Setor", rawValue: "Consumo / Varejo", normalizedValue: "Consumo / Varejo", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Atividade"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "subsector", sourceName: ficha, fieldPath: "company.subsector", fieldGroup: "company", label: "Subsetor", rawValue: "Varejo alimentar / supermercados", normalizedValue: "Varejo alimentar / supermercados", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Atividade"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "requested", sourceName: carta, fieldPath: "transaction.requested_amount", fieldGroup: "transaction", label: "Valor solicitado", rawValue: "R$ 54 milhões", normalizedValue: 54000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Pedido"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "purpose", sourceName: carta, fieldPath: "transaction.purpose", fieldGroup: "transaction", label: "Finalidade", rawValue: "Expansão de três novas lojas e refinanciamento de dívida existente", normalizedValue: "Expansão de três novas lojas e refinanciamento de dívida existente", valueType: "text", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Pedido e racional"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "expansion-debt", sourceName: carta, fieldPath: "transaction.expansion_debt", fieldGroup: "transaction", label: "Dívida para expansão", rawValue: "R$ 35 milhões", normalizedValue: 35000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 2, section: "Fontes e usos"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "refinancing", sourceName: carta, fieldPath: "transaction.refinancing", fieldGroup: "transaction", label: "Refinanciamento", rawValue: "R$ 19 milhões", normalizedValue: 19000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 2, section: "Fontes e usos"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "project-letter", sourceName: carta, fieldPath: "project.total_cost", fieldGroup: "project", label: "Custo total do projeto", rawValue: "aproximadamente R$ 50 milhões", normalizedValue: 50000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "company_document", evidenceRank: 6, sourceAnchor: {page: 1, section: "Projeto de expansão"}, confidence: 0.92, extractionMethod: "native_text"},
  {key: "project-plan", sourceName: plano, fieldPath: "project.total_cost", fieldGroup: "project", label: "Custo total do projeto", rawValue: "49,0", normalizedValue: 49000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "projection", evidenceRank: 7, sourceAnchor: {sheet: "LOJAS", cell: "M10"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "equity", sourceName: plano, fieldPath: "project.shareholder_equity", fieldGroup: "project", label: "Aporte dos acionistas", rawValue: "10,0", normalizedValue: 10000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "projection", evidenceRank: 7, sourceAnchor: {sheet: "FONTES_E_USOS", section: "Fontes"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "own-cash", sourceName: plano, fieldPath: "project.company_cash", fieldGroup: "project", label: "Caixa próprio", rawValue: "4,0", normalizedValue: 4000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "projection", evidenceRank: 7, sourceAnchor: {sheet: "FONTES_E_USOS", section: "Fontes"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "revenue-2025", sourceName: auditadas, fieldPath: "historical_financials.2025.revenue", fieldGroup: "historical_financials", label: "Receita líquida 2025", rawValue: "184,7", normalizedValue: 184700000, valueType: "number", unit: "currency", currency: "BRL", periodStart: "2025-01-01", periodEnd: "2025-12-31", informationClass: "audited", evidenceRank: 1, sourceAnchor: {page: 3, section: "Demonstração do resultado"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "ebitda-2025", sourceName: auditadas, fieldPath: "historical_financials.2025.ebitda", fieldGroup: "historical_financials", label: "EBITDA 2025", rawValue: "30,4", normalizedValue: 30400000, valueType: "number", unit: "currency", currency: "BRL", periodStart: "2025-01-01", periodEnd: "2025-12-31", informationClass: "audited", evidenceRank: 1, sourceAnchor: {page: 3, section: "Demonstração do resultado"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "debt-2025", sourceName: auditadas, fieldPath: "historical_financials.2025.gross_debt", fieldGroup: "historical_financials", label: "Dívida bruta dez/2025", rawValue: "65,0", normalizedValue: 65000000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2025-12-31", informationClass: "audited", evidenceRank: 1, sourceAnchor: {page: 4, section: "Empréstimos e financiamentos"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "cash-2025", sourceName: auditadas, fieldPath: "historical_financials.2025.cash", fieldGroup: "historical_financials", label: "Caixa dez/2025", rawValue: "8,6", normalizedValue: 8600000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2025-12-31", informationClass: "audited", evidenceRank: 1, sourceAnchor: {page: 2, section: "Balanço patrimonial"}, confidence: 0.99, extractionMethod: "native_text", isPrimary: true},
  {key: "erp-reconciled", sourceName: erp, fieldPath: "interim_financials.erp_reconciled", fieldGroup: "interim_financials", label: "Balancetes reconciliados", rawValue: "Todos os meses conciliados", normalizedValue: true, valueType: "boolean", periodEnd: "2026-07-31", informationClass: "accounting", evidenceRank: 3, sourceAnchor: {sheet: "CONTROLE_BALANCETE", section: "Checks mensais"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "revenue-jul26", sourceName: parecer, fieldPath: "interim_financials.2026_07.revenue_7m", fieldGroup: "interim_financials", label: "Receita 7M 2026", rawValue: "123,0", normalizedValue: 123000000, valueType: "number", unit: "currency", currency: "BRL", periodStart: "2026-01-01", periodEnd: "2026-07-31", informationClass: "reviewed", evidenceRank: 2, sourceAnchor: {page: 2, section: "Informações intermediárias"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "ebitda-jul26", sourceName: parecer, fieldPath: "interim_financials.2026_07.ebitda_7m", fieldGroup: "interim_financials", label: "EBITDA 7M 2026", rawValue: "20,8", normalizedValue: 20800000, valueType: "number", unit: "currency", currency: "BRL", periodStart: "2026-01-01", periodEnd: "2026-07-31", informationClass: "reviewed", evidenceRank: 2, sourceAnchor: {page: 2, section: "Informações intermediárias"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "debt-jul26", sourceName: divida, fieldPath: "interim_financials.2026_07.gross_debt", fieldGroup: "interim_financials", label: "Dívida bruta jul/2026", rawValue: "68,0", normalizedValue: 68000000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "RESUMO_TESOURARIA", cell: "B7"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "cash-jul26", sourceName: divida, fieldPath: "interim_financials.2026_07.cash", fieldGroup: "interim_financials", label: "Caixa jul/2026", rawValue: "9,3", normalizedValue: 9300000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "RESUMO_TESOURARIA", cell: "D7"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "ltm-ebitda", sourceName: parecer, fieldPath: "interim_financials.2026_07.ebitda_ltm", fieldGroup: "interim_financials", label: "EBITDA LTM jul/2026", rawValue: "33,0", normalizedValue: 33000000, valueType: "number", unit: "currency", currency: "BRL", periodStart: "2025-08-01", periodEnd: "2026-07-31", informationClass: "reviewed", evidenceRank: 2, sourceAnchor: {page: 3, section: "Indicadores LTM"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "net-debt", sourceName: divida, fieldPath: "interim_financials.2026_07.net_debt", fieldGroup: "interim_financials", label: "Dívida líquida jul/2026", rawValue: "58,7", normalizedValue: 58700000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "RESUMO_TESOURARIA", cell: "F7"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "pre-leverage", sourceName: divida, fieldPath: "leverage.pre_transaction_net_debt_ebitda", fieldGroup: "leverage", label: "Alavancagem pré-transação", rawValue: "58,7 / 33,0", normalizedValue: 1.7787878788, valueType: "number", unit: "x", periodEnd: "2026-07-31", informationClass: "calculated", evidenceRank: 7, sourceAnchor: {sheet: "RESUMO_TESOURARIA", cell: "J7", formula: "Dívida líquida / EBITDA LTM"}, confidence: 0.99, extractionMethod: "deterministic_calculation", isPrimary: true},
  {key: "post-debt", sourceName: memorial, fieldPath: "leverage.post_transaction_gross_debt", fieldGroup: "leverage", label: "Dívida bruta pós-transação", rawValue: "R$ 103,0 milhões", normalizedValue: 103000000, valueType: "number", unit: "currency", currency: "BRL", informationClass: "projection", evidenceRank: 7, sourceAnchor: {page: 6, section: "Estrutura pro forma"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "post-leverage", sourceName: plano, fieldPath: "leverage.post_transaction_net_debt_ebitda", fieldGroup: "leverage", label: "Alavancagem pós-transação", rawValue: "2,8735x", normalizedValue: 2.8735, valueType: "number", unit: "x", informationClass: "projection", evidenceRank: 7, sourceAnchor: {sheet: "RESUMO_ANUAL", section: "Closing"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "stock-accounting", sourceName: parecer, fieldPath: "collateral.inventory_accounting", fieldGroup: "collateral", label: "Estoque contábil", rawValue: "32,6", normalizedValue: 32600000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "reviewed", evidenceRank: 2, sourceAnchor: {page: 4, section: "Estoques"}, confidence: 0.98, extractionMethod: "native_text", isPrimary: true},
  {key: "stock-gross-base", sourceName: divida, fieldPath: "collateral.inventory_gross_base", fieldGroup: "collateral", label: "Base bruta de estoque", rawValue: "29,7", normalizedValue: 29700000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "GARANTIAS", section: "Estoque"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "stock-eligible", sourceName: divida, fieldPath: "collateral.inventory_eligible", fieldGroup: "collateral", label: "Estoque elegível", rawValue: "18,8", normalizedValue: 18800000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "GARANTIAS", section: "Base elegível"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "receivables-capacity", sourceName: divida, fieldPath: "collateral.receivables_capacity", fieldGroup: "collateral", label: "Capacidade sobre recebíveis", rawValue: "17,12", normalizedValue: 17120000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "GARANTIAS", section: "Recebíveis"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "inventory-capacity", sourceName: divida, fieldPath: "collateral.inventory_capacity", fieldGroup: "collateral", label: "Capacidade sobre estoque", rawValue: "15,04", normalizedValue: 15040000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "GARANTIAS", section: "Estoque"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "equipment-capacity", sourceName: divida, fieldPath: "collateral.property_equipment_capacity", fieldGroup: "collateral", label: "Capacidade sobre CD e equipamentos", rawValue: "21,60", normalizedValue: 21600000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "management", evidenceRank: 4, sourceAnchor: {sheet: "GARANTIAS", section: "Imóveis e equipamentos"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
  {key: "collateral-total", sourceName: divida, fieldPath: "collateral.total_capacity", fieldGroup: "collateral", label: "Capacidade total estimada de garantias", rawValue: "53,76", normalizedValue: 53760000, valueType: "number", unit: "currency", currency: "BRL", periodEnd: "2026-07-31", informationClass: "calculated", evidenceRank: 7, sourceAnchor: {sheet: "GARANTIAS", cell: "E17", formula: "17,12 + 15,04 + 21,60"}, confidence: 0.99, extractionMethod: "deterministic_calculation", isPrimary: true},
  {key: "dscr", sourceName: plano, fieldPath: "projections.minimum_dscr", fieldGroup: "projections", label: "DSCR mínimo projetado", rawValue: "1,452x", normalizedValue: 1.452, valueType: "number", unit: "x", informationClass: "projection", evidenceRank: 7, sourceAnchor: {sheet: "RESUMO_ANUAL", section: "DSCR mínimo"}, confidence: 0.99, extractionMethod: "spreadsheet_cell", isPrimary: true},
];

const issues: IntakeIssueDraft[] = [
  {type: "conflict", priority: "analysis", fieldGroup: "project", fieldPath: "project.total_cost", candidateKeys: ["project-letter", "project-plan"], title: "Custo do projeto aparece como R$ 49 milhões e aproximadamente R$ 50 milhões", description: "O business plan detalha R$ 49 milhões. A carta do CFO usa um valor arredondado de aproximadamente R$ 50 milhões.", resolutionHint: "Manter R$ 49 milhões como base estruturada e preservar o arredondamento da carta como evidência concorrente."},
  {type: "validation", priority: "analysis", fieldGroup: "historical_financials", fieldPath: "historical_financials.2025.gross_debt", candidateKeys: ["debt-2025", "debt-jul26"], title: "Dívida de R$ 65 milhões e R$ 68 milhões pertence a datas diferentes", description: "R$ 65 milhões é o saldo auditado de dez/2025. R$ 68 milhões é o saldo gerencial mais recente, de jul/2026.", resolutionHint: "Não substituir um período pelo outro. Usar jul/2026 como posição corrente e dez/2025 como histórico auditado."},
  {type: "validation", priority: "analysis", fieldGroup: "collateral", fieldPath: "collateral.inventory_eligible", candidateKeys: ["stock-accounting", "stock-gross-base", "stock-eligible"], title: "Estoque contábil não equivale à base elegível de garantia", description: "O estoque contábil é R$ 32,6 milhões, a base bruta do mapa é R$ 29,7 milhões e o estoque elegível é R$ 18,8 milhões.", resolutionHint: "Preservar as três medidas e utilizar somente a base elegível para o cálculo de garantia."},
  {type: "missing", priority: "critical", fieldGroup: "transaction", title: "Cartas de saldo e payoff da dívida a refinanciar", description: "Necessárias para confirmar os R$ 19 milhões de refinanciamento e o saldo na data da operação.", resolutionHint: "Enviar cartas emitidas pelos credores com data-base recente."},
  {type: "missing", priority: "critical", fieldGroup: "project", title: "Comprovação do aporte dos acionistas", description: "O plano considera R$ 10 milhões de equity, mas a disponibilidade e o cronograma ainda não foram comprovados.", resolutionHint: "Enviar extratos, ata ou compromisso formal de aporte."},
  {type: "missing", priority: "diligence", fieldGroup: "collateral", title: "Laudos de avaliação atualizados", description: "A capacidade de R$ 53,76 milhões é indicativa e depende de laudos, elegibilidade e haircuts confirmados.", resolutionHint: "Enviar laudos, relação de bens e documentos de titularidade."},
  {type: "missing", priority: "diligence", fieldGroup: "project", title: "Contratos, licenças e orçamentos das novas lojas", description: "O cronograma e o capex precisam de suporte documental para diligência.", resolutionHint: "Enviar contratos de locação, licenças, projetos e três orçamentos materiais."},
  {type: "missing", priority: "complementary", fieldGroup: "company", title: "Organograma societário e principais executivos", description: "Informação complementar para o perfil institucional e o material de investidores.", resolutionHint: "Enviar organograma atualizado e minibiografias."},
];

export function buildRedeHorizonteDocumentIntake(availableDocuments: Array<{id: string; original_name: string; sha256: string | null}>) {
  const byName = new Map(availableDocuments.filter((document) => redeHorizonteFileHashes[document.original_name as keyof typeof redeHorizonteFileHashes] === document.sha256).map((document) => [document.original_name, document.id]));
  const presentCandidates = candidates.filter((candidate) => byName.has(candidate.sourceName));
  const presentKeys = new Set(presentCandidates.map((candidate) => candidate.key));
  const missingFiles = redeHorizonteRequiredFiles.filter((name) => !byName.has(name));

  return {
    fixtureMatched: missingFiles.length === 0,
    missingFiles,
    candidates: presentCandidates.map((candidate) => ({...candidate, sourceDocumentId: byName.get(candidate.sourceName)!})),
    issues: [
      ...issues.filter((issue) => !issue.candidateKeys || issue.candidateKeys.every((key) => presentKeys.has(key))),
      ...missingFiles.map((name): IntakeIssueDraft => ({
        type: "missing",
        priority: "critical",
        title: `Documento esperado não recebido: ${name}`,
        description: "O processamento não pode considerar informações que não foram enviadas.",
        resolutionHint: "Adicione o documento ou marque-o como não disponível.",
      })),
    ],
  };
}
