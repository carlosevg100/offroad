/** The closed library of texts a board discussion can show. A contribution never writes text: it picks a
 * template by id and binds each slot to a registered reading, a deadline of a deliberation, or nothing when the
 * template has no slot. Every text here is fixed and reviewed; numbers, units, scales, currencies, periodicity and
 * dates enter only through the formatter's markers in the slots.
 *
 * Each slot is a concept, not a dimension: it names the exact origin it admits (method and registered path, with
 * the scenario, case, row or period written literally or as a variable shared with other slots), the year it
 * shows, or the deliberation action whose deadline it carries. Each template declares the conditions its fixed
 * text asserts (sign, comparison between slots, comparison with the source, the only path inside the gates, the
 * year of largest maturity), checked against the bound readings; a template is used only in the fields it is
 * written for, and a deliberation's texts belong to that deliberation.
 *
 * Slot syntax in a text: `{slot}` for a value, a label, a yes-no reading or a deadline; `{em:slot}`, `{ate:slot}`,
 * `{desde:slot}`, `{para:slot}`, `{fim:slot}`, `{de:slot}` or `{a:slot}` for a date or a year, written by the
 * formatter with that preposition. `{count:deliberations}` and `{count:dated}` are counted by the method. */
export const boardSlotTypes = ["money", "rate", "multiple", "years", "months", "bps", "count", "date", "label", "flag", "deadline", "informed"] as const;
export type BoardSlotType = (typeof boardSlotTypes)[number];
/** Who may be named as the author of an informed fact. */
export const boardInformedAuthors = ["chair", "cfo", "ceo"] as const;
export const boardTextUses = ["delib.title", "delib.subject", "delib.recommendation", "delib.action", "page.title", "page.line", "page.recommendation", "page.option",
  "summary.opening", "summary.closing", "appendix", "question", "answer", "topic", "note", "requester", "authority"] as const;
export type BoardTextUse = (typeof boardTextUses)[number];

/** A slot: its type and the one concept it admits. `from` lists the admissible [method, path] (selectors literal or
 * `$var`); `year` admits a year reading whose value matches (literal or `$var`); `action` is the deliberation action
 * a deadline slot announces. */
export type BoardSlotSpec = {type: BoardSlotType; from?: readonly (readonly [string, string])[]; year?: string; action?: string;
  /** The registered concept the field must carry (receivables: balance, capacity, program volume and sublimit differ). */
  concept?: string;
  /** For an informed fact: the person the template attributes it to; the fact must be adopted as informed by that person. */
  author?: (typeof boardInformedAuthors)[number];
  /** For a label: the generic words shown when the source name is not an entry of the closed name dictionary. */
  generic?: string};
/** An operand of a condition: a bound slot's source value, a literal (variables written as `$name` substituted), a
 * shared variable or a field of the source (`at`: [method, path], variables substituted); `year` compares the first
 * four characters. */
export type BoardOperand = {slot: string; year?: true} | {value: string} | {var: string} | {at: readonly [string, string]; year?: true}
  /** An adopted term the result records among its contributions, by the end of its field path (a contract clause). */
  | {contributed: readonly [string, string]};
export type BoardComparison = "lt" | "le" | "gt" | "ge" | "eq" | "ne" | "prefix";
/** Every condition may name the material assertion of the fixed text it sustains; the library is swept by these. */
export type BoardCondition = BoardConditionBody & {claim?: string};
type BoardConditionBody =
  | {compare: readonly [BoardOperand, BoardComparison, BoardOperand]}
  /** Every element of a list of the source: its field compared with the operand. */
  | {every: readonly [string, string, string]; op: BoardComparison; than: BoardOperand}
  /** The elements of a list whose flag is true are exactly one, and its key equals the operand. */
  | {onlyFlagged: readonly [string, string, string, string]; equals: BoardOperand}
  /** The element of a list with the largest value has its key equal to the operand. */
  | {largest: readonly [string, string, string, string]; equals: BoardOperand}
  /** Binds a variable to a field of the source, for the conditions after it. */
  | {bind: string; to: BoardOperand}
  /** A list of the source (or a field of each element) contains the operand; `only` requires it to be the single element. */
  | {includes: readonly [string, string, string | null]; value: BoardOperand; only?: true; none?: true}
  /** A list of the source has at least this many elements. */
  | {atLeast: readonly [string, string]; count: number};
export type BoardTemplate = {text: string; slots: Record<string, BoardSlotSpec>; use: readonly BoardTextUse[]; when: readonly BoardCondition[];
  /** For a deliberation's texts: the title template of the deliberation they belong to. */
  of?: string;
  /** For an answer: the question template it answers. */
  answers?: string};

const DT = "build-company-debt-table", CV = "measure-covenant-headroom", WC = "project-weekly-cash", IP = "analyze-investment-project",
  OP = "build-operating-projection", PC = "challenge-financial-projection", RF = "monetize-receivables-for-working-capital", RC = "analyze-relative-debt-cost",
  FP = "evaluate-financing-paths";
const s = (type: BoardSlotType, method: string, path: string): BoardSlotSpec => ({type, from: [[method, path]]});
const yr = (year: string): BoardSlotSpec => ({type: "date", year});
const dl = (action: string): BoardSlotSpec => ({type: "deadline", action});
const op = (x: string): BoardOperand => /^-?\d+(?:\.\d+)?$/.test(x) ? {value: x} : /^\$[a-z]+$/.test(x) ? {var: x.slice(1)} : {slot: x};
const cmp = (a: string | BoardOperand, how: BoardComparison, b: string | BoardOperand): BoardCondition => ({compare: [typeof a === "string" ? op(a) : a, how, typeof b === "string" ? op(b) : b]});
const at = (method: string, path: string, year?: true): BoardOperand => year ? {at: [method, path], year} : {at: [method, path]};
type Extra = {when?: BoardCondition[]; of?: string; answers?: string};
/** Names the material assertion a condition sustains. */
const claim = (text: string, ...conditions: BoardCondition[]): BoardCondition[] => conditions.map((c) => ({...c, claim: text}));
const has = (method: string, list: string, field: string | null, value: string): BoardCondition => ({includes: [method, list, field], value: {value}});
const lacks = (method: string, list: string, field: string | null, value: string | BoardOperand): BoardCondition =>
  ({includes: [method, list, field], value: typeof value === "string" ? {value} : value, none: true});
const t = (use: BoardTextUse | BoardTextUse[], text: string, slots: Record<string, BoardSlotSpec> = {}, extra: Extra = {}): BoardTemplate =>
  ({text, slots, use: Array.isArray(use) ? use : [use], when: extra.when ?? [], ...extra.of ? {of: extra.of} : {}, ...extra.answers ? {answers: extra.answers} : {}});

