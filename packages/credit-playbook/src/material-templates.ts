import {createHash} from "node:crypto";
import {z} from "zod";

export const materialTemplateRegistryVersion = "2026.08.25-v1";

const bi = (pt: string, en: string) => ({pt, en});
const bilingualSchema = z.object({pt: z.string().min(1), en: z.string().min(1)}).strict();

export const materialSectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  title: bilingualSchema,
  required: z.boolean(),
  objective: z.string().min(1),
  contentRules: z.array(z.string().min(1)).min(1),
  evidenceRules: z.array(z.string().min(1)).min(1),
  conditionalOn: z.string().min(1).optional(),
}).strict();
export type MaterialSection = z.infer<typeof materialSectionSchema>;

export const materialTemplateSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
  maturity: z.enum(["candidate", "production"]),
  kind: z.enum(["teaser", "credit_memo", "term_sheet", "data_room_index"]),
  title: bilingualSchema,
  audience: z.string().min(1),
  purpose: z.string().min(1),
  disclosure: z.enum(["anonymous_until_authorized", "authorized_only", "internal"]),
  sections: z.array(materialSectionSchema).min(1),
  consistencyChecks: z.array(z.string().min(1)).min(1),
  forbiddenClaims: z.array(z.string().min(1)).min(1),
  disclaimer: bilingualSchema,
  source: z.object({path: z.string().min(1), effectiveDate: z.iso.date()}).strict(),
}).strict().superRefine((template, context) => {
  const ids = template.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) context.addIssue({code: "custom", path: ["sections"], message: "section ids must be unique"});
});
export type MaterialTemplate = z.infer<typeof materialTemplateSchema>;

const disclaimer = bi(
  "Material preparado pela Offroad Capital, na qualidade de assessora de DCM, a partir de informações fornecidas pela companhia e rastreadas às fontes disponíveis. Análises e estruturas são indicativas e não constituem parecer de crédito vinculante, oferta, recomendação de investimento, compromisso de crédito ou garantia de captação. Cada financiador realiza seu próprio underwriting, diligência, comitê, negociação e documentação definitiva.",
  "Material prepared by Offroad Capital, acting as DCM adviser, from information provided by the company and traced to available sources. Analyses and structures are indicative and do not constitute a binding credit opinion, offer, investment recommendation, credit commitment or funding assurance. Each capital provider performs its own underwriting, diligence, committee review, negotiation and definitive documentation.",
);

const commonConsistency = [
  "Companhia, período, moeda, escala e perímetro econômico são idênticos em todos os materiais da mesma versão.",
  "Montante, uso dos recursos, dívida, EBITDA, alavancagem, prazo, amortização, garantias e covenants reconciliam com a base governada.",
  "Toda afirmação material aponta para fato, cálculo, premissa, julgamento ou referência de mercado classificados.",
  "Informação indisponível permanece identificada; nenhum campo é preenchido por estimativa silenciosa.",
  "A versão autorizada pelo cliente e o fingerprint econômico constam do manifesto do artefato.",
];

const forbiddenClaims = [
  "crédito aprovado",
  "parecer positivo ou negativo",
  "recomendamos o investimento",
  "funding garantido ou confirmado",
  "termos finais",
  "aprovação de comitê",
];

