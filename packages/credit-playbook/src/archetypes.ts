import type {Archetype, Requirement} from "./types";

/**
 * The five operations this desk originates, plus a fallback.
 *
 * Written for Brazilian private credit: the documents are the ones a company here actually
 * has, the collateral is the collateral that actually gets taken (alienação fiduciária,
 * cessão fiduciária de recebíveis, aval), and the risks are the ones that actually kill these
 * deals rather than the ones that read well in a textbook.
 *
 * Every line here is a claim a credit professional can disagree with, which is the point of
 * writing it down.
 */

/** Requirements almost every operation shares. Stated once so a change reaches all of them. */
const commonMinimum: readonly Requirement[] = [
  {
    id: "financials_historical",
    purposes: ["investor_case", "financials", "storytelling"],
    level: "minimum",
    satisfiedBy: ["audited_financial_statements", "reviewed_interim_statements", "management_accounts"],
    singleDocument: false,
    labels: {pt: "Demonstrações financeiras dos últimos exercícios", en: "Historical financial statements"},
    rationale: {
      pt: "Sem histórico não há tendência, e sem tendência qualquer projeção é opinião. Auditadas valem mais que gerenciais e mudam o preço.",
      en: "No history means no trend, and without a trend any projection is an opinion. Audited statements outrank management accounts and change the price.",
    },
  },
  {
    id: "financials_interim",
    purposes: ["investor_case", "financials"],
    level: "minimum",
    satisfiedBy: ["trial_balance", "erp_export", "reviewed_interim_statements", "management_accounts"],
    singleDocument: false,
    labels: {pt: "Posição contábil recente (balancete ou export do ERP)", en: "Recent accounting position"},
    rationale: {
      pt: "O último exercício fechado pode ter meses. O investidor pergunta como a empresa está agora, e o intervalo entre o balanço e hoje é onde os problemas aparecem.",
      en: "The last closed year can be months old. The investor asks how the company is now, and the gap between balance sheet and today is where problems surface.",
    },
  },
  {
    id: "debt_schedule",
    purposes: ["investor_case", "financials", "structure"],
    level: "minimum",
    satisfiedBy: ["debt_schedule", "loan_agreement", "debenture_indenture"],
    singleDocument: false,
    labels: {pt: "Mapa de dívida com cronograma e garantias", en: "Debt schedule with maturities and collateral"},
    rationale: {
      pt: "Alavancagem sem cronograma não diz nada: o risco é a concentração de vencimentos, e a garantia disponível é o que sobra depois do que já foi dado.",
      en: "Leverage without a maturity profile says nothing: the risk is the concentration of maturities, and available collateral is what remains after what is already pledged.",
    },
  },
  {
    id: "corporate_identity",
    purposes: ["investor_case", "structure"],
    level: "minimum",
    satisfiedBy: ["company_registration", "corporate_docs"],
    singleDocument: true,
    labels: {pt: "Identificação e estrutura societária", en: "Company identification and ownership"},
    rationale: {
      pt: "Quem toma, quem garante e quem controla definem o perímetro da operação. Sem isso não há a quem emprestar.",
      en: "Who borrows, who guarantees and who controls define the perimeter. Without it there is no one to lend to.",
    },
  },
  {
    id: "request",
    purposes: ["investor_case", "structure", "storytelling"],
    level: "minimum",
    satisfiedBy: ["capital_request_letter", "investor_deck", "cim", "business_plan"],
    singleDocument: true,
    labels: {pt: "O pedido: montante, uso dos recursos e prazo pretendido", en: "The request: amount, use of proceeds and intended tenor"},
    rationale: {
      pt: "Uso dos recursos é o que separa uma operação estruturável de um pedido genérico de dinheiro — e é a primeira coisa que um comitê pergunta.",
      en: "Use of proceeds is what separates a structurable operation from a generic request for money, and it is the first thing a committee asks.",
    },
  },
];

const commonIdeal: readonly Requirement[] = [
  {
    id: "bank_statements",
    purposes: ["financials"],
    level: "ideal",
    satisfiedBy: ["bank_statements", "open_finance_export"],
    singleDocument: false,
    labels: {pt: "Extratos bancários dos últimos meses", en: "Recent bank statements"},
    rationale: {
      pt: "Caixa é a única linha que não se ajusta. Extrato confirma — ou contradiz — o que a contabilidade diz sobre geração.",
      en: "Cash is the one line that cannot be adjusted. Statements confirm — or contradict — what the accounts claim about generation.",
    },
  },
  {
    id: "tax_clearance",
    purposes: ["investor_case", "structure"],
    level: "ideal",
    satisfiedBy: ["tax_clearance"],
    singleDocument: false,
    labels: {pt: "Certidões fiscais e trabalhistas", en: "Tax and labour clearance certificates"},
    rationale: {
      pt: "Passivo fiscal descoberto na diligência mata a operação tarde. Descoberto agora, vira condição precedente.",
      en: "A tax liability found in diligence kills a deal late. Found now, it becomes a condition precedent.",
    },
  },
  {
    id: "auditor_opinion",
    purposes: ["investor_case", "financials"],
    level: "ideal",
    satisfiedBy: ["audited_financial_statements", "auditor_report_only"],
    singleDocument: true,
    labels: {pt: "Parecer do auditor com ênfases e ressalvas", en: "Auditor's report with emphases and qualifications"},
    rationale: {
      pt: "A ressalva é onde o auditor escreve o que a demonstração não mostra. É leitura obrigatória e costuma valer mais que a demonstração.",
      en: "The qualification is where the auditor writes what the statements do not show. It is required reading and often worth more than the statements.",
    },
  },
];

/**
 * What the desk asks the company to *tell it* — the half of a data room that never arrives as
 * a file.
 *
 * Nobody uploads a document that explains why now, who the customers are, what happens if the
 * largest one leaves, or how long the last store took to mature. Those answers decide how the
 * case reads and, often, whether it clears — and a request that only asks for files leaves
 * them to be discovered on a call with an investor, which is the worst place to discover them.
 *
 * Each carries the question phrased the way a banker asks it, an example so nobody guesses the
 * format, and what it unblocks.
 */
