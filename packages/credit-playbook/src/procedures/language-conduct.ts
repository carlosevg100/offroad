import type {CanonicalProcedure, ProcedureOutputField, ProcedureRole} from "../procedure-contract";
import {canonicalProcedureSchema, compileProcedureRegistry} from "../procedure-contract";
import {materialTemplates} from "../material-templates";
import {referenceDataKeys} from "../reference-data";

const VERSION = "2026.08.25-v1";
const SOURCE = "packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";

type ConductSpec = {
  id: string;
  houseId: `LC-${string}`;
  title: {pt: string; en: string};
  role: ProcedureRole;
  stage: number;
  objective: string;
  product: string;
  decisionRules: string[];
  redFlags: string[];
  stopConditions: string[];
  outputs?: ProcedureOutputField[];
  templates?: string[];
  authorities?: Array<"LEI" | "DEF" | "CASA" | "MERCADO" | "HEURÍSTICA">;
  legalReviewRequired?: boolean;
  gold: string;
  adversarial: string;
};

const statusField: ProcedureOutputField = {
  id: "status",
  type: "enum",
  required: true,
  description: "Resultado do controle para a versão exata do artefato.",
  evidenceRequired: false,
  allowedValues: ["pass", "blocked", "review"],
};

const findingsField: ProcedureOutputField = {
  id: "findings",
  type: "array",
  required: true,
  description: "Findings com regra, código, severidade, localização e tratamento.",
  evidenceRequired: false,
};

const commonEvidence = {
  hierarchy: [
    "Artefato e claims da versão exata",
    "Claim registry e calculation traces",
    "Autorizações, destinatários, conflitos e registros datados",
    "Glossário, disclaimer e políticas versionadas da casa",
  ],
  rules: [
    "Executar sobre a versão e o fingerprint exatos do artefato.",
    "Bloqueio determinístico não pode ser dispensado por uma chamada de modelo.",
    "Finding identifica a regra LC de origem e não produz parecer de crédito.",
  ],
  materialClaimsRequireSupport: true as const,
};

function procedure(spec: ConductSpec): CanonicalProcedure {
  return canonicalProcedureSchema.parse({
    id: spec.id,
    version: VERSION,
    maturity: "candidate",
    title: spec.title,
    role: spec.role,
    blueprintStage: spec.stage,
    owner: {role: spec.role === "market_distribution" ? "Head de Mercado e Distribuição" : "Responsável independente de Quality Control"},
    objective: spec.objective,
    product: spec.product,
    procedure: [{
      id: "audit",
      title: "Executar controle determinístico",
      instructions: [
        ...spec.decisionRules,
        "Registrar findings sem reescrever silenciosamente o artefato.",
        "Bloquear a transição quando qualquer stop condition ocorrer.",
      ],
      mode: "deterministic",
      tools: ["conduct_policy"],
      evidenceInputs: commonEvidence.hierarchy,
    }],
    output: {schemaId: `offroad.${spec.id}.v1`, fields: [statusField, findingsField, ...(spec.outputs ?? [])]},
    evidence: commonEvidence,
    tests: {
      unit: ["regra retorna reason code estável", "fingerprint muda quando o artefato muda"],
      gold: [spec.gold],
      adversarial: [spec.adversarial],
      acceptance: ["nenhum bloqueio é reduzido a warning por modelo", "finding aponta para a regra canônica e a versão exata"],
    },
    source: {path: `${SOURCE}#${spec.houseId}`, effectiveDate: "2026-08-25"},
    knowledge: {
      houseProcedureIds: [spec.houseId],
      authorities: spec.authorities ?? ["CASA"],
      referenceDataKeys: [],
      legalReviewRequired: spec.legalReviewRequired ?? false,
    },
    prerequisites: ["Artefato versionado", "Contexto de organização e case conhecido"],
    dependencies: [],
    decisionRules: spec.decisionRules,
    redFlags: spec.redFlags,
    stopConditions: spec.stopConditions,
    exceptions: [],
    templates: spec.templates ?? [],
    examples: {
      positive: [spec.gold],
      negative: [spec.adversarial],
    },
    runtime: {
      orchestration: "deterministic_pipeline",
      peerHandoffs: false,
      maxModelCalls: 0,
      modelPurpose: [],
      allowedTools: ["conduct_policy"],
    },
  });
}

