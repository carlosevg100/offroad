# Etapa 5: revisão material de entidade e dossiê

O fundador aprovou em 16/09/2026 concluir a etapa 5 sem antecipar 17/18. O candidato anterior de memória entre dossiês foi descartado: verificar o acesso humano não amplia a delegação do worker. O loader legado continua retornando lista vazia; o teste SQL recusa a presença do helper que ultrapassava essa fronteira. Nenhuma mudança de autoridade da etapa 3 é relaxada.

## Dados e autoridade

`dossiers` pertence a uma organização e a um recurso já registrado. `companies.id` e vínculos legados são preservados por projeções; o título do projeto não vira identidade. O backfill cria dossiês, sem fundir entidades por nome ou publicar informações privadas.

`entities` e `entity_identifiers` comportam identidade local, vinculada ao dossiê de origem, e identidade pública comprovada. A exceção de organização nula é exclusiva do registro público: prova explícita, allowlist de campos e nenhuma escrita disponível ao cliente ou worker. A ingestão pública permanece operacional, por migração revisada com fonte oficial e hash; o cadastro privado nunca publica um registro global. Não há população pública inferida ou inventada nesta entrega.

Quatro tabelas têm FORCE RLS, leitura filtrada e escrita direta revogada. Comandos públicos são invoker; funções privilegiadas privadas têm search_path vazio e grants estreitos. Leitura e comandos privados consultam a política comum, incluindo contexto, finalidade e barreiras. Administração da organização não implica leitura do dossiê. Alterar um perfil de companhia legado exige autoridade sobre o destino.

Vínculos guardam período, perímetro, revisão humana, idempotência e retirada explícita. Identificadores corrigidos preservam a cadeia de versões; revisão não equivale a prova de registro público. O registro local e seu histórico só são visíveis no perímetro autorizado.

## Worker, cache e transição

A memória pública v2 usa o UUID da entidade pública comprovada; nome, domínio e localização deixam de ser chave de identidade. O banco exige vínculo atual dentro do recurso delegado ao job e revalida a capability. Identidade incerta ou divergente mantém a pesquisa por consulta sem memória de companhia. A tabela conserva as entradas v1 congeladas, inacessíveis pelos RPCs atuais; não há promoção de fontes antigas por inferência.

O DDL é compatível com o worker anterior: leitura com chave v1 retorna cache miss e sua tentativa de escrita é recusada pelo contrato, já tratada como falha de cache pelo runtime. O worker atualizado só faz reutilização com identidade verificada. Não há nova ferramenta externa, fornecedor, transferência privada ou log com conteúdo de cliente.

## Ameaças e provas exigidas

Homônimos, CNPJ público comum com dossiês isolados, tentativa de vincular entidade local alheia, revisão sem motivo, retirada e retry, revogação do criador, contexto forjado, escrita direta, backfill repetido e coerência dos perfis legados. Cache exige identidade do job, recusa campo privado e chave antiga, respeita retirada e continua negado a projeto privado. O worker não ganha leitura de outra raiz por compartilhar a entidade.

Controles: isolamento de tenant e recurso, menor privilégio, finalidade, barreiras, proveniência, integridade de revisão, não descoberta e auditoria. Logs de auditoria privados registram operação e ID, sem copiar o conteúdo para telemetria. As 18 lacunas gerais do inventário são mantidas; esta entrega não comprova certificação, contratos de fornecedores nem readiness enterprise completa.

Contenção: revogar o vínculo/recurso para impedir reutilização; manter a v1 congelada; reverter código apenas para o runtime compatível. Migração aplicada será imutável; correção de DDL será sempre migração sucessora.