// Shared concepts, each with the assertion it sustains.
const maturityYear: BoardCondition = {largest: [DT, "result.table.profile.scheduleByYear", "principal", "year"], equals: {slot: "ano"}, claim: "o ano mostrado é o de maior vencimento de principal"};
const horizonYear: BoardCondition = {...cmp("ano", "eq", at(FP, "readings.horizon.lastPeriodEnd", true)), claim: "o ano mostrado é o fim do horizonte do plano"};
const tightBelowMinimum: BoardCondition = {...cmp(at(WC, "readings.tightestWeek.belowMinimum"), "eq", {value: "true"}), claim: "o caixa fica abaixo do mínimo na semana mais apertada"};
const allBelowPolicy: BoardCondition = {every: [CV, "result.headroom.measurements", "ratio"], op: "lt", than: {slot: "politica"}, claim: "todas as medições ficam abaixo da política"};
const adverseYear: BoardCondition = {...cmp("ano", "eq", at(CV, "result.headroom.measurements[id=dez27-adverso].date", true)), claim: "o ano é o da medição adversa"};
const policyIsBoard = claim("a política é do conselho e está em vigor", cmp(at(CV, "result.headroom.limits[id=politica].kind"), "eq", {value: "board_policy"}),
  cmp(at(CV, "result.headroom.limits[id=politica].status"), "eq", {value: "in_force"}));
const policyUndefined = claim("a política adotada não registra definição de EBITDA (questão aberta do resultado do covenant)",
  has(CV, "result.openQuestions", "limitId", "politica"), has(CV, "result.openQuestions", "question", "ebitda_definition_not_written"));
/** Each cause a sensitivity names is the operand that case changes against the base, in the direction said. */
const caseField = (caseId: string, period: string, field: string) => at(IP, `cases[id=${caseId}].result.project.rows[periodId=${period}].${field}`);
const smallerEconomy = claim("economia menor: o EBITDA incremental em regime do caso é menor que o da base, com a mesma carga",
  cmp(caseField("economy-4", "2028-12-31", "incrementalEbitda"), "lt", caseField("base", "2028-12-31", "incrementalEbitda")),
  cmp(caseField("economy-4", "2028-12-31", "operands.loadYearFraction"), "eq", caseField("base", "2028-12-31", "operands.loadYearFraction")));
const largerCapex = claim("capex maior: o capex de expansão do caso supera o da base",
  cmp(caseField("capex-120", "2026-12-31", "operands.growthCapexPaid"), "gt", caseField("base", "2026-12-31", "operands.growthCapexPaid")));
const slowerStart = claim("partida mais lenta: a fração do ano em operação do caso é menor que a da base",
  cmp(caseField("slower-start", "2027-12-31", "operands.activeYearFraction"), "lt", caseField("base", "2027-12-31", "operands.activeYearFraction")));
const deferral = claim("adiar: o caso desembolsa depois e opera depois da base",
  cmp(caseField("defer-12", "2026-12-31", "operands.growthCapexPaid"), "lt", caseField("base", "2026-12-31", "operands.growthCapexPaid")),
  cmp(caseField("defer-12", "2027-12-31", "operands.activeYearFraction"), "lt", caseField("base", "2027-12-31", "operands.activeYearFraction")));
const bankFallback = claim("o plano alternativo do resultado é um alongamento bancário (CCB de alongamento) que exige anuência",
  {bind: "alt", to: at(FP, "readings.alternative.pathId")}, has(FP, "result.evaluation.paths[id=$alt].instrumentIds", null, "ccb-alongamento"),
  cmp(at(FP, "readings.paths[id=$alt].consentRequired"), "eq", {value: "true"}));
const longIsDebenture = claim("o instrumento longo recomendado é uma debênture", cmp(at(FP, "readings.recommendation.longInstrument.id"), "prefix", {value: "debenture"}));
const overdraft = claim("há conta garantida com limite livre", has(DT, "result.table.creditLines", "id", "conta-garantida"),
  cmp(at(DT, "result.table.creditLines[id=conta-garantida].unused"), "gt", {value: "0"}));
const programsAB = claim("o plano começa pelos programas das redes B e A, sem dívida bancária nova",
  cmp(at(RF, "result.funding.plan.steps[0].optionId"), "eq", {value: "risco-sacado-b"}), cmp(at(RF, "result.funding.plan.steps[1].optionId"), "eq", {value: "risco-sacado-a"}),
  cmp(at(RF, "readings.options[id=risco-sacado-a].measuredDebtAdded"), "eq", {value: "0"}), cmp(at(RF, "readings.options[id=risco-sacado-b].measuredDebtAdded"), "eq", {value: "0"}));
const bankReserve = claim("a linha bancária fica só como reserva", cmp(at(RF, "result.funding.plan.reserve"), "eq", at(RF, "result.funding.bankLine")),
  lacks(RF, "result.funding.plan.steps", "optionId", at(RF, "result.funding.bankLine")));
const L = "readings.recommendation.longInstrument.";
const issue = s("money", FP, L + "issueTarget"), term = s("years", FP, L + "termYears");
const policy = s("multiple", CV, "result.headroom.limits[id=politica].maximumRatio"), covenant = s("multiple", CV, "result.headroom.limits[id=aditamento].maximumRatio");
const metric = (type: BoardSlotType, caseId: string, field: string) => s(type, IP, `comparison.metrics[caseId=${caseId}].${field}`);
const measurement = (type: BoardSlotType, id: string, field: string) => s(type, CV, `result.headroom.measurements[id=${id}].${field}`);
const tightWeek = s("date", WC, "readings.tightestWeek.weekStart");
/** A receivables field by its registered concept: balance, capacity, program volume and sublimit never stand for one another. */
const rf = (type: BoardSlotType, path: string, concept: string): BoardSlotSpec => ({type, from: [[RF, path]], concept});
const negative = (...slots: string[]) => claim("cada valor é negativo", ...slots.map((x) => cmp(x, "lt", "0")));
/** The creditor of one row of the debt table, by its registered creditor field; the fixed text never names it. */
const creditorOf = (row: string, generic = "credor sem nome confirmado"): BoardSlotSpec => ({type: "label", from: [[DT, `result.table.rows[id=${row}].creditor`]], generic});
/** The obligation the plan prepays is the row whose creditor is shown. */
const prepaidIn = (path: string): BoardCondition => ({includes: [FP, `result.evaluation.paths[id=${path}].prepayments`, "instrumentId"], value: {var: "i"}, claim: "o caminho pré-paga a dívida da linha nomeada"});
/** The plan carries the amended version of the row (its id followed by -aditada) in place of the original. */
const amendedIn = (path: string): BoardCondition[] => [{includes: [FP, `result.evaluation.paths[id=${path}].instrumentIds`, null], value: {value: "$i-aditada"},
  claim: "o caminho alonga a dívida da linha nomeada (versão aditada)"}];
const variant = (id: string, v: string) => claim("o caminho tem a variante do projeto que o nome diz", cmp(at(FP, `result.evaluation.paths[id=${id}].projectVariantId`), "eq", {value: v}));
/** The path rows share one sentence; only the reviewed name of the path changes, every slot reads that path, and the name is sustained by the path's fields. */
const pathRow = (name: string, id: string, named: BoardCondition[], creditor = false) => {
  const p = `readings.paths[id=${id}].`;
  return t("page.line", `${name}: caixa mínimo de {caixa}; alavancagem de {alavancagem}; custo de {custo}; dívida líquida {em:ano} de {divida}; nos critérios: {criterios}; anuência: {anuencia}.`,
    {...creditor ? {credor: creditorOf("$i")} : {}, caixa: s("money", FP, p + "minimumCash.amount"), alavancagem: s("multiple", FP, p + "worstLeverage"),
      custo: s("money", FP, p + "horizonFinancingCost"), ano: yr("$y"), divida: s("money", FP, p + "netDebtAtHorizon"), criterios: s("flag", FP, p + "eligible"),
      anuencia: s("flag", FP, p + "consentRequired")}, {when: [horizonYear, ...named]});
};
const instrument = (id: string, has_: string, what: string) => claim(what, has(FP, `result.evaluation.paths[id=${id}].instrumentIds`, null, has_));

