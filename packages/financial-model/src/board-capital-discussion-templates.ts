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
export const boardSlotTypes = ["money", "rate", "multiple", "years", "months", "bps", "count", "date", "label", "flag", "deadline"] as const;
export type BoardSlotType = (typeof boardSlotTypes)[number];
export const boardTextUses = ["delib.title", "delib.subject", "delib.recommendation", "delib.action", "page.title", "page.line", "page.recommendation", "page.option",
  "summary.opening", "summary.closing", "appendix", "question", "answer", "topic", "note", "requester", "authority"] as const;
export type BoardTextUse = (typeof boardTextUses)[number];

/** A slot: its type and the one concept it admits. `from` lists the admissible [method, path] (selectors literal or
 * `$var`); `year` admits a year reading whose value matches (literal or `$var`); `action` is the deliberation action
 * a deadline slot announces. */
export type BoardSlotSpec = {type: BoardSlotType; from?: readonly (readonly [string, string])[]; year?: string; action?: string};
/** An operand of a condition: a bound slot's source value, a literal, a shared variable or a field of the source
 * (`at`: [method, path], variables substituted); `year` compares the first four characters. */
export type BoardOperand = {slot: string; year?: true} | {value: string} | {var: string} | {at: readonly [string, string]; year?: true};
export type BoardComparison = "lt" | "le" | "gt" | "ge" | "eq";
export type BoardCondition =
  | {compare: readonly [BoardOperand, BoardComparison, BoardOperand]}
  /** Every element of a list of the source: its field compared with the operand. */
  | {every: readonly [string, string, string]; op: BoardComparison; than: BoardOperand}
  /** The elements of a list whose flag is true are exactly one, and its key equals the operand. */
  | {onlyFlagged: readonly [string, string, string, string]; equals: BoardOperand}
  /** The element of a list with the largest value has its key equal to the operand. */
  | {largest: readonly [string, string, string, string]; equals: BoardOperand};
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
const op = (x: string): BoardOperand => /^-?\d+(?:\.\d+)?$/.test(x) ? {value: x} : x.startsWith("$") ? {var: x.slice(1)} : {slot: x};
const cmp = (a: string | BoardOperand, how: BoardComparison, b: string | BoardOperand): BoardCondition => ({compare: [typeof a === "string" ? op(a) : a, how, typeof b === "string" ? op(b) : b]});
const at = (method: string, path: string, year?: true): BoardOperand => year ? {at: [method, path], year} : {at: [method, path]};
type Extra = {when?: BoardCondition[]; of?: string; answers?: string};
const t = (use: BoardTextUse | BoardTextUse[], text: string, slots: Record<string, BoardSlotSpec> = {}, extra: Extra = {}): BoardTemplate =>
  ({text, slots, use: Array.isArray(use) ? use : [use], when: extra.when ?? [], ...extra.of ? {of: extra.of} : {}, ...extra.answers ? {answers: extra.answers} : {}});

// Shared concepts.
const maturityYear: BoardCondition = {largest: [DT, "result.table.profile.scheduleByYear", "principal", "year"], equals: {slot: "ano"}};
const horizonYear: BoardCondition = cmp("ano", "eq", at(FP, "readings.horizon.lastPeriodEnd", true));
const tightBelowMinimum: BoardCondition = cmp(at(WC, "readings.tightestWeek.belowMinimum"), "eq", {value: "true"});
const allBelowPolicy: BoardCondition = {every: [CV, "result.headroom.measurements", "ratio"], op: "lt", than: {slot: "politica"}};
const adverseYear: BoardCondition = cmp("ano", "eq", at(CV, "result.headroom.measurements[id=dez27-adverso].date", true));
const L = "readings.recommendation.longInstrument.";
const issue = s("money", FP, L + "issueTarget"), term = s("years", FP, L + "termYears");
const policy = s("multiple", CV, "result.headroom.limits[id=politica].maximumRatio"), covenant = s("multiple", CV, "result.headroom.limits[id=aditamento].maximumRatio");
const metric = (type: BoardSlotType, caseId: string, field: string) => s(type, IP, `comparison.metrics[caseId=${caseId}].${field}`);
const measurement = (type: BoardSlotType, id: string, field: string) => s(type, CV, `result.headroom.measurements[id=${id}].${field}`);
const tightWeek = s("date", WC, "readings.tightestWeek.weekStart");
/** The path rows share one sentence; only the reviewed name of the path changes, and every slot reads that path. */
const pathRow = (name: string, id: string) => {
  const p = `readings.paths[id=${id}].`;
  return t("page.line", `${name}: caixa mínimo de {caixa}; alavancagem de {alavancagem}; custo de {custo}; dívida líquida {em:ano} de {divida}; nos critérios: {criterios}; anuência: {anuencia}.`,
    {caixa: s("money", FP, p + "minimumCash.amount"), alavancagem: s("multiple", FP, p + "worstLeverage"), custo: s("money", FP, p + "horizonFinancingCost"), ano: yr("$y"),
      divida: s("money", FP, p + "netDebtAtHorizon"), criterios: s("flag", FP, p + "eligible"), anuencia: s("flag", FP, p + "consentRequired")}, {when: [horizonYear]});
};
const negative = (...slots: string[]) => slots.map((x) => cmp(x, "lt", "0"));

