/** The closed library of texts a board discussion can show. A contribution never writes text: it picks a
 * template by id and binds each typed slot to a registered reading, a deadline of a deliberation, or nothing
 * when the template has no slot. Every text here is fixed and reviewed; numbers, units, scales, currencies,
 * periodicity and dates enter only through the formatter's markers in the slots.
 *
 * Slot syntax in a text: `{slot}` for a value, a label, a yes-no reading or a deadline; `{em:slot}`,
 * `{ate:slot}`, `{desde:slot}`, `{para:slot}`, `{fim:slot}`, `{de:slot}` or `{a:slot}` for a date or a year,
 * written by the formatter with that preposition. `{count:deliberations}` and `{count:dated}` are counted by
 * the method and need no binding. */
export const boardSlotTypes = ["money", "rate", "multiple", "years", "months", "bps", "count", "date", "label", "flag", "deadline"] as const;
export type BoardSlotType = (typeof boardSlotTypes)[number];
export type BoardTemplate = {text: string; slots: Record<string, BoardSlotType>};

const t = (text: string, slots: Record<string, BoardSlotType> = {}): BoardTemplate => ({text, slots});
/** The path rows share one sentence; only the reviewed name of the path changes. */
const pathRow = (name: string) => t(`${name}: caixa mínimo de {caixa}; alavancagem de {alavancagem}; custo de {custo}; dívida líquida {em:ano} de {divida}; nos critérios: {criterios}; anuência: {anuencia}.`,
  {caixa: "money", alavancagem: "multiple", custo: "money", ano: "date", divida: "money", criterios: "flag", anuencia: "flag"});

