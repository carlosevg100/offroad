# Etapa 5: identidade de entidade e dossiê privado

O OK do fundador de 16/09/2026 autoriza este recorte sem antecipar 17/18. A tentativa anterior de reutilizar memória privada entre dossiês foi retirada antes de qualquer aplicação. O worker permanece na delegação do job; compartilhar uma entidade nunca autoriza outro dossiê.

## Implementação

`public.dossiers` projeta companhia, projeto e sessão sobre os recursos de autoridade existentes. `companies.id`, vínculos legados e perfis são preservados por adaptadores. Título de projeto não cria identidade. `entities` e `entity_identifiers` distinguem identidade local de registro público comprovado; homônimos viram candidatos, nunca fusão automática. Identificador corrigido conserva a versão anterior. `dossier_entity_links` registra relação, período, perímetro, revisão humana, retry idempotente e retirada.

Quatro tabelas com FORCE RLS e escrita direta revogada. RPCs invoker chamam comandos privados de escopo limitado e política comum. Perfis legados não podem alterar uma companhia sem autoridade sobre ela. Auditoria contém operação/ID, sem copiar conteúdo privado.

A memória pública v2 usa UUID de entidade pública comprovada, vinculada ao recurso delegado. Cache v1 fica congelado, sem leitura/escrita no runtime. Identidade não resolvida mantém a pesquisa normal por consulta, sem cache de companhia. Não há cadastro global inferido: ingestão pública exige migração revisada com fonte oficial/hash. Não se criou catálogo fictício para demonstrar uso.

## Instalação e verificação

| Ambiente | Carimbo | MD5 SQL do journal |
|---|---|---|
| Staging | 20260916190433 | 3c4aff1453f037d6d6d38984956bff0a |
| Produção | 20260916190600 | 3c4aff1453f037d6d6d38984956bff0a |

Arquivo imutável `supabase/migrations/20260916190600_entity_and_dossier_identity.sql`; SHA-256 `3bcd9e093e645bf3aa25861402fcc7252baa492e0663ad759362521d1ebb9bc6`. Tipos gerados de produção. Catálogos conferidos: 56 superfícies novas, 1581 objetos em produção e 1642 em staging; 321 versões de arquivo presentes no journal de produção. As diferenças históricas aprovadas de staging permanecem preservadas.

Leitura de produção: 50 recursos elegíveis, 50 dossiês, zero faltas e zero desvios de vínculo legado; entidades/vínculos novos vazios. 31 definições de função idênticas. Nenhum dado descartável foi criado em produção. Advisors de segurança sem lints nos dois ambientes. Performance: nenhum FK novo sem índice; índices novos ainda sem uso estatístico são esperados antes de tráfego. Achados históricos de performance não foram escondidos ou alterados nesta etapa.

68 testes SQL passaram com candidato e rollback em staging. Os mesmos 68 contratos passaram no schema instalado em staging; nomes e carimbos estão em etapa-05-installed-eval.json. A CI executa automaticamente todos os arquivos SQL sobre replay limpo; as verificações de catálogo e journal continuam obrigatórias.

## Limites e contenção

Sem reutilização privada entre dossiês, entradas adicionais de execução, Temporal, nova integração ou tela administrativa. Esses itens não são necessários para manter a identidade distinta da autoridade. A pesquisa pública permanece disponível; a memória de entidade só opera com prova e vínculo revisado. Revogar recurso ou retirar vínculo impede novas leituras do cache. Reverter código exige preservar o consumidor compatível; qualquer correção de DDL usa nova migração.

Migração instalada não significa etapa concluída: merge, CI e web/worker no commit exato são gates de fechamento. Etapa 6 depende de novo OK.
