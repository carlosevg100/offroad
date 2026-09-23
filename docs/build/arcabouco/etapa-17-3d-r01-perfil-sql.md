# Etapa 17 / 3D: perfil R01 no banco, execução ainda fechada

O banco passa a reconhecer exatamente o perfil derivado de R01 instalado na 3C. A prova de correspondência do perfil precede a ponte de proveniência, dentro do incremento 3; não constitui migração do procedimento para a fila nem conclusão da etapa 17.

`private.validate_execution_profile_storage_v1` compara integralmente o perfil com a derivação histórica e o manifesto com a publicação imutável `r01-2026.09.06-v1`. Preserva `originalBudget: null`, a política operacional de 31.000 ms/zero chamadas/zero custo, descritores de schemas e closure do executor. Trocar o rótulo para adapter compilado não evita essa verificação. Atestado de revisão continua obrigatório. Os literais SQL são restrições da versão suportada, não uma nova publicação; testes os comparam com a derivação TypeScript e o ledger histórico.

`private.require_execution_release_v1` recusa R01 com `execution_r01_provenance_unavailable`, inclusive quando seu perfil foi armazenado corretamente. Request, claim, renovação, reserva, settlement e commit existentes passam por essa fronteira. A remoção dessa recusa exige migração posterior com proveniência, produtor e prova real da fila. Nenhum perfil operacional, concessão, tabela, RPC público ou caminho de acesso é criado aqui. Capital conserva o ramo anterior; o caminho histórico de R01 e a seleção capital-only do consumidor permanecem.

## Pronto e evidência

Migração em staging e produção, carimbos conciliados, duas definições idênticas no catálogo; suíte `execution_r01_profile.sql` com rollback, regressão `execution_commands.sql`, três testes de paridade SQL/TypeScript e CI completa. Sem fixtures em produção. Web e worker devem publicar o mesmo commit. O completion externo registra resultados e runs; este texto não antecipa aprovação.

TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01: perfil não concede execução, proveniência não é inferida de hash e nenhum dado alcança provedor. Limpeza restrita a substituir as duas definições anteriores, sem criar um segundo dispatcher. Risco pendente com engenharia de execução no próximo incremento 3: converter assembleia histórica, fontes/versões, confirmação de escopo e evidências em dependências autoritativas e revalidáveis; comprovar retry, revogação e orçamento acumulado antes de abrir claims R01. Não aceitar hash de dataset ou referência textual como prova isolada. Nenhuma decisão adicional do fundador.

Reversão por nova migração que restaure o validador anterior; conservar a recusa de R01 até o substituto completo. Não alterar migrações aplicadas nem a release histórica.

## Registro anterior ao merge

Migração `execution_r01_profile_boundary`: staging `20260923013806`, produção `20260923014322`. Testes SQL novos e regressão de comandos passaram em staging com rollback; 23 testes do perfil (três novos) e check completo passaram localmente. Definições das duas funções idênticas, tipos regenerados sem diferenças, segurança sem lints, inventário de 2.152 objetos de produção e 2.213 de staging sem divergências. Nenhum perfil ou execução operacional criado. CI, merge e deploy são registrados no completion.