export const boardTemplates: Record<string, BoardTemplate> = {
  // Deliberations: title, subject, recommendation and dated actions.
  "delib.packaging_line": t("Linha de embalagem"),
  "delib.packaging_line.subject": t("decidir o caminho da linha de embalagem"),
  "delib.packaging_line.wait": t("não emitir o pedido de compra até as cotações firmes"),
  "delib.crop": t("Safra {de:ano}", {ano: "date"}),
  "delib.crop.subject": t("decidir o financiamento da safra {de:ano}", {ano: "date"}),
  "delib.crop.programs": t("financiar a safra pelos programas de antecipação das redes A e B, com a conta garantida para o aperto do fim da safra e a linha bancária só como reserva"),
  "delib.maturities": t("Vencimentos {de:ano}", {ano: "date"}),
  "delib.maturities.subject": t("decidir a rota para os vencimentos {de:ano}", {ano: "date"}),
  "delib.maturities.sounding": t("autorizar a sondagem de uma debênture de até {valor}, com prazo de {prazo}, tendo o alongamento bancário como plano alternativo", {valor: "money", prazo: "years"}),
  "delib.policy": t("Política de endividamento"),
  "delib.policy.definition": t("definir qual EBITDA mede o limite de {limite}", {limite: "multiple"}),
  "delib.action.supplier_notice": t("enviar ao fornecedor atual o aviso para renegociar o contrato"),
  "delib.action.join_programs": t("aderir aos programas"),
  "delib.action.finish_sounding": t("concluir a sondagem"),
  "delib.action.decide_route": t("decidir a rota"),
  // Pages: titles and lines.
  "page.decisions": t("Pedimos {count:deliberations} decisões; {count:dated} têm prazo"),
  "situation.debt_total": t("A dívida é de {total}, curta e concentrada {em:ano}", {total: "money", ano: "date"}),
  "situation.debt_maturity": t("{principal} de principal vencem {em:ano}; {parcela} da dívida vence {ate:horizonte}.", {principal: "money", ano: "date", parcela: "rate", horizonte: "date"}),
  "situation.debt_profile": t("Prazo médio de {prazo}; maior credor: {credor}, com {participacao} da dívida.", {prazo: "years", credor: "label", participacao: "rate"}),
  "situation.cash_shortfall": t("Sem ação, o caixa fica abaixo do mínimo {em:semana} e chega a {saldo} {fim:ano}", {semana: "date", saldo: "money", ano: "date"}),
  "situation.cash_without_line": t("Sem a linha da safra, o caixa {em:semana} é de {saldo}, contra o mínimo de {minimo}.", {semana: "date", saldo: "money", minimo: "money"}),
  "situation.debt_service": t("Serviço da dívida {em:ano}: {servico}, contra {disponivel} de caixa disponível.", {ano: "date", servico: "money", disponivel: "money"}),
  "constraint.indenture_basket": t("A escritura da debênture deixa só {saldo} de exceção para garantias de nova dívida", {saldo: "money"}),
  "constraint.basket_usage": t("Exceção de {cesta} para garantias, com {ocupado} ocupados pelas garantias da CCB do Bradesco.", {cesta: "money", ocupado: "money"}),
  "constraint.covenant_policy": t("Covenant de {covenant} na escritura; política do conselho de {politica}.", {covenant: "multiple", politica: "multiple"}),
  "topic.project_return": t("A linha de embalagem rende {retorno} contra custo de capital de {custo} e disputa o caixa mais apertado", {retorno: "rate", custo: "rate"}),
  "topic.project_value": t("Retorno de {retorno} contra custo de capital de {custo}; VPL de {vpl}.", {retorno: "rate", custo: "rate", vpl: "money"}),
  "topic.project_payback": t("Payback de cerca de {payback}; o fluxo acumulado do projeto chega a {pico} {em:data}.", {payback: "years", pico: "money", data: "date"}),
  "topic.project_sensitivities": t("O VPL fica negativo em cada sensibilidade: economia menor, {vpl_economia}; capex maior, {vpl_capex}; partida mais lenta, {vpl_partida}.",
    {vpl_economia: "money", vpl_capex: "money", vpl_partida: "money"}),
  "topic.project_strategic_reason": t("Motivo estratégico: reduzir a dependência de um único fornecedor de embalagem."),
  "topic.project_wait_quotes": t("Recomendamos pedir cotações firmes antes do pedido de compra; adiar a linha leva o VPL a {vpl} e o retorno a {retorno}.", {vpl: "money", retorno: "rate"}),
  "option.go_now": t("Seguir agora: VPL de {vpl} e retorno de {retorno}.", {vpl: "money", retorno: "rate"}),
  "option.staged": t("Seguir em etapas: VPL de {vpl}.", {vpl: "money"}),
  "option.wait_quotes": t("Esperar as cotações e adiar a linha: VPL de {vpl} e retorno de {retorno}.", {vpl: "money", retorno: "rate"}),
  "topic.crop_programs": t("A safra pode ser financiada com {valor} dos programas dos clientes, sem dívida bancária nova", {valor: "money"}),
  "topic.crop_program_cost": t("Custo indicativo dos programas: CDI mais {taxa_b} na rede B e CDI mais {taxa_a} na rede A.", {taxa_b: "rate", taxa_a: "rate"}),
  "topic.crop_overdraft": t("Conta garantida para o aperto de caixa {em:semana}.", {semana: "date"}),
  "alternatives.count": t("Avaliamos {caminhos} caminhos {para:ano}; só o recomendado passa em todos os critérios", {caminhos: "count", ano: "date"}),
  "alternatives.row.no_line_debenture": pathRow("Sem a linha agora, com giro e debênture nova"),
  "alternatives.row.defer_line": pathRow("Adiar a linha de embalagem"),
  "alternatives.row.debenture_with_line": pathRow("Separar por uso e emitir debênture que substitui a atual e o Bradesco"),
  "alternatives.row.keep_and_roll": pathRow("Manter e rolar no vencimento"),
  "alternatives.row.short_bank_loan": pathRow("CCB curta para safra e capex"),
  "alternatives.row.extend_with_bank": pathRow("Separar por uso e alongar com banco"),
  "alternatives.row.extend_bradesco": pathRow("Alongar só o Bradesco"),
  "recommendation.debenture": t("Recomendamos sondar uma debênture de até {valor}, com prazo de {prazo}", {valor: "money", prazo: "years"}),
  "recommendation.debenture_cost": t("Resgata a debênture atual e pré-paga o Bradesco; custo efetivo entre CDI mais {baixo} e CDI mais {alto}.", {baixo: "rate", alto: "rate"}),
  "recommendation.amortization": t("Amortização {de:inicio} {a:fim}.", {inicio: "date", fim: "date"}),
  "recommendation.alternative": t("Plano alternativo: alongamento bancário, com decisão até {prazo}.", {prazo: "deadline"}),
  "risk.leverage": t("A alavancagem fica abaixo da política de {politica} nos cenários avaliados, com {adverso} no adverso {de:ano}", {politica: "multiple", adverso: "multiple", ano: "date"}),
  "risk.leverage_path": t("A alavancagem fica em {inicio} {em:data_inicio} e cai para {fim} {em:data_fim}, pela definição da escritura.",
    {inicio: "multiple", data_inicio: "date", fim: "multiple", data_fim: "date"}),
  "risk.leverage_adverse": t("No adverso {de:ano}, chega a {adverso}, contra a política de {politica}.", {ano: "date", adverso: "multiple", politica: "multiple"}),
  "risk.policy_definition": t("A política de {politica} precisa de uma definição de EBITDA", {politica: "multiple"}),
  "risk.policy_readings": t("Pelo EBITDA gerencial, {gerencial}; pela definição da escritura, {escritura} {em:data}.", {gerencial: "multiple", escritura: "multiple", data: "date"}),
  "what_changes.title": t("A recomendação mudaria com demanda abaixo de {piso}, trigo mais caro ou redes pagando mais tarde", {piso: "money"}),
  "what_changes.demand": t("Demanda da debênture abaixo de {piso}, o mínimo que mantém a emissão de {alvo} dentro dos critérios.", {piso: "money", alvo: "money"}),
  "what_changes.wheat": t("Trigo {choque} mais caro, com repasse em {defasagem}: EBITDA {de:ano} perto de {ebitda}.", {choque: "rate", defasagem: "months", ano: "date", ebitda: "money"}),
  "what_changes.receivable_days": t("Redes pagando mais tarde: {giro} a mais de capital de giro.", {giro: "money"}),
  "next_steps.title": t("Próximos passos e datas"),
  "next_steps.notice": t("{prazo}: aviso ao fornecedor de embalagem.", {prazo: "deadline"}),
  "next_steps.programs": t("{prazo}: adesão aos programas de antecipação.", {prazo: "deadline"}),
  "next_steps.sounding": t("{prazo}: conclusão da sondagem da debênture.", {prazo: "deadline"}),
  "next_steps.route": t("{prazo}: decisão da rota para os vencimentos {de:ano}.", {prazo: "deadline", ano: "date"}),
  // Summary for prior reading.
  "summary.opening.debt_and_cash": t("A companhia tem {principal} de dívida vencendo {em:ano} e um aperto de caixa já {em:semana}.", {principal: "money", ano: "date", semana: "date"}),
  "summary.closing.leverage": t("Com o plano, a alavancagem fica em {alavancagem} {em:data} e abaixo de {politica} nos cenários avaliados.", {alavancagem: "multiple", data: "date", politica: "multiple"}),
  // Appendix.
  "appendix.debt_table": t("Tabela de dívida"),
  "appendix.projection": t("Projeção por drivers e premissas"),
  "appendix.plan_vs_base": t("Plano da área financeira contra a base"),
  "appendix.sources": t("Fontes e datas das análises"),
  // Likely questions and answers.
  "q.roll_bank": t("Por que não rolar o Bradesco no vencimento?"),
  "a.roll_bank": t("Rolar só o Bradesco deixa as parcelas da debênture sem fonte; faltam cerca de {falta}, com o Bradesco vencendo {em:vencimento}.", {falta: "money", vencimento: "date"}),
  "q.term": t("Por que {prazo} e não um prazo menor?", {prazo: "years"}),
  "a.term": t("Com prazo menor, a amortização {de:ano}, de {amortizacao}, passa o caixa disponível depois dos juros, de {disponivel}.", {ano: "date", amortizacao: "money", disponivel: "money"}),
  "q.demand": t("E se as gestoras não comprarem o volume todo?"),
  "a.demand": t("Plano alternativo: alongamento bilateral de cerca de {valor} com waiver da debênture, decidido até {prazo}, antes do vencimento do Bradesco {em:vencimento}.",
    {valor: "money", prazo: "deadline", vencimento: "date"}),
  "q.cost": t("Quanto custa?"),
  "a.cost": t("Custo efetivo entre CDI mais {baixo} e CDI mais {alto}; custo financeiro de cerca de {custo} {ate:ano}, com dívida líquida de {divida} {fim:ano_fim}.",
    {baixo: "rate", alto: "rate", custo: "money", ano: "date", divida: "money", ano_fim: "date"}),
  "q.peer": t("Por que pagamos mais que a concorrente?"),
  "a.peer": t("Da diferença de {total}, {data} vêm da data de contratação; o resto é escala, concentração de clientes, prazo curto e ausência de rating.", {total: "bps", data: "bps"}),
  "q.rating": t("Vale contratar rating?"),
  "a.rating": t("Pelo spread, o ganho líquido fica entre {baixo} e {alto}; vale pelo acesso a investidores da debênture. Sugerimos avaliação preliminar não publicada.", {baixo: "money", alto: "money"}),
  "q.strategic": t("A linha de embalagem não é estratégica?"),
  "a.strategic": t("Reduz a dependência de um fornecedor; o retorno de {retorno} está perto do custo de capital de {custo} e o VPL fica negativo com economia menor, capex maior ou partida mais lenta. Cotações firmes decidem.",
    {retorno: "rate", custo: "rate"}),
  "q.wheat": t("E se o trigo subir?"),
  "a.wheat": t("Com trigo {choque} mais caro e repasse em {defasagem}, o EBITDA {de:ano} cai para cerca de {ebitda}; no adverso, com EBITDA de {ebitda_adverso}, a alavancagem fica em {alavancagem}, abaixo do covenant de {covenant}.",
    {choque: "rate", defasagem: "months", ano: "date", ebitda: "money", ebitda_adverso: "money", alavancagem: "multiple", covenant: "multiple"}),
  "q.anchor": t("Dependemos demais da rede A?"),
  "a.anchor": t("A rede A tem {rede} dos {carteira} da carteira; o contrato veda a cessão a terceiros, mas o programa próprio dela permite antecipar no risco da rede, a CDI mais {taxa}.",
    {rede: "money", carteira: "money", taxa: "rate"}),
  "q.plan_vs_base": t("O plano da área financeira mostra EBITDA de {plano} {em:ano}; por que usamos {base}?", {plano: "money", ano: "date", base: "money"}),
  "a.plan_vs_base": t("O plano supõe preço acima do custo, volume acima da capacidade da fábrica e fixos abaixo da inflação; sem evidência, o banco corta. A base por drivers fica em {base}.", {base: "money"}),
  // Topics, pending notes and requesters.
  "topic.packaging_review": t("revisão da linha de embalagem"),
  "topic.crop_financing": t("financiamento da safra"),
  "note.program_indicative": t("Condições do programa da rede A indicativas até a confirmação do banco do programa"),
  "note.case_not_reviewed": t("A opção não está entre os casos revisados da análise do projeto"),
  "note.plan_not_reviewed": t("Não há resultado revisado do plano de financiamento"),
  "requester.chair": t("Presidente do conselho"),
  "requester.cfo": t("Diretor financeiro"),
  "authority.board_policy": t("Política de endividamento aprovada pelo conselho"),
};