export const boardTemplates: Record<string, BoardTemplate> = {
  // Deliberations: title, subject, recommendation and dated actions, each bound to its deliberation.
  "delib.packaging_line": t("delib.title", "Linha de embalagem"),
  "delib.packaging_line.subject": t("delib.subject", "decidir o caminho da linha de embalagem", {}, {of: "delib.packaging_line"}),
  "delib.packaging_line.wait": t("delib.recommendation", "não emitir o pedido de compra até as cotações firmes", {}, {of: "delib.packaging_line",
    when: [...claim("esperar as cotações e adiar a linha tem VPL maior que seguir agora", cmp(at(IP, "comparison.metrics[caseId=defer-12].netPresentValue"), "gt", at(IP, "comparison.metrics[caseId=base].netPresentValue"))), ...deferral]}),
  "delib.crop": t("delib.title", "Safra {de:ano}", {ano: yr("$y")}, {when: claim("o ano é o do aperto de caixa da safra", cmp("ano", "eq", at(WC, "readings.tightestWeek.weekStart", true)))}),
  "delib.crop.subject": t("delib.subject", "decidir o financiamento da safra {de:ano}", {ano: yr("$y")},
    {of: "delib.crop", when: claim("o ano é o do aperto de caixa da safra", cmp("ano", "eq", at(WC, "readings.tightestWeek.weekStart", true)))}),
  "delib.crop.programs": t("delib.recommendation", "financiar a safra pelos programas de antecipação das redes A e B, com a conta garantida para o aperto do fim da safra e a linha bancária só como reserva",
    {}, {of: "delib.crop", when: [...programsAB, ...overdraft, ...bankReserve]}),
  "delib.maturities": t("delib.title", "Vencimentos {de:ano}", {ano: yr("$y")}, {when: [maturityYear]}),
  "delib.maturities.subject": t("delib.subject", "decidir a rota para os vencimentos {de:ano}", {ano: yr("$y")}, {of: "delib.maturities", when: [maturityYear]}),
  "delib.maturities.sounding": t("delib.recommendation", "autorizar a sondagem de uma debênture de até {valor}, com prazo de {prazo}, tendo o alongamento bancário como plano alternativo",
    {valor: issue, prazo: term}, {of: "delib.maturities", when: [...longIsDebenture, ...bankFallback]}),
  "delib.policy": t("delib.title", "Política de endividamento"),
  "delib.policy.definition": t("delib.subject", "definir qual EBITDA mede o limite de {limite}", {limite: policy}, {of: "delib.policy", when: [...policyIsBoard, ...policyUndefined]}),
  "delib.action.supplier_notice": t("delib.action", "enviar ao fornecedor atual o aviso para renegociar o contrato", {}, {of: "delib.packaging_line"}),
  "delib.action.join_programs": t("delib.action", "aderir aos programas", {}, {of: "delib.crop"}),
  "delib.action.finish_sounding": t("delib.action", "concluir a sondagem", {}, {of: "delib.maturities"}),
  "delib.action.decide_route": t("delib.action", "decidir a rota", {}, {of: "delib.maturities"}),
  // Pages: titles and lines.
  "page.decisions": t("page.title", "Pedimos {count:deliberations} decisões; {count:dated} têm prazo"),
  "situation.debt_total": t("page.title", "A dívida é de {total}, concentrada {em:ano}", {total: s("money", DT, "result.table.reconciliation.principal"), ano: yr("$y")}, {when: [maturityYear]}),
  "situation.debt_maturity": t("page.line", "{principal} de principal vencem {em:ano}; {parcela} da dívida vence {ate:horizonte}.",
    {principal: s("money", DT, "result.table.profile.scheduleByYear[year=$y].principal"), ano: yr("$y"), parcela: s("rate", DT, "result.table.profile.dueWithinTwelveMonthsShare"),
      horizonte: s("date", DT, "result.table.profile.twelveMonthHorizon")}),
  "situation.debt_profile": t("page.line", "Prazo médio de {prazo}; maior credor: {credor}, com {participacao} da dívida.",
    {prazo: s("years", DT, "result.table.profile.weightedAverageLifeYears"), credor: {type: "label", from: [[DT, "result.table.profile.largestCreditor.creditor"]], generic: "sem nome confirmado"},
      participacao: s("rate", DT, "result.table.profile.largestCreditor.share")}),
  "situation.cash_shortfall": t("page.title", "Sem ação, o caixa fica abaixo do mínimo {em:semana} e chega a {saldo} {fim:ano}",
    {semana: tightWeek, saldo: s("money", FP, "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=$y-12-31].closingAvailable"), ano: yr("$y")},
    {when: [tightBelowMinimum, ...claim("sem ação é o caminho de manter e rolar", cmp(at(FP, "readings.paths[id=manter].role"), "eq", {value: "status_quo"}))]}),
  "situation.cash_without_line": t("page.line", "Sem a linha da safra, o caixa {em:semana} é de {saldo}, contra o mínimo de {minimo}.",
    {semana: s("date", WC, "readings.sensitivities[caseId=sem-linha].weekStart"), saldo: s("money", WC, "readings.sensitivities[caseId=sem-linha].minimum"),
      minimo: s("money", WC, "result.weekly.minimumCash")}, {when: claim("o caixa sem a linha fica abaixo do mínimo", cmp("saldo", "lt", "minimo"))}),
  "situation.debt_service": t("page.line", "Serviço da dívida {em:ano}: {servico}, contra {disponivel} de caixa disponível.",
    {ano: yr("$y"), servico: s("money", FP, "result.evaluation.paths[id=manter].debtServiceByYear[year=$y].service"),
      disponivel: s("money", FP, "result.evaluation.paths[id=manter].debtServiceByYear[year=$y].availableForService")},
    {when: claim("o serviço supera o caixa disponível", cmp("servico", "gt", "disponivel"))}),
  "constraint.indenture_basket": t("page.title", "A escritura da debênture deixa só {saldo} de exceção para garantias de nova dívida",
    {saldo: s("money", DT, "result.table.negativePledgeBaskets[holderId=debenture-1].remaining")},
    {when: claim("o saldo da exceção é menor que a exceção da escritura", cmp("saldo", "ge", "0"), cmp("saldo", "lt", at(DT, "result.table.negativePledgeBaskets[holderId=debenture-1].basket")))}),
  "constraint.basket_usage": t("page.line", "Exceção de {cesta} para garantias, com {ocupado} ocupados pelas garantias da dívida com {credor}.",
    {cesta: s("money", DT, "result.table.negativePledgeBaskets[holderId=debenture-1].basket"), ocupado: s("money", DT, "result.table.negativePledgeBaskets[holderId=debenture-1].occupied"),
      credor: creditorOf("$i")},
    {when: [...claim("o ocupado cabe na exceção", cmp("ocupado", "le", "cesta")),
      {includes: [DT, "result.table.negativePledgeBaskets[holderId=debenture-1].usedBy", null], value: {var: "i"}, only: true, claim: "só a dívida nomeada ocupa a exceção"}]}),
  "constraint.covenant_policy": t("page.line", "Covenant de {covenant} na escritura; política do conselho de {politica}.", {covenant, politica: policy},
    {when: [...claim("o covenant é contratual e está em vigor", cmp(at(CV, "result.headroom.limits[id=aditamento].kind"), "eq", {value: "contractual"}),
      cmp(at(CV, "result.headroom.limits[id=aditamento].status"), "eq", {value: "in_force"})), ...policyIsBoard]}),
  "topic.project_return": t("page.title", "A linha de embalagem rende {retorno}, acima do custo de capital de {custo}",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate")}, {when: claim("o retorno supera o custo de capital", cmp("retorno", "gt", "custo"))}),
  "topic.project_value": t("page.line", "Retorno de {retorno} contra custo de capital de {custo}; VPL de {vpl}.",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate"), vpl: metric("money", "base", "netPresentValue")}),
  "topic.project_payback": t("page.line", "Payback de cerca de {payback}; o fluxo acumulado do projeto chega a {pico} {em:data}.",
    {payback: metric("years", "base", "paybackYears"), pico: metric("money", "base", "peakCumulativeCashNeed.amount"), data: metric("date", "base", "peakCumulativeCashNeed.periodEndDate")}),
  "topic.project_sensitivities": t("page.line", "O VPL fica negativo em cada sensibilidade: economia menor, {vpl_economia}; capex maior, {vpl_capex}; partida mais lenta, {vpl_partida}.",
    {vpl_economia: metric("money", "economy-4", "netPresentValue"), vpl_capex: metric("money", "capex-120", "netPresentValue"), vpl_partida: metric("money", "slower-start", "netPresentValue")},
    {when: [...negative("vpl_economia", "vpl_capex", "vpl_partida"), ...smallerEconomy, ...largerCapex, ...slowerStart]}),
  "topic.project_wait_quotes": t("page.recommendation", "Recomendamos pedir cotações firmes antes do pedido de compra; adiar a linha leva o VPL a {vpl} e o retorno a {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue"), retorno: metric("rate", "defer-12", "annualIrr")},
    {when: [...claim("adiar tem VPL maior que seguir agora", cmp("vpl", "gt", at(IP, "comparison.metrics[caseId=base].netPresentValue"))), ...deferral]}),
  "option.go_now": t("page.option", "Seguir agora: VPL de {vpl} e retorno de {retorno}.", {vpl: metric("money", "base", "netPresentValue"), retorno: metric("rate", "base", "annualIrr")}),
  "option.staged": t("page.option", "Seguir em etapas: VPL de {vpl}.", {vpl: metric("money", "staged", "netPresentValue")}),
  "option.wait_quotes": t("page.option", "Esperar as cotações e adiar a linha: VPL de {vpl} e retorno de {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue"), retorno: metric("rate", "defer-12", "annualIrr")}, {when: deferral}),
  // An informed fact, attributed: the chair's strategic reason, adopted as informed by the chair; never a financial conclusion.
  "topic.project_strategic_reason": t("page.line", "Motivo estratégico apresentado pelo presidente do conselho: {motivo}.", {motivo: {type: "informed", author: "chair"}}),
  "topic.crop_programs": t("page.title", "Os programas das redes A e B antecipam {valor} contra o pico de {pico} da safra, sem dívida bancária nova",
    {valor: rf("money", "readings.plan[optionId=risco-sacado-a].cumulative", "volume_antecipavel_acumulado_no_plano"),
      pico: rf("money", "result.funding.need.peak", "pico_da_necessidade_de_caixa")}, {when: programsAB}),
  "topic.crop_program_cost": t("page.line", "Custo indicativo dos programas: CDI mais {taxa_b} na rede B e CDI mais {taxa_a} na rede A.",
    {taxa_b: rf("rate", "readings.options[id=risco-sacado-b].spreadOverDi", "spread_sobre_cdi_do_programa"), taxa_a: rf("rate", "readings.options[id=risco-sacado-a].spreadOverDi", "spread_sobre_cdi_do_programa")},
    {when: claim("as condições dos dois programas são indicativas e sobre o CDI", ...["risco-sacado-a", "risco-sacado-b"].flatMap((x) => [
      cmp(at(RF, `result.funding.options[id=${x}].indicative`), "eq", {value: "true"}), cmp(at(RF, `result.funding.options[id=${x}].rates.basis`), "eq", {value: "di_plus"})]))}),
  "topic.crop_overdraft": t("page.line", "Conta garantida para o aperto de caixa {em:semana}.", {semana: tightWeek}, {when: [tightBelowMinimum, ...overdraft]}),
  "alternatives.count": t("page.title", "Avaliamos {caminhos} caminhos {para:ano}; só o recomendado passa em todos os critérios",
    {caminhos: s("count", FP, "readings.horizon.candidatePaths"), ano: yr("$y")},
    {when: [maturityYear, {onlyFlagged: [FP, "readings.paths", "eligible", "id"], equals: at(FP, "readings.recommendation.pathId"), claim: "só o caminho recomendado passa em todos os critérios"}]}),
  "alternatives.row.no_line_debenture": pathRow("Sem a linha agora, com giro e debênture nova", "sem-linha-debenture",
    [...variant("sem-linha-debenture", "sem-linha"), ...instrument("sem-linha-debenture", "debenture-80", "o caminho emite a debênture nova")]),
  "alternatives.row.defer_line": pathRow("Adiar a linha de embalagem", "adiar-linha", variant("adiar-linha", "adiar-12")),
  "alternatives.row.debenture_with_line": pathRow("Separar por uso e emitir debênture que substitui a atual e a dívida com {credor}", "debenture-com-linha",
    [...variant("debenture-com-linha", "seguir"), prepaidIn("debenture-com-linha"), ...claim("o caminho resgata a debênture atual", has(FP, "result.evaluation.paths[id=debenture-com-linha].prepayments", "instrumentId", "debenture-2021"))], true),
  "alternatives.row.keep_and_roll": pathRow("Manter e rolar no vencimento", "manter", claim("o caminho é o de manter", cmp(at(FP, "readings.paths[id=manter].role"), "eq", {value: "status_quo"}))),
  "alternatives.row.short_bank_loan": pathRow("CCB curta para safra e capex", "ccb-tres-anos", instrument("ccb-tres-anos", "ccb-tres-anos", "o caminho toma a CCB curta")),
  "alternatives.row.extend_with_bank": pathRow("Separar por uso e alongar com banco", "alongar-com-banco",
    [...variant("alongar-com-banco", "seguir"), ...instrument("alongar-com-banco", "ccb-alongamento", "o caminho alonga com CCB bancária")]),
  "alternatives.row.extend_bradesco": pathRow("Alongar só a dívida com {credor}", "alongar-bradesco", amendedIn("alongar-bradesco"), true),
  "recommendation.debenture": t("page.title", "Recomendamos sondar uma debênture de até {valor}, com prazo de {prazo}", {valor: issue, prazo: term}, {when: longIsDebenture}),
  "recommendation.debenture_cost": t("page.line", "Resgata a debênture atual e pré-paga a dívida com {credor}; custo efetivo entre CDI mais {baixo} e CDI mais {alto}.",
    {credor: creditorOf("$i"), baixo: s("rate", FP, L + "equivalentSpread"), alto: s("rate", FP, L + "equivalentSpreadAtCondition")},
    {when: [...claim("a faixa vai do menor ao maior custo", cmp("baixo", "le", "alto")), ...claim("as leituras de pré-pagamento são do caminho recomendado", {bind: "p", to: at(FP, "readings.recommendation.pathId")}), prepaidIn("$p"),
      ...claim("o caminho recomendado resgata a debênture atual", has(FP, "result.evaluation.paths[id=$p].prepayments", "instrumentId", "debenture-2021"))]}),
  "recommendation.amortization": t("page.line", "Amortização {de:inicio} {a:fim}.",
    {inicio: s("date", FP, L + "firstAmortizationYear"), fim: s("date", FP, L + "lastAmortizationYear")}, {when: claim("o início vem antes do fim", cmp("inicio", "le", "fim"))}),
  "recommendation.alternative": t("page.line", "Plano alternativo: alongamento bancário, com decisão até {prazo}.", {prazo: dl("delib.action.decide_route")}, {when: bankFallback}),
  "risk.leverage": t("page.title", "A alavancagem fica abaixo da política de {politica} nos cenários avaliados, com {adverso} no adverso {de:ano}",
    {politica: policy, adverso: measurement("multiple", "dez27-adverso", "ratio"), ano: yr("$y")}, {when: [allBelowPolicy, adverseYear]}),
  "risk.leverage_path": t("page.line", "A alavancagem fica em {inicio} {em:data_inicio} e cai para {fim} {em:data_fim}.",
    {inicio: measurement("multiple", "dez26-base", "ratio"), data_inicio: measurement("date", "dez26-base", "date"), fim: measurement("multiple", "dez27-base", "ratio"),
      data_fim: measurement("date", "dez27-base", "date")}, {when: claim("a alavancagem cai", cmp("fim", "lt", "inicio"))}),
  "risk.leverage_adverse": t("page.line", "No adverso {de:ano}, chega a {adverso}, contra a política de {politica}.",
    {ano: yr("$y"), adverso: measurement("multiple", "dez27-adverso", "ratio"), politica: policy}, {when: [adverseYear, ...claim("o adverso fica abaixo da política", cmp("adverso", "lt", "politica"))]}),
  "risk.policy_definition": t("page.title", "A política de {politica} precisa de uma definição de EBITDA", {politica: policy}, {when: [...policyIsBoard, ...policyUndefined]}),
  "risk.policy_readings": t("page.line", "Pelo EBITDA gerencial, {gerencial}; pela definição da escritura, {escritura} {em:data}.",
    {gerencial: measurement("multiple", "dez26-gerencial", "ratio"), escritura: measurement("multiple", "dez26-base", "ratio"), data: measurement("date", "dez26-base", "date")},
    {when: [...claim("as duas leituras são da mesma data", cmp(at(CV, "result.headroom.measurements[id=dez26-gerencial].date"), "eq", "data")),
      ...claim("a leitura gerencial usa o EBITDA reportado e a da escritura o EBITDA ajustado",
        cmp(at(CV, "result.headroom.measurements[id=dez26-gerencial].ebitda"), "eq", at(CV, "result.headroom.measurements[id=dez26-gerencial].reportedEbitda")),
        cmp(at(CV, "result.headroom.measurements[id=dez26-base].ebitda"), "ne", at(CV, "result.headroom.measurements[id=dez26-base].reportedEbitda")))]}),
  "what_changes.title": t("page.title", "A recomendação depende de demanda acima de {piso}; trigo mais caro e redes pagando mais tarde reduzem a folga",
    {piso: s("money", FP, L + "issueFloorInsideGates")},
    {when: [...claim("o piso fica abaixo do alvo de emissão", cmp("piso", "lt", at(FP, L + "issueTarget"))),
      ...claim("trigo mais caro reduz o EBITDA e redes pagando mais tarde consomem capital de giro",
        cmp(at(OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=2027-12-31].ebitda"), "lt", at(OP, "readings.projected.scenarios[id=informado].rows[periodId=2027-12-31].ebitda")),
        cmp(at(OP, "readings.projected.largestCashReduction.workingCapitalChangeEffect"), "gt", {value: "0"}), cmp(at(OP, "readings.projected.largestCashReduction.scenarioId"), "eq", {value: "prazo-60"}))]}),
  "what_changes.demand": t("page.line", "Demanda da debênture abaixo de {piso}, o mínimo que mantém a emissão de {alvo} dentro dos critérios.",
    {piso: s("money", FP, L + "issueFloorInsideGates"), alvo: issue}, {when: [...claim("o piso fica abaixo do alvo", cmp("piso", "lt", "alvo")), ...longIsDebenture]}),
  "what_changes.wheat": t("page.line", "Trigo {choque} mais caro, com repasse em {defasagem}: EBITDA {de:ano} perto de {ebitda}.",
    {choque: s("rate", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate"),
      defasagem: s("months", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths"), ano: yr("$y"),
      ebitda: s("money", OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=$y-12-31].ebitda")}, {when: claim("o choque é de alta", cmp("choque", "gt", "0"))}),
  "what_changes.receivable_days": t("page.line", "Redes pagando mais tarde: {giro} a mais de capital de giro.",
    {giro: s("money", OP, "readings.projected.scenarios[id=prazo-60].rows[periodId=$p].effects.changeInWorkingCapital")},
    {when: claim("o efeito do prazo maior aumenta o capital de giro", cmp("giro", "gt", "0"))}),
  "next_steps.title": t("page.title", "Próximos passos e datas"),
  "next_steps.notice": t("page.line", "{prazo}: aviso ao fornecedor de embalagem.", {prazo: dl("delib.action.supplier_notice")}),
  "next_steps.programs": t("page.line", "{prazo}: adesão aos programas de antecipação.", {prazo: dl("delib.action.join_programs")}),
  "next_steps.sounding": t("page.line", "{prazo}: conclusão da sondagem da debênture.", {prazo: dl("delib.action.finish_sounding")}),
  "next_steps.route": t("page.line", "{prazo}: decisão da rota para os vencimentos {de:ano}.", {prazo: dl("delib.action.decide_route"), ano: yr("$y")}, {when: [maturityYear]}),
  // Summary for prior reading.
  "summary.opening.debt_and_cash": t("summary.opening", "A companhia tem {principal} de dívida vencendo {em:ano} e um aperto de caixa já {em:semana}.",
    {principal: s("money", DT, "result.table.profile.scheduleByYear[year=$y].principal"), ano: yr("$y"), semana: tightWeek}, {when: [tightBelowMinimum]}),
  "summary.closing.leverage": t("summary.closing", "A alavancagem fica em {alavancagem} {em:data} e abaixo de {politica} nos cenários avaliados.",
    {alavancagem: measurement("multiple", "dez26-base", "ratio"), data: measurement("date", "dez26-base", "date"), politica: policy}, {when: [allBelowPolicy]}),
  // Appendix.
  "appendix.debt_table": t("appendix", "Tabela de dívida"),
  "appendix.projection": t("appendix", "Projeção por drivers e premissas"),
  "appendix.plan_vs_base": t("appendix", "Plano da área financeira contra a base"),
  "appendix.sources": t("appendix", "Fontes e datas das análises"),
  // Likely questions and answers; an answer answers its own question.
  "q.roll_bank": t("question", "Por que não rolar a dívida com {credor} no vencimento?", {credor: creditorOf("$i")}),
  "a.roll_bank": t("answer", "Rolar só a dívida com {credor} deixa o caixa abaixo do mínimo da política; faltam cerca de {falta}, com vencimento {em:vencimento}.",
    {credor: creditorOf("$i"), falta: s("money", FP, "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum"), vencimento: s("date", DT, "result.table.rows[id=$i].finalPayment")},
    {answers: "q.roll_bank", when: [...claim("falta caixa contra o mínimo da política", cmp("falta", "gt", "0")), ...amendedIn("bradesco-sem-linha")]}),
  "q.term": t("question", "Por que {prazo} e não um prazo menor?", {prazo: term}),
  "a.term": t("answer", "No perfil de amortização mais curto testado, a amortização {de:ano}, de {amortizacao}, passa o caixa disponível depois dos juros, de {disponivel}; o perfil adotado passa em todo o horizonte.",
    {ano: yr("$y"), amortizacao: s("money", FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$y].scheduledAmortization"),
      disponivel: s("money", FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$y].availableAfterInterest")},
    {answers: "q.term", when: [...claim("as leituras são do caminho recomendado", cmp("$p", "eq", at(FP, "readings.recommendation.pathId"))),
      ...claim("a amortização supera o caixa disponível no ano mostrado, o primeiro em que o perfil falha", cmp("amortizacao", "gt", "disponivel"),
        cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].firstShortfallYear"), "eq", "ano")),
      ...claim("o perfil testado termina antes do adotado", cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].passes"), "eq", {value: "false"}),
        cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=adopted].passes"), "eq", {value: "true"}),
        {bind: "last", to: at(FP, L + "lastAmortizationYear")},
        cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$last].scheduledAmortization"), "eq", {value: "0"}))]}),
  "q.demand": t("question", "E se as gestoras não comprarem o volume todo?"),
  "a.demand": t("answer", "Plano alternativo: alongamento bancário de cerca de {valor}, que exige anuência dos debenturistas, decidido até {prazo}, antes do vencimento da dívida com {credor} {em:vencimento}.",
    {valor: s("money", FP, "readings.alternative.issueTarget"), prazo: dl("delib.action.decide_route"), credor: creditorOf("$i"), vencimento: s("date", DT, "result.table.rows[id=$i].finalPayment")},
    {answers: "q.demand", when: [...bankFallback, ...claim("a decisão vem antes do vencimento", cmp("prazo", "lt", "vencimento"))]}),
  "q.cost": t("question", "Quanto custa?"),
  "a.cost": t("answer", "Custo efetivo entre CDI mais {baixo} e CDI mais {alto}; custo financeiro de cerca de {custo} {ate:ano}, com dívida líquida de {divida} {fim:ano_fim}.",
    {baixo: s("rate", FP, L + "equivalentSpread"), alto: s("rate", FP, L + "equivalentSpreadAtCondition"), custo: s("money", FP, "readings.recommendation.horizonFinancingCost"),
      ano: yr("$y"), divida: s("money", FP, "readings.recommendation.netDebtAtHorizon"), ano_fim: yr("$y")},
    {answers: "q.cost", when: [...claim("a faixa vai do menor ao maior custo", cmp("baixo", "le", "alto")), horizonYear]}),
  "q.peer": t("question", "Por que pagamos mais que a concorrente?"),
  "a.peer": t("answer", "Da diferença de {total}, {data} vêm da data de contratação; o restante se divide entre prazo, garantia, distribuição do instrumento e escala.",
    {total: s("bps", RC, "decomposition.grossBps"), data: s("bps", RC, "result.bridge.steps[family=pricing_date].bps")},
    {answers: "q.peer", when: [...claim("a parcela da data cabe na diferença", cmp("data", "le", "total")),
      ...claim("a ponte tem as famílias de prazo, garantia, distribuição e escala", ...["tenor", "guarantee", "instrument_distribution", "scale"].map((x) => has(RC, "result.bridge.steps", "family", x)))]}),
  "q.rating": t("question", "Vale contratar rating?"),
  "a.rating": t("answer", "Pelo spread, o ganho líquido fica entre {baixo} e {alto}; a decisão depende do acesso a investidores da debênture. Sugerimos avaliação preliminar não publicada.",
    {baixo: s("money", RC, "levers[label=Rating, ganho menor e custo maior].netOfKnownCosts"), alto: s("money", RC, "levers[label=Rating, ganho maior e custo menor].netOfKnownCosts")},
    {answers: "q.rating", when: claim("a faixa vai do menor ao maior ganho", cmp("baixo", "le", "alto"))}),
  "q.strategic": t("question", "A linha de embalagem não é estratégica?"),
  "a.strategic": t("answer", "O retorno de {retorno} fica acima do custo de capital de {custo}, mas o VPL fica negativo com economia menor, capex maior ou partida mais lenta. Cotações firmes decidem.",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate")},
    {answers: "q.strategic", when: [...claim("o retorno supera o custo de capital", cmp("retorno", "gt", "custo")),
      ...claim("o VPL é negativo nas três sensibilidades", ...["economy-4", "capex-120", "slower-start"].map((x) => cmp(at(IP, `comparison.metrics[caseId=${x}].netPresentValue`), "lt", "0"))),
      ...smallerEconomy, ...largerCapex, ...slowerStart]}),
  "q.wheat": t("question", "E se o trigo subir?"),
  "a.wheat": t("answer", "Com trigo {choque} mais caro e repasse em {defasagem}, o EBITDA {de:ano} cai para cerca de {ebitda}; no adverso, com EBITDA de {ebitda_adverso}, a alavancagem fica em {alavancagem}, abaixo do covenant de {covenant}.",
    {choque: s("rate", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate"),
      defasagem: s("months", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths"), ano: yr("$y"),
      ebitda: s("money", OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=$y-12-31].ebitda"),
      ebitda_adverso: measurement("money", "dez27-adverso", "reportedEbitda"), alavancagem: measurement("multiple", "dez27-adverso", "ratio"), covenant},
    {answers: "q.wheat", when: [...claim("o choque é de alta", cmp("choque", "gt", "0")),
      ...claim("o EBITDA cai contra o cenário informado", cmp("ebitda", "lt", at(OP, "readings.projected.scenarios[id=informado].rows[periodId=$y-12-31].ebitda"))),
      ...claim("a alavancagem adversa fica abaixo do covenant", cmp("alavancagem", "lt", "covenant"))]}),
  "q.anchor": t("question", "Dependemos demais da rede A?"),
  // Exposure is the balance the chain owes in the portfolio; the program's volume is a capacity and is named as such.
  "a.anchor": t("answer", "A rede A deve {saldo} dos {carteira} da carteira; o contrato com ela veda a cessão sem consentimento, mas o programa próprio da rede antecipa {volume} sem regresso, a CDI mais {taxa}.",
    {saldo: rf("money", "result.funding.portfolio.items[itemId=rede-a].amount", "saldo_da_carteira_por_devedor"), carteira: rf("money", "readings.gross", "carteira_bruta"),
      volume: rf("money", "readings.options[id=risco-sacado-a].volume", "volume_antecipavel_do_programa"),
      taxa: rf("rate", "readings.options[id=risco-sacado-a].spreadOverDi", "spread_sobre_cdi_do_programa")},
    {answers: "q.anchor", when: [...claim("o saldo da rede cabe na carteira", cmp("saldo", "le", "carteira")),
      ...claim("o contrato registrado da rede veda a cessão sem consentimento", cmp({contributed: [RF, "item.rede-a.contract"]}, "eq", {value: "prohibited_without_consent"})),
      ...claim("o programa é da própria rede, sem regresso, oferecido a ela", cmp(at(RF, "result.funding.options[id=risco-sacado-a].kind"), "eq", {value: "anchor_program"}),
        cmp(at(RF, "result.funding.options[id=risco-sacado-a].recourse"), "eq", {value: "without_recourse"}),
        cmp(at(RF, "result.funding.options[id=risco-sacado-a].byItem[itemId=rede-a].offered"), "eq", {value: "true"}))]}),
  "q.plan_vs_base": t("question", "O plano da área financeira mostra EBITDA de {plano} {em:ano}; por que usamos {base}?",
    {plano: s("money", PC, "readings.gap.plan.ebitda"), ano: yr("$y"), base: s("money", PC, "readings.gap.reference.ebitda")},
    {when: [...claim("o ano é o alvo do plano", cmp("ano", "eq", at(PC, "readings.gap.targetPeriodId"))), ...claim("o plano supera a base", cmp("plano", "gt", "base"))]}),
  "a.plan_vs_base": t("answer", "O plano supõe preço, volume e custos fixos sem evidência apresentada, e o volume passa a capacidade da fábrica sem investimento. A base por drivers fica em {base}.",
    {base: s("money", PC, "readings.gap.reference.ebitda")},
    {answers: "q.plan_vs_base", when: [
      ...claim("preço, volume e custos fixos são premissas do plano sem evidência apresentada", ...["preco", "volume", "fixos"].map((x) => has(PC, "readings.assumptions", "assumptionId", x)),
        {every: [PC, "readings.assumptions", "evidenceStatus"], op: "eq", than: {value: "not_presented"}}),
      ...claim("o volume passa a capacidade sem investimento no plano", cmp(at(PC, "readings.capacity.aboveWithoutInvestment"), "eq", {value: "true"}),
        cmp(at(PC, "readings.capacity.investmentInPlan"), "eq", {value: "false"}))]}),
  // Topics, pending notes, requesters and authority bases.
  "topic.packaging_review": t("topic", "revisão da linha de embalagem"),
  "topic.crop_financing": t("topic", "financiamento da safra"),
  "note.program_indicative": t("note", "Condições do programa da rede A indicativas até a confirmação do banco do programa",
    {}, {when: claim("as condições do programa da rede A são indicativas", cmp(at(RF, "result.funding.options[id=risco-sacado-a].indicative"), "eq", {value: "true"}))}),
  "note.case_not_reviewed": t("note", "A opção não está entre os casos revisados da análise do projeto", {}, {when: claim("a opção em etapas não é caso revisado", lacks(IP, "comparison.metrics", "caseId", "staged"))}),
  "requester.chair": t("requester", "Presidente do conselho"),
  "requester.cfo": t("requester", "Diretor financeiro"),
  "authority.board_policy": t("authority", "Política de endividamento aprovada pelo conselho", {}, {when: policyIsBoard}),
};

/** The material assertions of the library, template by template: each claim of a fixed text with the verifiable
 * fields and the condition that sustain it. A template whose fixed text asserts nothing beyond its readings has none. */
export function boardTemplateClaims() {
  const describe = (o: BoardOperand): string => "slot" in o ? `posição ${o.slot}` : "value" in o ? `"${o.value}"` : "var" in o ? `$${o.var}`
    : "at" in o ? `${o.at[0]} ${o.at[1]}${o.year ? " (ano)" : ""}` : `contrato ${o.contributed[0]} ${o.contributed[1]}`;
  const check = (c: BoardCondition): string => "compare" in c ? `${describe(c.compare[0])} ${c.compare[1]} ${describe(c.compare[2])}`
    : "every" in c ? `todo ${c.every[0]} ${c.every[1]}[*].${c.every[2]} ${c.op} ${describe(c.than)}`
    : "onlyFlagged" in c ? `só um de ${c.onlyFlagged[0]} ${c.onlyFlagged[1]} com ${c.onlyFlagged[2]}, ${c.onlyFlagged[3]} = ${describe(c.equals)}`
    : "largest" in c ? `maior ${c.largest[2]} em ${c.largest[0]} ${c.largest[1]} tem ${c.largest[3]} = ${describe(c.equals)}`
    : "bind" in c ? `$${c.bind} := ${describe(c.to)}` : "atLeast" in c ? `${c.atLeast[0]} ${c.atLeast[1]} tem ao menos ${c.count}`
    : `${c.includes[0]} ${c.includes[1]}${c.includes[2] ? `[*].${c.includes[2]}` : ""} ${c.none ? "não contém" : c.only ? "é só" : "contém"} ${describe(c.value)}`;
  const rows: {templateId: string; claim: string; checks: string[]}[] = [];
  for (const [templateId, x] of Object.entries(boardTemplates)) for (const c of x.when) {
    const text = c.claim ?? "(sem nome)", row = rows.find((r) => r.templateId === templateId && r.claim === text);
    if (row) row.checks.push(check(c)); else rows.push({templateId, claim: text, checks: [check(c)]});
  }
  return rows;
}

/** The closed dictionary of names a material may show, in canonical spelling: financial institutions and named
 * counterparties. A source label is shown only when it equals an entry exactly; otherwise the slot shows its
 * generic words and the material records a gap of name. */
export const boardNameDictionary = ["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "BTG Pactual", "Banco Safra", "BNDES", "XP", "Sicredi", "Sicoob", "Banrisul",
  "Citi", "JPMorgan", "Debenturistas", "rede A", "rede B"] as const;
/** Counterparties the fixed texts of this library describe by role (the retail chains of the receivables programs); never a creditor. */
export const boardNamesAllowedInText: readonly string[] = ["rede A", "rede B"];

/** A text reference as adopted: `template|slot=reading|slot=deadline:deliberation.deadline`. */
export const boardTextRefPattern = /^[a-z][a-z0-9_.]{0,79}(?:\|[a-z][a-z0-9_]{0,30}=(?:deadline:|informed:)?[a-z0-9][a-z0-9.-]{0,80})*$/;
export type BoardTextRef = {templateId: string; bindings: Record<string, string>};
/** Parses one reference by name: unknown template, a missing, unknown or repeated slot is refused. */
export function parseBoardTextRef(ref: string): BoardTextRef & {template: BoardTemplate} {
  if (!boardTextRefPattern.test(ref)) throw new Error(`board_capital_text_ref_invalid:${ref.slice(0, 80)}`);
  const [templateId, ...pairs] = ref.split("|");
  const template = Object.hasOwn(boardTemplates, templateId!) ? boardTemplates[templateId!] : undefined;
  if (!template) throw new Error(`board_capital_template_unknown:${templateId}`);
  const bindings: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("="), slot = pair.slice(0, at);
    if (!Object.hasOwn(template.slots, slot) || Object.hasOwn(bindings, slot)) throw new Error(`board_capital_slot_invalid:${templateId}:${slot}`);
    bindings[slot] = pair.slice(at + 1);
  }
  for (const slot of Object.keys(template.slots)) if (!Object.hasOwn(bindings, slot)) throw new Error(`board_capital_slot_unbound:${templateId}:${slot}`);
  return {templateId: templateId!, bindings, template};
}
/** The reading ids a reference binds (deadlines excluded). */
export function boardRefReadingIds(ref: string): string[] {
  const parsed = parseBoardTextRef(ref);
  return Object.entries(parsed.bindings).filter(([slot]) => !["deadline", "informed"].includes(parsed.template.slots[slot]!.type)).map(([, id]) => id);
}

/** Splits a path into its keys and selectors, the same way the reader does. */
export function boardPathSegments(path: string) {
  return path.split(/\.(?![^[]*\])/).map((raw) => {
    const m = /^([A-Za-z0-9_]+)((?:\[[^\]]+\])*)$/.exec(raw);
    if (!m) return null;
    return {key: m[1]!, selectors: (m[2]!.match(/\[[^\]]+\]/g) ?? []).map((x) => x.slice(1, -1))};
  });
}
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches one value against a pattern with `$var` tokens; returns the captured variables or null. */
export function boardMatchValue(pattern: string, value: string): Record<string, string> | null {
  const names: string[] = [];
  const source = pattern.split(/(\$[a-z]+)/).map((part) => part.startsWith("$") ? (names.push(part.slice(1)), "(.+?)") : escape(part)).join("");
  const m = new RegExp(`^${source}$`).exec(value);
  if (!m) return null;
  const vars: Record<string, string> = {};
  for (const [i, name] of names.entries()) {
    if (Object.hasOwn(vars, name) && vars[name] !== m[i + 1]) return null;
    vars[name] = m[i + 1]!;
  }
  return vars;
}
/** Matches a reading's path against an admissible path: same keys, same selector fields, values literal or `$var`. */
export function boardMatchPath(pattern: string, path: string): Record<string, string> | null {
  const a = boardPathSegments(pattern), b = boardPathSegments(path);
  if (a.length !== b.length || a.some((x) => !x) || b.some((x) => !x)) return null;
  const vars: Record<string, string> = {};
  for (const [i, x] of a.entries()) {
    const y = b[i]!;
    if (x!.key !== y.key || x!.selectors.length !== y.selectors.length) return null;
    for (const [j, sel] of x!.selectors.entries()) {
      const other = y.selectors[j]!, at = sel.indexOf("="), atOther = other.indexOf("=");
      if (at < 1 || atOther < 1 || sel.slice(0, at) !== other.slice(0, atOther)) return null;
      const got = boardMatchValue(sel.slice(at + 1), other.slice(atOther + 1));
      if (!got) return null;
      for (const [k, v] of Object.entries(got)) {if (Object.hasOwn(vars, k) && vars[k] !== v) return null; vars[k] = v;}
    }
  }
  return vars;
}

/** The library checks itself: every condition names slots and variables the template has, every deadline slot an
 * action of the library, every deliberation text a title, every answer a question. */
export function checkBoardTemplateLibrary() {
  const problems: string[] = [];
  for (const [id, x] of Object.entries(boardTemplates)) {
    const vars = new Set<string>();
    for (const spec of Object.values(x.slots)) {
      for (const [, path] of spec.from ?? []) for (const m of path.matchAll(/\$([a-z]+)/g)) vars.add(m[1]!);
      if (spec.year) for (const m of spec.year.matchAll(/\$([a-z]+)/g)) vars.add(m[1]!);
      if (spec.type === "deadline" ? !spec.action || boardTemplates[spec.action]?.use[0] !== "delib.action" : spec.type === "informed" ? !spec.author : !spec.from && !spec.year) problems.push(`${id}:slot`);
      if (spec.year && spec.type !== "date") problems.push(`${id}:year`);
      if ((spec.type === "label") !== Boolean(spec.generic)) problems.push(`${id}:generic`);
    }
    for (const c of x.when) {if ("bind" in c) vars.add(c.bind); if (!c.claim) problems.push(`${id}:claim_missing`);}
    const operands: BoardOperand[] = x.when.flatMap((c) => "compare" in c ? [c.compare[0], c.compare[2]] : "every" in c ? [c.than] : "bind" in c ? [c.to] : "includes" in c ? [c.value]
      : "atLeast" in c ? [] : [c.equals]);
    const paths = x.when.flatMap((c) => "includes" in c ? [c.includes[1]] : "atLeast" in c ? [c.atLeast[1]] : "every" in c ? [c.every[1]] : []);
    for (const path of paths) for (const m of path.matchAll(/\$([a-z]+)/g)) if (!vars.has(m[1]!)) problems.push(`${id}:path:${m[1]}`);
    for (const o of operands) {
      if ("slot" in o && !Object.hasOwn(x.slots, o.slot)) problems.push(`${id}:operand:${o.slot}`);
      if ("var" in o && !vars.has(o.var)) problems.push(`${id}:var:${o.var}`);
      if ("at" in o) for (const m of o.at[1].matchAll(/\$([a-z]+)/g)) if (!vars.has(m[1]!)) problems.push(`${id}:at:${m[1]}`);
    }
    for (const m of x.text.matchAll(/\{(?:[a-z]+:)?([a-z_]+)\}/g)) if (!m[0].startsWith("{count:") && !Object.hasOwn(x.slots, m[1]!)) problems.push(`${id}:text:${m[1]}`);
    // No fixed text names a creditor or a bank: names enter only through label slots.
    for (const name of boardNameDictionary) if (new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(x.text) && !boardNamesAllowedInText.includes(name)) problems.push(`${id}:names:${name}`);
    if (x.of && boardTemplates[x.of]?.use[0] !== "delib.title") problems.push(`${id}:of`);
    if (["delib.subject", "delib.recommendation", "delib.action"].some((u) => x.use.includes(u as BoardTextUse)) && !x.of) problems.push(`${id}:of_missing`);
    if (x.use.includes("answer") !== Boolean(x.answers) || (x.answers && boardTemplates[x.answers]?.use[0] !== "question")) problems.push(`${id}:answers`);
  }
  return problems;
}
