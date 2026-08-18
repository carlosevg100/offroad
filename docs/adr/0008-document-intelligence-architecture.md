# ADR 0008 — Arquitetura da inteligência documental (P1): pipeline puro, extração ancorada verificada, gateway multi-provedor, evals como gate

Status: accepted (fundador, 18/08/2026 — "plano ok"; restrições de modelo e residência incorporadas: sem Haiku, sem usar modelo mais poderoso do que o necessário, worker em AWS Fargate `sa-east-1`)
Data: 2026-08-18
Plano de referência: `docs/build/P1_INTELLIGENCE_PLAN.md`

## Contexto

Até o P0 a "extração" era a reprodução do fixture Rede Horizonte casado por hash:
zero parsers, zero chamadas a modelos, zero evals. O produto precisa entender um
pacote desorganizado (DFs, balancetes, planilhas, planos, apresentações, cartas),
organizá-lo, conciliar fontes, entender o case e preparar materiais de mercado com
cada dado referenciado à origem — sem inventar números e sem que o modelo faça
conta. O Blueprint v3.0 (§13–§21, §36–§43) fixa os invariantes; faltava decidir a
arquitetura de execução.

## Decisão

1. **Pipeline como biblioteca pura + hosts finos.** As etapas (portaria, perfil,
   camadas, extração ancorada, normalização, spreading, conciliação, entendimento,
   financial-core, materiais) são funções tipadas em `packages/document-intelligence`
   (entrada → saída + trace + custo). Quem as hospeda é o worker isolado
   (`apps/document-worker`, F1), a CLI de evals e os testes. A biblioteca nunca toca
   banco, storage ou rede.
2. **Extração ancorada com verificador determinístico.** O modelo devolve, por
   structured output, `value_raw` literal, âncora (id de célula/linha/bloco/página da
   camada) e `quote`; **o código** confirma que a âncora existe, que o trecho está
   nela, que o valor está no trecho e que os dígitos não foram alterados; calcula o
   valor normalizado com Decimal aplicando a escala declarada; marca conflitos de
   escala/período/entidade. Só o que passa (`anchor_verified`) com precisão de
   célula/linha/bloco pode ser aceito automaticamente pela política v1 (D-014);
   páginas escaneadas ficam em modo degradado (âncora de página, revisão obrigatória)
   até o OCR (F6). O modelo nunca produz o valor normalizado nem números calculados.
3. **Ontologia como código.** `packages/credit-ontology` define o que se procura
   (taxonomia de documentos, catálogo de campos com padrões, plano de contas canônico,
   períodos/entidades, ranks de evidência 1–7, materialidade e política de auto-aceite,
   regras R1–R17, definições financeiras). Prompts são renderizados a partir dela;
   mudanças passam por PR com evals; a v1 aguarda revisão de especialista (D-013).
4. **Tiering por evidência, não por precaução.** Cada tarefa declara uma escada
   barato → forte (`extract_fields`: Sonnet 5 `medium` → Opus 5 `high` → GPT-5.6 Sol
   `high`). O pipeline só sobe um degrau quando o verificador aponta fraqueza no
   documento (âncoras não verificadas em campos materiais, divergência do shadow,
   saída inválida, conflito) — nunca porque um valor "parece estranho". Modelos de
   geração anterior (GPT-4o, GPT-4.1, Luna, Sonnet 4.6) ficam fora de produção: a
   economia é de ≈ US$ 1,5 por case, enquanto cache de prompt e a passada
   "localizar → extrair" economizam mais do que isso sem custo de qualidade; eles
   permanecem testáveis no sweep de evals (`experimentalModels`) para que a decisão
   seja revisitada com dado, por tipo de documento.
5. **Um gateway multi-provedor, sem Haiku.** `packages/model-gateway` é a única porta
   para LLMs: Anthropic (Opus 5, Sonnet 5) e OpenAI (GPT-5.6) via API, política por
   tarefa (primário / shadow com outro provedor / fallback), allowlist com denylist por
   padrão (Haiku, mini, nano, luna, famílias antigas), structured outputs validados por
   zod nos dois provedores, recusas nunca viram resultado, budgets por run com custo
   de tabela, mascaramento de CPF/e-mail antes da saída, `store:false` na OpenAI,
   cassetes para testes determinísticos, logs sem conteúdo. Fable 5 fica fora até haver
   política de retenção de 30 dias aceita (D-010).
6. **Evals como gate de release.** `packages/evals` + gold sets em
   `packages/testing-fixtures/gold/*` (G1 = Rede Horizonte a partir do gabarito
   sintético). Métricas do plano §14.2 (recall material, precisão, alucinação = aceito
   automaticamente sem âncora verificada, classificação, exceções, cálculos, critérios
   de aceite). Nenhuma mudança de prompt, modelo, parser ou ontologia entra sem eval;
   a linha de base do fixture (47,7% de recall material, 100% de precisão, 7/12
   exceções) está registrada e deve ser superada, nunca reescrita.
7. **Escopo dual sessão/oportunidade e capacidades sem service-role.** Perfis, camadas,
   spreads e brief nascem no escopo da `document_intake_session` e são promovidos à
   oportunidade na confirmação; o worker escreve por RPCs estreitas com token de
   capacidade por job e lê/grava objetos por URLs assinadas — nenhum componente recebe
   a service-role key (detalhe em F1).
8. **Sem framework agentic no P1.** O pipeline é um DAG determinístico com chamadas
   estruturadas; um job só vira agente autônomo quando eval provar ganho (Blueprint
   §38.3). Vercel Workflows/LangGraph ficam fora até haver orquestração entre serviços.

## Consequências

- O fixture deixa de ser "o extrator" e passa a ser gold case; produção continua com o
  caminho atual até o gate da F2, atrás de feature flag por organização.
- Todo número material do produto passa a ter três estados distintos e auditáveis:
  proposto pelo modelo, verificado pelo código, confirmado por pessoa.
- Trocar de modelo/provedor é configuração + eval, não reescrita; a dependência de um
  provedor externo (EUA) fica explícita e governada por D-010.
- Custo previsto de US$ 6–10 por case a preço de tabela e US$ 3–5 com cache de prompt e seleção de páginas; budgets e kill switch por run.
- Novos grupos de campos (`debt`, `customers`, `management_questions`) exigem
  migration da check constraint de `intake_field_candidates` antes de persistir.