/** A text reference as adopted: `template|slot=reading|slot=deadline:deliberation.deadline`. */
export const boardTextRefPattern = /^[a-z][a-z0-9_.]{0,79}(?:\|[a-z][a-z0-9_]{0,30}=(?:deadline:)?[a-z0-9][a-z0-9.-]{0,80})*$/;
export type BoardTextRef = {templateId: string; bindings: Record<string, string>};
/** Parses one reference by name: unknown template, a missing, unknown or repeated slot is refused. */
export function parseBoardTextRef(ref: string): BoardTextRef & {template: BoardTemplate} {
  if (!boardTextRefPattern.test(ref)) throw new Error(`board_capital_text_ref_invalid:${ref.slice(0, 80)}`);
  const [templateId, ...pairs] = ref.split("|");
  const template = boardTemplates[templateId!];
  if (!template) throw new Error(`board_capital_template_unknown:${templateId}`);
  const bindings: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("="), slot = pair.slice(0, at);
    if (!(slot in template.slots) || slot in bindings) throw new Error(`board_capital_slot_invalid:${templateId}:${slot}`);
    bindings[slot] = pair.slice(at + 1);
  }
  for (const slot of Object.keys(template.slots)) if (!(slot in bindings)) throw new Error(`board_capital_slot_unbound:${templateId}:${slot}`);
  return {templateId: templateId!, bindings, template};
}
/** The reading ids a reference binds (deadlines excluded). */
export function boardRefReadingIds(ref: string): string[] {
  const parsed = parseBoardTextRef(ref);
  return Object.entries(parsed.bindings).filter(([slot]) => parsed.template.slots[slot] !== "deadline").map(([, id]) => id);
}