export const teaserTemplate = materialTemplateSchema.parse({
  id: "institutional-teaser",
  version: "2026.08.25-v1",
  maturity: "candidate",
  kind: "teaser",
  title: bi("Teaser institucional", "Institutional teaser"),
  audience: "Provedores de capital selecionados em triagem inicial, antes ou depois de NDA conforme autorização.",
  purpose: "Permitir uma decisão rápida de aderência sem substituir o memorando e sem revelar identidade antes de autorização.",
  disclosure: "anonymous_until_authorized",
  sections: [
    {id: "transaction_snapshot", title: bi("Visão da operação", "Transaction snapshot"), required: true, objective: "Responder em segundos o que a companhia busca e por quê.", contentRules: ["Exibir arquétipo, montante indicativo, uso dos recursos, prazo pretendido e status de autorização.", "Não apresentar condições como acordadas."], evidenceRules: ["Montante e uso derivam do pedido confirmado e do sources and uses reconciliado."]},
    {id: "company_profile", title: bi("Companhia", "Company"), required: true, objective: "Situar modelo de negócio, setor, escala e diferenciais sem marketing vazio.", contentRules: ["Identidade permanece anônima até autorização.", "Descrever somente fatos verificáveis sobre atuação, escala e posicionamento."], evidenceRules: ["Cada claim material aponta para documento corporativo, demonstração ou resposta confirmada."]},
    {id: "financial_snapshot", title: bi("Indicadores", "Financial snapshot"), required: true, objective: "Mostrar histórico, posição atual e capacidade em poucos indicadores consistentes.", contentRules: ["Usar no máximo oito métricas.", "Distinguir auditado, intermediário e projetado."], evidenceRules: ["Métricas vêm exclusivamente do financial core com trace."]},
    {id: "structure_snapshot", title: bi("Estrutura indicativa", "Indicative structure"), required: true, objective: "Expor a configuração de trabalho suficiente para triagem de mandato.", contentRules: ["Instrumento, volume, prazo, amortização e garantias em nível indicativo.", "Pricing somente com referência datada e limitações."], evidenceRules: ["Cada termo aponta para capacidade, pedido, playbook ou referência de mercado."]},
    {id: "fit_and_open_points", title: bi("Aderência e pontos em aberto", "Fit and open points"), required: true, objective: "Evitar que o leitor descubra tarde uma incompatibilidade ou lacuna material.", contentRules: ["Listar até quatro razões de aderência e até quatro pontos ainda abertos.", "Não usar percentual de match."], evidenceRules: ["Aderência deriva de filtros de mandato; lacunas derivam do registro governado."]},
  ],
  consistencyChecks: [...commonConsistency, "O teaser contém a mesma configuração indicativa do term sheet e do memorando."],
  forbiddenClaims,
  disclaimer,
  source: {path: "packages/credit-playbook/src/material-templates.ts#institutional-teaser", effectiveDate: "2026-08-25"},
});

