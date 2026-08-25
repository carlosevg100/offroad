/**
 * The Offroad DCM operating blueprint.
 *
 * This is the product boundary as data. Offroad behaves as an institutional origination and
 * DCM advisory desk: it understands the company and the transaction, reconciles evidence,
 * develops financing alternatives, prepares market-standard materials and directs the case to
 * aligned capital providers. It does not commit capital, issue a binding credit opinion, approve
 * an investment, or replace an investor's underwriting, diligence, committee or documentation.
 *
 * Every stage is explicit about who does what so that product copy, automation and tests cannot
 * silently expand Offroad's mandate.
 */

export const dcmStageId = [
  "capital_need_framing",
  "guided_information_plan",
  "document_intake_inventory",
  "extraction_evidence_map",
  "reconciliation_financial_base",
  "focused_gap_resolution",
  "business_transaction_analysis",
  "financing_alternatives_capacity",
  "indicative_structuring",
  "institutional_packaging",
  "market_mapping_mandate_fit",
  "client_authorization_qualified_introduction",
] as const;

export type DcmStageId = (typeof dcmStageId)[number];
export type BilingualText = {pt: string; en: string};

export type DcmStage = {
  order: number;
  id: DcmStageId;
  title: BilingualText;
  objective: BilingualText;
  clientExperience: readonly BilingualText[];
  systemWork: readonly BilingualText[];
  deskWork: readonly BilingualText[];
  outputs: readonly BilingualText[];
  exitCriteria: readonly BilingualText[];
  prohibitedClaims: readonly string[];
  investorReservedActivities: readonly BilingualText[];
};

const bi = (pt: string, en: string): BilingualText => ({pt, en});

const investorReserved = [
  bi("Underwriting e diligência independentes", "Independent underwriting and diligence"),
  bi("Decisão de comitê e aprovação de crédito", "Investment committee decision and credit approval"),
  bi("Termos finais, documentação, desembolso e monitoramento", "Final terms, documentation, funding and monitoring"),
] as const;

const neverCreditApproval = [
  "Offroad approved the credit",
  "Offroad recommends the investment",
  "funding is guaranteed",
  "the terms are final",
] as const;

