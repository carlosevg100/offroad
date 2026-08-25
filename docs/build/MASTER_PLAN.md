# Offroad Capital - Master Build Plan

Versão: 1.0
Fonte de produto: Blueprint v3.0 pt-BR
Método: dependências, gates objetivos e evidência de aceite. Este plano não representa cronograma.

## 1. Princípios de execução

1. Cada incremento atravessa UI, domínio, autorização, persistência, observabilidade, teste e documentação quando essas camadas forem aplicáveis.
2. Nenhum gate posterior contorna invariantes de tenancy, evidência, cálculo determinístico, autorização humana ou disclosure.
3. `main` recebe mudanças apenas por pull request e checks obrigatórios depois do bootstrap inicial do repositório vazio.
4. Ambientes são separados em local, preview, staging e production; secrets vivem somente nos secret stores.
5. Produção pública permanece `noindex` e sem ativação de mercado até os clearances de marca, jurídico, regulatório, privacidade e segurança.
6. O mesmo payload econômico produz números idênticos em `pt-BR` e `en-US`.

## 2. Grafo principal

```text
B0 Fundação
  -> B1 Marca, design, i18n e website
  -> B2 Auth, organizações e shell
  -> B3 Autoridade, empresa, oportunidade e RLS
  -> B4 Documentos e evidence ledger
  -> B5 Spreading, reconciliação e financial core
  -> B6 Crédito, capacidade, downside, estrutura e garantias
  -> B7 Agent Kernel, Brain e Copilot
  -> B8 Outputs e evidence compiler
  -> B9 Provedores de capital, mandatos e matching
  -> B10 Discovery, ativação e handoff
  -> B11 Admin e operações internas
  -> B12 Analytics, observabilidade e economics
  -> B13 Privacy, regulação e hardening
  -> B14 Deployment production-ready
  -> B15 Aceitação end-to-end
```

B11-B13 podem avançar em paralelo após B3, mas nenhum deles é considerado completo sem os objetos e workflows dos gates que observa ou governa.

## 3. Gates executáveis

### B0 - Orientação e fundação do repositório

Dependências: repositório oficial identificado.

Tarefas:

- B0.1 confirmar `owner/repo`, conta GitHub, branch e estado remoto;
- B0.2 criar checkout local sem alterar `main` e preservar fontes fornecidas;
- B0.3 registrar Node, pnpm, Next.js, React, TypeScript e política de versões;
- B0.4 configurar monorepo, workspaces, Turborepo e scripts reproduzíveis;
- B0.5 criar lint, typecheck, unit tests e build como quality gate local;
- B0.6 criar CI inicial, CODEOWNERS e templates de PR/issue;
- B0.7 criar `.env.example`, access register e secret policy;
- B0.8 versionar o Blueprint e seu hash;
- B0.9 criar ledgers, ADRs e registro de riscos;
- B0.10 documentar o bootstrap excepcional de `main` exigido pelo repositório vazio.

Gate de aceite:

- checkout aponta para `carlosevg100/offroad`;
- branch de trabalho é `codex/b0-foundation`;
- `pnpm check` passa em máquina limpa sem secrets;
- CI pode executar sem credenciais de produção;
- Blueprint, stack e fontes de verdade são identificáveis;
- scan local não encontra segredo versionado.

### B1 - Marca configurável, design system, i18n e website

Dependências: B0.

Tarefas:

- B1.1 manter nome, slug, domínio, e-mail, assinatura e categoria em configuração central;
- B1.2 documentar clearance de marca e histórico da antiga OffRoad Capital como bloqueio de lançamento;
- B1.3 criar tokens de cor, tipografia, espaçamento, estados e motion;
- B1.4 implementar componentes acessíveis e estados em Storybook;
- B1.5 implementar landing, páginas por ICP, Como Funciona, Segurança, Sobre e Contato;
- B1.6 implementar placeholders legais explicitamente não finais;
- B1.7 publicar `pt-BR` e `en-US` com roteamento, metadata, canonical e hreflang;
- B1.8 implementar SEO técnico, sitemap, Open Graph e consent shell sem telemetria sensível;
- B1.9 executar axe, keyboard QA, contraste, expansão de texto e visual regression;
- B1.10 medir Core Web Vitals e budget de bundle.