export const creditMemoTemplate = materialTemplateSchema.parse({
  id: "institutional-credit-memo",
  version: "2026.08.25-v1",
  maturity: "candidate",
  kind: "credit_memo",
  title: bi("Memorando de crédito", "Credit memorandum"),
  audience: "Equipes de originação, crédito e portfolio management de provedores de capital selecionados.",
  purpose: "Apresentar a companhia, a necessidade, a análise, a estrutura indicativa e os riscos com padrão institucional e rastreabilidade.",
  disclosure: "authorized_only",
  sections: [
    {id: "key_terms", title: bi("Termos-chave", "Key terms"), required: true, objective: "Permitir ao leitor entender pedido, estrutura e métricas centrais antes do texto.", contentRules: ["Mostrar tomadora, instrumento, montante, uso, prazo, carência, amortização, pricing indicativo, garantias e covenants propostos.", "Qualificar todo termo como indicativo."], evidenceRules: ["Cada linha carrega basis e suporte." ]},
    {id: "supportability", title: bi("Suportabilidade e alternativas", "Supportability and alternatives"), required: true, objective: "Explicar o que a evidência suporta, sob quais condições e quais alternativas preservam o objetivo econômico.", contentRules: ["Separar configuração solicitada, configuração suportável e alternativas.", "Explicitar restrição vinculante e condições."], evidenceRules: ["Citar cálculos de capacidade, cenários e premissas." ]},
    {id: "executive_summary", title: bi("Sumário executivo", "Executive summary"), required: true, objective: "Sintetizar tese, fontes de pagamento, estrutura e principais riscos.", contentRules: ["Responder por que agora, por que esta estrutura e o que precisa permanecer verdadeiro.", "Não esconder pontos abertos."], evidenceRules: ["Cada frase material possui support ids." ]},
    {id: "transaction", title: bi("A operação", "The transaction"), required: true, objective: "Detalhar contexto, sources and uses, cronograma e impacto econômico.", contentRules: ["Sources and uses fecha exatamente.", "Distinguir recursos novos, refinanciamento, custos e caixa da companhia."], evidenceRules: ["Pedido confirmado, orçamento, cronograma e cálculos reconciliados." ]},
    {id: "company", title: bi("A companhia", "The company"), required: true, objective: "Explicar modelo de negócio, setor, posicionamento, governança e perímetro.", contentRules: ["Aplicar lente setorial específica.", "Tratar concentração, dependências e partes relacionadas."], evidenceRules: ["Documentos corporativos, materiais institucionais e evidência operacional." ]},
    {id: "historical_performance", title: bi("Desempenho histórico e posição atual", "Historical performance and current position"), required: true, objective: "Mostrar qualidade de receita, margem, caixa, capital de giro, liquidez e normalizações.", contentRules: ["Mínimo de três exercícios e posição intermediária quando disponível.", "Exibir ponte entre reportado e ajustado."], evidenceRules: ["Spreading e reconciliação por período, entidade, moeda e escala." ]},
    {id: "capital_structure", title: bi("Estrutura de capital", "Capital structure"), required: true, objective: "Explicar dívida atual, vencimentos, custos, garantias, covenants e tratamento proposto.", contentRules: ["Incluir ponte da dívida e maturity wall.", "Identificar passivos financeiros fora do mapa recebido."], evidenceRules: ["Balanço, notas, mapa de dívida, contratos e cálculo rastreado." ]},
    {id: "business_plan", title: bi("Projeto, projeções e sensibilidades", "Project, projections and sensitivities"), required: true, objective: "Avaliar premissas, execução, geração e downside.", contentRules: ["Separar premissas da companhia, ajustes Offroad e cenários.", "Mostrar impacto de atraso, custo adicional, receita e margem abaixo do plano."], evidenceRules: ["Business plan, orçamento, contratos e financial core." ]},
    {id: "risks", title: bi("Riscos e mitigantes", "Risks and mitigants"), required: true, objective: "Expor riscos que alteram capacidade, estrutura ou mandato, com mitigantes verificáveis.", contentRules: ["Risco não é ausência de documento.", "Cada mitigante deve existir, ser proposto como condição ou permanecer como lacuna."], evidenceRules: ["Fatos, sensibilidades, contratos e julgamentos classificados." ]},
    {id: "credit_considerations", title: bi("Considerações de crédito", "Credit considerations"), required: true, objective: "Consolidar fontes de pagamento, alavancagem, cobertura, liquidez, garantias e covenant headroom.", contentRules: ["Não emitir decisão de investimento.", "Distinguir avaliação técnica de decisão do financiador."], evidenceRules: ["Somente cálculos e julgamentos aprovados para a versão corrente." ]},
    {id: "open_points", title: bi("Pontos em aberto", "Open points"), required: true, objective: "Registrar incertezas materiais sem transformá-las em certeza.", contentRules: ["Informar impacto e próxima melhor solicitação.", "Separar bloqueador, condição e melhoria de material."], evidenceRules: ["Registro de lacunas e exceções da run." ]},
    {id: "basis", title: bi("Base de preparação", "Basis of preparation"), required: true, objective: "Explicar fontes, datas, premissas, metodologia, limitações e rastreabilidade.", contentRules: ["Incluir data de referência, perímetro, moeda, escala, modelos e versões.", "Incluir disclaimer integral."], evidenceRules: ["Manifesto imutável da run e índice de evidências." ]},
  ],
  consistencyChecks: [...commonConsistency, "A ponte da dívida, sources and uses, trajetória de alavancagem e covenants fecham matematicamente."],
  forbiddenClaims,
  disclaimer,
  source: {path: "packages/credit-playbook/src/material-templates.ts#institutional-credit-memo", effectiveDate: "2026-08-25"},
});