export const offroadDcmBlueprint: readonly DcmStage[] = [
  {
    order: 1,
    id: "capital_need_framing",
    title: bi("Enquadramento da necessidade de capital", "Capital need framing"),
    objective: bi(
      "Entender o objetivo econômico antes de presumir instrumento, estrutura ou financiador.",
      "Understand the economic objective before presuming an instrument, structure or capital provider.",
    ),
    clientExperience: [
      bi("Informa objetivo, valor indicativo, prazo desejado e uso dos recursos em linguagem simples.", "States the objective, indicative amount, desired timing and use of proceeds in plain language."),
      bi("Pode explicar o contexto por texto, documentos ou ambos.", "May explain the context through text, documents or both."),
    ],
    systemWork: [
      bi("Classifica o arquétipo da operação sem fixar prematuramente o instrumento.", "Classifies the transaction archetype without prematurely fixing the instrument."),
      bi("Registra premissas declaradas separadamente dos fatos extraídos.", "Records declared assumptions separately from extracted facts."),
    ],
    deskWork: [bi("Valida o objetivo econômico e identifica ambiguidades que mudariam o plano de informação.", "Validates the economic objective and identifies ambiguities that would change the information plan.")],
    outputs: [bi("Mandato de trabalho inicial e arquétipo da necessidade", "Initial working mandate and capital-need archetype")],
    exitCriteria: [bi("Objetivo, uso, valor indicativo e horizonte temporal compreendidos", "Objective, use, indicative amount and timing understood")],
    prohibitedClaims: neverCreditApproval,
    investorReservedActivities: investorReserved,
  },
  {
    order: 2,
    id: "guided_information_plan",
    title: bi("Plano guiado de informações", "Guided information plan"),
    objective: bi("Mostrar somente o próximo conjunto material de informações, com motivo e alternativas aceitas.", "Show only the next material information set, with rationale and accepted substitutes."),
    clientExperience: [
      bi("Vê um lote curto, priorizado e específico para a operação.", "Sees a short, prioritized batch specific to the transaction."),
      bi("Sabe por que cada item importa, o que pode substituir e o que acontece se não estiver disponível.", "Understands why each item matters, what may substitute for it and what happens if it is unavailable."),
    ],
    systemWork: [
      bi("Deriva mínimo, alvo e ideal internamente, sem transformar os três níveis em uma lista de tarefas.", "Derives minimum, target and ideal internally without turning all three levels into a task list."),
      bi("Seleciona a próxima melhor ação por materialidade e decisão desbloqueada.", "Selects the next best action by materiality and decision unlocked."),
    ],
    deskWork: [bi("Revisa exceções de alta materialidade e ajusta o plano ao caso real.", "Reviews high-materiality exceptions and adapts the plan to the actual case.")],
    outputs: [bi("Lote atual de solicitações e mapa futuro resumido", "Current request batch and summarized future roadmap")],
    exitCriteria: [bi("Nenhuma solicitação duplicada e no máximo cinco itens ativos", "No duplicate request and no more than five active items")],
    prohibitedClaims: [...neverCreditApproval, "all listed information is mandatory at intake"],
    investorReservedActivities: investorReserved,
  },
  {
    order: 3,
    id: "document_intake_inventory",
    title: bi("Recebimento e inventário documental", "Document intake and inventory"),
    objective: bi("Receber o que a empresa já possui, no formato disponível, sem trabalho prévio de organização.", "Receive what the company already has, in its available format, without prior organization work."),
    clientExperience: [
      bi("Arrasta e solta arquivos sem renomear, padronizar ou montar uma data room.", "Drags and drops files without renaming, standardizing or assembling a data room."),
      bi("Acompanha o que foi reconhecido, duplicado, ilegível ou ainda está em processamento.", "Tracks what was recognized, duplicated, unreadable or is still processing."),
    ],
    systemWork: [
      bi("Preserva o arquivo original e cria inventário, hash, versão, idioma e classificação.", "Preserves the original file and creates inventory, hash, version, language and classification."),
      bi("Detecta duplicatas e vincula cada arquivo às necessidades que ele atende.", "Detects duplicates and links each file to the needs it satisfies."),
    ],
    deskWork: [bi("Resolve documentos ambíguos ou sensíveis que exigem contexto.", "Resolves ambiguous or sensitive documents that require context.")],
    outputs: [bi("Inventário documental rastreável", "Traceable document inventory")],
    exitCriteria: [bi("Todos os arquivos recebidos têm estado e origem identificáveis", "Every received file has an identifiable state and origin")],
    prohibitedClaims: [...neverCreditApproval, "the client must reorganize files before upload"],
    investorReservedActivities: investorReserved,
  },
  {
    order: 4,
    id: "extraction_evidence_map",
    title: bi("Leitura, extração e mapa de evidências", "Reading, extraction and evidence map"),
    objective: bi("Transformar documentos em dados estruturados sem perder a ligação com a fonte.", "Turn documents into structured data without losing the link to the source."),
    clientExperience: [bi("Não redigita o que já consta nos documentos.", "Does not retype what already exists in the documents.")],
    systemWork: [
      bi("Extrai entidades, períodos, moeda, escala, contas, dívidas, garantias, projeções e fatos narrativos.", "Extracts entities, periods, currency, scale, accounts, debt, collateral, projections and narrative facts."),
      bi("Anexa página, célula, tabela e trecho de origem a cada afirmação material.", "Attaches source page, cell, table and excerpt to every material claim."),
      bi("Separa fato, cálculo, premissa e interpretação.", "Separates fact, calculation, assumption and interpretation."),
    ],
    deskWork: [bi("Revisa extrações de baixa confiança que afetariam a análise ou a estrutura.", "Reviews low-confidence extractions that would affect the analysis or structure.")],
    outputs: [bi("Ledger de evidências e fatos normalizados", "Evidence ledger and normalized facts")],
    exitCriteria: [bi("Toda afirmação material tem fonte ou está marcada como premissa", "Every material claim has a source or is marked as an assumption")],
    prohibitedClaims: neverCreditApproval,
    investorReservedActivities: investorReserved,
  },
  {
    order: 5,
    id: "reconciliation_financial_base",
    title: bi("Conciliação e base financeira", "Reconciliation and financial base"),
    objective: bi("Construir uma visão financeira consistente antes de calcular capacidade ou propor estrutura.", "Build a consistent financial view before calculating capacity or proposing structure."),
    clientExperience: [bi("É chamado apenas quando um conflito material não pode ser resolvido pelas próprias evidências.", "Is contacted only when a material conflict cannot be resolved from the evidence itself.")],
    systemWork: [
      bi("Aplica hierarquia de fontes por conta e período, detecta conflitos e preserva versões.", "Applies source hierarchy by account and period, detects conflicts and preserves versions."),
      bi("Reconcilia histórico, balancete, ERP, dívida, garantias, projeções e entidades do grupo.", "Reconciles historical statements, trial balance, ERP, debt, collateral, projections and group entities."),
      bi("Calcula métricas por fórmulas versionadas, reproduzíveis e testadas.", "Calculates metrics using versioned, reproducible and tested formulas."),
    ],
    deskWork: [bi("Define o tratamento técnico de conflitos materiais e ajustes normalizadores.", "Determines the technical treatment of material conflicts and normalization adjustments.")],
    outputs: [bi("Base financeira reconciliada com linhagem", "Reconciled financial base with lineage")],
    exitCriteria: [bi("Diferenças materiais estão resolvidas, explicadas ou explicitamente abertas", "Material differences are resolved, explained or explicitly open")],
    prohibitedClaims: neverCreditApproval,
    investorReservedActivities: investorReserved,
  },
  {
    order: 6,
    id: "focused_gap_resolution",
    title: bi("Resolução focada de lacunas", "Focused gap resolution"),
    objective: bi("Pedir somente o que altera uma decisão material e não pode ser inferido com segurança.", "Ask only for what changes a material decision and cannot be safely inferred."),
    clientExperience: [
      bi("Recebe perguntas curtas em lotes, com linguagem simples e campo para responder no formato disponível.", "Receives short batched questions in plain language and may answer in the available format."),
      bi("Pode indicar parcial, não aplicável, indisponível ou disponível após confidencialidade.", "May indicate partial, not applicable, unavailable or available after confidentiality."),
    ],
    systemWork: [
      bi("Elimina perguntas já respondidas por arquivos, respostas anteriores ou evidências equivalentes.", "Eliminates questions already answered by files, prior responses or equivalent evidence."),
      bi("Prioriza lacunas que mudam capacidade, instrumento, estrutura ou aderência a mandato.", "Prioritizes gaps that change capacity, instrument, structure or mandate fit."),
    ],
    deskWork: [bi("Formula perguntas de alta materialidade e decide quando informação suficiente é realmente suficiente.", "Frames high-materiality questions and determines when sufficient information is truly sufficient.")],
    outputs: [bi("Registro de lacunas, respostas, impacto e resolução", "Gap, response, impact and resolution register")],
    exitCriteria: [bi("Nenhuma lacuna crítica está oculta ou tratada como certeza", "No critical gap is hidden or treated as certainty")],
    prohibitedClaims: [...neverCreditApproval, "every possible diligence item is required now"],
    investorReservedActivities: investorReserved,
  },
  {
    order: 7,
    id: "business_transaction_analysis",
    title: bi("Análise da companhia e da transação", "Company and transaction analysis"),
    objective: bi("Entender capacidade econômica, riscos, mitigantes e fonte de pagamento com profundidade institucional.", "Understand economic capacity, risks, mitigants and source of repayment with institutional depth."),
    clientExperience: [bi("Revisa fatos e premissas materiais, sem preencher um formulário de análise de crédito.", "Reviews material facts and assumptions without filling out a credit-analysis form.")],
    systemWork: [
      bi("Analisa negócio, setor, histórico, projeções, endividamento, liquidez, garantias e cenários de estresse.", "Analyzes business, sector, history, projections, debt, liquidity, collateral and stress scenarios."),
      bi("Distingue cálculo determinístico de interpretação assistida por modelo.", "Distinguishes deterministic calculation from model-assisted interpretation."),
    ],
    deskWork: [
      bi("Desafia premissas, interpreta riscos e mitigantes e formula a tese de financiamento.", "Challenges assumptions, interprets risks and mitigants and frames the financing thesis."),
      bi("Não emite parecer vinculante nem substitui underwriting do financiador.", "Does not issue a binding opinion or replace lender underwriting."),
    ],
    outputs: [bi("Análise técnica rastreável e tese de financiamento", "Traceable technical analysis and financing thesis")],
    exitCriteria: [bi("Fontes de pagamento, riscos, mitigantes e sensibilidades estão explicitados", "Sources of repayment, risks, mitigants and sensitivities are explicit")],
    prohibitedClaims: neverCreditApproval,
    investorReservedActivities: investorReserved,
  },
  {
    order: 8,
    id: "financing_alternatives_capacity",
    title: bi("Alternativas e capacidade de financiamento", "Financing alternatives and capacity"),
    objective: bi("Traduzir a análise em alternativas tecnicamente suportáveis e compatíveis com práticas de mercado.", "Translate the analysis into technically supportable alternatives compatible with market practice."),
    clientExperience: [bi("Compara caminhos, contrapartidas e limitações sem receber promessa de captação.", "Compares paths, trade-offs and limitations without receiving a funding promise.")],
    systemWork: [
      bi("Calcula capacidade por fluxo de caixa, alavancagem, cobertura, garantia, liquidez e restrições do instrumento.", "Calculates capacity through cash flow, leverage, coverage, collateral, liquidity and instrument constraints."),
      bi("Gera cenários comparáveis e identifica configurações não suportadas pelas evidências.", "Generates comparable scenarios and identifies configurations not supported by evidence."),
    ],
    deskWork: [bi("Seleciona alternativas defensáveis, explicita ajustes necessários e preserva o objetivo econômico.", "Selects defensible alternatives, makes necessary adjustments explicit and preserves the economic objective.")],
    outputs: [bi("Menu de alternativas e faixas indicativas de capacidade", "Alternative menu and indicative capacity ranges")],
    exitCriteria: [bi("Há uma alternativa suportável ou uma explicação clara de por que a configuração pedida não é suportada", "There is a supportable alternative or a clear explanation of why the requested configuration is not supported")],
    prohibitedClaims: neverCreditApproval,
    investorReservedActivities: investorReserved,
  },
  {
    order: 9,
    id: "indicative_structuring",
    title: bi("Estruturação indicativa", "Indicative structuring"),
    objective: bi("Converter a alternativa selecionada em uma proposta de estrutura clara e negociável.", "Convert the selected alternative into a clear, negotiable structure proposal."),
    clientExperience: [bi("Entende instrumento, volume, prazo, amortização, referência de preço, garantias, covenants e condições.", "Understands instrument, amount, tenor, amortization, pricing reference, collateral, covenants and conditions.")],
    systemWork: [bi("Mantém cada termo ligado à análise, às premissas e às referências de mercado utilizadas.", "Keeps every term linked to the analysis, assumptions and market references used.")],
    deskWork: [bi("Elabora term sheet indicativo e não vinculante, com alternativas quando apropriado.", "Drafts an indicative and non-binding term sheet, with alternatives where appropriate.")],
    outputs: [bi("Draft de term sheet indicativo", "Indicative term sheet draft")],
    exitCriteria: [bi("Estrutura internamente coerente, rastreável e pronta para revisão do cliente", "Internally consistent, traceable structure ready for client review")],
    prohibitedClaims: [...neverCreditApproval, "an investor has accepted these terms"],
    investorReservedActivities: investorReserved,
  },
  {
    order: 10,
    id: "institutional_packaging",
    title: bi("Materiais institucionais", "Institutional packaging"),
    objective: bi("Apresentar a companhia e a transação no padrão esperado por investidores profissionais.", "Present the company and transaction in the standard expected by professional investors."),
    clientExperience: [bi("Revisa um pacote consistente, sem remontar manualmente a história em vários arquivos.", "Reviews a consistent package without manually rebuilding the story across several files.")],
    systemWork: [bi("Compila números, fontes, narrativa e estrutura a partir de uma única base governada.", "Compiles numbers, sources, narrative and structure from a single governed base.")],
    deskWork: [bi("Prepara teaser, credit memorandum, modelo financeiro, term sheet indicativo, índice de evidências e Q&A antecipado.", "Prepares teaser, credit memorandum, financial model, indicative term sheet, evidence index and anticipated Q&A.")],
    outputs: [bi("Pacote institucional consistente e versionado", "Consistent, versioned institutional package")],
    exitCriteria: [bi("Materiais passam auditoria de consistência e não contêm alegações sem suporte", "Materials pass consistency audit and contain no unsupported claims")],
    prohibitedClaims: [...neverCreditApproval, "this is the investor's internal investment memorandum"],
    investorReservedActivities: investorReserved,
  },
  {
    order: 11,
    id: "market_mapping_mandate_fit",
    title: bi("Mapeamento de mercado e aderência a mandato", "Market mapping and mandate fit"),
    objective: bi("Direcionar a operação somente a provedores cujo mandato e prática observada sejam compatíveis.", "Direct the transaction only to capital providers whose mandate and observed practice are compatible."),
    clientExperience: [bi("Vê a lógica qualitativa de aderência e as restrições, sem percentuais fictícios.", "Sees the qualitative fit rationale and constraints without fake percentages.")],
    systemWork: [
      bi("Aplica filtros objetivos de ticket, setor, instrumento, estrutura, garantia, retorno e restrições.", "Applies objective filters for ticket, sector, instrument, structure, collateral, return and restrictions."),
      bi("Mantém mandato declarado separado de evidência de mercado e relacionamento.", "Keeps declared mandate separate from market and relationship evidence."),
    ],
    deskWork: [bi("Valida shortlist, tese de aderência e contato correto dentro de cada instituição.", "Validates the shortlist, fit rationale and correct contact within each institution.")],
    outputs: [bi("Shortlist de provedores e racional de aderência", "Capital-provider shortlist and fit rationale")],
    exitCriteria: [bi("Cada nome tem aderência explicável, contato adequado e nenhuma restrição crítica ignorada", "Every name has explainable fit, the correct contact and no ignored critical constraint")],
    prohibitedClaims: [...neverCreditApproval, "mandate fit means the investor will fund"],
    investorReservedActivities: investorReserved,
  },
  {
    order: 12,
    id: "client_authorization_qualified_introduction",
    title: bi("Autorização e introdução qualificada", "Authorization and qualified introduction"),
    objective: bi("Obter autorização explícita do cliente e realizar uma introdução profissional ao contato aderente.", "Obtain explicit client authorization and make a professional introduction to the aligned contact."),
    clientExperience: [
      bi("Aprova os materiais, destinatários e informações que podem ser compartilhadas.", "Approves materials, recipients and information that may be shared."),
      bi("Acompanha introduções, retornos e próximos passos sem confundir interesse com aprovação.", "Tracks introductions, feedback and next steps without confusing interest with approval."),
    ],
    systemWork: [bi("Registra versão, autorização, destinatário, data, escopo e trilha de divulgação.", "Records version, authorization, recipient, date, scope and disclosure trail.")],
    deskWork: [
      bi("Apresenta a operação ao contato correto e contextualiza por que ela adere ao mandato.", "Presents the transaction to the correct contact and contextualizes why it fits the mandate."),
      bi("Coordena respostas rastreáveis e atualizações do pacote durante a interlocução.", "Coordinates traceable answers and package updates during the dialogue."),
    ],
    outputs: [bi("Introdução qualificada e registro de mercado", "Qualified introduction and market log")],
    exitCriteria: [bi("Introdução realizada com autorização e pacote versionado", "Introduction made with authorization and a versioned package")],
    prohibitedClaims: [...neverCreditApproval, "qualified introduction is a financing commitment"],
    investorReservedActivities: investorReserved,
  },
] as const;

export const offroadAdvisoryBoundary = {
  does: [
    bi("Originação, análise técnica, desenvolvimento de alternativas e estruturação indicativa", "Origination, technical analysis, alternative development and indicative structuring"),
    bi("Preparação de materiais institucionais, mapeamento de mercado e introdução qualificada", "Institutional materials, market mapping and qualified introduction"),
    bi("Rastreabilidade de evidências, premissas, cálculos e versões", "Traceability of evidence, assumptions, calculations and versions"),
  ],
  doesNot: [
    bi("Comprometer capital ou garantir captação", "Commit capital or guarantee funding"),
    bi("Emitir parecer de crédito vinculante ou recomendação de investimento", "Issue a binding credit opinion or investment recommendation"),
    bi("Aprovar crédito, substituir comitê, diligência, documentos finais ou monitoramento do financiador", "Approve credit or replace lender committee, diligence, final documentation or monitoring"),
  ],
} as const;

export function dcmStage(id: DcmStageId): DcmStage {
  const stage = offroadDcmBlueprint.find((candidate) => candidate.id === id);
  if (!stage) throw new Error(`Unknown DCM stage: ${id}`);
  return stage;
}