export const boardTemplates: Record<string, BoardTemplate> = {
  // Deliberations: title, subject, recommendation and dated actions, each bound to its deliberation.
  "delib.packaging_line": t("delib.title", "Linha de embalagem"),
  "delib.packaging_line.subject": t("delib.subject", "decidir o caminho da linha de embalagem", {}, {of: "delib.packaging_line"}),
  "delib.packaging_line.wait": t("delib.recommendation", "não emitir o pedido de compra até as cotações firmes", {}, {of: "delib.packaging_line"}),
  "delib.crop": t("delib.title", "Safra {de:ano}", {ano: yr("$y")}, {when: [cmp("ano", "eq", at(WC, "readings.tightestWeek.weekStart", true))]}),
  "delib.crop.subject": t("delib.subject", "decidir o financiamento da safra {de:ano}", {ano: yr("$y")}, {of: "delib.crop", when: [cmp("ano", "eq", at(WC, "readings.tightestWeek.weekStart", true))]}),
  "delib.crop.programs": t("delib.recommendation", "financiar a safra pelos programas de antecipação das redes A e B, com a conta garantida para o aperto do fim da safra e a linha bancária só como reserva",
    {}, {of: "delib.crop"}),
  "delib.maturities": t("delib.title", "Vencimentos {de:ano}", {ano: yr("$y")}, {when: [maturityYear]}),
  "delib.maturities.subject": t("delib.subject", "decidir a rota para os vencimentos {de:ano}", {ano: yr("$y")}, {of: "delib.maturities", when: [maturityYear]}),
  "delib.maturities.sounding": t("delib.recommendation", "autorizar a sondagem de uma debênture de até {valor}, com prazo de {prazo}, tendo o alongamento bancário como plano alternativo",
    {valor: issue, prazo: term}, {of: "delib.maturities"}),
  "delib.policy": t("delib.title", "Política de endividamento"),
  "delib.policy.definition": t("delib.subject", "definir qual EBITDA mede o limite de {limite}", {limite: policy}, {of: "delib.policy"}),
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
    {prazo: s("years", DT, "result.table.profile.weightedAverageLifeYears"), credor: s("label", DT, "result.table.profile.largestCreditor.creditor"),
      participacao: s("rate", DT, "result.table.profile.largestCreditor.share")}),
  "situation.cash_shortfall": t("page.title", "Sem ação, o caixa fica abaixo do mínimo {em:semana} e chega a {saldo} {fim:ano}",
    {semana: tightWeek, saldo: s("money", FP, "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=$y-12-31].closingAvailable"), ano: yr("$y")}, {when: [tightBelowMinimum]}),
  "situation.cash_without_line": t("page.line", "Sem a linha da safra, o caixa {em:semana} é de {saldo}, contra o mínimo de {minimo}.",
    {semana: s("date", WC, "readings.sensitivities[caseId=sem-linha].weekStart"), saldo: s("money", WC, "readings.sensitivities[caseId=sem-linha].minimum"),
      minimo: s("money", WC, "result.weekly.minimumCash")}, {when: [cmp("saldo", "lt", "minimo")]}),
  "situation.debt_service": t("page.line", "Serviço da dívida {em:ano}: {servico}, contra {disponivel} de caixa disponível.",
    {ano: yr("$y"), servico: s("money", FP, "result.evaluation.paths[id=manter].debtServiceByYear[year=$y].service"),
      disponivel: s("money", FP, "result.evaluation.paths[id=manter].debtServiceByYear[year=$y].availableForService")}, {when: [cmp("servico", "gt", "disponivel")]}),
  "constraint.indenture_basket": t("page.title", "A escritura da debênture deixa só {saldo} de exceção para garantias de nova dívida",
    {saldo: s("money", DT, "result.table.negativePledgeBaskets[holderId=debenture-1].remaining")},
    {when: [cmp("saldo", "ge", "0"), cmp("saldo", "lt", at(DT, "result.table.negativePledgeBaskets[holderId=debenture-1].basket"))]}),
  "constraint.basket_usage": t("page.line", "Exceção de {cesta} para garantias, com {ocupado} ocupados pelas garantias da CCB do Bradesco.",
    {cesta: s("money", DT, "result.table.negativePledgeBaskets[holderId=debenture-1].basket"), ocupado: s("money", DT, "result.table.negativePledgeBaskets[holderId=debenture-1].occupied")},
    {when: [cmp("ocupado", "le", "cesta")]}),
  "constraint.covenant_policy": t("page.line", "Covenant de {covenant} na escritura; política do conselho de {politica}.", {covenant, politica: policy}),
  "topic.project_return": t("page.title", "A linha de embalagem rende {retorno}, acima do custo de capital de {custo}",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate")}, {when: [cmp("retorno", "gt", "custo")]}),
  "topic.project_value": t("page.line", "Retorno de {retorno} contra custo de capital de {custo}; VPL de {vpl}.",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate"), vpl: metric("money", "base", "netPresentValue")}),
  "topic.project_payback": t("page.line", "Payback de cerca de {payback}; o fluxo acumulado do projeto chega a {pico} {em:data}.",
    {payback: metric("years", "base", "paybackYears"), pico: metric("money", "base", "peakCumulativeCashNeed.amount"), data: metric("date", "base", "peakCumulativeCashNeed.periodEndDate")}),
  "topic.project_sensitivities": t("page.line", "O VPL fica negativo em cada sensibilidade: economia menor, {vpl_economia}; capex maior, {vpl_capex}; partida mais lenta, {vpl_partida}.",
    {vpl_economia: metric("money", "economy-4", "netPresentValue"), vpl_capex: metric("money", "capex-120", "netPresentValue"), vpl_partida: metric("money", "slower-start", "netPresentValue")},
    {when: negative("vpl_economia", "vpl_capex", "vpl_partida")}),
  "topic.project_strategic_reason": t("page.line", "Motivo estratégico: reduzir a dependência de um único fornecedor de embalagem."),
  "topic.project_wait_quotes": t("page.recommendation", "Recomendamos pedir cotações firmes antes do pedido de compra; adiar a linha leva o VPL a {vpl} e o retorno a {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue"), retorno: metric("rate", "defer-12", "annualIrr")},
    {when: [cmp("vpl", "gt", at(IP, "comparison.metrics[caseId=base].netPresentValue"))]}),
  "option.go_now": t("page.option", "Seguir agora: VPL de {vpl} e retorno de {retorno}.", {vpl: metric("money", "base", "netPresentValue"), retorno: metric("rate", "base", "annualIrr")}),
  "option.staged": t("page.option", "Seguir em etapas: VPL de {vpl}.", {vpl: metric("money", "staged", "netPresentValue")}),
  "option.wait_quotes": t("page.option", "Esperar as cotações e adiar a linha: VPL de {vpl} e retorno de {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue"), retorno: metric("rate", "defer-12", "annualIrr")}),
  "topic.crop_programs": t("page.title", "A safra pode ser financiada com {valor} dos programas dos clientes, sem dívida bancária nova",
    {valor: s("money", RF, "readings.plan[optionId=risco-sacado-a].cumulative")}, {when: [cmp(at(RF, "readings.planCoversPeak"), "eq", {value: "true"})]}),
  "topic.crop_program_cost": t("page.line", "Custo indicativo dos programas: CDI mais {taxa_b} na rede B e CDI mais {taxa_a} na rede A.",
    {taxa_b: s("rate", RF, "readings.options[id=risco-sacado-b].spreadOverDi"), taxa_a: s("rate", RF, "readings.options[id=risco-sacado-a].spreadOverDi")}),
  "topic.crop_overdraft": t("page.line", "Conta garantida para o aperto de caixa {em:semana}.", {semana: tightWeek}, {when: [tightBelowMinimum]}),
  "alternatives.count": t("page.title", "Avaliamos {caminhos} caminhos {para:ano}; só o recomendado passa em todos os critérios",
    {caminhos: s("count", FP, "readings.horizon.candidatePaths"), ano: yr("$y")},
    {when: [maturityYear, {onlyFlagged: [FP, "readings.paths", "eligible", "id"], equals: at(FP, "readings.recommendation.pathId")}]}),
  "alternatives.row.no_line_debenture": pathRow("Sem a linha agora, com giro e debênture nova", "sem-linha-debenture"),
  "alternatives.row.defer_line": pathRow("Adiar a linha de embalagem", "adiar-linha"),
  "alternatives.row.debenture_with_line": pathRow("Separar por uso e emitir debênture que substitui a atual e o Bradesco", "debenture-com-linha"),
  "alternatives.row.keep_and_roll": pathRow("Manter e rolar no vencimento", "manter"),
  "alternatives.row.short_bank_loan": pathRow("CCB curta para safra e capex", "ccb-tres-anos"),
  "alternatives.row.extend_with_bank": pathRow("Separar por uso e alongar com banco", "alongar-com-banco"),
  "alternatives.row.extend_bradesco": pathRow("Alongar só o Bradesco", "alongar-bradesco"),
  "recommendation.debenture": t("page.title", "Recomendamos sondar uma debênture de até {valor}, com prazo de {prazo}", {valor: issue, prazo: term}),
  "recommendation.debenture_cost": t("page.line", "Resgata a debênture atual e pré-paga o Bradesco; custo efetivo entre CDI mais {baixo} e CDI mais {alto}.",
    {baixo: s("rate", FP, L + "equivalentSpread"), alto: s("rate", FP, L + "equivalentSpreadAtCondition")}, {when: [cmp("baixo", "le", "alto")]}),
  "recommendation.amortization": t("page.line", "Amortização {de:inicio} {a:fim}.",
    {inicio: s("date", FP, L + "firstAmortizationYear"), fim: s("date", FP, L + "lastAmortizationYear")}, {when: [cmp("inicio", "le", "fim")]}),
  "recommendation.alternative": t("page.line", "Plano alternativo: alongamento bancário, com decisão até {prazo}.", {prazo: dl("delib.action.decide_route")}),
  "risk.leverage": t("page.title", "A alavancagem fica abaixo da política de {politica} nos cenários avaliados, com {adverso} no adverso {de:ano}",
    {politica: policy, adverso: measurement("multiple", "dez27-adverso", "ratio"), ano: yr("$y")}, {when: [allBelowPolicy, adverseYear]}),
  "risk.leverage_path": t("page.line", "A alavancagem fica em {inicio} {em:data_inicio} e cai para {fim} {em:data_fim}, pela definição da escritura.",
    {inicio: measurement("multiple", "dez26-base", "ratio"), data_inicio: measurement("date", "dez26-base", "date"), fim: measurement("multiple", "dez27-base", "ratio"),
      data_fim: measurement("date", "dez27-base", "date")}, {when: [cmp("fim", "lt", "inicio")]}),
  "risk.leverage_adverse": t("page.line", "No adverso {de:ano}, chega a {adverso}, contra a política de {politica}.",
    {ano: yr("$y"), adverso: measurement("multiple", "dez27-adverso", "ratio"), politica: policy}, {when: [adverseYear, cmp("adverso", "lt", "politica")]}),
  "risk.policy_definition": t("page.title", "A política de {politica} precisa de uma definição de EBITDA", {politica: policy}),
  "risk.policy_readings": t("page.line", "Pelo EBITDA gerencial, {gerencial}; pela definição da escritura, {escritura} {em:data}.",
    {gerencial: measurement("multiple", "dez26-gerencial", "ratio"), escritura: measurement("multiple", "dez26-base", "ratio"), data: measurement("date", "dez26-base", "date")},
    {when: [cmp(at(CV, "result.headroom.measurements[id=dez26-gerencial].date"), "eq", "data")]}),
  "what_changes.title": t("page.title", "A recomendação mudaria com demanda abaixo de {piso}, trigo mais caro ou redes pagando mais tarde",
    {piso: s("money", FP, L + "issueFloorInsideGates")}, {when: [cmp("piso", "lt", at(FP, L + "issueTarget"))]}),
  "what_changes.demand": t("page.line", "Demanda da debênture abaixo de {piso}, o mínimo que mantém a emissão de {alvo} dentro dos critérios.",
    {piso: s("money", FP, L + "issueFloorInsideGates"), alvo: issue}, {when: [cmp("piso", "lt", "alvo")]}),
  "what_changes.wheat": t("page.line", "Trigo {choque} mais caro, com repasse em {defasagem}: EBITDA {de:ano} perto de {ebitda}.",
    {choque: s("rate", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate"),
      defasagem: s("months", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths"), ano: yr("$y"),
      ebitda: s("money", OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=$y-12-31].ebitda")}, {when: [cmp("choque", "gt", "0")]}),
  "what_changes.receivable_days": t("page.line", "Redes pagando mais tarde: {giro} a mais de capital de giro.",
    {giro: s("money", OP, "readings.projected.scenarios[id=prazo-60].rows[periodId=$p].effects.changeInWorkingCapital")}, {when: [cmp("giro", "gt", "0")]}),
  "next_steps.title": t("page.title", "Próximos passos e datas"),
  "next_steps.notice": t("page.line", "{prazo}: aviso ao fornecedor de embalagem.", {prazo: dl("delib.action.supplier_notice")}),
  "next_steps.programs": t("page.line", "{prazo}: adesão aos programas de antecipação.", {prazo: dl("delib.action.join_programs")}),
  "next_steps.sounding": t("page.line", "{prazo}: conclusão da sondagem da debênture.", {prazo: dl("delib.action.finish_sounding")}),
  "next_steps.route": t("page.line", "{prazo}: decisão da rota para os vencimentos {de:ano}.", {prazo: dl("delib.action.decide_route"), ano: yr("$y")}, {when: [maturityYear]}),
  // Summary for prior reading.
  "summary.opening.debt_and_cash": t("summary.opening", "A companhia tem {principal} de dívida vencendo {em:ano} e um aperto de caixa já {em:semana}.",
    {principal: s("money", DT, "result.table.profile.scheduleByYear[year=$y].principal"), ano: yr("$y"), semana: tightWeek}, {when: [tightBelowMinimum]}),
  "summary.closing.leverage": t("summary.closing", "Com o plano, a alavancagem fica em {alavancagem} {em:data} e abaixo de {politica} nos cenários avaliados.",
    {alavancagem: measurement("multiple", "dez26-base", "ratio"), data: measurement("date", "dez26-base", "date"), politica: policy}, {when: [allBelowPolicy]}),
  // Appendix.
  "appendix.debt_table": t("appendix", "Tabela de dívida"),
  "appendix.projection": t("appendix", "Projeção por drivers e premissas"),
  "appendix.plan_vs_base": t("appendix", "Plano da área financeira contra a base"),
  "appendix.sources": t("appendix", "Fontes e datas das análises"),
  // Likely questions and answers; an answer answers its own question.
  "q.roll_bank": t("question", "Por que não rolar o Bradesco no vencimento?"),
  "a.roll_bank": t("answer", "Rolar só o Bradesco deixa as parcelas da debênture sem fonte; faltam cerca de {falta}, com o Bradesco vencendo {em:vencimento}.",
    {falta: s("money", FP, "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum"), vencimento: s("date", DT, "result.table.rows[id=ccb-bradesco].finalPayment")},
    {answers: "q.roll_bank", when: [cmp("falta", "gt", "0")]}),
  "q.term": t("question", "Por que {prazo} e não um prazo menor?", {prazo: term}),
  "a.term": t("answer", "Com prazo menor, a amortização {de:ano}, de {amortizacao}, passa o caixa disponível depois dos juros, de {disponivel}.",
    {ano: yr("$y"), amortizacao: s("money", FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$y].scheduledAmortization"),
      disponivel: s("money", FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$y].availableAfterInterest")},
    {answers: "q.term", when: [cmp("$p", "eq", at(FP, "readings.recommendation.pathId")), cmp("amortizacao", "gt", "disponivel")]}),
  "q.demand": t("question", "E se as gestoras não comprarem o volume todo?"),
  "a.demand": t("answer", "Plano alternativo: alongamento bilateral de cerca de {valor} com waiver da debênture, decidido até {prazo}, antes do vencimento do Bradesco {em:vencimento}.",
    {valor: s("money", FP, "readings.alternative.issueTarget"), prazo: dl("delib.action.decide_route"), vencimento: s("date", DT, "result.table.rows[id=ccb-bradesco].finalPayment")},
    {answers: "q.demand", when: [cmp("prazo", "lt", "vencimento")]}),
  "q.cost": t("question", "Quanto custa?"),
  "a.cost": t("answer", "Custo efetivo entre CDI mais {baixo} e CDI mais {alto}; custo financeiro de cerca de {custo} {ate:ano}, com dívida líquida de {divida} {fim:ano_fim}.",
    {baixo: s("rate", FP, L + "equivalentSpread"), alto: s("rate", FP, L + "equivalentSpreadAtCondition"), custo: s("money", FP, "readings.recommendation.horizonFinancingCost"),
      ano: yr("$y"), divida: s("money", FP, "readings.recommendation.netDebtAtHorizon"), ano_fim: yr("$y")},
    {answers: "q.cost", when: [cmp("baixo", "le", "alto"), horizonYear]}),
  "q.peer": t("question", "Por que pagamos mais que a concorrente?"),
  "a.peer": t("answer", "Da diferença de {total}, {data} vêm da data de contratação; o resto é escala, concentração de clientes, prazo curto e ausência de rating.",
    {total: s("bps", RC, "decomposition.grossBps"), data: s("bps", RC, "result.bridge.steps[family=pricing_date].bps")}, {answers: "q.peer", when: [cmp("data", "le", "total")]}),
  "q.rating": t("question", "Vale contratar rating?"),
  "a.rating": t("answer", "Pelo spread, o ganho líquido fica entre {baixo} e {alto}; vale pelo acesso a investidores da debênture. Sugerimos avaliação preliminar não publicada.",
    {baixo: s("money", RC, "levers[label=Rating, ganho menor e custo maior].netOfKnownCosts"), alto: s("money", RC, "levers[label=Rating, ganho maior e custo menor].netOfKnownCosts")},
    {answers: "q.rating", when: [cmp("baixo", "le", "alto")]}),
  "q.strategic": t("question", "A linha de embalagem não é estratégica?"),
  "a.strategic": t("answer", "Reduz a dependência de um fornecedor; o retorno de {retorno} fica acima do custo de capital de {custo}, mas o VPL fica negativo com economia menor, capex maior ou partida mais lenta. Cotações firmes decidem.",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate")},
    {answers: "q.strategic", when: [cmp("retorno", "gt", "custo"), ...["economy-4", "capex-120", "slower-start"].map((x) => cmp(at(IP, `comparison.metrics[caseId=${x}].netPresentValue`), "lt", "0"))]}),
  "q.wheat": t("question", "E se o trigo subir?"),
  "a.wheat": t("answer", "Com trigo {choque} mais caro e repasse em {defasagem}, o EBITDA {de:ano} cai para cerca de {ebitda}; no adverso, com EBITDA de {ebitda_adverso}, a alavancagem fica em {alavancagem}, abaixo do covenant de {covenant}.",
    {choque: s("rate", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate"),
      defasagem: s("months", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths"), ano: yr("$y"),
      ebitda: s("money", OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=$y-12-31].ebitda"),
      ebitda_adverso: measurement("money", "dez27-adverso", "reportedEbitda"), alavancagem: measurement("multiple", "dez27-adverso", "ratio"), covenant},
    {answers: "q.wheat", when: [cmp("choque", "gt", "0"), cmp("ebitda", "lt", at(OP, "readings.projected.scenarios[id=informado].rows[periodId=$y-12-31].ebitda")),
      cmp("alavancagem", "lt", "covenant")]}),
  "q.anchor": t("question", "Dependemos demais da rede A?"),
  "a.anchor": t("answer", "A rede A tem {rede} dos {carteira} da carteira; o contrato veda a cessão a terceiros, mas o programa próprio dela permite antecipar no risco da rede, a CDI mais {taxa}.",
    {rede: s("money", RF, "readings.options[id=risco-sacado-a].volume"), carteira: s("money", RF, "readings.gross"), taxa: s("rate", RF, "readings.options[id=risco-sacado-a].spreadOverDi")},
    {answers: "q.anchor", when: [cmp("rede", "le", "carteira")]}),
  "q.plan_vs_base": t("question", "O plano da área financeira mostra EBITDA de {plano} {em:ano}; por que usamos {base}?",
    {plano: s("money", PC, "readings.gap.plan.ebitda"), ano: yr("$y"), base: s("money", PC, "readings.gap.reference.ebitda")},
    {when: [cmp("ano", "eq", at(PC, "readings.gap.targetPeriodId")), cmp("plano", "gt", "base")]}),
  "a.plan_vs_base": t("answer", "O plano supõe preço acima do custo, volume acima da capacidade da fábrica e fixos abaixo da inflação; sem evidência, o banco corta. A base por drivers fica em {base}.",
    {base: s("money", PC, "readings.gap.reference.ebitda")}, {answers: "q.plan_vs_base"}),
  // Topics, pending notes, requesters and authority bases.
  "topic.packaging_review": t("topic", "revisão da linha de embalagem"),
  "topic.crop_financing": t("topic", "financiamento da safra"),
  "note.program_indicative": t("note", "Condições do programa da rede A indicativas até a confirmação do banco do programa"),
  "note.case_not_reviewed": t("note", "A opção não está entre os casos revisados da análise do projeto"),
  "note.plan_not_reviewed": t("note", "Não há resultado revisado do plano de financiamento"),
  "requester.chair": t("requester", "Presidente do conselho"),
  "requester.cfo": t("requester", "Diretor financeiro"),
  "authority.board_policy": t("authority", "Política de endividamento aprovada pelo conselho"),
};

/** A text reference as adopted: `template|slot=reading|slot=deadline:deliberation.deadline`. */
export const boardTextRefPattern = /^[a-z][a-z0-9_.]{0,79}(?:\|[a-z][a-z0-9_]{0,30}=(?:deadline:)?[a-z0-9][a-z0-9.-]{0,80})*$/;
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
  return Object.entries(parsed.bindings).filter(([slot]) => parsed.template.slots[slot]!.type !== "deadline").map(([, id]) => id);
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
      if (spec.type === "deadline" ? !spec.action || boardTemplates[spec.action]?.use[0] !== "delib.action" : !spec.from && !spec.year) problems.push(`${id}:slot`);
      if (spec.year && spec.type !== "date") problems.push(`${id}:year`);
    }
    const operands = x.when.flatMap((c) => "compare" in c ? [c.compare[0], c.compare[2]] : "every" in c ? [c.than] : [c.equals]);
    for (const o of operands) {
      if ("slot" in o && !Object.hasOwn(x.slots, o.slot)) problems.push(`${id}:operand:${o.slot}`);
      if ("var" in o && !vars.has(o.var)) problems.push(`${id}:var:${o.var}`);
      if ("at" in o) for (const m of o.at[1].matchAll(/\$([a-z]+)/g)) if (!vars.has(m[1]!)) problems.push(`${id}:at:${m[1]}`);
    }
    for (const m of x.text.matchAll(/\{(?:[a-z]+:)?([a-z_]+)\}/g)) if (!m[0].startsWith("{count:") && !Object.hasOwn(x.slots, m[1]!)) problems.push(`${id}:text:${m[1]}`);
    if (x.of && boardTemplates[x.of]?.use[0] !== "delib.title") problems.push(`${id}:of`);
    if (["delib.subject", "delib.recommendation", "delib.action"].some((u) => x.use.includes(u as BoardTextUse)) && !x.of) problems.push(`${id}:of_missing`);
    if (x.use.includes("answer") !== Boolean(x.answers) || (x.answers && boardTemplates[x.answers]?.use[0] !== "question")) problems.push(`${id}:answers`);
  }
  return problems;
}
