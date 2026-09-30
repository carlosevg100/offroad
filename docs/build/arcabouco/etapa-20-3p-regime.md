# Etapa 20: 3P, regime de revisão do conteúdo

## Contrato e transição

O componente existente `project-review-roles.tsx` lê `read_capital_project_review_context_v2`. Mostra separadamente atribuição obrigatória e autoaprovação, com valores do projeto, da organização e efetivos. `assigned`, `individual` e `open` descrevem a combinação; papel, membership e regime nunca equivalem à autoridade de aprovar uma revisão. O leitor exige identidade humana vigente, membership ativa e acesso ao trabalho. Limita a lista a 500 pessoas elegíveis e declara truncamento.

`set_capital_project_review_policy_v2` e `set_organization_review_policy_v2` recebem os dois eixos completos e fingerprint do snapshot lido. A comparação acontece sob as travas; política alterada retorna `40001/policy_changed`, sem escrita ou auditoria. A interface relê o contexto e pede nova escolha, sem repetir automaticamente a alteração. Retorno com organização, projeto, fingerprint ou política inválidos é recusado no servidor. O tenant vem da sessão, não de um campo do formulário.

As tabelas existentes `capital_project_review_policies` e `organization_review_policies` permanecem. Nenhuma coluna, backfill ou default muda. Os setters v1 de política conservam assinaturas, respostas e o eixo de atribuição; passam a exigir identidade vigente e gestão legítima. O de projeto exige READ e MANAGE antes de travar o alvo e novamente sob as travas. O de organização exige administração antes do advisory e novamente depois. A guarda MANAGE já instalada no setter v1 de atribuição permanece integralmente.

Ordem: identidade SHARE, projeto NO KEY UPDATE quando aplicável, advisory da política de recursos da organização, membership SHARE NOWAIT, linha de política. Membership ocupada retorna conflito em vez de esperar invertendo a ordem do revogador de principal. Autoridade é revalidada depois das travas. Um usuário sem autoridade não espera por um recurso estrangeiro bloqueado. Os comandos de revogação não mudam.

`page.tsx` preserva o leitor v1 usado por brief/setup até os cortes 3R/3U. Os dois retornos de trabalho independente recebem o mesmo componente v2. A tela delimita revisão de conteúdo e não afirma que os consumidores antigos já usam este novo contrato. Pendências, relato, reafirmação e reassociação pertencem ao 3W.

## Eval em andamento

Baseline `089e70a7d51a770df177c2299a1f897199931056`. Antes da correção, staging aceitou o setter de política de projeto por administrador com READ e sem MANAGE, e o de organização por identidade suspensa ou removida. A atribuição v1 negou o mesmo usuário sem MANAGE. A reprodução foi integralmente revertida e os contadores de fixtures ficaram zero.

Migração instalada em staging: `20260930143756_project_review_regime_v2`. O contrato SQL passou 45 verificações, incluindo os negativos após correção, CAS sem escrita/auditoria, herança, quatro combinações, isolamento, truncamento e ausência de decisão, revisão, job ou publicação como efeito de configuração. A primeira tentativa parou na fixture de arquivamento sem os campos exigidos; a fixture foi corrigida, sem alterar DDL. Teste final revertido, zero fixtures. Advisors de segurança sem lints.

Cinco arquivos focais de interface, parser e ações passaram 67 testes. Gate local completo passou 44/44 tarefas por fase. Concorrência com duas sessões, E2E, produção, CI final, merge e deploys ainda exigem evidência; isto não é completion.

## Segurança, riscos e contenção

APP-02, APP-08, APP-11, DATA-03, DATA-09. Abusos: gravar política por cargo sem MANAGE, usar identidade suspensa, sobrescrever outra alteração de política, converter regime em aprovação, bloquear recurso estrangeiro antes de negar acesso. Negativos cobrem os endpoints novos e antigos. A prova usa apenas identidades sintéticas em staging com rollback e banco descartável local da CI; produção recebe somente migração e consultas de catálogo.

Fingerprints são tokens de concorrência, nunca credenciais. Incluem tenant, existência da linha, ambos os eixos, epoch de atualização e política da organização. Mudanças do mesmo valor em transações distintas invalidam o token; não se promete um contador de revisões dentro da mesma transação. Leituras posteriores continuam revalidando acesso e revisão exata. Propagação completa após a última consulta pertence à etapa 22.

Rollback do aplicativo conserva RPCs aditivos e história, com setters v1 protegidos. Contenção de um defeito v2 usa migração forward para fechar seus grants; não restaurar os setters vulneráveis, apagar auditoria ou resetar política. O 3O está concluído em produção; este incremento não inicia etapas 21–24.
