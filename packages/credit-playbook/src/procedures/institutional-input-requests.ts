/** Canonical requests for the annual institutional model's declared input needs.
 * This catalog neither supplies financial premises nor certifies a sector method.
 */
export const institutionalInputRequestCatalogVersion = "2026.09.10-v1";
export type InstitutionalInputRequestTopic = "scope"|"history"|"historical_resolution"|"forecast"|"debt";
export type InstitutionalInputRequestCopy = {
  question:string;whyItMatters:string;decisionImpact:string;acceptableEvidence:readonly string[];
};
type Entry = {
  category:"historical_document"|"forecast_premise"|"scope_confirmation";
  answerKind:"document"|"text";
  pt:InstitutionalInputRequestCopy;
  en:InstitutionalInputRequestCopy;
};
export const institutionalInputRequestCatalog:Readonly<Record<InstitutionalInputRequestTopic,Entry>>={
  scope:{category:"scope_confirmation",answerKind:"text",
    pt:{question:"Qual companhia ou unidade devemos modelar, quais empresas entram no perímetro e qual é o ano-base? Confirme também a moeda, a escala dos valores e os anos que deseja projetar.",whyItMatters:"Balanço, resultados e dívida precisam se referir ao mesmo perímetro e a períodos compatíveis.",decisionImpact:"Define quais informações podem ser combinadas e evita misturar empresas, valores em milhares e unidades ou períodos incompletos.",acceptableEvidence:["Organograma e indicação do perímetro","Demonstrações com moeda e escala informadas","Confirmação do ano-base e horizonte"]},
    en:{question:"Which company or business unit should we model, which entities belong in its scope, and what is the base year? Also confirm the currency, amount scale and forecast years.",whyItMatters:"The balance sheet, earnings and debt need to refer to the same scope and compatible periods.",decisionImpact:"Determines which information can be combined and prevents mixing entities, thousands with units, or incomplete periods.",acceptableEvidence:["Organization chart and stated perimeter","Statements showing currency and scale","Confirmed base year and forecast horizon"]}},
  history:{category:"historical_document",answerKind:"document",
    pt:{question:"Indique as demonstrações do ano-base já enviadas, com balanço, resultado, fluxo de caixa e notas, ou envie-as se ainda não estiverem no projeto. Precisamos do detalhamento dos saldos e das receitas e custos que sustentarão o modelo, incluindo saldos fiscais quando aplicáveis.",whyItMatters:"O modelo parte de valores históricos reconciliados; a falta de uma conta não significa saldo zero.",decisionImpact:"Permite fechar a posição inicial e separar caixa, dívida, ativos, obrigações e patrimônio antes de projetar.",acceptableEvidence:["Demonstrações financeiras e notas explicativas","Balancete e conciliação das contas","Detalhamento de receitas, custos e saldos fiscais"]},
    en:{question:"Identify the base-year financial statements already provided, including the balance sheet, income statement, cash flow statement and notes, or upload them if they are not yet in the project. We need the account, revenue and cost detail supporting the model, including tax balances where applicable.",whyItMatters:"The model starts from reconciled historical amounts; a missing account does not mean a zero balance.",decisionImpact:"Establishes the opening position and separates cash, debt, assets, obligations and equity before forecasting.",acceptableEvidence:["Financial statements and notes","Trial balance and account reconciliation","Revenue, cost and tax balance detail"]}},
  historical_resolution:{category:"historical_document",answerKind:"document",
    pt:{question:"Há dados históricos pendentes de conciliação ou sem suporte suficiente. Pode enviar a versão aplicável das demonstrações e a conciliação que explica eventuais diferenças?",whyItMatters:"Uma divergência precisa ser explicada antes de o valor alimentar a projeção.",decisionImpact:"Evita escolher automaticamente entre valores conflitantes ou usar uma estimativa como histórico confirmado.",acceptableEvidence:["Demonstrações aplicáveis ao período","Conciliação das diferenças","Nota explicativa ou confirmação documentada da companhia"]},
    en:{question:"Some historical information needs reconciliation or additional support. Can you provide the applicable financial statements and a reconciliation explaining any differences?",whyItMatters:"A difference needs to be explained before the amount enters the forecast.",decisionImpact:"Avoids automatically selecting between conflicting amounts or treating an estimate as confirmed history.",acceptableEvidence:["Statements applicable to the period","Reconciliation of differences","Explanatory note or documented company confirmation"]}},
  forecast:{category:"forecast_premise",answerKind:"document",
    pt:{question:"Indique o orçamento ou plano operacional já enviado, ou envie-o se ainda não estiver no projeto, com premissas anuais de receitas, custos, capital de giro, investimentos, tributos, distribuições e caixa mínimo? Se não houver, indique o que já foi definido para construirmos as premissas restantes com você.",whyItMatters:"As projeções dependem de premissas explícitas, com unidade, período e justificativa; não preenchemos o que falta com zero.",decisionImpact:"Define o cenário a calcular e deixa visível o que veio da companhia e o que ainda precisa ser discutido.",acceptableEvidence:["Orçamento ou plano operacional","Planilha de premissas por ano","Explicação das premissas já definidas e das pendências"]},
    en:{question:"Identify the budget or operating plan already provided, or upload it if it is not yet in the project, with annual assumptions for revenue, costs, working capital, investment, taxes, distributions and minimum cash? If none exists, tell us what has been decided so we can develop the remaining assumptions with you.",whyItMatters:"Forecasts require explicit assumptions with units, periods and rationale; missing inputs are not filled with zeros.",decisionImpact:"Defines the scenario to calculate and makes clear which assumptions came from the company and which still need discussion.",acceptableEvidence:["Budget or operating plan","Annual assumption schedule","Explanation of agreed assumptions and open points"]}},
  debt:{category:"forecast_premise",answerKind:"document",
    pt:{question:"Indique o mapa de dívida e os contratos já enviados, com saldos, taxas, indexadores, amortizações e liberações previstas, ou envie-os se ainda não estiverem no projeto. Para operações ainda propostas, separe os termos confirmados das premissas que deseja testar.",whyItMatters:"Cada instrumento precisa de um cronograma próprio; parcelas ou novas liberações não informadas não podem ser presumidas como zero.",decisionImpact:"Permite projetar serviço da dívida e caixa sem confundir dívida existente com alternativas ainda em discussão.",acceptableEvidence:["Mapa de endividamento na data-base","Contratos e aditivos","Cronogramas e termos indicativos de alternativas"]},
    en:{question:"Identify the debt schedule and agreements already provided, with balances, rates, indexers, repayments and planned drawdowns, or upload them if they are not yet in the project. For proposed transactions, separate confirmed terms from assumptions you want to test.",whyItMatters:"Each instrument requires its own schedule; undisclosed repayments or drawdowns cannot be assumed to be zero.",decisionImpact:"Supports debt-service and cash projections without confusing existing debt with alternatives still under discussion.",acceptableEvidence:["Debt schedule at the base date","Agreements and amendments","Repayment schedules and indicative alternative terms"]}},
};

