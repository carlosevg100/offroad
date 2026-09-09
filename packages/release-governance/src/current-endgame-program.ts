import type {
  CapabilityTransition,
  EndgameProgramBoard,
  ProgramAcceptance,
  ProgramBlocker,
  ProgramSubtask,
  ProgramTask,
  ProgramTaskState,
  ProgramReleaseId,
} from "./endgame-program-board";

const generatedAt = "2026-09-07T21:40:23.000-03:00";

type TaskInput = {
  taskId: string;
  releaseId: ProgramReleaseId;
  title: string;
  outcome: string;
  state?: ProgramTaskState;
  ownerRole: string;
  dependsOn?: string[];
  steps: string[];
  subtaskState?: Array<{index: number; state: ProgramSubtask["state"]}>;
  acceptance: string[];
  evidenceRefs?: string[];
  capabilityRefs?: string[];
  acceptanceState?: Array<{index: number; status: ProgramAcceptance["status"]; evidenceRefs: string[]}>;
  blockers?: ProgramBlocker[];
  securityControlIds?: string[];
  blueprintRefs: string[];
  capabilityTransition?: CapabilityTransition | null;
};

function task(input: TaskInput): ProgramTask {
  const acceptanceState = new Map(input.acceptanceState?.map((item) => [item.index, item]) ?? []);
  const subtaskState = new Map(input.subtaskState?.map((item) => [item.index, item.state]) ?? []);
  return {
    taskId: input.taskId,
    releaseId: input.releaseId,
    title: input.title,
    outcome: input.outcome,
    state: input.state ?? "backlog",
    ownerRole: input.ownerRole,
    dependsOn: input.dependsOn ?? [],
    subtasks: input.steps.map((title, index): ProgramSubtask => ({
      subtaskId: `${input.taskId}.${String(index + 1).padStart(2, "0")}`,
      title,
      state: subtaskState.get(index) ?? (input.state === "in_progress" && index === 0 ? "in_progress" : input.state === "blocked" && index === 0 ? "blocked" : "pending"),
    })),
    acceptance: input.acceptance.map((description, index) => {
      const state = acceptanceState.get(index);
      return {
        criterionId: `${input.taskId}.AC${String(index + 1).padStart(2, "0")}`,
        description,
        status: state?.status ?? "pending",
        evidenceRefs: state?.evidenceRefs ?? [],
      };
    }),
    evidenceRefs: input.evidenceRefs ?? [],
    capabilityRefs: input.capabilityRefs ?? [],
    blockers: input.blockers ?? [],
    securityControlIds: input.securityControlIds ?? [],
    blueprintRefs: input.blueprintRefs,
    capabilityTransition: input.capabilityTransition ?? null,
  };
}

const B = "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md";
const S = "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md";