const commonInformation: readonly Requirement[] = [
  {
    id: "info_why_now",
    level: "minimum",
    satisfiedBy: [],
    source: "information",
    answerFormat: "text",
    singleDocument: true,
    purposes: ["investor_case", "storytelling"],
    labels: {pt: "Por que agora", en: "Why now"},
    question: {
      pt: "Por que esta operação agora, e o que acontece se ela não sair nos próximos seis meses?",
      en: "Why this operation now, and what happens if it does not close in the next six months?",
    },
    example: {
      pt: "Ex.: os três pontos comerciais já estão contratados e as obras começam em março; sem o financiamento, a companhia perde os pontos e o depósito.",
      en: "e.g. the three sites are already under contract and works start in March; without the financing the company loses the sites and the deposit.",
    },
    rationale: {
      pt: "É a primeira pergunta de qualquer comitê. Uma resposta específica com data e consequência transforma um pedido genérico em uma operação com prazo — e é o que separa um case que anda de um que fica na pilha.",
      en: "It is any committee's first question. A specific answer with a date and a consequence turns a generic request into an operation with a clock — and it is what separates a case that moves from one that sits in the pile.",
    },
  },
  {
    id: "info_business_model",
    level: "minimum",
    satisfiedBy: [],
    source: "information",
    answerFormat: "text",
    singleDocument: true,
    purposes: ["investor_case", "storytelling"],
    labels: {pt: "O que a companhia faz e como ganha dinheiro", en: "What the company does and how it makes money"},
    question: {
      pt: "Descreva o negócio: o que vende, para quem, como cobra, e de onde vem a margem.",
      en: "Describe the business: what it sells, to whom, how it charges, and where the margin comes from.",
    },
    example: {
      pt: "Ex.: 12 supermercados de vizinhança no interior de SP, ticket médio de R$ 62, margem bruta de 29% vinda de private label e negociação de compra por volume.",
      en: "e.g. 12 neighbourhood supermarkets in inland São Paulo, average basket R$ 62, 29% gross margin from private label and volume purchasing.",
    },
    rationale: {
      pt: "Dois perfis de crédito idênticos captam valores diferentes conforme alguém consiga explicar o negócio. O investidor não financia uma planilha; financia uma operação que ele entende.",
      en: "Two identical credit profiles raise different amounts depending on whether anyone can explain the business. An investor does not fund a spreadsheet; he funds an operation he understands.",
    },
  },
  {
    id: "info_customer_concentration",
    level: "minimum",
    satisfiedBy: [],
    source: "information",
    answerFormat: "list",
    singleDocument: true,
    purposes: ["investor_case", "financials", "structure"],
    labels: {pt: "Concentração de clientes", en: "Customer concentration"},
    question: {
      pt: "Quais os cinco maiores clientes, a participação de cada um na receita e o prazo do contrato?",
      en: "Who are the five largest customers, each one's share of revenue, and the term of each contract?",
    },
    example: {
      pt: "Ex.: Cliente A 18% (contrato até 2028), Cliente B 11% (sem contrato), …",
      en: "e.g. Customer A 18% (contract to 2028), Customer B 11% (no contract), …",
    },
    rationale: {
      pt: "Concentração é o risco que mais derruba operação de médio porte no comitê. Declarada com contrato e prazo, vira um fato administrável; descoberta na diligência, vira desconfiança sobre tudo o mais.",
      en: "Concentration is what most often sinks a mid-market operation at committee. Declared with contract and term it becomes a manageable fact; found in diligence it becomes distrust of everything else.",
    },
  },
  {
    id: "info_management",
    level: "ideal",
    satisfiedBy: [],
    source: "information",
    answerFormat: "list",
    singleDocument: true,
    purposes: ["investor_case", "storytelling"],
    labels: {pt: "Quem toca o negócio", en: "Who runs the business"},
    question: {
      pt: "Quem são os executivos-chave, há quanto tempo estão na companhia e o que faziam antes?",
      en: "Who are the key executives, how long have they been with the company, and what did they do before?",
    },
    example: {
      pt: "Ex.: CFO há 6 anos, antes controller de rede com 40 lojas; fundador ainda opera comercial.",
      en: "e.g. CFO for 6 years, previously controller of a 40-store chain; founder still runs commercial.",
    },
    rationale: {
      pt: "Crédito de médio porte é decisão sobre gente tanto quanto sobre número. Um time que já operou algo maior muda a leitura de um plano de expansão.",
      en: "Mid-market credit is a decision about people as much as about numbers. A team that has run something bigger changes how an expansion plan reads.",
    },
  },
  {
    id: "info_seasonality",
    level: "ideal",
    satisfiedBy: [],
    source: "information",
    answerFormat: "text",
    singleDocument: true,
    purposes: ["financials", "structure"],
    labels: {pt: "Sazonalidade", en: "Seasonality"},
    question: {
      pt: "Quais são os meses mais fortes e mais fracos, e quanto varia o caixa entre eles?",
      en: "Which are the strongest and weakest months, and how much does cash swing between them?",
    },
    example: {
      pt: "Ex.: dezembro é 1,6x o mês médio; fevereiro e março consomem caixa; pico de necessidade em abril.",
      en: "e.g. December runs 1.6x the average month; February and March consume cash; peak need in April.",
    },
    rationale: {
      pt: "Sem sazonalidade declarada, um trimestre fraco parece deterioração. Com ela, o cronograma de amortização pode ser desenhado para não pedir caixa no pior mês do ano.",
      en: "Without stated seasonality a weak quarter looks like deterioration. With it, the amortisation schedule can be drawn so it does not ask for cash in the worst month of the year.",
    },
  },
  {
    id: "info_related_parties",
    level: "ideal",
    satisfiedBy: [],
    source: "information",
    answerFormat: "text",
    singleDocument: true,
    purposes: ["investor_case", "financials"],
    labels: {pt: "Partes relacionadas", en: "Related parties"},
    question: {
      pt: "Há operações com partes relacionadas — aluguel de imóvel dos sócios, mútuo, compra de coligada? Quais e de quanto?",
      en: "Are there related-party transactions — property rented from the owners, intercompany loans, purchases from an affiliate? Which, and how much?",
    },
    example: {
      pt: "Ex.: aluguel de três lojas de imóveis dos sócios, R$ 180 mil/mês, contratos até 2030.",
      en: "e.g. three stores rented from properties owned by the shareholders, R$ 180k/month, contracts to 2030.",
    },
    rationale: {
      pt: "Parte relacionada não é problema; parte relacionada não declarada é. Ela muda EBITDA normalizado e aparece na diligência de qualquer forma.",
      en: "A related party is not a problem; an undeclared one is. It changes normalised EBITDA and surfaces in diligence anyway.",
    },
  },
];

