# Produção e revisão nativas de materiais

## Etapa 20 / 3S–3T: produção e revisão nativas de materiais, 02/10/2026

O pacote substitui os escritores livres de plano, material e aprovação por captura de servidor, plano preparado e aprovado atomicamente, execução com manifesto fixado, recuperação física e revisão humana da revisão exata. Os três tipos de aprovação histórica (`production_plan`, `package_review`, `release_authorization`) são negados pelo caminho genérico; os comandos nativos não usam esse caminho. O material continua interno: a aprovação não autoriza circulação, contato ou introdução, e o follow-up aguarda ato separado.

As oito migrações estão instaladas em staging e produção. Arquivos usam os carimbos reais de produção `20261002210206` a `20261002210256`; os journals e catálogos foram recolhidos ao vivo. Foram revisados os 203 objetos novos, inclusive DDL gerado e funções renomeadas. Os cinco corpos efetivos alterados conferem byte a byte nos ambientes; segurança reporta zero alertas. Não foram criados dados descartáveis em produção.

O SQL instalado de staging passou pelos grupos de produção, recuperação, revisão, política, papéis, revogação, ausência física dos pais e bloqueio das três aprovações antigas. Esse SQL verifica metadados de Storage; HTTP físico é gate próprio, sem inferência. A CI passa a exigir os runners nativos, corridas de duas transações, SDK/Auth/Storage real e navegador. Os testes `deal_state_route.sql` e `material_package_analysis_trigger.sql` que aprovavam objetos históricos livremente foram substituídos por essas provas; somente o setup sintético útil permanece em `support/material_production_route_fixture.sql`.

Migração aplicada não encerra o incremento. CI, merge, web e worker no mesmo commit e verificação pós-deploy precisam fechar antes do completion. Etapa 20 continua aberta; o importador de workbook permanece na etapa 21.
