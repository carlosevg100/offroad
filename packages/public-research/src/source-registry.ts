import {createHash} from "node:crypto";
import {z} from "zod";

export const debtJurisdictionSchema = z.enum(["BR", "US", "GLOBAL"]);
export type DebtJurisdiction = z.infer<typeof debtJurisdictionSchema>;

export const debtResearchWorkSchema = z.enum([
  "company_debt_view",
  "origination_thesis",
  "capital_planning",
  "structure_from_documents",
  "review_existing_operation",
  "prepare_materials_and_process",
]);
export type DebtResearchWork = z.infer<typeof debtResearchWorkSchema>;

export const debtResearchCapabilitySchema = z.enum([
  "entity_identity",
  "issuer_filings",
  "financial_statements",
  "debt_book",
  "debt_instruments",
  "covenants_and_security",
  "earnings_and_guidance",
  "ratings_and_credit_events",
  "sector_and_regulation",
  "company_events",
  "comparable_transactions",
  "primary_market_terms",
  "secondary_market_pricing",
  "lender_mandates",
]);
export type DebtResearchCapability = z.infer<typeof debtResearchCapabilitySchema>;

export const debtSourceClassSchema = z.enum([
  "regulator",
  "exchange",
  "self_regulatory_organization",
  "issuer",
  "rating_agency",
  "licensed_database",
  "specialist_credit_intelligence",
  "news",
  "search_engine",
  "content_acquisition",
  "offroad_proprietary",
]);
export type DebtSourceClass = z.infer<typeof debtSourceClassSchema>;

export const debtSourceAccessSchema = z.enum([
  "public_keyless",
  "public_site",
  "contracted_api",
  "contracted_platform",
  "offroad_private",
]);
export type DebtSourceAccess = z.infer<typeof debtSourceAccessSchema>;

export const debtSourceStatusSchema = z.enum([
  "implemented",
  "contract_ready",
  "manual_only",
  "research_required",
]);
export type DebtSourceStatus = z.infer<typeof debtSourceStatusSchema>;

export const debtSourceReuseSchema = z.enum([
  "public_reusable",
  "licensed_reusable_within_contract",
  "tenant_only",
  "no_persistent_content",
]);
export type DebtSourceReuse = z.infer<typeof debtSourceReuseSchema>;

export const debtSourceDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(2).max(120),
  jurisdictions: z.array(debtJurisdictionSchema).min(1),
  sourceClass: debtSourceClassSchema,
  access: debtSourceAccessSchema,
  status: debtSourceStatusSchema,
  authorityTier: z.number().int().min(1).max(5),
  capabilities: z.array(debtResearchCapabilitySchema).min(1),
  domains: z.array(z.string().min(3)).default([]),
  reuse: debtSourceReuseSchema,
  purpose: z.string().min(10).max(500),
  limitations: z.array(z.string().min(3).max(300)).default([]),
  activationEnv: z.string().regex(/^[A-Z0-9_]+$/).nullable().default(null),
  retrievalOnly: z.boolean().default(false),
});
export type DebtSourceDefinition = z.infer<typeof debtSourceDefinitionSchema>;

const source = (definition: z.input<typeof debtSourceDefinitionSchema>): DebtSourceDefinition =>
  debtSourceDefinitionSchema.parse(definition);

/**
 * Source registry for the two launch jurisdictions. Presence is not activation: paid sources
 * remain contract-ready until their commercial agreement, field coverage and usage policy have
 * been validated. Search and crawling tools are retrieval mechanisms, never source authority.
 */