Gate de aceite:

- nenhuma string de interface fica fora dos catálogos de mensagens;
- nenhuma identidade pública fica hardcoded fora da configuração central;
- visual é original, editorial, calmo, responsivo e não replica as referências;
- rotas críticas funcionam com teclado e leitores de tela;
- variantes PT/EN mantêm estrutura e economia equivalentes;
- preview pode ser compartilhado internamente, mas produção segue `noindex` até clearance.

### B2 - Auth, organizações, onboarding e shell

Dependências: B0; design primitives de B1; projeto Supabase de desenvolvimento.

Tarefas:

- B2.1 iniciar Supabase local e migrations versionadas;
- B2.2 criar profiles, organizations, memberships e invitations;
- B2.3 integrar Auth SSR, e-mail verification, magic link, password e recovery;
- B2.4 preparar OAuth Google/Microsoft sem ativar antes de redirect URIs e consentimento;
- B2.5 implementar MFA, AAL e step-up para ações sensíveis;
- B2.6 implementar onboarding distinto para empresa, originador e financiador;
- B2.7 criar shell com rail global, rail da oportunidade, canvas e inspector;
- B2.8 proteger rotas server-side e testar sessão expirada/revogação;
- B2.9 implementar audit events mínimos de identidade;
- B2.10 concluir jornadas PT/EN de cadastro, login, recuperação e convite.

Gate de aceite: sessão segura, onboarding recuperável, rotas protegidas no servidor e nenhuma inferência cross-tenant.

### B3 - Autoridade, empresa, oportunidade e RLS

Dependências: B2.

Tarefas:

- B3.1 implementar registry global mínimo não enumerável;
- B3.2 criar company record privado, legal entities e ownership links;
- B3.3 criar capital request, opportunity, fingerprint e lead único;
- B3.4 modelar mandates, authority evidence, powers, grants e expiração;
- B3.5 implementar conflict/exclusivity review e workflow de duplicidade;
- B3.6 implementar disclosure grants e recipient scope;
- B3.7 habilitar e forçar RLS com policies CRUD e `WITH CHECK`;
- B3.8 usar foreign keys compostas que carregam `organization_id`;
- B3.9 criar pgTAP/non-interference suite para owner, membro restrito, outro tenant e anônimo;
- B3.10 testar Realtime, views, RPC, search e contagens contra inferência.

Gate de aceite: company-direct e originator-led compartilham o mesmo core; outro tenant não lê nem infere; revogação interrompe acesso futuro.

### B4 - Documentos e evidence ledger

Dependências: B3; decisão sobre residência e isolamento do worker.

Tarefas:

- B4.1 criar buckets privados e signed upload curto emitido pelo servidor;
- B4.2 calcular hash, registrar metadata imutável e manter quarentena;
- B4.3 validar magic bytes, tamanho, decompression ratio, senha, macro e malware;
- B4.4 executar conversão e parsing em sandbox isolado;
- B4.5 implementar adapters por formato e manifest de processamento;
- B4.6 criar anchors de PDF, sheet, célula, tabela, linha e região;
- B4.7 implementar candidate fact, review state, confidence e provenance;
- B4.8 criar evidence viewer com preview sanitizado;
- B4.9 reautorizar downloads, aplicar TTL curto, watermark e audit event;
- B4.10 testar arquivos hostis, parser failure, cross-tenant e revogação.

Gate de aceite: arquivo hostil não executa; nenhum dado promovido perde sua âncora; falha parcial não vira fato aprovado.

### B5 - Spreading, reconciliação e financial core

Dependências: B4.

Tarefas:

- B5.1 modelar chart of accounts, mappings, períodos, moeda, unidade e entidade;
- B5.2 implementar statement identity checks e exceptions tipadas;
- B5.3 reconciliar DRE, balanço, fluxo de caixa, dívida, contábil e gerencial;
- B5.4 criar pure functions para LTM, EBITDA, working capital e CFADS;
- B5.5 implementar leverage, coverage, DSCR, debt schedule, fees e custo all-in;
- B5.6 implementar benchmarks, floating rate, carência, bullet, step-up e amortização;
- B5.7 implementar collateral haircuts, covenant headroom e downside;
- B5.8 usar Decimal em toda verdade financeira e persistência;
- B5.9 criar golden supermarket fixture, property tests e boundary cases;
- B5.10 gerar hash por input, policy version e resultado.

Gate de aceite: identidades fecham ou bloqueiam; cálculo é reproduzível; LLM não participa da matemática; PT/EN são economicamente idênticos.

### B6 - Crédito, capacidade, downside, estrutura e garantias

Dependências: B5.

Tarefas:

- B6.1 compilar credit profile com fatos, riscos, mitigantes e gaps separados;
- B6.2 construir capacity bridge entre pedido, fluxo de caixa, garantias e mercado;
- B6.3 criar cenários conservador, recomendado e stretch;
- B6.4 implementar Structure Lab com branch, compare, restore e versionamento;
- B6.5 modelar termos, ranges, covenant sets e policy guards;
- B6.6 implementar collateral map e recovery questions;
- B6.7 separar capacidade observada, recomendação, preferência e market-sounding aprovado;
- B6.8 implementar typed change command, impact preview e aprovação;
- B6.9 invalidar outputs/matches dependentes quando cenário mudar;
- B6.10 testar estruturas inviáveis, stale approval e concorrência.

Gate de aceite: nenhuma estrutura inviável ativa mercado; toda mudança cria versão e diff; solicitação e recomendação nunca se sobrescrevem.

### B7 - Agent Kernel, Brain e Copilot

Dependências: B3 para autorização; B4-B6 para ferramentas e evidências reais.

Tarefas:

- B7.1 criar registry, TaskEnvelope e schemas de input/output;
- B7.2 implementar tool allowlists, evidence, memory, budget e escalation policies;
- B7.3 criar tool gateway on-behalf-of e workload identities estreitas;
- B7.4 implementar LangGraph do Deal Captain com interrupts e checkpoints;
- B7.5 separar Evidence, Credit Graph, Policy/Math, Capital Intelligence, Retrieval, Case Memory e Evaluation planes;
- B7.6 implementar retrieval por tenant, opportunity, purpose, scopes e version;
- B7.7 criar mutation protocol com preview/aprovação/commit/receipt;
- B7.8 criar offline evals, golden/adversarial cases, shadow e canary;
- B7.9 implementar kill switches, trace redigido e console operacional;
- B7.10 testar prompt injection, loop, budget, stale state e tool abuse.

Gate de aceite: tool fora da allowlist falha; números vêm do core; chat não é state store; output sem suporte recusa de forma segura.

### B8 - Outputs e evidence compiler

Dependências: B5-B7.

Tarefas:

- B8.1 criar claim objects e coverage rules;
- B8.2 compilar Financing Readiness, Credit Profile, Capacity e Proposed Structure;
- B8.3 gerar Blind Teaser, Lender Package e credit-focused IM;
- B8.4 gerar Match List, Diligence Roadmap, Indicative Term Sheet e Handoff Package;
- B8.5 renderizar HTML, PDF e documento editável com versões imutáveis;
- B8.6 regenerar PT/EN do payload canônico, preservando números e anchors;
- B8.7 criar evidence index, freshness e staleness propagation;
- B8.8 implementar review, four-eyes, approval e disclosure check;
- B8.9 testar claim sem suporte, tradução divergente e dependência stale;
- B8.10 validar acessibilidade e qualidade visual dos outputs.

Gate de aceite: claim material sem suporte bloqueia; versão compartilhada é imutável; outputs issuer-side nunca fingem aprovação buy-side.

### B9 - Provedores de capital, mandatos e matching