/** Labels for unresolved slots, never interpolated technical paths or source identifiers. */
export const institutionalInputTargetLabels:Readonly<Record<string,{pt:string;en:string}>>={
  unrestrictedCash:{pt:"caixa disponível",en:"unrestricted cash"},restrictedCash:{pt:"caixa restrito",en:"restricted cash"},
  receivables:{pt:"contas a receber",en:"receivables"},inventory:{pt:"estoques",en:"inventory"},
  otherCurrentAssets:{pt:"outros ativos circulantes",en:"other current assets"},netPpe:{pt:"imobilizado líquido",en:"net property, plant and equipment"},
  otherAssets:{pt:"outros ativos",en:"other assets"},payables:{pt:"fornecedores",en:"payables"},
  otherCurrentLiabilities:{pt:"outros passivos circulantes",en:"other current liabilities"},grossDebt:{pt:"dívida bruta",en:"gross debt"},
  otherLiabilities:{pt:"outros passivos",en:"other liabilities"},equity:{pt:"patrimônio líquido",en:"equity"},
  baseRevenue:{pt:"receita histórica",en:"historical revenue"},baseCost:{pt:"custos históricos",en:"historical costs"},
  openingTaxLossCarryforward:{pt:"saldo de prejuízos fiscais",en:"tax loss carryforward"},
  openingDisallowedInterestCarryforward:{pt:"saldo de juros não deduzidos",en:"disallowed interest carryforward"},
  workingCapital:{pt:"premissas de capital de giro",en:"working capital assumptions"},
  cashAndDepreciation:{pt:"premissas de caixa, distribuições e depreciação",en:"cash, distribution and depreciation assumptions"},
  workingCapitalAndTax:{pt:"premissas de capital de giro e tributos",en:"working capital and tax assumptions"},
  covenants:{pt:"limites contratuais",en:"contractual thresholds"},
};

export const institutionalAssumptionAnswerCopy={
  pt:{questionPrefix:"Qual valor deseja testar para",questionSuffix:"Informe apenas o número, sem separador de milhares.",why:"Esta é uma premissa de cenário, separada dos valores históricos e sujeita à revisão antes de uso.",impact:"Atualiza somente a premissa e o ano indicados. A resposta não substitui documentos nem aprova o modelo.",evidence:"Resposta explícita para esta premissa",scenarioName:"Cenário proposto pelo usuário",rationale:"Valor informado pelo usuário para teste de cenário; ainda sujeito à revisão."},
  en:{questionPrefix:"What value would you like to test for",questionSuffix:"Enter only the number, without thousands separators.",why:"This is a scenario assumption, separate from historical amounts and subject to review before use.",impact:"Updates only the named assumption and year. The answer does not replace documents or approve the model.",evidence:"Explicit answer for this assumption",scenarioName:"User-proposed scenario",rationale:"User-supplied value for scenario testing; still subject to review."},
} as const;
export const institutionalAssumptionUnitLabels={
  currency:{pt:"unidades monetárias",en:"currency units"},percent:{pt:"por cento",en:"percent"},days:{pt:"dias",en:"days"},multiple:{pt:"vezes",en:"times"},quantity:{pt:"quantidade",en:"quantity"},index:{pt:"índice",en:"index"},
} as const;