export const debtSourceRegistry = [
  source({
    id: "cvm_open_data", name: "CVM Dados Abertos", jurisdictions: ["BR"],
    sourceClass: "regulator", access: "public_keyless", status: "implemented", authorityTier: 1,
    capabilities: ["entity_identity", "issuer_filings", "financial_statements", "debt_book", "covenants_and_security", "company_events", "sector_and_regulation", "primary_market_terms"],
    domains: ["dados.cvm.gov.br", "cvm.gov.br", "gov.br"], reuse: "public_reusable",
    purpose: "Fonte oficial para cadastro de companhia aberta, ITR, DFP, FRE e documentos periódicos ou eventuais.",
    limitations: ["Periodicidade e estrutura variam por conjunto; reapresentações devem superseder, nunca sobrescrever, a versão anterior."],
  }),
  source({
    id: "b3_public", name: "B3 Dados Públicos", jurisdictions: ["BR"],
    sourceClass: "exchange", access: "public_site", status: "contract_ready", authorityTier: 1,
    capabilities: ["entity_identity", "debt_instruments", "company_events", "primary_market_terms", "secondary_market_pricing"],
    domains: ["b3.com.br"], reuse: "public_reusable",
    purpose: "Fonte oficial de listagem, características e eventos de instrumentos registrados ou negociados na B3.",
    limitations: ["Alguns produtos detalhados são licenciados; dados públicos e contratados devem permanecer separados."],
  }),
  source({
    id: "anbima_data", name: "ANBIMA Data", jurisdictions: ["BR"],
    sourceClass: "self_regulatory_organization", access: "public_site", status: "contract_ready", authorityTier: 2,
    capabilities: ["debt_instruments", "primary_market_terms", "secondary_market_pricing", "comparable_transactions", "lender_mandates"],
    domains: ["anbima.com.br"], reuse: "public_reusable",
    purpose: "Referência de debêntures, CRI, CRA, FIDC, documentos e dados analíticos publicados pela ANBIMA.",
    limitations: ["A disponibilidade pública por ativo não substitui a escritura, o prospecto ou o documento do emissor."],
  }),
  source({
    id: "anbima_feed", name: "ANBIMA Feed", jurisdictions: ["BR"],
    sourceClass: "self_regulatory_organization", access: "contracted_api", status: "contract_ready", authorityTier: 2,
    capabilities: ["secondary_market_pricing", "primary_market_terms", "comparable_transactions"],
    domains: ["api.anbima.com.br"], reuse: "licensed_reusable_within_contract",
    purpose: "API estruturada para preços indicativos, curvas de crédito e dados de títulos privados.",
    limitations: ["Exige contratação e respeito ao pacote e à licença de redistribuição."], activationEnv: "ANBIMA_CLIENT_ID",
  }),
  source({
    id: "sec_edgar", name: "SEC EDGAR", jurisdictions: ["US"],
    sourceClass: "regulator", access: "public_keyless", status: "implemented", authorityTier: 1,
    capabilities: ["entity_identity", "issuer_filings", "financial_statements", "debt_book", "covenants_and_security", "company_events", "earnings_and_guidance", "sector_and_regulation", "primary_market_terms"],
    domains: ["sec.gov"], reuse: "public_reusable",
    purpose: "Fonte oficial de submissions, XBRL Company Facts e documentos arquivados por emissores nos Estados Unidos.",
    limitations: ["Tags XBRL variam por emissor; valores precisam preservar unidade, período, form e accession."],
  }),
  source({
    id: "finra_trace", name: "FINRA TRACE", jurisdictions: ["US"],
    sourceClass: "self_regulatory_organization", access: "public_site", status: "research_required", authorityTier: 2,
    capabilities: ["debt_instruments", "secondary_market_pricing", "comparable_transactions"],
    domains: ["finra.org"], reuse: "public_reusable",
    purpose: "Referência regulatória para atividade e preços observados de instrumentos de renda fixa reportados ao TRACE.",
    limitations: ["Cobertura, atraso e licença precisam ser confirmados por produto antes de automação."],
  }),
  source({
    id: "issuer_ir", name: "Issuer Investor Relations", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "issuer", access: "public_site", status: "implemented", authorityTier: 2,
    capabilities: ["entity_identity", "issuer_filings", "financial_statements", "debt_book", "covenants_and_security", "earnings_and_guidance", "company_events", "primary_market_terms"],
    domains: [], reuse: "public_reusable",
    purpose: "Apresentações, releases, relatórios, calls e documentos publicados pela própria companhia.",
    limitations: ["Fala de administração e medidas não-GAAP devem permanecer distintas de fatos regulatórios e cálculos Offroad."],
  }),
  source({
    id: "rating_agencies", name: "Rating agencies", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "rating_agency", access: "public_site", status: "contract_ready", authorityTier: 3,
    capabilities: ["ratings_and_credit_events", "debt_instruments", "covenants_and_security", "company_events"],
    domains: ["spglobal.com", "moodys.com", "fitchratings.com", "moodyslocal.com", "brasilratings.com.br"],
    reuse: "no_persistent_content", purpose: "Opiniões de crédito, rationales e eventos de rating datados.",
    limitations: ["É opinião de terceiro, não Company Truth; conteúdo e redistribuição podem ser licenciados."],
  }),
  source({
    id: "pitchbook", name: "PitchBook API", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "licensed_database", access: "contracted_api", status: "contract_ready", authorityTier: 3,
    capabilities: ["entity_identity", "financial_statements", "company_events", "comparable_transactions", "primary_market_terms"],
    domains: ["api.pitchbook.com", "pitchbook.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Enriquecimento de entidade, histórico financeiro disponível e relações ou transações de mercado.",
    limitations: ["API é contrato separado; não substitui documentos oficiais para saldo, covenant, garantia ou obrigação legal."],
    activationEnv: "PITCHBOOK_API_KEY",
  }),
  source({
    id: "economatica", name: "Economatica", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "licensed_database", access: "contracted_platform", status: "manual_only", authorityTier: 3,
    capabilities: ["financial_statements", "sector_and_regulation", "comparable_transactions", "secondary_market_pricing"],
    domains: ["economatica.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Séries financeiras e comparáveis padronizados, especialmente úteis no mercado brasileiro.",
    limitations: ["Acesso programático, campos e direito de armazenamento precisam ser contratados."],
  }),
  source({
    id: "ninefin", name: "9fin", jurisdictions: ["US", "GLOBAL"],
    sourceClass: "specialist_credit_intelligence", access: "contracted_api", status: "contract_ready", authorityTier: 3,
    capabilities: ["debt_instruments", "covenants_and_security", "ratings_and_credit_events", "company_events", "comparable_transactions", "primary_market_terms", "secondary_market_pricing"],
    domains: ["9fin.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Inteligência especializada em crédito, documentos, termos, eventos e comparáveis de dívida.",
    limitations: ["Cobertura Brasil e direitos de API/armazenamento precisam ser validados comercialmente."], activationEnv: "NINEFIN_API_KEY",
  }),
  source({
    id: "octus", name: "Octus", jurisdictions: ["US", "GLOBAL"],
    sourceClass: "specialist_credit_intelligence", access: "contracted_api", status: "contract_ready", authorityTier: 3,
    capabilities: ["debt_instruments", "covenants_and_security", "ratings_and_credit_events", "company_events", "comparable_transactions", "primary_market_terms", "secondary_market_pricing"],
    domains: ["octus.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Notícias, documentos e inteligência especializada em crédito, distress e mercados de dívida.",
    limitations: ["Exige licença; fatos materiais continuam sujeitos a fonte primária e política de citação."], activationEnv: "OCTUS_API_KEY",
  }),
  source({
    id: "capital_iq", name: "S&P Capital IQ", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "licensed_database", access: "contracted_api", status: "contract_ready", authorityTier: 3,
    capabilities: ["entity_identity", "financial_statements", "debt_book", "ratings_and_credit_events", "company_events", "comparable_transactions", "primary_market_terms", "secondary_market_pricing"],
    domains: ["spglobal.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Dados financeiros, capital structure, transações e inteligência de mercado padronizada.",
    limitations: ["Campos, cobertura e redistribuição dependem do contrato de feed/API."], activationEnv: "CAPITAL_IQ_API_KEY",
  }),
  source({
    id: "factset", name: "FactSet", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "licensed_database", access: "contracted_api", status: "contract_ready", authorityTier: 3,
    capabilities: ["entity_identity", "financial_statements", "debt_book", "company_events", "comparable_transactions", "primary_market_terms", "secondary_market_pricing"],
    domains: ["factset.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Dados financeiros, ownership, estimates, transações e mercados para enriquecimento e comparação.",
    limitations: ["Não ativar sem contrato, field map, política de retenção e avaliação de cobertura Brasil."], activationEnv: "FACTSET_API_KEY",
  }),
  source({
    id: "lseg", name: "LSEG Data & Analytics", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "licensed_database", access: "contracted_api", status: "contract_ready", authorityTier: 3,
    capabilities: ["entity_identity", "financial_statements", "debt_book", "company_events", "comparable_transactions", "primary_market_terms", "secondary_market_pricing"],
    domains: ["lseg.com"], reuse: "licensed_reusable_within_contract",
    purpose: "Dados financeiros e de mercado para enriquecimento, séries e comparáveis.",
    limitations: ["Não ativar sem contrato e política explícita de uso e armazenamento."], activationEnv: "LSEG_APP_KEY",
  }),
  source({
    id: "perplexity", name: "Perplexity Search", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "search_engine", access: "contracted_api", status: "implemented", authorityTier: 5,
    capabilities: ["entity_identity", "issuer_filings", "earnings_and_guidance", "sector_and_regulation", "company_events", "comparable_transactions"],
    domains: ["perplexity.ai"], reuse: "no_persistent_content",
    purpose: "Descoberta ampla e rápida de URLs públicas quando a fonte exata ainda não foi resolvida.",
    limitations: ["Resultado de busca não é evidência primária; a URL encontrada precisa ser adquirida, classificada e citada."],
    activationEnv: "PERPLEXITY_API_KEY", retrievalOnly: true,
  }),
  source({
    id: "openai_web_search", name: "OpenAI Web Search", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "search_engine", access: "contracted_api", status: "implemented", authorityTier: 5,
    capabilities: ["entity_identity", "issuer_filings", "earnings_and_guidance", "sector_and_regulation", "company_events", "comparable_transactions"],
    domains: ["openai.com"], reuse: "no_persistent_content",
    purpose: "Fallback de descoberta de fontes públicas com allowlist de domínio quando disponível.",
    limitations: ["Não transforma snippet ou resposta do modelo em fato; persiste apenas URLs e metadados permitidos."],
    activationEnv: "OPENAI_API_KEY", retrievalOnly: true,
  }),
  source({
    id: "firecrawl", name: "Firecrawl", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "content_acquisition", access: "contracted_api", status: "contract_ready", authorityTier: 5,
    capabilities: ["issuer_filings", "earnings_and_guidance", "sector_and_regulation", "company_events", "comparable_transactions"],
    domains: ["firecrawl.dev"], reuse: "no_persistent_content",
    purpose: "Aquisição de conteúdo web já descoberto quando download direto não produz texto utilizável.",
    limitations: ["É mecanismo de aquisição, não fonte; conteúdo privado e URLs não públicas são proibidos."],
    activationEnv: "FIRECRAWL_API_KEY", retrievalOnly: true,
  }),
  source({
    id: "offroad_lender_graph", name: "Offroad Lender Graph", jurisdictions: ["BR", "US", "GLOBAL"],
    sourceClass: "offroad_proprietary", access: "offroad_private", status: "implemented", authorityTier: 2,
    capabilities: ["lender_mandates", "comparable_transactions", "primary_market_terms"],
    domains: [], reuse: "tenant_only",
    purpose: "Mandatos, interações, recusas e outcomes governados, separados de fontes públicas e de outros tenants.",
    limitations: ["Não participa da pesquisa pública inicial e nunca cruza memória privada entre organizações."],
  }),
] as const satisfies readonly DebtSourceDefinition[];

export const debtResearchTaskSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  capability: debtResearchCapabilitySchema,
  graph: z.enum(["knowledge", "case", "market"]),
  required: z.boolean(),
  sourceChain: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
  publicInputOnly: z.boolean(),
  cacheTtlHours: z.number().int().min(1).max(24 * 90),
  completionRule: z.string().min(10).max(500),
});
export type DebtResearchTask = z.infer<typeof debtResearchTaskSchema>;

export const debtResearchStrategySchema = z.object({
  schemaVersion: z.literal("debt-research-strategy.v1"),
  work: debtResearchWorkSchema,
  jurisdiction: debtJurisdictionSchema,
  evidenceBasis: z.enum(["public_information", "private_authorized", "mixed"]),
  tasks: z.array(debtResearchTaskSchema).min(1),
  activatedSources: z.array(z.string()).min(1),
  disabledPaidSources: z.array(z.string()),
  publicReusePolicy: z.literal("public_raw_material_only"),
  privateContextInExternalQueries: z.literal(false),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DebtResearchStrategy = z.infer<typeof debtResearchStrategySchema>;

export const debtJurisdictionInferenceSchema = z.object({
  jurisdiction: debtJurisdictionSchema.exclude(["GLOBAL"]),
  basis: z.enum(["explicit_geography", "website_domain", "locale_default"]),
  needsConfirmation: z.boolean(),
});
export type DebtJurisdictionInference = z.infer<typeof debtJurisdictionInferenceSchema>;

export function inferDebtJurisdiction(input: {
  locale: "pt-BR" | "en-US";
  geography?: string;
  website?: string;
}): DebtJurisdictionInference {
  const geography = input.geography?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
  if (/\b(brasil|brazil|br)\b/.test(geography)) {
    return {jurisdiction: "BR", basis: "explicit_geography", needsConfirmation: false};
  }
  if (/\b(estados unidos|united states|usa|us)\b/.test(geography)) {
    return {jurisdiction: "US", basis: "explicit_geography", needsConfirmation: false};
  }
  if (input.website) {
    const host = new URL(input.website).hostname.toLowerCase();
    if (host.endsWith(".br")) return {jurisdiction: "BR", basis: "website_domain", needsConfirmation: false};
    if (host.endsWith(".us")) return {jurisdiction: "US", basis: "website_domain", needsConfirmation: false};
  }
  return {
    jurisdiction: input.locale === "pt-BR" ? "BR" : "US",
    basis: "locale_default",
    needsConfirmation: true,
  };
}

const capabilitiesByWork: Record<DebtResearchWork, readonly DebtResearchCapability[]> = {
  company_debt_view: [
    "entity_identity", "issuer_filings", "financial_statements", "debt_book",
    "debt_instruments", "covenants_and_security", "earnings_and_guidance",
    "ratings_and_credit_events", "sector_and_regulation", "company_events",
    "comparable_transactions", "primary_market_terms", "secondary_market_pricing",
  ],
  origination_thesis: [
    "entity_identity", "issuer_filings", "financial_statements", "debt_book",
    "debt_instruments", "covenants_and_security", "earnings_and_guidance",
    "ratings_and_credit_events", "sector_and_regulation", "company_events",
    "comparable_transactions", "primary_market_terms", "secondary_market_pricing",
  ],
  capital_planning: [
    "entity_identity", "issuer_filings", "financial_statements", "debt_book",
    "debt_instruments", "sector_and_regulation", "company_events", "comparable_transactions",
    "primary_market_terms", "secondary_market_pricing",
  ],
  structure_from_documents: [
    "entity_identity", "issuer_filings", "sector_and_regulation", "company_events",
    "comparable_transactions", "primary_market_terms", "secondary_market_pricing",
  ],
  review_existing_operation: [
    "entity_identity", "debt_instruments", "covenants_and_security",
    "comparable_transactions", "primary_market_terms", "secondary_market_pricing",
  ],
  prepare_materials_and_process: [
    "company_events", "comparable_transactions", "primary_market_terms",
    "secondary_market_pricing", "lender_mandates",
  ],
};

const graphByCapability: Record<DebtResearchCapability, DebtResearchTask["graph"]> = {
  entity_identity: "case", issuer_filings: "case", financial_statements: "case",
  debt_book: "case", debt_instruments: "case", covenants_and_security: "case",
  earnings_and_guidance: "knowledge", ratings_and_credit_events: "knowledge",
  sector_and_regulation: "knowledge", company_events: "knowledge",
  comparable_transactions: "market", primary_market_terms: "market",
  secondary_market_pricing: "market", lender_mandates: "market",
};

const ttlByCapability: Record<DebtResearchCapability, number> = {
  entity_identity: 24 * 7, issuer_filings: 24, financial_statements: 24,
  debt_book: 24, debt_instruments: 24, covenants_and_security: 24,
  earnings_and_guidance: 24, ratings_and_credit_events: 12,
  sector_and_regulation: 24 * 7, company_events: 6,
  comparable_transactions: 24, primary_market_terms: 12,
  secondary_market_pricing: 6, lender_mandates: 1,
};

export function compileDebtResearchStrategy(input: {
  work: DebtResearchWork;
  jurisdiction: DebtJurisdiction;
  evidenceBasis: DebtResearchStrategy["evidenceBasis"];
  activatedSourceIds?: readonly string[];
}): DebtResearchStrategy {
  const parsed = z.object({
    work: debtResearchWorkSchema,
    jurisdiction: debtJurisdictionSchema,
    evidenceBasis: debtResearchStrategySchema.shape.evidenceBasis,
    activatedSourceIds: z.array(z.string()).default([]),
  }).parse({...input, activatedSourceIds: [...(input.activatedSourceIds ?? [])]});
  const activated = new Set(parsed.activatedSourceIds);
  const available = debtSourceRegistry.filter((entry) =>
    (entry.jurisdictions as readonly DebtJurisdiction[]).includes(parsed.jurisdiction)
      || (entry.jurisdictions as readonly DebtJurisdiction[]).includes("GLOBAL"));
  const tasks = capabilitiesByWork[parsed.work].map((capability) => {
    const chain = available
      .filter((entry) => (entry.capabilities as readonly DebtResearchCapability[]).includes(capability))
      .filter((entry) => isSourceAvailable(entry, activated))
      .filter((entry) => entry.id !== "offroad_lender_graph" || capability === "lender_mandates")
      .sort((left, right) => left.authorityTier - right.authorityTier || Number(left.retrievalOnly) - Number(right.retrievalOnly))
      .map((entry) => entry.id);
    if (chain.length === 0) throw new Error(`no source chain for ${parsed.jurisdiction}:${capability}`);
    const taskBase = {
      capability,
      graph: graphByCapability[capability],
      required: !["ratings_and_credit_events", "secondary_market_pricing"].includes(capability),
      sourceChain: chain,
      publicInputOnly: true,
      cacheTtlHours: ttlByCapability[capability],
      completionRule: completionRule(capability),
    };
    return debtResearchTaskSchema.parse({...taskBase, id: sha256(JSON.stringify(taskBase))});
  });
  const activatedSources = [...new Set(tasks.flatMap((task) => task.sourceChain))];
  const disabledPaidSources = available
    .filter((entry) => entry.access.startsWith("contracted_") && !activatedSources.includes(entry.id))
    .map((entry) => entry.id);
  const payload = {
    schemaVersion: "debt-research-strategy.v1" as const,
    work: parsed.work,
    jurisdiction: parsed.jurisdiction,
    evidenceBasis: parsed.evidenceBasis,
    tasks,
    activatedSources,
    disabledPaidSources,
    publicReusePolicy: "public_raw_material_only" as const,
    privateContextInExternalQueries: false as const,
  };
  return debtResearchStrategySchema.parse({...payload, fingerprint: sha256(JSON.stringify(payload))});
}

function isSourceAvailable(entry: DebtSourceDefinition, activated: ReadonlySet<string>): boolean {
  if (entry.access === "public_keyless" || entry.access === "public_site") return true;
  if (entry.access === "offroad_private") return entry.status === "implemented";
  // "Implemented" means an adapter exists, not that a paid provider is authorized for use.
  // Contracted sources, including discovery and acquisition APIs, remain off until the runtime
  // explicitly confirms a credential and the corresponding commercial/data-use policy.
  return activated.has(entry.id);
}

export function classifyDebtSource(input: {
  url: string;
  issuerDomains?: readonly string[];
}): DebtSourceDefinition | null {
  const url = new URL(input.url);
  if (url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const issuerDomains = (input.issuerDomains ?? []).map((domain) => domain.toLowerCase().replace(/^www\./, ""));
  if (issuerDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return debtSourceRegistry.find((entry) => entry.id === "issuer_ir") ?? null;
  }
  return debtSourceRegistry
    .filter((entry) => !entry.retrievalOnly)
    .filter((entry) => entry.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)))
    .sort((left, right) => left.authorityTier - right.authorityTier)[0] ?? null;
}

function completionRule(capability: DebtResearchCapability): string {
  const rules: Record<DebtResearchCapability, string> = {
    entity_identity: "Resolve legal entity and stable official identifier, or abstain with the candidate ambiguity preserved.",
    issuer_filings: "Inventory current and prior relevant filings with issuer, period, form, publication date and source URL.",
    financial_statements: "Acquire period-specific statements with units and filing lineage; do not calculate from search snippets.",
    debt_book: "Locate debt balances, maturities, costs and creditor or instrument detail, preserving every missing field.",
    debt_instruments: "Resolve each observed debt instrument to primary terms and official identifiers where available.",
    covenants_and_security: "Locate covenant, guarantee, security and prepayment language in primary documents or mark it unavailable.",
    earnings_and_guidance: "Acquire management statements with date and speaker, distinct from regulated financial facts.",
    ratings_and_credit_events: "Capture dated third-party credit opinion or event without promoting it to Company Truth.",
    sector_and_regulation: "Capture current sector drivers and applicable rules from authoritative, dated sources.",
    company_events: "Capture material recent events and distinguish issuer or regulator confirmation from media signals.",
    comparable_transactions: "Record transaction date, instrument, issuer, amount, tenor, pricing and source; preserve missing terms.",
    primary_market_terms: "Use issued or announced transaction terms with as-of date and comparability dimensions.",
    secondary_market_pricing: "Use dated observed or indicative pricing with instrument identity, methodology and source.",
    lender_mandates: "Use only current governed mandate observations and relationship evidence; public inference cannot confirm appetite.",
  };
  return rules[capability];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
