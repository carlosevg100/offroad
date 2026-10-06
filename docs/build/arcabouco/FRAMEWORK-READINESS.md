# Etapa 24 : prontidão técnica do arcabouço

## Estado

Em verificação. A presença deste documento ou um teste unitário positivo não significa conclusão. O completion é produzido após CI, merge, mesma revisão implantada e provas dos ambientes. Etapas 22 e 23 foram encerradas; não são reabertas por registros históricos anteriores em BUILD_STATE.

## Contrato de evidência

`packages/evals/src/framework-readiness.ts` mapeia os 21 critérios de 24.1 aos SQLs executados pela CI e reproduzidos em staging. As provas guardam commit, origem e SHA-256 da fonte e do recibo. A coleta é operação interna: nunca aceita resultados declarados por usuários do produto. O avaliador verifica completude e coerência dos recibos, não substitui execução nem autentica o conteúdo de um arquivo não confiável.

O operador fixa a revisão pelo Git, confere o run e os jobs pela API da CI, calcula hashes dos arquivos e preserva as respostas efetivas das ferramentas. Um `exitCode: 0` só é registrado após término efetivo com sucesso. O SQL executado em staging é expandido com suas dependências, conserva BEGIN/ROLLBACK e não é aplicado em produção. Todos os testes SQL são executados pelo job database; o percurso usa o job E2E e seu worker real.

As contagens e snapshots de continuidade ficam no trabalho/organização da fixture. Histórico auditável de outros ensaios não entra na quantidade esperada; as operações e os negativos continuam nos RPCs e tabelas reais, sem apagar registros ou trocar as regras de acesso.

## Percurso integrado

`apps/web/e2e/framework-readiness.spec.ts` inicia o trabalho com a pergunta sobre alternativas de estrutura de capital, sem companhia, intake ou plano. Adiciona dois arquivos sintéticos pelos caminhos reais de upload, verifica hashes pelo pipeline do worker, conserva duas observações divergentes e adota uma por finalidade. Adiciona contexto depois no mesmo ID, registra entidades e definições, fixa premissas, executa o procedimento v4 publicado e confere manifesto, perfil, recibo e autoria do worker. Uma segunda pessoa autentica, recebe grant explícito, conserva seu canal privado, compartilha contribuição e revisa a revisão exata. Uma nova premissa gera execução nova no mesmo trabalho; a anterior conserva seus bytes. A revogação fecha a URL anteriormente lida, inclusive para o criador.

O percurso integrado, incluindo fontes/divergência/adoção, e sua execução remota devem possuir recibos próprios antes do aceite. Os testes de contrato de observação, adoção, direitos e continuidade não são apresentados como esse percurso completo. Transporte privado simulado não comprova integração homologada de provedor.

No navegador, o worker completo também consome a alteração de premissa. A prova distingue as duas solicitações humanas do descendente automático: este exige raiz na execução original, candidato no mesmo trabalho, request vinculado ao candidato e recibo de sucesso. Uma execução extra sem essa linhagem reprova o gate.

## Ambientes e publicação

Staging: `gjkkjtbfnssdsbmlhmwk`. Produção: `ifnogpksgdadruooqydi`. Jornals e catálogo são capturados ao vivo; o checker de migrações exige todas as versões de main no journal de produção. Diferenças históricas declaradas de staging não liberam diferenças de definições atuais.

A confirmação de produção é somente por metadados, política, release, auditoria, HTTP legítimo e versão web/worker; não cria fixture em produção. Worker estável exige imagem da revisão, tarefa ativa, boot e executores fixados. Vercel exige READY/PROMOTED na mesma revisão. Nenhuma combinação de provedor/modelo/recurso sem elegibilidade pode ser ativada como consequência do relatório.

## Limpeza e limites

Credenciais e identidades sintéticas existem somente em ambiente de verificação e são revogadas ao terminar, com comprovação. A prova de ausência de fixtures operacionais é distinta da preservação dos registros auditáveis. Não remover história imutável para produzir contagem zero. Não instalar gatilhos de fixtures nem levar scripts de ensaio ao runtime.

Ensaios de produto, segundo procedimento, Office nativo, Temporal, conectores e intercâmbio entre organizações ficam posteriores, conforme 24.2. Esta etapa não declara utilidade comercial ou certificação externa.