export const archetypes: readonly Archetype[] = [
  {
    id: "growth_expansion",
    labels: {pt: "Crescimento / Expansão", en: "Growth / Expansion"},
    description: {
      pt: "Capex para abrir, ampliar ou equipar capacidade produtiva, pago pela geração futura do que está sendo construído.",
      en: "Capex to open, expand or equip capacity, repaid from the future generation of what is being built.",
    },
    requirements: [
      ...commonMinimum,
      {
        id: "project_plan",
    purposes: ["investor_case", "financials", "structure", "storytelling"],
        level: "minimum",
        satisfiedBy: ["business_plan", "financial_model", "project_memorandum", "budget"],
        singleDocument: true,
        labels: {pt: "Plano do projeto com premissas e orçamento", en: "Project plan with assumptions and budget"},
        rationale: {
          pt: "O crédito é pago pelo projeto. Sem premissas explícitas não há o que testar — e premissa que não se escreve é premissa que não se defende.",
          en: "The credit is repaid by the project. Without explicit assumptions there is nothing to test, and an assumption not written down is one that cannot be defended.",
        },
      },
      ...commonIdeal,
      ...commonInformation,
      {
        id: "info_ramp_history",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "text",
        singleDocument: true,
        purposes: ["investor_case", "financials", "structure"],
        labels: {pt: "Curva das unidades já abertas", en: "Curve of units already opened"},
        question: {
          pt: "Qual foi a receita mensal das duas últimas unidades abertas, do mês 1 ao mês 24?",
          en: "What was the monthly revenue of the last two units opened, from month 1 to month 24?",
        },
        example: {
          pt: "Ex.: loja de Ribeirão abriu em 03/2024: R$ 310 mil no mês 1, R$ 780 mil no mês 12, estabilizou em R$ 1,05 mi no mês 18.",
          en: "e.g. the Ribeirão store opened 03/2024: R$ 310k in month 1, R$ 780k in month 12, stabilised at R$ 1.05m in month 18.",
        },
        rationale: {
          pt: "É a premissa mais frágil de qualquer expansão e a que o comitê testa primeiro. Com histórico comparável, o ramp-up projetado deixa de ser opinião; sem ele, a projeção inteira fica em aberto.",
          en: "It is the most fragile assumption in any expansion and the first thing a committee tests. With comparable history the projected ramp stops being an opinion; without it the whole projection is open.",
        },
      },
      {
        id: "info_capex_actual",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "currency",
        singleDocument: true,
        purposes: ["financials", "structure"],
        labels: {pt: "Custo real da última unidade", en: "Actual cost of the last unit"},
        question: {
          pt: "Quanto custou, de fato, abrir a última unidade, e o que ficou fora do orçamento original?",
          en: "What did the last unit actually cost to open, and what fell outside the original budget?",
        },
        example: {
          pt: "Ex.: orçado R$ 12,0 mi, realizado R$ 14,6 mi; estouro em obra civil e equipamento de frios.",
          en: "e.g. budgeted R$ 12.0m, actual R$ 14.6m; overrun in civil works and refrigeration.",
        },
        rationale: {
          pt: "Capex projetado sem confronto com o realizado é a segunda premissa que mais quebra. A diferença entre orçado e realizado na última obra é o melhor indicador de contingência para a próxima.",
          en: "Projected capex never checked against actuals is the second assumption that most often breaks. The gap between budget and outturn on the last build is the best contingency indicator for the next.",
        },
      },
      {
        id: "unit_economics",
    purposes: ["investor_case", "financials", "storytelling"],
        level: "ideal",
        satisfiedBy: ["management_accounts", "financial_model", "business_plan"],
        singleDocument: false,
        labels: {pt: "Unit economics das unidades existentes", en: "Unit economics of existing units"},
        rationale: {
          pt: "A pergunta que decide: a unidade nova se parece com as que já operam? Ramp-up projetado sem histórico comparável é a premissa mais frágil deste tipo de operação.",
          en: "The deciding question: does the new unit resemble the ones already running? A projected ramp-up with no comparable history is the most fragile assumption in this operation.",
        },
      },
      {
        id: "project_schedule",
    purposes: ["structure", "storytelling"],
        level: "ideal",
        satisfiedBy: ["project_memorandum", "technical_report", "budget"],
        singleDocument: true,
        labels: {pt: "Cronograma físico-financeiro e licenças", en: "Construction schedule and permits"},
        rationale: {
          pt: "O desembolso segue a obra e a carência segue o cronograma. Atraso de licença vira alavancagem sem geração.",
          en: "Disbursement follows construction and grace follows the schedule. A permit delay becomes leverage with no generation behind it.",
        },
      },
      {
        id: "appraisal",
    purposes: ["structure"],
        level: "ideal",
        satisfiedBy: ["appraisal_report", "collateral_inventory"],
        singleDocument: false,
        labels: {pt: "Laudo dos ativos oferecidos em garantia", en: "Appraisal of the assets offered as collateral"},
        rationale: {
          pt: "Garantia sem laudo entra na conversa com haircut de desconhecido. Com laudo, entra pelo valor.",
          en: "Collateral without an appraisal enters the conversation at an unknown haircut. With one, it enters at value.",
        },
      },
    ],
    focus: [
      {
        id: "ramp_credibility",
        labels: {pt: "Credibilidade do ramp-up", en: "Ramp-up credibility"},
        question: {
          pt: "A curva projetada da unidade nova é compatível com o que as unidades existentes levaram para maturar?",
          en: "Is the projected curve for the new unit consistent with how long existing units took to mature?",
        },
        evidence: ["projections.{period}.revenue", "historical_financials.{period}.revenue", "project.investments.{i}.amount"],
      },
      {
        id: "peak_leverage",
        labels: {pt: "Alavancagem no pico", en: "Peak leverage"},
        question: {
          pt: "Durante a obra a dívida sobe e o EBITDA não. Qual é a alavancagem no pior mês, e ela cabe no covenant?",
          en: "During construction debt rises and EBITDA does not. What is leverage in the worst month, and does it fit the covenant?",
        },
        evidence: ["leverage.post_transaction_net_debt_ebitda", "historical_financials.{period}.ebitda", "debt.total_gross"],
      },
      {
        id: "capex_realism",
        labels: {pt: "Realismo do capex", en: "Capex realism"},
        question: {
          pt: "O capex por unidade bate com o que a empresa já gastou para abrir as anteriores?",
          en: "Does capex per unit match what the company actually spent opening the previous ones?",
        },
        evidence: ["project.investments.{i}.amount", "historical_financials.{period}.capex", "project.total_cost"],
      },
      {
        id: "service_after_project",
        labels: {pt: "Capacidade de serviço pós-projeto", en: "Debt service after the project"},
        question: {
          pt: "Com o projeto maduro, o DSCR fecha com folga suficiente para absorver um ramp-up 30% pior?",
          en: "With the project mature, does DSCR hold with enough headroom to absorb a ramp-up 30% worse than projected?",
        },
        evidence: ["projections.{period}.ebitda", "projections.{period}.free_cash_flow"],
      },
    ],
    risks: [
      {
        id: "optimistic_ramp",
        severity: "critical",
        labels: {pt: "Ramp-up otimista", en: "Optimistic ramp-up"},
        test: {
          pt: "Comparar a curva projetada com a curva realizada das unidades existentes nos primeiros 24 meses.",
          en: "Compare the projected curve with the realised curve of existing units over their first 24 months.",
        },
      },
      {
        id: "understated_capex",
        severity: "high",
        labels: {pt: "Capex subestimado", en: "Understated capex"},
        test: {
          pt: "Capex por unidade projetado contra o histórico e contra o orçamento do memorial; verificar contingência.",
          en: "Projected capex per unit against history and against the project budget; check the contingency line.",
        },
      },
      {
        id: "grace_mismatch",
        severity: "high",
        labels: {pt: "Carência menor que a maturação", en: "Grace shorter than maturation"},
        test: {
          pt: "Cronograma de obra + ramp-up contra o início da amortização.",
          en: "Construction schedule plus ramp-up against the start of amortisation.",
        },
      },
      {
        id: "collateral_already_pledged",
        severity: "high",
        labels: {pt: "Garantia já comprometida", en: "Collateral already pledged"},
        test: {
          pt: "Cruzar o inventário de garantias com os gravames declarados no mapa de dívida.",
          en: "Cross the collateral inventory against the liens declared in the debt schedule.",
        },
      },
    ],
    structure: {
      tenorMonths: {typical: [48, 84], outer: [36, 120]},
      leverageCeiling: "3.5",
      minimumDscr: "1.30",
      gracePeriodMonths: {typical: [12, 24]},
      amortization: ["price", "sac", "bullet parcial com amortização crescente"],
      collateral: [
        "alienação fiduciária do imóvel ou das benfeitorias",
        "alienação fiduciária dos equipamentos financiados",
        "cessão fiduciária de recebíveis da unidade",
        "aval dos controladores",
      ],
      covenants: [
        "dívida líquida / EBITDA com step-down após a maturação",
        "DSCR mínimo aferido a partir do primeiro ano cheio",
        "limite de capex adicional sem anuência",
        "cross-default e cross-acceleration",
      ],
      notes: {
        pt: "Carência acompanha a obra e o ramp-up, não o calendário. Covenant de alavancagem aferido cedo demais quebra por construção, não por deterioração.",
        en: "Grace follows construction and ramp-up, not the calendar. A leverage covenant tested too early breaks by construction, not by deterioration.",
      },
    },
    questions: [
      {id: "ramp_history", focusId: "ramp_credibility", materiality: "material", labels: {pt: "Qual foi a curva de receita mensal das últimas unidades abertas, do mês 1 ao 24?", en: "What was the monthly revenue curve of the most recently opened units, from month 1 to 24?"}},
      {id: "capex_history", focusId: "capex_realism", materiality: "material", labels: {pt: "Quanto custou, de fato, abrir a última unidade, e o que ficou fora do orçamento original?", en: "What did the last unit actually cost to open, and what fell outside the original budget?"}},
      {id: "permit_status", focusId: "peak_leverage", materiality: "material", labels: {pt: "Em que estágio está cada licença e alvará do projeto?", en: "What stage is each permit and licence of the project at?"}},
      {id: "contingency", focusId: "capex_realism", materiality: "supporting", labels: {pt: "Qual a contingência prevista no orçamento e quem absorve o estouro?", en: "What contingency is in the budget and who absorbs an overrun?"}},
    ],
  },

  {
    id: "working_capital",
    labels: {pt: "Capital de giro", en: "Working capital"},
    description: {
      pt: "Financiamento do ciclo operacional — estoque, prazo de recebimento e sazonalidade —, pago pela conversão do próprio giro.",
      en: "Financing of the operating cycle — inventory, receivable terms and seasonality — repaid by the conversion of the cycle itself.",
    },
    requirements: [
      ...commonMinimum,
      {
        id: "revenue_evidence",
    purposes: ["financials", "storytelling"],
        level: "minimum",
        satisfiedBy: ["erp_export", "management_accounts", "trial_balance"],
        singleDocument: false,
        labels: {pt: "Faturamento dos últimos 12 meses", en: "Last twelve months of billings"},
        rationale: {
          pt: "Necessidade de giro é função do faturamento e dos prazos. Sem a série mensal não há como distinguir sazonalidade de deterioração.",
          en: "Working capital need is a function of billings and terms. Without the monthly series there is no telling seasonality from deterioration.",
        },
      },
      ...commonIdeal,
      ...commonInformation,
      {
        id: "info_assigned_receivables",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "text",
        singleDocument: true,
        purposes: ["structure", "financials"],
        labels: {pt: "Recebíveis já cedidos", en: "Receivables already assigned"},
        question: {
          pt: "Que parcela dos recebíveis já está cedida ou vinculada, e a quais credores?",
          en: "What share of receivables is already assigned or pledged, and to which creditors?",
        },
        example: {
          pt: "Ex.: 40% do faturamento de cartão cedido ao Banco X até 06/2027; duplicatas livres.",
          en: "e.g. 40% of card receivables assigned to Bank X until 06/2027; trade receivables unencumbered.",
        },
        rationale: {
          pt: "O recebível é a garantia natural desta operação. Se já está cedido, a estrutura muda inteira — e descobrir isso na diligência custa semanas.",
          en: "The receivable is this operation's natural collateral. If it is already assigned the structure changes entirely, and finding that out in diligence costs weeks.",
        },
      },
      {
        id: "info_cash_cycle",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "number",
        singleDocument: true,
        purposes: ["financials", "structure"],
        labels: {pt: "Prazos de recebimento, estoque e pagamento", en: "Receivable, inventory and payable days"},
        question: {
          pt: "Em dias: quanto a companhia leva para receber, quanto tempo o estoque gira e em quanto paga fornecedores?",
          en: "In days: how long to collect, how long inventory turns, and how long to pay suppliers?",
        },
        example: {pt: "Ex.: recebe em 38, estoque gira em 52, paga em 41 — ciclo de 49 dias.", en: "e.g. collects in 38, inventory turns in 52, pays in 41 — a 49-day cycle."},
        rationale: {
          pt: "O ciclo define o tamanho certo da linha. Pedido acima do ciclo é dívida estrutural com nome de giro, e um financiador experiente identifica isso na primeira conversa.",
          en: "The cycle defines the right size of the facility. A request larger than the cycle is structural debt wearing a working-capital label, and an experienced lender spots it on the first call.",
        },
      },
      {
        id: "receivables_aging",
    purposes: ["financials", "structure"],
        level: "ideal",
        satisfiedBy: ["receivables_aging"],
        singleDocument: false,
        labels: {pt: "Aging de recebíveis com concentração por cliente", en: "Receivables aging with customer concentration"},
        rationale: {
          pt: "O recebível é a garantia natural desta operação. Vencido e concentrado valem menos — e parte dele pode já estar cedido.",
          en: "The receivable is this operation's natural collateral. Overdue and concentrated is worth less — and part of it may already be assigned.",
        },
      },
      {
        id: "payables_aging",
    purposes: ["financials"],
        level: "ideal",
        satisfiedBy: ["payables_aging"],
        singleDocument: false,
        labels: {pt: "Aging de fornecedores", en: "Payables aging"},
        rationale: {
          pt: "Alongar fornecedor é a forma mais barata e mais silenciosa de financiar giro. Se já está esticado, o espaço acabou.",
          en: "Stretching suppliers is the cheapest and quietest way to fund the cycle. If it is already stretched, the room is gone.",
        },
      },
      {
        id: "customer_contracts",
    purposes: ["investor_case", "structure", "storytelling"],
        level: "ideal",
        satisfiedBy: ["customer_contract"],
        singleDocument: false,
        labels: {pt: "Contratos com os principais clientes", en: "Contracts with the main customers"},
        rationale: {
          pt: "Prazo, reajuste e cláusula de cessão definem se o recebível é cedível — e portanto se serve de garantia.",
          en: "Term, indexation and assignment clauses define whether the receivable can be assigned, and therefore whether it works as collateral.",
        },
      },
    ],
    focus: [
      {
        id: "cash_cycle",
        labels: {pt: "Ciclo de conversão de caixa", en: "Cash conversion cycle"},
        question: {
          pt: "Quantos dias a empresa financia entre pagar e receber, e o pedido é compatível com essa necessidade?",
          en: "How many days does the company fund between paying and being paid, and does the request match that need?",
        },
        evidence: ["historical_financials.{period}.receivables", "historical_financials.{period}.inventory", "historical_financials.{period}.payables", "historical_financials.{period}.working_capital"],
      },
      {
        id: "structural_vs_loss",
        labels: {pt: "Giro estrutural ou prejuízo disfarçado", en: "Structural cycle or disguised loss"},
        question: {
          pt: "A necessidade cresce com o faturamento, ou cresce enquanto o faturamento não cresce?",
          en: "Does the need grow with billings, or does it grow while billings do not?",
        },
        evidence: ["historical_financials.{period}.revenue", "historical_financials.{period}.working_capital", "historical_financials.{period}.cfo"],
      },
      {
        id: "receivable_quality",
        labels: {pt: "Qualidade e disponibilidade do recebível", en: "Receivable quality and availability"},
        question: {
          pt: "Quanto do recebível está vencido, concentrado ou já cedido a outro credor?",
          en: "How much of the receivable is overdue, concentrated or already assigned to another creditor?",
        },
        evidence: ["collateral.receivables_capacity", "collateral.assets.{i}.encumbrances", "historical_financials.{period}.receivables"],
      },
    ],
    risks: [
      {
        id: "funding_the_loss",
        severity: "critical",
        labels: {pt: "Financiar prejuízo operacional como se fosse giro", en: "Funding an operating loss as if it were working capital"},
        test: {
          pt: "EBITDA e fluxo de caixa operacional na série histórica: giro que cresce com CFO negativo é prejuízo, não ciclo.",
          en: "EBITDA and operating cash flow across the series: a growing cycle with negative CFO is a loss, not a cycle.",
        },
      },
      {
        id: "receivables_double_pledged",
        severity: "critical",
        labels: {pt: "Recebível já cedido", en: "Receivable already assigned"},
        test: {
          pt: "Cruzar o aging com as cessões declaradas no mapa de dívida e nos contratos das operações vigentes.",
          en: "Cross the aging against assignments declared in the debt schedule and in existing facility agreements.",
        },
      },
      {
        id: "customer_concentration",
        severity: "high",
        labels: {pt: "Concentração de clientes", en: "Customer concentration"},
        test: {
          pt: "Participação do maior cliente na receita e no recebível; prazo e rescisão do contrato correspondente.",
          en: "Largest customer's share of revenue and of receivables; term and termination of the matching contract.",
        },
      },
      {
        id: "revolving_evergreen",
        severity: "medium",
        labels: {pt: "Rotativo que nunca amortiza", en: "Revolving that never amortises"},
        test: {
          pt: "Saldo médio utilizado nos últimos 24 meses: linha que nunca zera é dívida de longo prazo com preço de curto.",
          en: "Average drawn balance over 24 months: a line that never clears is long-term debt priced as short-term.",
        },
      },
    ],
    structure: {
      tenorMonths: {typical: [12, 36], outer: [6, 48]},
      leverageCeiling: "2.5",
      minimumDscr: "1.20",
      gracePeriodMonths: {typical: [0, 6]},
      amortization: ["revolving com limite decrescente", "amortização mensal", "bullet com renovação condicionada"],
      collateral: [
        "cessão fiduciária de recebíveis performados",
        "alienação fiduciária de estoque (quando há controle)",
        "aval dos controladores",
      ],
      covenants: [
        "índice mínimo de cobertura da cessão (recebível cedido / saldo devedor)",
        "dívida líquida / EBITDA",
        "limite de novas cessões a terceiros",
      ],
      notes: {
        pt: "O prazo deve caber no ciclo, não no desejo. Giro financiado em prazo maior que o ciclo é dívida estrutural com outro nome.",
        en: "The tenor has to fit the cycle, not the wish. A cycle funded over a longer term is structural debt under another name.",
      },
    },
    questions: [
      {id: "assigned_receivables", focusId: "receivable_quality", materiality: "material", labels: {pt: "Que parcela dos recebíveis já está cedida, e a quais credores?", en: "What share of receivables is already assigned, and to which creditors?"}},
      {id: "seasonality", focusId: "cash_cycle", materiality: "material", labels: {pt: "Qual o mês de maior e de menor necessidade de giro no ano?", en: "Which months carry the highest and lowest working capital need?"}},
      {id: "top_customers", focusId: "receivable_quality", materiality: "material", labels: {pt: "Quais são os cinco maiores clientes, sua participação e o prazo de cada contrato?", en: "Who are the five largest customers, their share, and each contract's term?"}},
    ],
  },

  {
    id: "refinance",
    labels: {pt: "Refinanciamento", en: "Refinance"},
    description: {
      pt: "Substituição de dívida existente por prazo mais longo, custo menor ou garantia melhor — paga pela mesma geração, reorganizada.",
      en: "Replacement of existing debt with longer tenor, lower cost or better collateral — repaid by the same generation, reorganised.",
    },
    requirements: [
      ...commonMinimum,
      {
        id: "debt_contracts",
    purposes: ["structure"],
        level: "minimum",
        satisfiedBy: ["loan_agreement", "debenture_indenture", "debt_schedule"],
        singleDocument: false,
        labels: {pt: "Contratos das dívidas a serem liquidadas", en: "Agreements of the debt being repaid"},
        rationale: {
          pt: "Multa de pré-pagamento, cross-default e ordem de liberação das garantias definem se a operação é possível — e a que custo.",
          en: "Prepayment penalties, cross-default and the order in which collateral is released define whether the operation is possible at all, and at what cost.",
        },
      },
      ...commonIdeal,
      ...commonInformation,
      {
        id: "info_prepayment",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "text",
        singleDocument: true,
        purposes: ["structure", "financials"],
        labels: {pt: "Multas e condições de pré-pagamento", en: "Prepayment penalties and conditions"},
        question: {
          pt: "Para cada dívida a ser liquidada: qual a multa de pré-pagamento e sob que condições cada credor libera as garantias?",
          en: "For each debt being repaid: what is the prepayment penalty, and under what conditions does each creditor release its collateral?",
        },
        example: {pt: "Ex.: Banco Y cobra 2% sobre o saldo e libera a alienação em 30 dias após a quitação.", en: "e.g. Bank Y charges 2% on the balance and releases the lien 30 days after repayment."},
        rationale: {
          pt: "É o que decide se a operação faz sentido econômico. Multa não considerada come a economia de custo que justificava o refinanciamento.",
          en: "It decides whether the operation makes economic sense. An unaccounted penalty eats the cost saving that justified the refinancing.",
        },
      },
      {
        id: "collateral_release",
    purposes: ["structure"],
        level: "ideal",
        satisfiedBy: ["collateral_inventory", "loan_agreement"],
        singleDocument: false,
        labels: {pt: "Garantias atuais e condições de liberação", en: "Current collateral and release conditions"},
        rationale: {
          pt: "O novo credor precisa saber o que herda e o que fica preso. Garantia sem liberação acordada trava o fechamento.",
          en: "The new creditor needs to know what it inherits and what stays locked. Collateral without an agreed release stalls closing.",
        },
      },
      {
        id: "waivers",
    purposes: ["investor_case", "structure"],
        level: "ideal",
        satisfiedBy: ["loan_agreement", "regulatory_filing", "corporate_docs"],
        singleDocument: false,
        labels: {pt: "Covenants vigentes e waivers obtidos", en: "Current covenants and waivers obtained"},
        rationale: {
          pt: "Covenant quebrado e renegociado no passado é informação de crédito, não papelada. Diz como a empresa se comporta sob pressão.",
          en: "A covenant breached and renegotiated in the past is credit information, not paperwork. It says how the company behaves under stress.",
        },
      },
    ],
    focus: [
      {
        id: "real_extension",
        labels: {pt: "Alongamento real", en: "Real extension"},
        question: {
          pt: "O prazo médio ponderado depois é materialmente maior que antes, ou é rolagem com nome novo?",
          en: "Is the weighted average tenor materially longer after, or is this a roll-over with a new name?",
        },
        evidence: ["debt.instruments.{i}.maturity", "debt.instruments.{i}.amortization", "debt.total_gross"],
      },
      {
        id: "cost_delta",
        labels: {pt: "Custo antes e depois", en: "Cost before and after"},
        question: {
          pt: "O custo médio ponderado cai o suficiente para justificar a operação e as suas despesas?",
          en: "Does the weighted average cost fall enough to justify the operation and its expenses?",
        },
        evidence: ["debt.instruments.{i}.rate", "debt.instruments.{i}.balance", "debt.total_gross"],
      },
      {
        id: "service_capacity",
        labels: {pt: "Capacidade de serviço", en: "Debt service capacity"},
        question: {
          pt: "O novo cronograma cabe na geração histórica, sem depender de crescimento?",
          en: "Does the new schedule fit historical generation, without depending on growth?",
        },
        evidence: ["historical_financials.{period}.cfo", "historical_financials.{period}.ebitda", "debt.total_gross"],
      },
    ],
    risks: [
      {
        id: "refinancing_the_unpayable",
        severity: "critical",
        labels: {pt: "Refinanciar dívida que a geração não paga", en: "Refinancing debt the generation cannot service"},
        test: {
          pt: "Serviço da dívida proposto contra o CFO histórico dos últimos três exercícios, sem crescimento projetado.",
          en: "Proposed debt service against historical CFO for the last three years, with no projected growth.",
        },
      },
      {
        id: "collateral_exhausted",
        severity: "high",
        labels: {pt: "Garantia esgotada", en: "Collateral exhausted"},
        test: {
          pt: "Valor dos ativos livres após haircut contra o saldo a refinanciar.",
          en: "Value of unencumbered assets after haircut against the balance being refinanced.",
        },
      },
      {
        id: "hidden_prepayment_cost",
        severity: "medium",
        labels: {pt: "Custo de pré-pagamento não considerado", en: "Prepayment cost not accounted for"},
        test: {
          pt: "Cláusulas de multa e de indenização nos contratos das dívidas a liquidar.",
          en: "Penalty and indemnity clauses in the agreements of the debt being repaid.",
        },
      },
    ],
    structure: {
      tenorMonths: {typical: [36, 84], outer: [24, 120]},
      leverageCeiling: "3.0",
      minimumDscr: "1.25",
      gracePeriodMonths: {typical: [6, 18]},
      amortization: ["sac", "price", "amortização crescente acompanhando a geração"],
      collateral: [
        "herança das garantias liberadas pelos credores substituídos",
        "alienação fiduciária de imóveis operacionais",
        "cessão fiduciária de recebíveis",
        "aval dos controladores",
      ],
      covenants: [
        "dívida líquida / EBITDA decrescente ao longo do prazo",
        "DSCR mínimo",
        "restrição a nova dívida sênior",
        "restrição a distribuição de dividendos acima de percentual do lucro",
      ],
      notes: {
        pt: "O prazo novo tem de ser maior que o da dívida que substitui — caso contrário a operação não resolve nada e cobra por isso.",
        en: "The new tenor has to exceed the debt it replaces; otherwise the operation solves nothing and charges for it.",
      },
    },
    questions: [
      {id: "prepayment_terms", focusId: "cost_delta", materiality: "material", labels: {pt: "Qual a multa de pré-pagamento de cada contrato a ser liquidado?", en: "What is the prepayment penalty on each agreement being repaid?"}},
      {id: "release_conditions", focusId: "real_extension", materiality: "material", labels: {pt: "Sob que condições cada credor atual libera as garantias?", en: "Under what conditions does each current creditor release its collateral?"}},
      {id: "past_breaches", focusId: "service_capacity", materiality: "supporting", labels: {pt: "Houve quebra de covenant nos últimos 36 meses? Como foi resolvida?", en: "Was any covenant breached in the last 36 months? How was it resolved?"}},
    ],
  },

  {
    id: "acquisition",
    labels: {pt: "Aquisição", en: "Acquisition"},
    description: {
      pt: "Financiamento da compra de uma empresa ou de ativos, pago pela geração combinada — e garantido pelo perímetro que se forma.",
      en: "Financing the purchase of a company or assets, repaid from combined generation and secured on the perimeter that results.",
    },
    requirements: [
      ...commonMinimum,
      {
        id: "target_financials",
    purposes: ["investor_case", "financials"],
        level: "minimum",
        satisfiedBy: ["audited_financial_statements", "reviewed_interim_statements", "management_accounts", "trial_balance"],
        singleDocument: false,
        labels: {pt: "Demonstrações da empresa-alvo", en: "Target company financials"},
        rationale: {
          pt: "Metade do risco está do outro lado da mesa. Alvo sem número auditável é aquisição feita no escuro.",
          en: "Half the risk sits on the other side of the table. A target with no auditable numbers is an acquisition made blind.",
        },
      },
      {
        id: "transaction_documents",
    purposes: ["investor_case", "structure", "storytelling"],
        level: "minimum",
        satisfiedBy: ["corporate_docs", "capital_request_letter", "cim"],
        singleDocument: true,
        labels: {pt: "Documentos da transação (LOI, SPA ou memorando)", en: "Transaction documents (LOI, SPA or memorandum)"},
        rationale: {
          pt: "Preço, forma de pagamento, earn-out e condições precedentes definem quanto de dívida a operação realmente comporta.",
          en: "Price, payment structure, earn-out and conditions precedent define how much debt the operation can actually carry.",
        },
      },
      ...commonIdeal,
      ...commonInformation,
      {
        id: "info_synergies",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "list",
        singleDocument: true,
        purposes: ["investor_case", "financials", "storytelling"],
        labels: {pt: "Sinergias com plano e responsável", en: "Synergies with a plan and an owner"},
        question: {
          pt: "Para cada sinergia projetada: qual o valor, o plano para capturá-la, o prazo e quem responde por ela?",
          en: "For each projected synergy: the amount, the plan to capture it, the deadline, and who owns it.",
        },
        example: {pt: "Ex.: R$ 4,2 mi/ano em compras, renegociando 60% do volume em 90 dias — responsável: diretor comercial.", en: "e.g. R$ 4.2m/year in purchasing, renegotiating 60% of volume in 90 days — owner: commercial director."},
        rationale: {
          pt: "Sinergia sem plano não entra na base do covenant, e sinergia que entra sem plano faz o covenant nascer quebrado. A diferença entre as duas é esta resposta.",
          en: "A synergy with no plan does not enter the covenant base, and one that enters without a plan makes the covenant start already breached. This answer is the difference.",
        },
      },
      {
        id: "due_diligence",
    purposes: ["investor_case", "structure"],
        level: "ideal",
        satisfiedBy: ["technical_report", "auditor_report_only", "tax_clearance"],
        singleDocument: false,
        labels: {pt: "Diligência contábil, fiscal e trabalhista do alvo", en: "Accounting, tax and labour diligence on the target"},
        rationale: {
          pt: "Passivo contingente do alvo vira passivo do comprador. É a diferença entre um múltiplo e um problema.",
          en: "The target's contingent liabilities become the buyer's. It is the difference between a multiple and a problem.",
        },
      },
      {
        id: "post_structure",
    purposes: ["structure"],
        level: "ideal",
        satisfiedBy: ["corporate_docs"],
        singleDocument: true,
        labels: {pt: "Estrutura societária pós-operação", en: "Post-transaction ownership structure"},
        rationale: {
          pt: "Onde a dívida fica e de onde vem o caixa que a paga podem ser entidades diferentes. Se forem, é preciso garantia atravessando o perímetro.",
          en: "Where the debt sits and where the cash that repays it comes from can be different entities. If they are, collateral has to cross the perimeter.",
        },
      },
    ],
    focus: [
      {
        id: "target_ebitda_quality",
        labels: {pt: "Qualidade do EBITDA do alvo", en: "Quality of the target's EBITDA"},
        question: {
          pt: "Quanto do EBITDA do alvo é recorrente, auditado e sobrevive à mudança de controle?",
          en: "How much of the target's EBITDA is recurring, audited and survives the change of control?",
        },
        evidence: ["historical_financials.{period}.ebitda", "historical_financials.{period}.adjusted_ebitda"],
      },
      {
        id: "synergy_credibility",
        labels: {pt: "Sinergias verificáveis", en: "Verifiable synergies"},
        question: {
          pt: "As sinergias estão no covenant ou só no discurso? Quais têm plano, prazo e responsável?",
          en: "Are the synergies in the covenant or only in the pitch? Which have a plan, a deadline and an owner?",
        },
        evidence: ["projections.{period}.ebitda", "transaction.use_of_proceeds.{i}.amount"],
      },
      {
        id: "proforma_leverage",
        labels: {pt: "Alavancagem pro-forma", en: "Pro-forma leverage"},
        question: {
          pt: "Alavancagem no fechamento, sem sinergia nenhuma, cabe no apetite do mercado para este setor?",
          en: "Does leverage at closing, with no synergies at all, fit the market's appetite for this sector?",
        },
        evidence: ["leverage.post_transaction_net_debt_ebitda", "leverage.post_transaction_gross_debt"],
      },
    ],
    risks: [
      {
        id: "unaudited_target",
        severity: "critical",
        labels: {pt: "EBITDA do alvo não auditado", en: "Target EBITDA not audited"},
        test: {
          pt: "Classe da informação das demonstrações do alvo e existência de diligência independente.",
          en: "Information class of the target's statements and whether independent diligence exists.",
        },
      },
      {
        id: "synergies_in_covenant",
        severity: "critical",
        labels: {pt: "Sinergia dentro do covenant", en: "Synergies inside the covenant"},
        test: {
          pt: "Base de EBITDA usada no covenant: se inclui sinergia não realizada, o covenant nasce quebrado.",
          en: "EBITDA base used in the covenant: if it includes unrealised synergies, the covenant starts already breached.",
        },
      },
      {
        id: "contingent_liabilities",
        severity: "high",
        labels: {pt: "Passivos contingentes do alvo", en: "Target's contingent liabilities"},
        test: {
          pt: "Certidões, notas explicativas de contingências e provisões contra o preço e o escrow.",
          en: "Clearance certificates, contingency notes and provisions against the price and the escrow.",
        },
      },
      {
        id: "perimeter_gap",
        severity: "high",
        labels: {pt: "Caixa fora do perímetro da garantia", en: "Cash outside the collateral perimeter"},
        test: {
          pt: "Entidade devedora contra a entidade geradora, e as garantias que ligam uma à outra.",
          en: "Borrowing entity against generating entity, and the collateral linking one to the other.",
        },
      },
    ],
    structure: {
      tenorMonths: {typical: [60, 84], outer: [36, 96]},
      leverageCeiling: "4.0",
      minimumDscr: "1.35",
      gracePeriodMonths: {typical: [6, 12]},
      amortization: ["sac", "amortização com cash sweep sobre excedente", "bullet parcial no final"],
      collateral: [
        "alienação fiduciária das quotas ou ações do alvo",
        "alienação fiduciária dos ativos operacionais do perímetro",
        "cessão fiduciária de recebíveis do consolidado",
        "aval dos controladores e escrow do preço",
      ],
      covenants: [
        "dívida líquida / EBITDA pro-forma com step-down",
        "DSCR consolidado",
        "restrição a nova aquisição sem anuência",
        "cash sweep sobre excedente de caixa",
        "manutenção do perímetro societário",
      ],
      notes: {
        pt: "A base de EBITDA do covenant é a decisão mais importante da estrutura. Sinergia não realizada não entra na base — entra no step-down, se entrar.",
        en: "The covenant's EBITDA base is the most important decision in the structure. Unrealised synergies do not enter the base; they enter the step-down, if anywhere.",
      },
    },
    questions: [
      {id: "target_audit", focusId: "target_ebitda_quality", materiality: "material", labels: {pt: "As demonstrações do alvo são auditadas? Por quem, e com que ressalvas?", en: "Are the target's statements audited? By whom, and with what qualifications?"}},
      {id: "synergy_plan", focusId: "synergy_credibility", materiality: "material", labels: {pt: "Para cada sinergia projetada: qual o plano, o prazo e o responsável?", en: "For each projected synergy: what is the plan, the deadline and the owner?"}},
      {id: "escrow", focusId: "proforma_leverage", materiality: "material", labels: {pt: "Há escrow ou retenção de preço para contingências? De quanto e por quanto tempo?", en: "Is there an escrow or price holdback for contingencies? How much and for how long?"}},
    ],
  },

  {
    id: "equipment_finance",
    labels: {pt: "Financiamento de equipamentos", en: "Equipment finance"},
    description: {
      pt: "Aquisição de máquinas, frota ou equipamentos, paga pela produtividade do próprio ativo e garantida por ele.",
      en: "Purchase of machinery, fleet or equipment, repaid by the asset's own productivity and secured on it.",
    },
    requirements: [
      ...commonMinimum,
      {
        id: "equipment_quote",
    purposes: ["financials", "structure"],
        level: "minimum",
        satisfiedBy: ["budget", "supplier_contract", "project_memorandum", "technical_report"],
        singleDocument: true,
        labels: {pt: "Proposta ou orçamento do equipamento", en: "Equipment quote or budget"},
        rationale: {
          pt: "Especificação, preço e prazo de entrega definem o valor financiável e quando o ativo começa a produzir.",
          en: "Specification, price and delivery define the financeable amount and when the asset starts producing.",
        },
      },
      ...commonIdeal,
      ...commonInformation,
      {
        id: "info_asset_productivity",
        level: "minimum",
        satisfiedBy: [],
        source: "information",
        answerFormat: "text",
        singleDocument: true,
        purposes: ["financials", "structure", "storytelling"],
        labels: {pt: "O que o equipamento muda na operação", en: "What the equipment changes in the operation"},
        question: {
          pt: "Qual capacidade, custo ou receita muda com este equipamento, e em quanto tempo depois da instalação?",
          en: "What capacity, cost or revenue changes with this equipment, and how long after installation?",
        },
        example: {pt: "Ex.: substitui terceirização de corte, economia de R$ 95 mil/mês a partir do segundo mês.", en: "e.g. replaces outsourced cutting, saving R$ 95k/month from the second month."},
        rationale: {
          pt: "É o que responde se o ativo se paga sozinho ou se a operação depende do resto da empresa — e é a diferença entre financiar um ativo e financiar um balanço.",
          en: "It answers whether the asset pays for itself or the operation leans on the rest of the company — the difference between financing an asset and financing a balance sheet.",
        },
      },
      {
        id: "equipment_appraisal",
    purposes: ["structure"],
        level: "ideal",
        satisfiedBy: ["appraisal_report"],
        singleDocument: false,
        labels: {pt: "Laudo e mercado secundário do equipamento", en: "Equipment appraisal and secondary market"},
        rationale: {
          pt: "A garantia é o próprio ativo. Equipamento sem mercado secundário é garantia que não se executa.",
          en: "The collateral is the asset itself. Equipment with no secondary market is collateral that cannot be enforced.",
        },
      },
      {
        id: "insurance",
    purposes: ["structure"],
        level: "ideal",
        satisfiedBy: ["insurance_policy"],
        singleDocument: false,
        labels: {pt: "Apólice de seguro com endosso ao credor", en: "Insurance policy endorsed to the creditor"},
        rationale: {
          pt: "Ativo financiado que se perde sem seguro endossado transforma garantia real em risco de crédito puro.",
          en: "A financed asset lost without endorsed insurance turns real collateral into pure credit risk.",
        },
      },
    ],
    focus: [
      {
        id: "asset_pays_itself",
        labels: {pt: "O ativo se paga", en: "The asset pays for itself"},
        question: {
          pt: "A produtividade incremental do equipamento cobre a parcela, ou a operação depende do resto da empresa?",
          en: "Does the equipment's incremental productivity cover the instalment, or does the operation depend on the rest of the company?",
        },
        evidence: ["projections.{period}.ebitda", "project.investments.{i}.amount", "projections.{period}.dscr"],
      },
      {
        id: "life_vs_tenor",
        labels: {pt: "Vida útil contra prazo", en: "Useful life against tenor"},
        question: {
          pt: "O prazo da dívida termina antes da vida útil do ativo, com folga?",
          en: "Does the debt mature comfortably before the asset's useful life ends?",
        },
        evidence: ["historical_financials.{period}.d_and_a", "collateral.assets.{i}.appraisal_value"],
      },
    ],
    risks: [
      {
        id: "tenor_beyond_life",
        severity: "critical",
        labels: {pt: "Prazo maior que a vida útil", en: "Tenor beyond useful life"},
        test: {
          pt: "Prazo proposto contra a taxa de depreciação praticada pela empresa para ativos da mesma classe.",
          en: "Proposed tenor against the depreciation rate the company applies to assets of the same class.",
        },
      },
      {
        id: "no_secondary_market",
        severity: "high",
        labels: {pt: "Ativo sem mercado secundário", en: "Asset with no secondary market"},
        test: {
          pt: "Laudo com referência de revenda e histórico de negociação de equipamentos equivalentes.",
          en: "Appraisal with resale reference and trading history for equivalent equipment.",
        },
      },
      {
        id: "already_encumbered",
        severity: "high",
        labels: {pt: "Equipamento já alienado", en: "Equipment already pledged"},
        test: {
          pt: "Inventário de garantias e gravames declarados no mapa de dívida.",
          en: "Collateral inventory and liens declared in the debt schedule.",
        },
      },
    ],
    structure: {
      tenorMonths: {typical: [24, 60], outer: [12, 84]},
      leverageCeiling: "3.0",
      minimumDscr: "1.25",
      gracePeriodMonths: {typical: [3, 12]},
      amortization: ["sac", "price", "parcelas sazonais quando a produção é sazonal"],
      collateral: [
        "alienação fiduciária do próprio equipamento",
        "seguro endossado ao credor",
        "aval dos controladores",
      ],
      covenants: [
        "manutenção e seguro do ativo",
        "restrição a alienação ou transferência do equipamento",
        "dívida líquida / EBITDA",
      ],
      notes: {
        pt: "Prazo limitado pela vida útil e carência limitada pelo prazo de entrega e instalação. Um ativo que ainda não chegou não gera parcela.",
        en: "Tenor capped by useful life, grace capped by delivery and installation. An asset that has not arrived generates no instalment.",
      },
    },
    questions: [
      {id: "delivery_date", focusId: "asset_pays_itself", materiality: "material", labels: {pt: "Qual o prazo de entrega e instalação até o equipamento entrar em operação?", en: "What is the delivery and installation lead time until the equipment is operating?"}},
      {id: "existing_fleet", focusId: "life_vs_tenor", materiality: "supporting", labels: {pt: "Qual a idade média e a taxa de depreciação da frota ou do parque atual?", en: "What is the average age and depreciation rate of the current fleet or plant?"}},
    ],
  },

  {
    id: "other",
    labels: {pt: "Outra operação", en: "Other operation"},
    description: {
      pt: "Operação que não se encaixa nos arquétipos acima. O desk pede o mínimo comum e pergunta o resto.",
      en: "An operation that does not fit the archetypes above. The desk asks for the common minimum and asks about the rest.",
    },
    requirements: [...commonMinimum, ...commonIdeal, ...commonInformation],
    focus: [
      {
        id: "generation_vs_service",
        labels: {pt: "Geração contra serviço da dívida", en: "Generation against debt service"},
        question: {
          pt: "A geração histórica cobre o serviço da dívida proposto, sem depender de crescimento?",
          en: "Does historical generation cover the proposed debt service, without depending on growth?",
        },
        evidence: ["historical_financials.{period}.cfo", "historical_financials.{period}.ebitda", "debt.total_gross"],
      },
    ],
    risks: [
      {
        id: "purpose_unclear",
        severity: "high",
        labels: {pt: "Uso dos recursos indefinido", en: "Use of proceeds unclear"},
        test: {
          pt: "Carta de pedido e materiais: uso dos recursos declarado, com valores por destinação.",
          en: "Request letter and materials: declared use of proceeds, with amounts per destination.",
        },
      },
    ],
    structure: {
      tenorMonths: {typical: [24, 60], outer: [12, 120]},
      leverageCeiling: "2.5",
      minimumDscr: "1.30",
      gracePeriodMonths: {typical: [0, 12]},
      amortization: ["a definir com o uso dos recursos"],
      collateral: ["a definir com os ativos disponíveis"],
      covenants: ["dívida líquida / EBITDA", "DSCR mínimo"],
      notes: {
        pt: "Sem arquétipo definido, a primeira entrega do desk é enquadrar a operação — não estruturá-la.",
        en: "With no archetype settled, the desk's first deliverable is to frame the operation, not to structure it.",
      },
    },
    questions: [
      {id: "purpose_detail", focusId: "generation_vs_service", materiality: "material", labels: {pt: "Qual o uso dos recursos, com valores por destinação?", en: "What is the use of proceeds, with amounts per destination?"}},
    ],
  },
];

export const archetypeMap: ReadonlyMap<string, Archetype> = new Map(archetypes.map((a) => [a.id, a]));

export function archetype(id: string): Archetype {
  const found = archetypeMap.get(id);
  if (!found) throw new Error(`unknown archetype: ${id}`);
  return found;
}