const tasks: ProgramTask[] = [
  task({taskId: "JOB-01", releaseId: "R1", title: "Pedido documental até entrega revisável", outcome: "Comparação, briefing e revisão de oportunidade chegam a resultado persistido e Word no mesmo workspace.", state: "in_progress", ownerRole: "Program integrator", dependsOn: ["UX-02"], steps: ["Conectar objetivo aprovado, fontes e executor documental", "Integrar leitura corrente, interface e Word", "Verificar isolamento, invalidação e recuperação", "Executar três jornadas com provedor real e revisão de domínio", "Publicar por escopo comprovado"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}, {index: 2, state: "in_progress"}], acceptance: ["Três pedidos produzem trabalhos distintos a partir dos documentos enviados", "Resultado e arquivo persistidos correspondem ao plano e às fontes atuais", "Modelo real, qualidade de domínio, custo e latência são comprovados", "Tarefa pontual não obriga jornada completa de estruturação"], blueprintRefs: ["docs/build/DOCUMENT_WORK_PRODUCTS_MILESTONE.md", `${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-APP-02", "TRUST-DATA-02", "TRUST-SDLC-01"]}),

  task({taskId: "CTRL-01", releaseId: "R0", title: "Reconciliar o estado real", outcome: "Baseline único de código, PRs, deploy, banco, ledger e documentos, sem claims conflitantes.", state: "in_progress", ownerRole: "Program integrator", steps: ["Fixar origin/main e inventariar PRs/deploys", "Comparar ledger, Build State, blueprint e evidências", "Registrar divergências e corrigir claims", "Congelar o baseline reconciliado"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}, {index: 2, state: "done"}], acceptance: ["Commit, ledger, PRs e ambientes têm referências verificáveis", "Toda divergência material aparece como finding com owner", "Reconciliação não concede uso de cliente ou autorização externa"], evidenceRefs: ["EV-MAIN-B6DA", "EV-LEDGER-V17", "EV-CAPABILITY-LEDGER"], acceptanceState: [{index: 0, status: "pending", evidenceRefs: []}, {index: 1, status: "passed", evidenceRefs: ["EV-CAPABILITY-LEDGER"]}, {index: 2, status: "passed", evidenceRefs: ["EV-CAPABILITY-LEDGER"]}], blueprintRefs: [`${B}#20.2-release-0---program-reset-e-referência-de-qualidade`, "docs/build/BUILD_STATE.md"], securityControlIds: ["TRUST-GOV-01", "TRUST-SDLC-01"]}),
  task({taskId: "CTRL-02", releaseId: "R0", title: "Endgame Program Board executável", outcome: "Fonte machine-readable com tarefas, dependências, owners, aceite, evidência, bloqueadores e transições de maturidade.", state: "code_complete", ownerRole: "Program control engineer", dependsOn: [], steps: ["Definir schema e fonte canônica", "Validar dependências, evidências e transições", "Gerar vista Markdown", "Integrar o gate ao CI"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}, {index: 2, state: "done"}], acceptance: ["Board inválido falha fechado", "Gate passed e promovido são impossíveis sem evidência", "Vista humana tem paridade byte a byte com a fonte"], evidenceRefs: ["EV-CTRL02-LOCAL-GATE"], acceptanceState: [{index: 0, status: "passed", evidenceRefs: ["EV-CTRL02-LOCAL-GATE"]}, {index: 1, status: "passed", evidenceRefs: ["EV-CTRL02-LOCAL-GATE"]}, {index: 2, status: "passed", evidenceRefs: ["EV-CTRL02-LOCAL-GATE"]}], blueprintRefs: [`${B}#20.2-release-0---program-reset-e-referência-de-qualidade`], securityControlIds: ["TRUST-GOV-01", "TRUST-SDLC-01"]}),
  task({taskId: "CTRL-03", releaseId: "R0", title: "Acceptance Evidence Index", outcome: "Cada claim de capacidade resolve a evidência vigente, ambiente, gate e validade.", ownerRole: "Quality and assurance owner", dependsOn: ["CTRL-01", "CTRL-02"], steps: ["Definir taxonomia de evidências", "Vincular capabilities e tarefas", "Adicionar validade e expiração", "Publicar relatório de lacunas"], acceptance: ["Toda evidência referenciada existe", "Evidência expirada não promove capability", "Relatório diferencia teste, runtime e assessment externo"], blueprintRefs: [`${B}#18-trust-security-privacy-and-assurance-program`, "docs/build/ACCEPTANCE_EVIDENCE.md"], securityControlIds: ["TRUST-GOV-01", "TRUST-OPS-01"]}),

  task({taskId: "RT-01", releaseId: "R1", title: "Intent Envelope universal", outcome: "Intenção, objeto, trabalho, entrega, audiência e continuidade resolvidos sem cargo como regra.", state: "code_complete", ownerRole: "Intent and work-control engineer", dependsOn: ["CTRL-02"], steps: ["Consolidar núcleo inferível e contexto governado", "Bloquear inferência de autoridade e evidence regime", "Cobrir intenção sem companhia", "Ampliar corpus gold e adversarial"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}, {index: 2, state: "done"}, {index: 3, state: "done"}], acceptance: ["Paráfrases preservam identidade de workflow", "Intenções economicamente diferentes não colapsam", "Autoridade nunca é inferida"], evidenceRefs: ["EV-RT01-LOCAL"], capabilityRefs: ["intent.semantic-envelope-shadow", "gold.intent-router-stability-gate"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`, "docs/product/CANONICAL_INTENT_WORKFLOW_ATLAS.md"], securityControlIds: ["TRUST-AI-01", "TRUST-AI-02"], capabilityTransition: {capabilityId: "intent.semantic-envelope-shadow", from: "implemented", to: "tested", status: "planned", evidenceRefs: []}}),
  task({taskId: "RT-02", releaseId: "R1", title: "Context and Object Resolver", outcome: "Contexto autorizado e objetos existentes são recuperados, classificados e reaproveitados somente quando relevantes.", ownerRole: "Context runtime engineer", dependsOn: ["RT-01"], steps: ["Resolver projeto e objetos", "Aplicar autorização e classe de informação", "Detectar versão, validade e invalidação", "Emitir gaps de contexto"], acceptance: ["Cross-tenant e contexto sem autorização falham fechado", "Novo projeto funciona sem memória", "Contexto vencido não é tratado como atual"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-AI-02"]}),
  task({taskId: "RT-03", releaseId: "R1", title: "Output Terminal Resolver", outcome: "O produto solicitado define o terminal e muda o grafo antes da execução.", ownerRole: "Workflow compiler engineer", dependsOn: ["RT-01"], steps: ["Canonizar terminais", "Resolver forma e audiência", "Tratar alteração incremental", "Medir ambiguidades materiais"], acceptance: ["Análise, reunião, modelo, revisão e material compilam terminais distintos", "Ambiguidade material gera pergunta ou abstenção"], capabilityRefs: ["workflow.objective-plan-core"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`]}),
  task({taskId: "RT-04", releaseId: "R1", title: "Compositor de especializações", outcome: "Necessidade, análise, instrumento, setor e jurisdição compõem profundidade sem soluções fragmentadas.", ownerRole: "DCM specialization engineer", dependsOn: ["RT-01", "RT-03"], steps: ["Definir precedência de packs", "Resolver conflitos e dependências", "Emitir expertise necessária", "Bloquear combinações não homologadas"], acceptance: ["Composição é determinística", "Conflito não cai em workflow genérico", "Unmatched expertise permanece explícita"], capabilityRefs: ["workflow.composable-specialization-shadow", "workflow.specialist-method-binding-shadow"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`, `${B}#20.7-release-5---generalidade-econômica`], securityControlIds: ["TRUST-AI-01"]}),
  task({taskId: "RT-05", releaseId: "R1", title: "Catálogo executável de capabilities", outcome: "Cada TaskSpec conhece procedure, executor, schemas, ferramentas, dados, efeitos, maturidade e evidência.", ownerRole: "Runtime capability engineer", dependsOn: ["CTRL-03"], steps: ["Inventariar 80 TaskSpecs", "Resolver procedures e executores", "Vincular policies, budgets e kill switches", "Publicar gaps sem simular capacidade"], acceptance: ["TaskSpec não vinculada falha no preflight", "Catálogo e Capability Ledger não divergem", "Fixtures não contam como runtime live"], capabilityRefs: ["workflow.taskspec-library"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-AI-01", "TRUST-SDLC-01"]}),
  task({taskId: "RT-06", releaseId: "R1", title: "Preflight universal", outcome: "Nenhum plano ativa tarefa sem capability, evidência, autoridade, provider e tool policy compatíveis.", ownerRole: "Runtime safety engineer", dependsOn: ["RT-02", "RT-04", "RT-05"], steps: ["Consumir grafo e catálogo", "Validar dados, fontes e providers", "Validar autoridade e efeitos", "Persistir decisão imutável"], acceptance: ["Toda ausência material produz blocker nomeado", "Preflight não pode ser contornado pelo dispatcher", "Decisão é capability-bound e auditável"], capabilityRefs: ["workflow.preflight-capability-gate", "workflow.objective-preflight-shadow"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-APP-02"]}),
  task({taskId: "RT-07", releaseId: "R1", title: "Dispatcher universal", outcome: "Grafo mínimo executa tarefas allowlisted, idempotentes, observáveis e fail-closed.", ownerRole: "Agent runtime engineer", dependsOn: ["RT-06"], steps: ["Despachar por TaskSpec", "Paralelizar dependências independentes", "Persistir fingerprints e lineage", "Implementar retry, fallback, timeout e kill switch"], acceptance: ["Não existe fallback para plano genérico", "Replay não duplica efeitos ou artifacts", "Provider fallback preserva proteção e contrato"], capabilityRefs: ["workflow.universal-dispatch-candidate-shadow", "execution.general-specialist-runtime"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-OPS-02"], capabilityTransition: {capabilityId: "execution.universal-dispatcher", from: "unsupported", to: "implemented", status: "planned", evidenceRefs: []}}),
  task({taskId: "RT-08", releaseId: "R1", title: "Perguntas, checkpoints e branches", outcome: "Gaps materiais guiam perguntas, respostas atualizam objetos e só descendentes inválidos são recalculados.", ownerRole: "Conversation workflow engineer", dependsOn: ["RT-02", "RT-07"], steps: ["Gerar perguntas por gap", "Vincular resposta ao objeto", "Invalidar dependentes", "Persistir branches e checkpoints"], acceptance: ["Pergunta só aparece quando muda trabalho ou decisão", "Usuário pode seguir com premissa explícita", "Mudança não reinicia o projeto"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-DATA-02", "TRUST-AI-02"]}),
  task({taskId: "RT-09", releaseId: "R1", title: "Gate universal de seis intenções", outcome: "Seis pedidos estruturalmente distintos percorrem o runtime sem identidade Case 01.", ownerRole: "Evaluation engineer", dependsOn: ["RT-07", "RT-08"], steps: ["Congelar seis jornadas curtas", "Executar casos positivos e adversariais", "Medir invariância e abstenção", "Registrar evidência de CI"], acceptance: ["Seis intenções produzem grafos apropriados e diferentes", "Nenhum executor Case 01 governa identidade", "Falhas de capability são honestas"], blueprintRefs: [`${B}#20.3-release-1---objective-to-plan-universal`], securityControlIds: ["TRUST-AI-02", "TRUST-SDLC-01"], capabilityTransition: {capabilityId: "workflow.universal-compiler", from: "specified", to: "tested", status: "planned", evidenceRefs: []}}),

  task({taskId: "VLT-01", releaseId: "R2", title: "Document and Version Manifest", outcome: "Todo arquivo, versão, hash, origem, classe, parser, coverage e derivado possui identidade governada.", ownerRole: "Document intelligence engineer", dependsOn: ["RT-02"], steps: ["Definir manifest", "Ligar versões e supersession", "Persistir classificação", "Expor coverage seguro"], acceptance: ["Arquivo e versão são inequívocos", "Derivados preservam lineage", "Superseded não vira fonte atual"], blueprintRefs: [`${B}#20.4-release-2---vault-to-truth`], securityControlIds: ["TRUST-DATA-01", "TRUST-DOC-01"]}),
  task({taskId: "VLT-02", releaseId: "R2", title: "Portaria governada de quarentena", outcome: "Os formatos hoje allowlisted só chegam ao parser após scanner clean, inspeção limitada e receipt vinculado aos bytes e ao escopo exatos.", state: "code_complete", ownerRole: "Secure ingestion engineer", dependsOn: ["VLT-01"], steps: ["Validar integridade, magic bytes e política de formatos", "Executar scanner antes de container parsing", "Limitar archives e rejeitar conteúdo ativo", "Autorizar parser por snapshot e receipt exatos", "Persistir receipt com CAS e provar isolamento operacional"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}, {index: 2, state: "done"}, {index: 3, state: "done"}], acceptance: ["Scanner ausente, malware, tipo divergente ou conteúdo ativo nunca autorizam o parser", "Limites de formato e detecção incompleta permanecem explícitos", "Persistência append-only, Storage version, tenant isolation, sandbox, egress e scanner freshness são provados em staging"], evidenceRefs: ["EV-PR537", "EV-VLT02-BOUNDARY", "EV-VLT02-TESTS"], capabilityRefs: ["documents.governed-quarantine-shadow"], acceptanceState: [{index: 0, status: "passed", evidenceRefs: ["EV-PR537", "EV-VLT02-TESTS"]}, {index: 1, status: "passed", evidenceRefs: ["EV-VLT02-BOUNDARY"]}], blockers: [{blockerId: "BL-VLT02-PERSISTENCE", severity: "high", status: "open", description: "Receipt ainda não possui store append-only, CAS transacional nem vínculo a uma Storage object version imutável.", evidenceRefs: ["EV-VLT02-BOUNDARY"]}, {blockerId: "BL-VLT02-RUNTIME", severity: "high", status: "open", description: "Scanner freshness, sandbox da task, egress deny-by-default, corpus adversarial, concorrência e crash recovery ainda não têm evidência operacional em staging.", evidenceRefs: ["EV-VLT02-BOUNDARY"]}, {blockerId: "BL-VLT02-CONTAINERS", severity: "medium", status: "open", description: "TAR renomeado sem extensão e arquivos SFX não são detectados por conteúdo nesta fatia.", evidenceRefs: ["EV-VLT02-BOUNDARY"]}], blueprintRefs: [`${B}#20.4-release-2---vault-to-truth`], securityControlIds: ["TRUST-DOC-01", "TRUST-DOC-02", "TRUST-DATA-01"]}),
  task({taskId: "VLT-03", releaseId: "R2", title: "Reading Strategy Registry", outcome: "O sistema escolhe leitura exata, exaustiva, tabular, cláusula, OCR, planilha ou híbrida conforme o trabalho.", ownerRole: "Document methods engineer", dependsOn: ["VLT-02"], steps: ["Catalogar estratégias", "Definir seleção por intenção", "Registrar manifest de leitura", "Medir conteúdo não lido"], acceptance: ["Estratégia é justificável e reproduzível", "Nenhum documento é marcado completo sem coverage"], blueprintRefs: [`${B}#20.4-release-2---vault-to-truth`], securityControlIds: ["TRUST-DOC-02", "TRUST-AI-02"]}),
  task({taskId: "VLT-04", releaseId: "R2", title: "Evidence Ledger", outcome: "Cada fato resolve documento, versão, anchor, período, unidade, moeda, perímetro e rank.", ownerRole: "Evidence graph engineer", dependsOn: ["VLT-03"], steps: ["Definir objetos de evidência", "Criar anchors multimodais", "Promover fatos", "Implementar trace back"], acceptance: ["Claim material sem source binding falha", "Página, célula ou cláusula pode ser recuperada", "Classe de informação acompanha o fato"], blueprintRefs: [`${B}#20.4-release-2---vault-to-truth`], securityControlIds: ["TRUST-DATA-02", "TRUST-AI-02"]}),
  task({taskId: "VLT-05", releaseId: "R2", title: "Reconciliação institucional", outcome: "Períodos, moedas, escalas, conceitos, EBITDA, dívida, caixa e covenant são conciliados com exceções explícitas.", ownerRole: "Financial data engineer", dependsOn: ["VLT-04"], steps: ["Normalizar períodos e escalas", "Conciliar conceitos financeiros", "Registrar conflitos e substituições", "Expor workbench de exceções"], acceptance: ["Diferenças não são silenciosamente sobrescritas", "Toda reconciliação material tem regra e trace", "Exceções abertas bloqueiam dependentes aplicáveis"], blueprintRefs: [`${B}#20.4-release-2---vault-to-truth`]}),
  task({taskId: "VLT-06", releaseId: "R2", title: "Coverage Map universal", outcome: "O sistema declara o que buscou, encontrou, não leu, não encontrou e como isso altera a decisão.", ownerRole: "Coverage and quality engineer", dependsOn: ["VLT-03", "VLT-04", "VLT-05"], steps: ["Compilar coverage por decisão", "Classificar materialidade", "Definir substitutos e next action", "Renderizar lacunas na interface"], acceptance: ["Omissão fica visível", "Cada gap material informa impacto", "Coverage acompanha atualização documental"], blueprintRefs: [`${B}#20.4-release-2---vault-to-truth`], capabilityTransition: {capabilityId: "documents.arbitrary-dataroom", from: "specified", to: "tested", status: "planned", evidenceRefs: []}}),

  task({taskId: "FIN-01", releaseId: "R3", title: "Economic Snapshot", outcome: "Chat, modelo, estrutura, materiais e matching compartilham a mesma identidade econômica.", ownerRole: "Credit object graph engineer", dependsOn: ["VLT-05"], steps: ["Definir snapshot canônico", "Vincular fatos e ajustes", "Versionar por data-base", "Propagar fingerprints"], acceptance: ["Mesma métrica mantém valor e definição entre superfícies", "Mudança material invalida descendentes"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`]}),
  task({taskId: "FIN-02", releaseId: "R3", title: "Histórico reconciliado", outcome: "DRE, balanço, fluxo, notas, dívida, segmentos e ajustes fecham historicamente.", ownerRole: "Credit modelling engineer", dependsOn: ["FIN-01"], steps: ["Mapear demonstrações", "Construir bridges e checks", "Conciliar notas e segmentos", "Registrar ajustes"], acceptance: ["Balanço fecha ou bloqueia", "Cash flow reconcilia", "Ajustes têm source e rationale"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`]}),
  task({taskId: "FIN-03", releaseId: "R3", title: "Assumption Book", outcome: "Toda premissa é editável, justificada, versionada e ligada aos descendentes que altera.", ownerRole: "Scenario modelling engineer", dependsOn: ["FIN-01"], steps: ["Definir schema de premissa", "Ligar fontes e racional", "Criar cenários e intervalos", "Implementar selective recalculation"], acceptance: ["Premissa sem base é declarada", "Usuário altera driver sem reconstruir tudo", "Diff mostra impactos"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`]}),
  task({taskId: "FIN-04", releaseId: "R3", title: "Modelo financeiro integrado", outcome: "Drivers operacionais fecham DRE, balanço, caixa, CFADS e debt service.", ownerRole: "Senior credit modelling engineer", dependsOn: ["FIN-02", "FIN-03"], steps: ["Construir drivers operacionais", "Integrar três demonstrações", "Implementar capital de giro, capex e tax", "Criar checks e sensitivities"], acceptance: ["Modelo fecha e reconcilia", "Linhas materiais têm driver e rationale", "Cenários recalculam deterministicamente"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`], capabilityTransition: {capabilityId: "finance.integrated-institutional-model", from: "specified", to: "tested", status: "planned", evidenceRefs: []}}),
  task({taskId: "FIN-05", releaseId: "R3", title: "Debt Engine", outcome: "Principal, moeda, indexador, spread, juros, amortização, IPCA, hedge e pré-pagamento são modelados por instrumento.", ownerRole: "Debt analytics engineer", dependsOn: ["FIN-02", "FIN-03"], steps: ["Definir cash-flow por instrumento", "Distinguir IPCA pago e capitalizado", "Modelar amortização e pré-pagamento", "Ligar garantias e covenants"], acceptance: ["Fluxo reproduz documentos contratuais", "IPCA capitalizado altera principal corretamente", "Exit cost e debt service têm trace"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`]}),
  task({taskId: "FIN-06", releaseId: "R3", title: "Cenários e downside", outcome: "Base, management, conservative, downside, reverse stress e break-even medem liquidez e cobertura.", ownerRole: "Credit risk modelling engineer", dependsOn: ["FIN-04", "FIN-05"], steps: ["Definir cenários governados", "Aplicar shocks setoriais e macro", "Calcular DSCR e headroom", "Construir reverse stress"], acceptance: ["Downside muda drivers relevantes", "Breaches e liquidity shortfalls aparecem", "Probabilidade não é inventada"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`]}),
  task({taskId: "FIN-07", releaseId: "R3", title: "Structure Lab", outcome: "Alternativas e no-action case são comparados por economia, risco, termos, execução e contingência.", ownerRole: "DCM structuring engineer", dependsOn: ["FIN-04", "FIN-05", "FIN-06"], steps: ["Definir Alternative e Structure objects", "Construir before/after", "Comparar termos, garantias e covenants", "Registrar execution risks e contingência"], acceptance: ["Recomendação permanece ponderada, não conclusiva", "Alternativas incluem disconfirmers", "Estrutura não implica execução final pela Offroad"], blueprintRefs: [`${B}#20.5-release-3---truth-to-decision`]}),

  task({taskId: "MAT-01", releaseId: "R4", title: "Fundação Office governada", outcome: "PPTX editável e decision workbook do Caso 01 são construídos de forma determinística, inspecionados, vinculados ao manifest e mantidos apenas para validação interna.", state: "code_complete", ownerRole: "Governed materials engineer", dependsOn: ["CTRL-01"], steps: ["Mesclar renderers, storage e download governados", "Tornar o pacote PPTX byte-determinístico", "Verificar deploy do worker contra o baseline atual", "Executar geração real e revisão visual governada"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}], acceptance: ["Implementação e regressões determinísticas estão em main", "Manifest, scope, binding e bytes divergentes falham fechado nos testes", "Geração real, inspeção visual e receipt de deploy passam no ambiente aplicável"], evidenceRefs: ["EV-MAT-FOUNDATION", "EV-MAT-DETERMINISM"], capabilityRefs: ["artifacts.governed-office-foundation"], acceptanceState: [{index: 0, status: "passed", evidenceRefs: ["EV-MAT-FOUNDATION", "EV-MAT-DETERMINISM"]}, {index: 1, status: "passed", evidenceRefs: ["EV-MAT-FOUNDATION"]}], blockers: [{blockerId: "BL-MAT01-REAL-GATE", severity: "high", status: "open", description: "Não há nesta reconciliação receipt de deploy, geração real no baseline atual e revisão visual que autorize promoção ou uso externo.", evidenceRefs: ["EV-MAT-FOUNDATION", "EV-MAT-DETERMINISM"]}], blueprintRefs: [`${B}#20.6-release-4---decision-to-deliverable`], securityControlIds: ["TRUST-DATA-01", "TRUST-SDLC-01"], capabilityTransition: {capabilityId: "artifacts.governed-office-foundation", from: "unsupported", to: "implemented", status: "recorded", evidenceRefs: ["EV-MAT-FOUNDATION", "EV-MAT-DETERMINISM"]}}),
  task({taskId: "MAT-02", releaseId: "R4", title: "XLSX governado no projeto", outcome: "Workbook institucional é renderizado no worker, inspecionado, armazenado e baixado por manifest imutável.", ownerRole: "Financial artifacts engineer", dependsOn: ["MAT-01", "FIN-04"], steps: ["Preservar model IR", "Renderizar bytes no worker", "Inspecionar fórmulas e estilos", "Armazenar e vincular SHA", "Remover geração ad hoc web"], acceptance: ["Download devolve os bytes exatos", "Cross-tenant e tamper tests passam", "Workbook ad hoc não aparece como governado"], evidenceRefs: ["EV-PR522"], blueprintRefs: [`${B}#20.6-release-4---decision-to-deliverable`], securityControlIds: ["TRUST-DATA-01", "TRUST-APP-02"]}),
  task({taskId: "MAT-03", releaseId: "R4", title: "Eliminar artifacts falsos", outcome: "Nenhuma superfície chama placeholder, JSON interno ou export improvisado de material pronto.", ownerRole: "Artifact integrity engineer", dependsOn: ["MAT-01", "MAT-02"], steps: ["Inventariar exports", "Bloquear botões sem manifest", "Remover rotas ad hoc", "Adicionar negative tests"], acceptance: ["Material sem lineage não é baixável", "Placeholder é impossível em release surface"], blueprintRefs: [`${B}#20.6-release-4---decision-to-deliverable`], securityControlIds: ["TRUST-APP-02"]}),
  task({taskId: "MAT-04", releaseId: "R4", title: "Revisão visual governada", outcome: "Slides, páginas e sheets recebem inspeção automática, comparação e receipt antes de release.", ownerRole: "Visual quality engineer", dependsOn: ["MAT-01", "MAT-02"], steps: ["Renderizar superfícies", "Detectar overflow e clipping", "Comparar versões", "Persistir review receipt"], acceptance: ["High visual finding bloqueia release", "Receipt resolve imagens e fingerprints", "Regressão visual roda no CI"], blueprintRefs: [`${B}#20.6-release-4---decision-to-deliverable`]}),
  task({taskId: "MAT-05", releaseId: "R4", title: "DOCX e templates de cliente", outcome: "DOCX nativo e templates ingeridos preservam estilo suportado, com fallback honesto.", ownerRole: "Template fidelity engineer", dependsOn: ["MAT-03", "MAT-04"], steps: ["Criar renderer DOCX", "Ingerir templates com segurança", "Extrair masters e estilos", "Medir fidelidade"], acceptance: ["Template não executa conteúdo ativo", "Fidelidade é mensurada", "Elemento não suportado gera gap"], blueprintRefs: [`${B}#20.6-release-4---decision-to-deliverable`], securityControlIds: ["TRUST-DOC-01", "TRUST-DOC-02"], capabilityTransition: {capabilityId: "artifacts.template-faithful-suite", from: "specified", to: "tested", status: "planned", evidenceRefs: []}}),

  ...([
    ["WFI-01", "Refinance e liability management"],
    ["WFI-02", "Board e capital structure"],
    ["WFI-03", "Liquidez e capital de giro"],
    ["WFI-04", "Capex finance"],
    ["WFI-05", "Recebíveis e FIDC"],
    ["WFI-06", "Investor underwriting"],
    ["WFI-07", "Covenant, contrato e waterfall"],
    ["WFI-08", "Acquisition finance"],
    ["WFI-09", "Project finance"],
    ["WFI-10", "Instrumentos Brasil"],
    ["WFI-11", "Instrumentos EUA"],
    ["WFI-12", "Cross-border"],
    ["WFI-13", "Sector packs prioritários"],
  ] as const).map(([taskId, title], index) => task({taskId, releaseId: "R5", title: `Workflow pack: ${title}`, outcome: `${title} possui coverage, procedure, schemas, executor, gold, adversarial, revisão e gate próprios.`, ownerRole: "Workflow intelligence engineer", dependsOn: index === 0 ? ["RT-07", "FIN-07"] : ["WFI-01", "RT-07"], steps: ["Definir escopo e coverage", "Escrever procedure e schemas", "Implementar executor determinístico/bounded", "Criar gold e adversarial", "Revisar e homologar"], acceptance: ["Procedure resolve a fonte canônica", "Executor passa gold, adversarial e consistency", "Pack não se autodeclara expert"], blueprintRefs: [`${B}#20.7-release-5---generalidade-econômica`], securityControlIds: ["TRUST-AI-01", "TRUST-AI-02"]})),
  task({taskId: "WFI-14", releaseId: "R5", title: "Gate agregado do specialist runtime", outcome: "O runtime geral só avança depois que todos os packs Pareto possuem gates próprios e integração conjunta.", ownerRole: "Workflow intelligence lead", dependsOn: ["WFI-01", "WFI-02", "WFI-03", "WFI-04", "WFI-05", "WFI-06", "WFI-07", "WFI-08", "WFI-09", "WFI-10", "WFI-11", "WFI-12", "WFI-13"], steps: ["Verificar gates de todos os packs", "Executar composição e conflitos cross-pack", "Medir abstenção fora do escopo", "Registrar acreditação agregada"], acceptance: ["Nenhum pack isolado promove o runtime geral", "Todos os packs requeridos estão gate_passed", "Cross-pack e unknown composition falham de forma governada"], blueprintRefs: [`${B}#20.7-release-5---generalidade-econômica`], securityControlIds: ["TRUST-AI-01", "TRUST-AI-02"], capabilityTransition: {capabilityId: "execution.general-specialist-runtime", from: "specified", to: "tested", status: "planned", evidenceRefs: []}}),

  ...([
    ["JNY-01", "Banker: pedido a estruturação", ["WFI-01", "MAT-05"]],
    ["JNY-02", "CFO: conselho a operação", ["WFI-02", "MAT-05"]],
    ["JNY-03", "Assessor: documentos a capital", ["WFI-05", "MAT-05"]],
    ["JNY-04", "Investidor: underwriting a decisão", ["WFI-06", "MAT-02"]],
    ["JNY-05", "Contrato: documento a risco", ["WFI-07", "VLT-06"]],
    ["JNY-06", "Atualização incremental", ["RT-08", "MAT-04"]],
    ["JNY-07", "Project finance longitudinal", ["WFI-09", "MAT-05"]],
    ["JNY-08", "Operação a conexão qualificada", ["WFI-06", "CAP-02"]],
  ] as const).map(([taskId, title, dependsOn]) => task({taskId, releaseId: "R6", title: `Jornada ${title}`, outcome: `${title} funciona como projeto contínuo, não como resposta isolada.`, ownerRole: "Longitudinal journey owner", dependsOn: [...dependsOn], steps: ["Congelar gabarito e work products", "Executar variantes pública, privada e híbrida", "Testar retornos e mudança de objetivo", "Registrar benchmark"], acceptance: ["Estado econômico persiste entre estágios", "Mudança recalcula somente descendentes", "Output final passa review aplicável"], blueprintRefs: [`${B}#21-reference-journeys-g1-g8`], securityControlIds: ["TRUST-DATA-01", "TRUST-AI-02"]})),
  task({taskId: "JNY-09", releaseId: "R6", title: "Gate agregado G2-G8", outcome: "A capability longitudinal G2-G8 só avança após todas as jornadas e variantes obrigatórias passarem.", ownerRole: "Longitudinal journey lead", dependsOn: ["JNY-01", "JNY-02", "JNY-03", "JNY-04", "JNY-05", "JNY-06", "JNY-07", "JNY-08"], steps: ["Verificar gates das oito jornadas", "Executar invariância cross-journey", "Revisar work products e continuity", "Registrar acreditação agregada"], acceptance: ["Nenhuma jornada isolada promove G2-G8", "As oito jornadas estão gate_passed", "Variações de usuário não mudam o workflow econômico"], blueprintRefs: [`${B}#21-reference-journeys-g1-g8`], securityControlIds: ["TRUST-DATA-01", "TRUST-AI-02"], capabilityTransition: {capabilityId: "gold.g2-g8-reference-journeys", from: "specified", to: "tested", status: "planned", evidenceRefs: []}}),

  task({taskId: "CAP-01", releaseId: "R6", title: "Mandate Ledger real", outcome: "Mandatos têm fonte, data, validade, ticket, setor, instrumento, retorno, restrições, confiança e consentimento.", ownerRole: "Capital network data owner", dependsOn: ["VLT-04"], steps: ["Definir provider e mandate schemas", "Ingerir fontes autorizadas", "Implementar freshness", "Auditar consentimento"], acceptance: ["Mandato sem fonte/freshness não ranqueia como atual", "Dados privados respeitam disclosure"], blueprintRefs: [`${B}#20.8-release-6---capital-and-continuity`], securityControlIds: ["TRUST-DATA-03", "TRUST-VENDOR-01"]}),
  task({taskId: "CAP-02", releaseId: "R6", title: "Matching explicável", outcome: "Hard filters, fit, non-fit, unknown, exclusões e informação que muda ranking são discriminados.", ownerRole: "Matching and credit market engineer", dependsOn: ["CAP-01", "FIN-07"], steps: ["Implementar hard filters", "Criar ranking explicado", "Registrar razões de exclusão", "Medir feedback e drift"], acceptance: ["Ranking não inventa mandato", "Exclusões são explicáveis", "Synthetic e real nunca se misturam"], blueprintRefs: [`${B}#20.8-release-6---capital-and-continuity`], capabilityTransition: {capabilityId: "capital.live-mandate-network", from: "unsupported", to: "tested", status: "planned", evidenceRefs: []}}),
  task({taskId: "CAP-03", releaseId: "R6", title: "Conexão qualificada", outcome: "Disclosure, destinatário, material e introdução exigem autorização exata e permanecem auditáveis.", ownerRole: "Capital workflow owner", dependsOn: ["CAP-02", "MAT-05"], steps: ["Implementar anonymous screening", "Capturar recipient authorization", "Congelar material enviado", "Registrar introdução e feedback"], acceptance: ["Sem autorização não há external effect", "Destinatário e material são imutáveis", "Offroad não implica aprovação ou funding"], blueprintRefs: [`${B}#20.8-release-6---capital-and-continuity`], securityControlIds: ["TRUST-DATA-03", "TRUST-APP-02"]}),

  task({taskId: "SEC-01", releaseId: "R0", title: "Current-state e inventários", outcome: "Um snapshot validado e conservador representa ambientes, sistemas, dados, fluxos, identities, vendors, evidências, gaps e claims externos sem inferir operação live.", state: "code_complete", ownerRole: "Security program owner", dependsOn: ["CTRL-01"], steps: ["Inventariar sistemas e ambientes", "Mapear data flows e classes", "Inventariar identities e vendors", "Registrar owners, evidência, freshness e gaps", "Coletar evidência live e manter o snapshot atualizado"], subtaskState: [{index: 0, state: "done"}, {index: 1, state: "done"}, {index: 2, state: "done"}, {index: 3, state: "done"}], acceptance: ["Inventário delimita produção e staging sem afirmar configuração não observada", "Scanner de segredos e renderer governado impedem claims adulterados", "Owners funcionais, freshness e gaps estão explícitos; evidência live permanece separada"], evidenceRefs: ["EV-PR529", "EV-SEC01-INVENTORY", "EV-SEC01-TESTS"], capabilityRefs: ["trust.security-current-state-inventory"], acceptanceState: [{index: 0, status: "passed", evidenceRefs: ["EV-SEC01-INVENTORY", "EV-SEC01-TESTS"]}, {index: 1, status: "passed", evidenceRefs: ["EV-PR529", "EV-SEC01-TESTS"]}, {index: 2, status: "passed", evidenceRefs: ["EV-SEC01-INVENTORY"]}], blockers: [{blockerId: "BL-SEC01-LIVE-EVIDENCE", severity: "high", status: "open", description: "Configuração live, effective IAM, responsáveis nomeados, vendor terms e operação histórica de controles continuam desconhecidos ou parciais.", evidenceRefs: ["EV-SEC01-INVENTORY"]}, {blockerId: "BL-SEC01-REFRESH", severity: "medium", status: "open", description: "O snapshot SEC-01 está fixado em b2e3897 e precisa ser regenerado para incorporar mudanças posteriores, inclusive VLT-01 e VLT-02.", evidenceRefs: ["EV-SEC01-INVENTORY", "EV-MAIN-2A96"]}], blueprintRefs: [`${B}#18-trust-security-privacy-and-assurance-program`, S], securityControlIds: ["TRUST-GOV-02", "TRUST-CLOUD-01", "TRUST-VENDOR-01"]}),
  task({taskId: "SEC-02", releaseId: "R0", title: "Threat model e abuse cases", outcome: "Tenancy, documentos, IA, tools, exports, effects, supply chain e insider access têm ameaças e controles.", ownerRole: "Application security owner", dependsOn: ["SEC-01"], steps: ["Modelar trust boundaries", "Registrar abuse cases", "Vincular mitigations", "Criar negative tests"], acceptance: ["Critical/high têm owner e tratamento", "Threat model acompanha mudanças de arquitetura"], blueprintRefs: [`${B}#18-trust-security-privacy-and-assurance-program`, S], securityControlIds: ["TRUST-GOV-02", "TRUST-APP-01", "TRUST-AI-03", "TRUST-DOC-02"]}),
  task({taskId: "SEC-03", releaseId: "R0", title: "Continuous Evidence Pipeline", outcome: "PR, testes, deploy, acessos, providers, exports, vulnerabilities, backup e incidentes geram evidência contínua.", ownerRole: "Security assurance engineer", dependsOn: ["CTRL-03", "SEC-01"], steps: ["Definir evidence collectors", "Assinar e reter evidência", "Vincular controles", "Alertar expiração e drift"], acceptance: ["Evidence Index é atualizado automaticamente", "Ambiente e validade são verificáveis", "Evidence collector não lê conteúdo de cliente"], blueprintRefs: [`${B}#18-trust-security-privacy-and-assurance-program`, S], securityControlIds: ["TRUST-OPS-01", "TRUST-SDLC-01"]}),
  task({taskId: "SEC-04", releaseId: "R7", title: "Identity e enterprise controls", outcome: "MFA, step-up, RBAC/ABAC, support JIT, SSO/SAML e SCIM operam com least privilege.", ownerRole: "Identity security owner", dependsOn: ["SEC-02", "SEC-03"], steps: ["MFA privilegiado", "RBAC/ABAC e JIT", "SSO/SAML", "SCIM e access reviews"], acceptance: ["Privileged access exige step-up", "Joiner/mover/leaver é provado", "Support access é temporário e auditado"], blueprintRefs: [`${B}#20.9-release-7---enterprise-integration-e-external-assurance`, S], securityControlIds: ["TRUST-ID-01", "TRUST-ID-02"]}),
  task({taskId: "SEC-05", releaseId: "R7", title: "Resiliência, pentest e assurance externo", outcome: "Restore, BCP/DR, IR, pentest/retest e readiness SOC 2/ISO são comprovados externamente no escopo exato.", ownerRole: "Security and compliance owner", dependsOn: ["SEC-03", "SEC-04", "PRD-03"], steps: ["Executar restore e DR drills", "Exercitar incident response", "Contratar pentest e retest", "Preparar SOC 2 e ISO audits"], acceptance: ["RPO/RTO são medidos", "Critical/high do pentest estão fechados", "Claim externo exige attestation vigente"], blueprintRefs: [`${B}#20.9-release-7---enterprise-integration-e-external-assurance`, S], securityControlIds: ["TRUST-OPS-02", "TRUST-OPS-03", "TRUST-GOV-01"], capabilityTransition: {capabilityId: "trust.enterprise-assurance", from: "unsupported", to: "production", status: "planned", evidenceRefs: []}}),

  task({taskId: "PRD-01", releaseId: "R7", title: "Reliability e SLOs por workflow", outcome: "Disponibilidade, latência, custo, contenção e recovery são medidos por família de trabalho.", ownerRole: "Platform reliability owner", dependsOn: ["RT-09", "JNY-01"], steps: ["Definir SLOs segmentados", "Instrumentar latência e custo", "Testar recovery", "Criar error budget"], acceptance: ["SLO não mistura chat com pipelines longos", "Falha conserva causa útil e sanitizada", "Budget breach bloqueia rollout"], blueprintRefs: [`${B}#20.9-release-7---enterprise-integration-e-external-assurance`], securityControlIds: ["TRUST-OPS-01", "TRUST-OPS-02"]}),
  task({taskId: "PRD-02", releaseId: "R7", title: "Rollout, containment e rollback", outcome: "Capabilities são promovidas por allowlist, cohort, kill switch e rollback verificado.", ownerRole: "Release engineer", dependsOn: ["PRD-01", "CTRL-03"], steps: ["Criar cohorts", "Vincular kill switches", "Testar rollback", "Automatizar promotion decision"], acceptance: ["Nenhuma promoção é apenas mudança de label", "Rollback preserva estado e isolamento"], blueprintRefs: [`${B}#20.9-release-7---enterprise-integration-e-external-assurance`], securityControlIds: ["TRUST-SDLC-01", "TRUST-OPS-02"]}),
  task({taskId: "PRD-03", releaseId: "R7", title: "Founder acceptance suite", outcome: "G1-G8 e work products passam revisão técnica, visual, de interação, segurança e continuidade.", ownerRole: "Founder gate coordinator", dependsOn: ["JNY-01", "JNY-02", "JNY-03", "JNY-04", "JNY-05", "JNY-06", "JNY-07", "JNY-08", "PRD-02"], steps: ["Congelar pacote de revisão", "Executar jornadas completas", "Registrar correções como regressão", "Obter aceite explícito"], acceptance: ["Todos os blockers do gabarito fecham", "Correções viram testes", "Limitações remanescentes são aceitas explicitamente"], blueprintRefs: [`${B}#22-founder-acceptance-gate`]}),

  task({
    "taskId": "UX-01",
    "state": "in_progress",
    "releaseId": "R1",
    "title": "Estados de trabalho e prontidão econômica",
    "outcome": "A interface distingue execução concluída, cobertura parcial, revisão, bloqueio e entrega utilizável com uma próxima ação real.",
    "ownerRole": "Product interaction engineer",
    "dependsOn": [],
    "steps": [
      "Mapear estados persistidos e condições reais",
      "Definir prioridade entre falha, lacuna e entrega",
      "Aplicar rótulos e próxima ação em pt-BR e en-US"
    ],
    "acceptance": [
      "Concluir tarefas não declara cobertura ou entrega aprovadas",
      "Falha recuperável mantém contexto e ação segura",
      "Toda transição corresponde a estado verificável"
    ],
    "capabilityRefs": [
      "experience.live-work"
    ],
    "blueprintRefs": [
      "docs/build/ENDGAME_WAVE1_EXECUTION.md",
      "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md#16-experiência-e-design-do-produto"
    ]
  }),
  task({
    "taskId": "UX-02",
    "state": "in_progress",
    "releaseId": "R1",
    "title": "Workspace persistente e inspector de evidências",
    "outcome": "Conversa, trabalho e objetos compartilham uma shell progressiva com inspeção de fonte sem perder o contexto.",
    "ownerRole": "Product design and frontend engineer",
    "dependsOn": [
      "UX-01"
    ],
    "steps": [
      "Consolidar tokens, hierarquia e navegação",
      "Integrar inspector de documento, versão e anchor",
      "Mostrar superfícies somente quando relevantes"
    ],
    "acceptance": [
      "CFO, assessor e investidor usam o mesmo workspace por intenção",
      "Abertura e fechamento da fonte preservam seleção e posição",
      "Não há abas vazias, fontes simuladas ou export sem artefato real"
    ],
    "capabilityRefs": [
      "experience.premium-workbench"
    ],
    "blueprintRefs": [
      "docs/build/ENDGAME_WAVE1_EXECUTION.md",
      "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md#16-experiência-e-design-do-produto"
    ]
  }),
  task({
    "taskId": "UX-03",
    "state": "in_progress",
    "releaseId": "R1",
    "title": "Precisão numérica e revisão completa",
    "outcome": "Valores mantêm precisão, unidade declarada e locale; todas as linhas, colunas e lacunas ficam acessíveis.",
    "ownerRole": "Financial interface engineer",
    "dependsOn": [],
    "steps": [
      "Substituir formatter que corrompe decimais",
      "Exibir contexto de unidade sem inferência",
      "Expandir tabelas e lacunas com controles acessíveis",
      "Verificar síntese e materiais no contexto de revisão"
    ],
    "acceptance": [
      "Decimais longos, negativos e inteiros grandes não mudam magnitude",
      "Ausência de unidade permanece explícita e não vira BRL ou percentual",
      "Nenhuma linha, coluna ou lacuna some por limite visual",
      "Síntese existente renderiza independentemente da presença de brief"
    ],
    "capabilityRefs": [
      "experience.premium-workbench"
    ],
    "blueprintRefs": [
      "docs/build/ENDGAME_WAVE1_EXECUTION.md",
      "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md#16-experiência-e-design-do-produto"
    ]
  }),
  task({
    "taskId": "UX-04",
    "state": "in_progress",
    "releaseId": "R1",
    "title": "Edição e retomada sem perda de trabalho",
    "outcome": "Falha de comando preserva conteúdo e permite retry com identidade estável sem duplicar efeitos.",
    "ownerRole": "Conversation workflow engineer",
    "dependsOn": [],
    "steps": [
      "Conservar rascunho até confirmação",
      "Bloquear submissão concorrente",
      "Reutilizar identidade após resposta ambígua",
      "Verificar envio, edição de plano e resposta a perguntas",
      "Definir e implementar retomada após reload com autorização e retenção explícitas"
    ],
    "acceptance": [
      "Falha retornada ou exceção não apaga texto nem prende pending",
      "Retry idêntico reutiliza comando; conteúdo alterado cria comando novo",
      "Aceitação confirmada limpa somente o rascunho enviado",
      "Versão obsoleta continua respeitando restrições do servidor",
      "Retomada após reload preserva escopo autorizado e não expõe rascunho em storage ou telemetria indevidos"
    ],
    "capabilityRefs": [
      "experience.execution-brief"
    ],
    "blueprintRefs": [
      "docs/build/ENDGAME_WAVE1_EXECUTION.md",
      "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md#16-experiência-e-design-do-produto"
    ]
  }),
  task({
    "taskId": "UX-05",
    "releaseId": "R1",
    "title": "Aceite de acessibilidade e usabilidade por jornada",
    "outcome": "A mesma experiência atende todos os públicos com revisão visual e tarefas completas verificadas.",
    "ownerRole": "Product quality and domain reviewer",
    "dependsOn": [
      "UX-01",
      "UX-02",
      "UX-03",
      "UX-04"
    ],
    "steps": [
      "Executar jornadas de CFO, assessor e investidor",
      "Verificar teclado, foco, contraste e diferentes larguras",
      "Medir encontrar fonte, corrigir premissa e retomar falha",
      "Registrar revisão visual e limitações por jornada"
    ],
    "acceptance": [
      "Os três públicos conseguem completar o trabalho delimitado sem orientação do operador",
      "Teclado e foco permitem todas as ações essenciais; tabelas extensas continuam acessíveis",
      "Fonte, versão, unidade e limitação são compreensíveis no contexto",
      "Aceite visual não promove inteligência financeira nem autoriza uso externo"
    ],
    "capabilityRefs": [
      "experience.premium-workbench"
    ],
    "blueprintRefs": [
      "docs/build/ENDGAME_WAVE1_EXECUTION.md",
      "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md#16-experiência-e-design-do-produto"
    ]
  }),
];

export const currentEndgameProgramBoard: EndgameProgramBoard = {
  boardVersion: "2026.09.08-v4",
  generatedAt: "2026-09-08T20:52:00.000-03:00",
  baseline: {
    repository: "carlosevg100/offroad",
    branch: "main",
    commit: "b6da2876d86cf63a6a17bd4bc855b6c4a1e41698",
    capabilityLedgerVersion: "2026.09.09-v18-candidate",
    capabilityLedgerBaselineCommit: "b6da2876d86cf63a6a17bd4bc855b6c4a1e41698",
  },
  releaseSequence: ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"],
  evidenceIndex: [
    {evidenceId: "EV-MAIN-B6DA", kind: "repository", ref: "https://github.com/carlosevg100/offroad/commit/b6da2876d86cf63a6a17bd4bc855b6c4a1e41698", environment: "repository", capturedAt: generatedAt, description: "Baseline integrado da primeira onda, incluindo novo gate RT-01 e boundary de evidência SEC-03", immutableFingerprint: "b6da2876d86cf63a6a17bd4bc855b6c4a1e41698"},
    {evidenceId: "EV-MAIN-2A96", kind: "repository", ref: "https://github.com/carlosevg100/offroad/commit/2a96d0125d9ace1929a5bbf5d18739bbf28d4eda", environment: "repository", capturedAt: generatedAt, description: "origin/main reconciliado após SEC-01 e VLT-02", immutableFingerprint: "2a96d0125d9ace1929a5bbf5d18739bbf28d4eda"},
    {evidenceId: "EV-LEDGER-V17", kind: "repository", ref: "packages/release-governance/src/current-capability-ledger.ts", environment: "repository", capturedAt: generatedAt, description: "Ledger v17 reconciliado com o código de main b6da287; nenhum novo uso autorizado", immutableFingerprint: null},
    {evidenceId: "EV-CAPABILITY-LEDGER", kind: "document", ref: "docs/build/CAPABILITY_LEDGER.md", environment: "repository", capturedAt: generatedAt, description: "Vista humana v17; implementação delimitada não equivale a customer-work, material externo ou maturidade de produção", immutableFingerprint: null},
    {evidenceId: "EV-BLUEPRINT", kind: "document", ref: B, environment: "repository", capturedAt: generatedAt, description: "Blueprint canônico usado para releases e backlog", immutableFingerprint: "2a96d0125d9ace1929a5bbf5d18739bbf28d4eda"},
    {evidenceId: "EV-SECURITY-PLAN", kind: "document", ref: S, environment: "repository", capturedAt: generatedAt, description: "Programa de readiness enterprise; não é certificação", immutableFingerprint: "2a96d0125d9ace1929a5bbf5d18739bbf28d4eda"},
    {evidenceId: "EV-PR529", kind: "pull_request", ref: "https://github.com/carlosevg100/offroad/pull/529", environment: "ci", capturedAt: generatedAt, description: "SEC-01 mesclado na main como inventário validado e conservador", immutableFingerprint: "9e1e3de36b67e7acc89251fb0fbd3f989bb28721"},
    {evidenceId: "EV-SEC01-INVENTORY", kind: "document", ref: "docs/security/CURRENT_STATE_INVENTORY.md", environment: "repository", capturedAt: generatedAt, validThrough: "2026-09-14T09:43:00.000-03:00", description: "Snapshot SEC-01 fixado em b2e3897, com 18 gaps e sem claim de certificação", immutableFingerprint: "bc1646adc34edf85f740aa1de61e2e09a9974ee2d4d9a342996c2606af42477d"},
    {evidenceId: "EV-SEC01-TESTS", kind: "test", ref: "packages/release-governance/src/security-current-state.test.ts; packages/release-governance/src/security-assurance-statements.test.ts", environment: "repository", capturedAt: generatedAt, description: "Validação estrutural, resolução confiável, secret scanning e claims externos fail-closed", immutableFingerprint: "9e1e3de36b67e7acc89251fb0fbd3f989bb28721"},
    {evidenceId: "EV-PR537", kind: "pull_request", ref: "https://github.com/carlosevg100/offroad/pull/537", environment: "ci", capturedAt: generatedAt, description: "VLT-02 mesclado na main como fatia code-complete candidate e internal shadow", immutableFingerprint: "2a96d0125d9ace1929a5bbf5d18739bbf28d4eda"},
    {evidenceId: "EV-VLT02-BOUNDARY", kind: "document", ref: "docs/build/VLT02_GOVERNED_QUARANTINE_BOUNDARY.md", environment: "repository", capturedAt: generatedAt, description: "Fronteira implementada e oito bloqueios de promoção declarados", immutableFingerprint: "5f6fb4a7ea3209f81e3c6dbeff380cd23d9255c49f72e049b8c604b475953682"},
    {evidenceId: "EV-VLT02-TESTS", kind: "test", ref: "packages/document-intelligence/src/governed-document-quarantine.test.ts; apps/document-worker/src/pipeline.test.ts", environment: "repository", capturedAt: generatedAt, description: "Scanner-first, bounds, receipt binding, snapshot exato e falha fechada testados localmente e no PR", immutableFingerprint: "2a96d0125d9ace1929a5bbf5d18739bbf28d4eda"},
    {evidenceId: "EV-PR522", kind: "pull_request", ref: "https://github.com/carlosevg100/offroad/pull/522", environment: "ci", capturedAt: generatedAt, description: "Renderer e inspector de workbooks institucionais mesclados na main com todos os checks obrigatórios verdes", immutableFingerprint: "b76016734e860358d8b9d2f076d47c527346b0d3"},
    {evidenceId: "EV-MAT-FOUNDATION", kind: "pull_request", ref: "https://github.com/carlosevg100/offroad/pull/525", environment: "ci", capturedAt: generatedAt, description: "Fundação governada de PPTX e decision workbook mesclada na main; não é promoção de material externo", immutableFingerprint: "aa563b99d240ce7d3759ada3cce0b65dc0410c89"},
    {evidenceId: "EV-MAT-DETERMINISM", kind: "pull_request", ref: "https://github.com/carlosevg100/offroad/pull/534", environment: "ci", capturedAt: generatedAt, description: "Pacotes de apresentação tornados byte-determinísticos na main", immutableFingerprint: "9c72131c05625e5aea5fc3ab4166d6003c79c534"},
    {evidenceId: "EV-INTENT-GATE", kind: "ci_run", ref: "https://github.com/carlosevg100/offroad/actions/runs/34096964058", environment: "ci", capturedAt: generatedAt, description: "Baseline histórica invalidada para promoção: 17 turnos, score parcial e repetições com os mesmos bytes", immutableFingerprint: "919def6"},
    {evidenceId: "EV-CTRL02-LOCAL-GATE", kind: "test", ref: "packages/release-governance/src/endgame-program-board.test.ts", environment: "repository", capturedAt: generatedAt, description: "Evaluator fail-closed e paridade da vista gerada do Program Board", immutableFingerprint: null},
    {evidenceId: "EV-RT01-LOCAL", kind: "test", ref: "packages/evals/src/intent-router-gate.test.ts", environment: "repository", capturedAt: generatedAt, description: "Contrato candidate de 40 turnos e manifesto de 52 observações; ainda sem execução posterior com modelo real", immutableFingerprint: null},
  ],
  reconciliationFindings: [
    {findingId: "PF-NO-CUSTOMER-RELIANCE", severity: "high", status: "open", description: "Nenhuma capability do ledger atual autoriza customer_work, external_material ou external_action; o produto permanece em validação interna.", evidenceRefs: ["EV-CAPABILITY-LEDGER"], ownerRole: "Capability governance owner"},
    {findingId: "PF-ENDGAME-INCOMPLETE", severity: "high", status: "open", description: "Dispatcher universal, data room arbitrário, modelo institucional, template suite, journeys G2-G8, rede real de capital e assurance externo não estão promovidos.", evidenceRefs: ["EV-BLUEPRINT", "EV-CAPABILITY-LEDGER"], ownerRole: "Program integrator"},
    {findingId: "PF-SECURITY-SNAPSHOT-STALE", severity: "medium", status: "open", description: "O inventário SEC-01 é uma base válida, porém está fixado em b2e3897 e não representa mudanças posteriores da main; precisa de refresh governado antes de servir como current state do baseline b6da287.", evidenceRefs: ["EV-SEC01-INVENTORY", "EV-MAIN-2A96"], ownerRole: "Security program owner"},
    {findingId: "PF-FOUNDATIONS-NOT-PROMOTION", severity: "high", status: "open", description: "SEC-01, VLT-02 e a fundação Office possuem código e testes delimitados, mas não fornecem evidência operacional ou autorização para uso de cliente, material externo ou claim de assurance.", evidenceRefs: ["EV-PR529", "EV-PR537", "EV-MAT-FOUNDATION", "EV-CAPABILITY-LEDGER"], ownerRole: "Capability governance owner"},
  ],
  tasks,
};