Dependências: B3 e B6; B8 para materiais compartilháveis.

Tarefas:

- B9.1 criar organizations/users de capital, funds, strategies e mandates;
- B9.2 versionar declared mandate, observed pre-introduction appetite e process intelligence;
- B9.3 registrar relationship context, provenance, confidence e freshness;
- B9.4 implementar hard filters por cenário;
- B9.5 implementar ranking multiobjetivo e penalidade de staleness;
- B9.6 explicar fit, mismatch, sensitivity e mudança de ranking;
- B9.7 implementar club/tranche matching e `do_not_contact`;
- B9.8 criar saved search, watchlist e alert;
- B9.9 testar não interferência entre fundos e ausência de pay-to-rank;
- B9.10 validar linguagem que não sugere probabilidade de aprovação.

Gate de aceite: lista é curta e explicável; mandato stale é visível; informação confidencial de um fundo nunca aparece para outro.

### B10 - Discovery, ativação de mercado e handoff

Dependências: B8-B9; matriz regulatória aplicável.

Tarefas:

- B10.1 materializar Published Opportunity Projection imutável;
- B10.2 implementar discovery blind/identified sem consultar workspace privado;
- B10.3 implementar recipient-specific access requests e grants;
- B10.4 criar regulatory action check antes de contato;
- B10.5 implementar dupla aprovação de conteúdo, identidade e destinatários;
- B10.6 registrar pass, pergunta, request access e interest sem inferir silêncio;
- B10.7 criar mutual introduction e pacote de handoff;
- B10.8 modelar outcomes opcionais como reported/confirmed/verified/inferred/unknown;
- B10.9 testar revogação, recipient mismatch e stale projection;
- B10.10 encerrar promessa operacional no handoff.

Gate de aceite: cada destinatário recebe somente o snapshot autorizado; introdução exige consentimento competente; pós-introdução permanece unknown sem update legítimo.

### B11 - Admin, quality, coverage e operações internas

Dependências: B3; amplia conforme B4-B10.

Tarefas:

- B11.1 criar assignment interno com prazo, finalidade e acesso mínimo;
- B11.2 implementar filas four-eyes de fatos, cenários, outputs e ativação;
- B11.3 criar policy administration e versionamento;
- B11.4 criar Fund Coverage workspace e freshness queue;
- B11.5 implementar access review, break-glass e expiração automática;
- B11.6 criar audit explorer redigido e export seguro;
- B11.7 criar suporte sem acesso ao conteúdo por padrão;
- B11.8 testar separação de função e funcionário sem assignment;
- B11.9 criar runbooks de operações e escalonamento;
- B11.10 medir tempo humano, correções e backlog de exceções.

Gate de aceite: emprego na Offroad não concede acesso global; acesso interno é atribuído, temporário e auditável.

### B12 - Analytics, observabilidade e economics

Dependências: event taxonomy aprovada; objetos dos gates observados.

Tarefas:

- B12.1 criar schema registry allowlisted de eventos PostHog;
- B12.2 bloquear replay e autocapture em superfícies sensíveis;
- B12.3 criar redaction processors do Sentry;
- B12.4 instrumentar OpenTelemetry de app, workflow, agent e tool sem payload bruto;
- B12.5 definir SLI/SLO de rotas, workflows e jornadas críticas;
- B12.6 implementar alerting, release tracking e trace correlation;
- B12.7 medir custo por workflow, model call, documento e oportunidade;
- B12.8 medir horas humanas, correções e unit economics;
- B12.9 testar telemetria com PII/documento/número financeiro como casos negativos;
- B12.10 documentar dashboard e resposta a alertas.

Gate de aceite: nenhum evento/log/trace comum contém PII ou número financeiro; custo e confiabilidade são observáveis por opportunity.

### B13 - Privacy, regulação e security hardening

Dependências: B3 e arquitetura de dados; matriz instrumento-ato-parceiro.

Tarefas:

- B13.1 criar threat models por boundary e data flow;
- B13.2 manter data inventory, RoPA, retention, deletion e legal holds;
- B13.3 registrar transferências internacionais e providers/subprocessors;
- B13.4 implementar DLP, taint tracking e outbound policy;
- B13.5 criar matriz jurisdição-instrumento-ato-responsabilidade-fee-comunicação;
- B13.6 bloquear atos market-facing sem policy e parceiro aplicável;
- B13.7 implementar security headers, WAF, rate limit e abuse prevention;
- B13.8 ativar SAST, secret/dependency/container scans, SBOM e attestation;
- B13.9 executar pen test proporcional ao release gate;
- B13.10 testar incident response, backup, restore e revogação.

Gate de aceite: nenhum blocker crítico; RLS/non-interference passam; restore real é comprovado; produto descreve honestamente limites de download e revogação.

### B14 - Deployment e operação production-ready

Dependências: B1 para preview; B2+ para ambientes de aplicação; B13 para produção pública.

Tarefas:

- B14.1 criar projetos/ambientes Vercel, Supabase, Railway e AWS aprovados;
- B14.2 configurar local, preview, staging e production com secrets isolados;
- B14.3 usar OIDC/workload identity onde suportado;
- B14.4 configurar custom domains, redirects, TLS, e-mail e DNS;
- B14.5 proteger previews e production promotion;
- B14.6 testar migrations expand/contract e rollback;
- B14.7 configurar health checks, alerts, backups e restore;
- B14.8 testar provider outage, queue recovery e disaster recovery;
- B14.9 promover o mesmo artefato quando possível;
- B14.10 registrar runbook de deploy, rollback e incident commander.

Gate de aceite: produção exige checks/aprovações; secrets não passam pelo Git; health/alerts funcionam; rollback é exercitado.

### B15 - Aceitação end-to-end

Dependências: B0-B14.

Tarefas:

- B15.1 CFO cria empresa e oportunidade;
- B15.2 originador cria draft sob mandato válido;
- B15.3 segundo originador tenta duplicar a tese;
- B15.4 pacote fragmentado é processado e inconsistências são detectadas;
- B15.5 usuário corrige/aprova fatos e financial core calcula capacidade;
- B15.6 usuário explora estrutura via UI e Copilot com preview;
- B15.7 outputs PT/EN são gerados com evidência e números idênticos;
- B15.8 fundo encontra blind teaser, solicita acesso e recebe grant aprovado;
- B15.9 introdução/handoff acontece sem inferir estado posterior;
- B15.10 executar abuso, outro tenant, arquivo hostil, injection, stale state, outage, rate limit e rollback.

Gate de aceite: todos os critérios do Blueprint passam, cálculos são reproduzíveis, não há blocker crítico e a experiência completa é navegável, rápida, auditável e permissionada.

## 4. Definition of done por task

Uma task só recebe `done` com: código completo; testes proporcionais; lint/typecheck/build; security review; accessibility/i18n quando houver UI; observabilidade; documentação; migration/rollback quando aplicável; evidência de aceite; nenhum TODO crítico oculto.

Estados permitidos: `not_started`, `ready`, `in_progress`, `blocked_access`, `blocked_decision`, `in_review`, `done`.

## 5. Biblioteca operacional executável

Decisão arquitetural: ADR 0013.

1. A Constituição Operacional é camada 0 e não é executada como prompt.
2. Procedimentos canônicos são a única fonte de conhecimento editável.
3. Skills são compiladas, fechadas por schema e executadas pelo pipeline determinístico.
4. Papéis organizam responsabilidade; não são agentes autônomos.
5. Templates são fechados dentro da vertical que os utiliza.
6. A primeira vertical é expansão/capex corporativo e permanece `candidate` até revisão técnica,
   gold cases, adversariais e quality gates.
7. Próxima promoção: revisar os 19 procedimentos e quatro templates conteúdo a conteúdo, adicionar
   cálculos e schemas específicos ainda representados por contratos genéricos, produzir os quatro
   artefatos gold completos e medir a vertical inteira antes de promover qualquer item a production.