export const termSheetTemplate = materialTemplateSchema.parse({
  id: "indicative-term-sheet",
  version: "2026.08.25-v1",
  maturity: "candidate",
  kind: "term_sheet",
  title: bi("Term sheet indicativo", "Indicative term sheet"),
  audience: "Companhia, assessores e provedores de capital em discussão preliminar de estrutura.",
  purpose: "Materializar uma alternativa de financiamento defensável, não vinculante e pronta para discussão.",
  disclosure: "authorized_only",
  sections: [
    {id: "parties", title: bi("Partes e perímetro", "Parties and perimeter"), required: true, objective: "Definir tomadora, garantidoras e perímetro econômico.", contentRules: ["Identificar razão social e papel de cada entidade.", "Não presumir solidariedade ou garantia cruzada."], evidenceRules: ["Documentos societários e perímetro reconciliado." ]},
    {id: "facility", title: bi("Instrumento e montante", "Facility and amount"), required: true, objective: "Definir instrumento, volume e eventual tranches.", contentRules: ["Indicar natureza não vinculante.", "Explicar basis de capacidade e elegibilidade."], evidenceRules: ["Análise de capacidade, instrumento e referência de mercado." ]},
    {id: "use_of_proceeds", title: bi("Destinação", "Use of proceeds"), required: true, objective: "Vincular recursos ao objetivo e ao sources and uses.", contentRules: ["Somar exatamente ao montante bruto.", "Separar refinanciamento, investimento, custos e caixa."], evidenceRules: ["Sources and uses aprovado pelo cliente." ]},
    {id: "economics", title: bi("Prazo, amortização e remuneração", "Tenor, amortisation and pricing"), required: true, objective: "Descrever o perfil econômico proposto.", contentRules: ["Prazo, carência, amortização, indexador, spread/faixa e pagamento de juros.", "Pricing é referência, nunca oferta."], evidenceRules: ["Capacidade, cash flow, market reference e limitações." ]},
    {id: "security", title: bi("Garantias", "Security"), required: true, objective: "Definir pacote proposto e cobertura sem prometer constituição.", contentRules: ["Ativo, proprietário, prioridade, valor, haircut e cobertura.", "Identificar diligências e registros futuros como condições, não fatos concluídos."], evidenceRules: ["Inventário, titularidade disponível, haircuts versionados e cálculo." ]},
    {id: "covenants", title: bi("Covenants", "Covenants"), required: true, objective: "Propor testes coerentes com downside e folga operacional.", contentRules: ["Definição, limite, data de teste, frequência, cura e reporting.", "Não copiar covenant genérico sem relação com risco e modelo."], evidenceRules: ["Trajetória base/downside e risco que cada covenant endereça." ]},
    {id: "conditions", title: bi("Condições precedentes", "Conditions precedent"), required: true, objective: "Listar somente condições necessárias para o instrumento e a estrutura propostos.", contentRules: ["Separar condição de análise, diligência e fechamento.", "Não transformar a data room inicial em checklist de closing."], evidenceRules: ["Procedimento de instrumento, segurança e autorização." ]},
    {id: "events", title: bi("Eventos de vencimento", "Events of default"), required: true, objective: "Apresentar eventos indicativos proporcionais à operação.", contentRules: ["Inadimplemento, cross-default calibrado, insolvência, falsidade material e mudança de controle quando aplicável.", "Evitar cláusulas finais ou juridicamente conclusivas."], evidenceRules: ["Riscos materiais e prática documentada." ]},
    {id: "process_terms", title: bi("Custos, validade, confidencialidade e natureza", "Costs, validity, confidentiality and status"), required: true, objective: "Preservar caráter preliminar e responsabilidades.", contentRules: ["Incluir validade, despesas, confidencialidade, não vinculação e sujeição a aprovações do financiador.", "Não criar exclusividade sem decisão expressa."], evidenceRules: ["Autorização da companhia e regras da casa." ]},
  ],
  consistencyChecks: [...commonConsistency, "Todas as cláusulas econômicas coincidem com o memorando e o modelo financeiro."],
  forbiddenClaims,
  disclaimer,
  source: {path: "packages/credit-playbook/src/material-templates.ts#indicative-term-sheet", effectiveDate: "2026-08-25"},
});