const specs: ConductSpec[] = [
  {
    id: "validate-claim-support", houseId: "LC-01", title: {pt: "Validar suporte de afirmações", en: "Validate claim support"}, role: "independent_quality_control", stage: 9,
    objective: "Impedir que uma afirmação material circule sem fonte, calculation trace ou aprovação exata quando for julgamento.",
    product: "Registro de claims aceitos e bloqueados com suporte e fingerprint.",
    decisionRules: ["Fato material exige fonte.", "Cálculo material exige trace.", "Julgamento material exige suporte e aprovação do fingerprint exato."],
    redFlags: ["Citação genérica", "Support id inexistente", "Aprovação herdada de versão anterior"], stopConditions: ["Claim material sem suporte", "Julgamento material sem aprovação exata"],
    gold: "Claim de dívida cita o cálculo e todas as suas entradas ancoradas.", adversarial: "Número correto em claim cita uma fonte que contém outro período.",
  },
  {
    id: "validate-material-qualifiers", houseId: "LC-02", title: {pt: "Validar qualificadores materiais", en: "Validate material qualifiers"}, role: "independent_quality_control", stage: 9,
    objective: "Remover adjetivos analíticos vazios e exigir base verificável para toda qualificação material.", product: "Findings de qualificadores sem base explícita.",
    decisionRules: ["Robusto, forte, sólido, resiliente, atrativo e equivalentes exigem basis explícito.", "Suporte genérico não substitui a razão da qualificação."],
    redFlags: ["Adjetivo promocional", "Superlativo", "Qualificação sem métrica ou fato"], stopConditions: ["Qualificador muda a leitura de risco e não possui basis"],
    gold: "Liquidez é qualificada pela cobertura calculada e pelo período.", adversarial: "Companhia descrita como líder sem métrica, fonte ou definição de mercado.",
  },
  {
    id: "enforce-risk-first", houseId: "LC-03", title: {pt: "Aplicar risco primeiro", en: "Enforce risk first"}, role: "independent_quality_control", stage: 9,
    objective: "Garantir que restrições e riscos materiais apareçam antes da narrativa promocional que poderiam qualificar.", product: "Validação da ordem e presença dos riscos materiais.",
    decisionRules: ["Risco material aparece antes do benefício correspondente.", "Tratamento não elimina a descrição do risco original."],
    redFlags: ["Risco escondido em nota final", "Mitigante apresentado sem risco", "Sumário só promocional"], stopConditions: ["Material omite risco material conhecido"],
    gold: "Memo apresenta concentração antes da diversificação planejada.", adversarial: "Risco só aparece no apêndice depois do caso de investimento.",
  },
  {
    id: "enforce-house-vocabulary", houseId: "LC-04", title: {pt: "Aplicar vocabulário da casa", en: "Enforce house vocabulary"}, role: "independent_quality_control", stage: 9,
    objective: "Preservar a natureza indicativa e separar proposta, elegibilidade, decisão e termo final.", product: "Lint de vocabulário com substituição controlada sugerida.",
    decisionRules: ["Estrutura é indicativa ou proposta até decisão do financiador.", "Elegível não significa aprovado.", "Termo final nunca é atribuído à Offroad."],
    redFlags: ["Termos finais", "Operação aprovada", "Preço fechado", "Recomendação de investimento"], stopConditions: ["Vocabulário atribui decisão do financiador à Offroad"],
    gold: "Estrutura indicativa sujeita à diligência e decisão do financiador.", adversarial: "Termos finais definidos pela Offroad.",
  },
  {
    id: "block-outcome-promises", houseId: "LC-05", title: {pt: "Bloquear promessas de resultado", en: "Block outcome promises"}, role: "independent_quality_control", stage: 11,
    objective: "Bloquear qualquer promessa de aprovação, funding, prazo de terceiro ou resultado fora do controle da Offroad.", product: "Gate de fronteira da assessoria com reason codes.",
    decisionRules: ["Offroad não aprova crédito.", "Offroad não compromete capital.", "Offroad não garante captação, timing do investidor ou closing."],
    redFlags: ["Funding garantido", "Crédito aprovado", "Dinheiro na conta em data certa"], stopConditions: ["Texto ou fala contém promessa de resultado"],
    gold: "Material informa prazo de preparação sob controle da Offroad.", adversarial: "Mensagem promete desembolso em trinta dias.",
  },
  {
    id: "enforce-advisory-disclaimer", houseId: "LC-06", title: {pt: "Aplicar disclaimer de assessoria", en: "Enforce advisory disclaimer"}, role: "independent_quality_control", stage: 11,
    objective: "Garantir que todo material externo carregue o disclaimer aprovado e versionado da fronteira de assessoria.", product: "Presença, versão e fingerprint do disclaimer.",
    decisionRules: ["Material externo sem disclaimer é bloqueado.", "Texto do disclaimer não pode ser improvisado.", "Resposta a aprovação usa o texto padrão versionado."],
    redFlags: ["Disclaimer ausente", "Disclaimer alterado", "Resposta improvisada sobre aprovação"], stopConditions: ["Versão do disclaimer não é a aprovada ou está ausente"],
    templates: ["institutional-teaser", "institutional-credit-memo", "indicative-term-sheet", "institutional-data-room-index"], authorities: ["LEI", "CASA"], legalReviewRequired: true,
    gold: "Teaser contém o disclaimer aprovado da versão corrente.", adversarial: "Documento usa disclaimer antigo que omite a diligência do financiador.",
  },
  {
    id: "verify-bilingual-economics", houseId: "LC-07", title: {pt: "Verificar identidade econômica bilíngue", en: "Verify bilingual economic identity"}, role: "independent_quality_control", stage: 9,
    objective: "Provar que PT e EN apresentam os mesmos números, moedas, percentuais, múltiplos e termos econômicos.", product: "Diff econômico bilíngue com bloqueio por divergência.",
    decisionRules: ["Números derivam da mesma base decimal.", "Tradução não arredonda novamente.", "Termo novo entra no glossário antes de circular."],
    redFlags: ["Prazo diferente entre idiomas", "Conversão de moeda não declarada", "Covenant traduzido com definição diferente"], stopConditions: ["Qualquer payload econômico diverge entre PT e EN"],
    gold: "1.234,5 em PT e 1,234.5 em EN derivam do mesmo valor.", adversarial: "Prazo de 48 meses em PT vira 60 meses em EN.",
  },
  {
    id: "enforce-case-confidentiality", houseId: "LC-08", title: {pt: "Aplicar confidencialidade entre casos", en: "Enforce cross-case confidentiality"}, role: "independent_quality_control", stage: 11,
    objective: "Impedir uso ou divulgação de informação fora da organização, case, finalidade e destinatário autorizados.", product: "Gate de tenant, case, destinatário e finalidade.",
    decisionRules: ["Organização e case de origem precisam coincidir com o contexto de destino.", "Destinatário e versão precisam estar autorizados.", "Benchmark agregado precisa ser irreversivelmente anonimizado."],
    redFlags: ["Exemplo identificável de outro cliente", "Destinatário não autorizado", "Benchmark reconhecível por eliminação"], stopConditions: ["Qualquer mismatch de tenant ou case", "Destinatário não autorizado"], authorities: ["LEI", "CASA"], legalReviewRequired: true,
    gold: "Material autorizado permanece no tenant e destinatário corretos.", adversarial: "Trecho de outro case aparece como exemplo setorial.",
  },
  {
    id: "check-engagement-conflicts", houseId: "LC-09", title: {pt: "Checar conflitos do mandato", en: "Check engagement conflicts"}, role: "independent_quality_control", stage: 1,
    objective: "Detectar sobreposição de mandato e impedir atuação nos dois lados da mesma operação.", product: "Registro de conflito claro, revelado e aceito ou bloqueado.",
    decisionRules: ["Nunca representar os dois lados da mesma operação.", "Sobreposição material exige revelação e aceite ou declínio.", "Decisão fica registrada no case."],
    redFlags: ["Mesmo bolso e setor no mesmo período", "Mandato oposto na mesma operação", "Conflito sem disclosure"], stopConditions: ["Conflito não resolvido", "Offroad está nos dois lados da mesma operação"],
    gold: "Sobreposição é revelada e aceita com trilha.", adversarial: "Novo mandato é aceito sem consultar a carteira ativa.",
  },
  {
    id: "record-material-commitments", houseId: "LC-10", title: {pt: "Registrar compromissos materiais", en: "Record material commitments"}, role: "market_distribution", stage: 12,
    objective: "Manter número, prazo, termo e conversa relevante em registro escrito, datado e vinculado ao case.", product: "Nota ou comunicação com autor, data, destinatário e conteúdo material.",
    decisionRules: ["Nada material é dito se não puder ser sustentado por escrito.", "Compromisso verbal relevante vira registro datado.", "Registro não altera a natureza indicativa da estrutura."],
    redFlags: ["Prazo verbal sem nota", "Termo econômico em canal não registrado", "Mensagem sem destinatário"], stopConditions: ["Compromisso material externo não possui registro escrito"],
    gold: "Sondagem registra termo indicativo, pessoa, data e contexto.", adversarial: "Prazo é prometido por telefone e nunca entra no case.",
  },
  {
    id: "qualify-unknowns", houseId: "LC-11", title: {pt: "Qualificar o que ainda não se sabe", en: "Qualify what remains unknown"}, role: "independent_quality_control", stage: 5,
    objective: "Responder com velocidade sem converter ausência ou análise incompleta em certeza.", product: "Resposta com conhecido, lacuna, dependência e data absoluta de resolução.",
    decisionRules: ["Não sabemos ainda é estado válido.", "Resposta parcial nomeia dependência e data absoluta.", "Chute confiante é proibido."],
    redFlags: ["Estimativa silenciosa", "Data relativa", "Certeza sem evidência"], stopConditions: ["Informação material desconhecida é apresentada como fato"],
    gold: "Resposta separa o valor conhecido do item dependente do balancete e informa a data.", adversarial: "Analista preenche lacuna com aproximação não marcada.",
  },
  {
    id: "log-diligence-surprises", houseId: "LC-12", title: {pt: "Registrar surpresas de diligência", en: "Log diligence surprises"}, role: "independent_quality_control", stage: 12,
    objective: "Converter toda surpresa levantada pelo financiador em finding atribuível e melhoria versionada do sistema.", product: "Registro de surpresa, procedimento responsável e ação corretiva.",
    decisionRules: ["Toda surpresa é registrada.", "Finding aponta para o módulo ou procedimento que deveria ter capturado o item.", "Ação corretiva gera emenda, teste ou procedimento versionado."],
    redFlags: ["Surpresa descartada como pontual", "Sem causa responsável", "Sem ação corretiva"], stopConditions: ["Surpresa material não registrada antes do encerramento da revisão"],
    gold: "Ônus descoberto em diligência gera finding em ES-13 e caso adversarial.", adversarial: "Item levantado pelo fundo não altera o playbook nem os testes.",
  },
  {
    id: "enforce-house-form", houseId: "LC-13", title: {pt: "Aplicar forma da casa", en: "Enforce house form"}, role: "independent_quality_control", stage: 9,
    objective: "Aplicar forma institucional consistente, precisa e auditável em todo texto da casa.", product: "Lint de travessão, datas relativas, moeda, separador e siglas.",
    decisionRules: ["Travessão é proibido.", "Datas são absolutas.", "Moeda e unidade são explícitas.", "Sigla é aberta na primeira ocorrência ou consta do glossário."],
    redFlags: ["Travessão", "Recentemente", "Número sem moeda ou unidade", "Sigla não aberta"], stopConditions: ["Forma altera ou torna ambíguo o significado econômico"],
    gold: "Em 31/12/2025, a dívida ajustada era de R$ 182,4 milhões.", adversarial: "Recentemente a alavancagem melhorou bastante.",
  },
];

export const languageConductProcedures = specs.map(procedure);

export const languageConductProcedureRegistry = compileProcedureRegistry(
  languageConductProcedures,
  materialTemplates.map((template) => template.id),
  referenceDataKeys,
);
