# Etapa 11: participação, canais pessoais e contribuições

Participação usa os grants e as barreiras existentes. `work_participants` referencia o grant;
não autoriza conteúdo por si. A lista de pessoas resolve a autoridade vigente, inclusive grupos,
e só oferece administração ao sujeito autorizado. Remover acesso usa o comando canônico de
revogação, com invalidação já existente de capabilities e eventos de autoridade.

`work_channels` separa compartilhado, pessoal e legado. Só o titular com acesso atual ao trabalho
lê seu canal pessoal; administrador não herda o conteúdo. Conversas históricas recebem canal
legado, preservando sua audiência anterior. `agent_messages.human_author_id` usa somente
`created_by` de mensagens humanas comprovadas. Respostas do assistente permanecem sem autor
humano; origem desconhecida não é preenchida por suposição.

`work_contributions` guarda a identidade da contribuição. `contribution_revisions` preserva cada
versão, sua base, antecessora, autor e ato de compartilhamento. Revisar o texto de outra pessoa
cria uma candidata pessoal. O comando de promoção fixa a versão escolhida e valida todos os
leitores atuais, incluindo grupos. Quando a base compartilhada mudou, devolve base, versão
atual e candidata autorizadas; não sobrescreve e não apaga a proposta perdedora.

`private.contribution_source_dependencies` fixa as versões dos direitos. Filhos e cópias herdam
a interseção dos direitos; omitir a fonte numa revisão não retira a restrição. Toda leitura
reavalia o sujeito e os direitos atuais. Novos participantes não herdam acesso às fontes nem
às candidatas pessoais. Repetir a promoção da mesma versão retorna o ato existente.

## Interface e transição

O mesmo trabalho apresenta pessoas, canal pessoal, contribuições compartilhadas, revisão,
comparação de conflito e histórico. Busca de pessoas/fontes e histórico são paginados.
Participantes acrescentados na interface recebem colaboração; remoção é explícita. A concessão
continua aditiva conforme a política canônica, sem prometer reduzir permissões vindas de grupos.
Os componentes não mantêm cache compartilhado de conteúdo nem enviam contribuições a modelos.

A conversa existente permanece no mesmo endereço, com canal e autoria explícitos. Compartilhar
uma contribuição não publica no cofre, não adota dado, não executa cálculo e não dispara job.
Premissas e cenários financeiros conservam `assumption_versions`; texto proposto não vira
uma segunda base de cálculo. A entrada de execução desses insumos permanece no contrato de 17.

## Verificações

- `work_contribution_isolation.sql`: duas candidatas sobre a mesma base, comparação de três
  versões, negações entre pessoas, administrador e participante tardio; fontes e revogação.
- `work_contribution_rights.sql`: repetição sem nova publicação, vínculo da requisição,
  herança de restrições, retirada de derive com read mantido e workspace incorreto.
- `rls_non_interference.sql`: RLS forçada, grants mínimos e políticas restritivas nos caminhos
  antigos de conversa e mensagens.
- `test-contribution-concurrency.py`: duas conexões reais, espera pelo lock observada,
  candidatas preservadas e conflito explícito. Executado pela CI no banco local descartável.
- `work-contributions.spec.ts`: duas sessões reais de navegador, edição concorrente,
  compartilhamento, comparação, histórico, mobile e revogação por ação do produto.
- `work-contributions.test.ts`: contrato de entrada e resposta de conflito completo.

Os 87 contratos SQL passaram em staging com rollback; o contrato de direitos foi ampliado e
reexecutado para provar herança ao reapresentar candidata sobre base irrestrita. `pnpm check`
passou. A CI e a implantação web/worker ainda são gates de fechamento, não presumidos.

As migrações `work_contributions_and_channels`, `work_contribution_command_integrity` e
`work_contribution_history_indexes` estão nos dois ambientes. A migração adicional
`work_contribution_dependency_audit` completa identidade, atualização e auditoria de cada vínculo
sem expor conteúdo e desdobra a negação em quatro políticas explícitas por comando. Carimbos de produção:
`20260918002400`, `20260918002404`, `20260918002407`, `20260918010613`; staging:
`20260917235306`, `20260918000139`, `20260918001427`, `20260918010531`. Os textos nos journals são idênticos por nome e as
16 funções têm definição idêntica. Tipos foram gerados de produção. Os dois verificadores
de inventário/histórico passaram, incluindo 18 e 5 regressões dos próprios verificadores.
Segurança: zero alertas nos dois ambientes. Verificação sem identidade em produção negou
leitura de revisões, sem criar dados descartáveis. Índice de FK faltante identificado na revisão
foi corrigido; índices novos ainda sem uso estatístico não são removidos por esse motivo.

## Riscos no incremento responsável

Nenhuma publicação oficial, automação financeira ou acesso de modelo é inferido desta etapa.
Cofre fica na 12; retenção por provedor na 16; incorporação de contribuições ao manifesto na 17;
propagação operacional e alarmes na 18; retenção, exclusão e auditoria final na 22.
A informação já exibida a um leitor autorizado não pode ser retirada de sua memória; toda
nova leitura e mutação passa pela autoridade corrente. Não há recuperação de acesso por autoria.