export const dataRoomTemplate = materialTemplateSchema.parse({
  id: "institutional-data-room-index",
  version: "2026.08.25-v1",
  maturity: "candidate",
  kind: "data_room_index",
  title: bi("Índice da sala de dados", "Data room index"),
  audience: "Companhia, assessores e destinatários autorizados.",
  purpose: "Organizar originais, materiais Offroad e pontos em aberto sem alterar a evidência recebida.",
  disclosure: "authorized_only",
  sections: [
    {id: "corporate", title: bi("01. Societário", "01. Corporate"), required: true, objective: "Identificar entidades e autorizações.", contentRules: ["Preservar nome e versão do original."], evidenceRules: ["Hash e origem de cada arquivo." ]},
    {id: "financial", title: bi("02. Financeiro", "02. Financial"), required: true, objective: "Organizar históricos, intermediários, ERP e projeções.", contentRules: ["Separar histórico, intermediário e projetado."], evidenceRules: ["Hash, período, entidade e classificação." ]},
    {id: "debt", title: bi("03. Dívida e garantias", "03. Debt and security"), required: true, objective: "Reunir mapas, contratos, garantias e covenants.", contentRules: ["Não substituir originais por resumos Offroad."], evidenceRules: ["Vínculo entre contrato, instrumento e mapa reconciliado." ]},
    {id: "project", title: bi("04. Projeto e operação", "04. Project and transaction"), required: true, objective: "Reunir pedido, orçamento, cronograma e sources and uses.", contentRules: ["Identificar versão aprovada pelo cliente."], evidenceRules: ["Documento original e cálculo derivado separados." ]},
    {id: "offroad_materials", title: bi("05. Materiais Offroad", "05. Offroad materials"), required: true, objective: "Publicar apenas artefatos aprovados e coerentes.", contentRules: ["Incluir teaser, memo, modelo e term sheet da mesma versão."], evidenceRules: ["Manifesto, fingerprint e autorização." ]},
    {id: "open_items", title: bi("06. Pontos em aberto", "06. Open items"), required: true, objective: "Mostrar lacunas e status sem simular completude.", contentRules: ["Classificar impacto e responsável."], evidenceRules: ["Registro governado de lacunas e exceções." ]},
  ],
  consistencyChecks: [...commonConsistency, "Originais permanecem imutáveis e separados de análises e materiais derivados."],
  forbiddenClaims,
  disclaimer,
  source: {path: "packages/credit-playbook/src/material-templates.ts#institutional-data-room-index", effectiveDate: "2026-08-25"},
});

export const materialTemplates = [teaserTemplate, creditMemoTemplate, termSheetTemplate, dataRoomTemplate] as const;

export function materialTemplate(id: string): MaterialTemplate {
  const found = materialTemplates.find((template) => template.id === id);
  if (!found) throw new Error(`unknown material template ${id}`);
  return found;
}

export type MaterialTemplateReference = {id: string; version: string; registryHash: string};

export function materialTemplateReference(id: string): MaterialTemplateReference {
  const template = materialTemplate(id);
  return {id: template.id, version: template.version, registryHash: materialTemplateRegistryHash};
}

export const materialTemplateRegistryHash = createHash("sha256")
  .update(stableJson(materialTemplates))
  .digest("hex");

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
