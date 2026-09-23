# Etapa 17 / 3G: preparador técnico fixado

## Objetivo e identidade

Fixar a preparação separadamente do método financeiro publicado. O preparador `r01-preparation.2026-09-23.v1` é capturado do commit de main `585bb62b0c54b43addaefb43b6fc0a41b4aceeb6`. Snapshot `da0fe862d642ae02f9c1dc32d6b94eedbcbb79e2e7795c8cbed13fbf1b0757f0`, artefato `c3043ee77b56adfd6b3ce234c0ead8ae3892bfbefb6753426ef37e6db6547f15`. Não altera os locks, manifesto, aprovação ou resultado do R01 financeiro.

## Implementação

`apps/document-worker/scripts/preparer-release.mjs` captura fontes regulares de um ancestral de main, confere lock instalado e reconstrói sem rede a partir do grafo fixado. O snapshot inclui dependências de parsing dos barrels, com bytes conferidos contra Git e instalação congelada na CI. A identidade publicada é append-only em `apps/document-worker/preparers/preparer-lock.json`; o checker existente passa a conferir também esse registro.

`released-preparer.ts` carrega somente a identidade instalada, confere SHA-256 e exports, conserva cópia privada congelada do registro e devolve interface congelada. Ausência de versão ou alteração dos bytes recusa o carregamento; não recorre ao código atual. Build/test e Docker reutilizam o diretório existente `released-methods`. O boot registra apenas a contagem de preparadores verificados.

O empacotador admite `node:crypto`, `node:zlib` e `node:util` no artefato. Imports de fs/path e dependências transitivas de quarentena são resolvidos apenas para parsing e têm de desaparecer do resultado. Metafile deve comprovar zero bytes emitidos dos dois módulos marcados como parse-only; qualquer import externo além dos três permitidos recusa o build. Isso não é um sandbox para código arbitrário: a confiança continua nas fontes publicadas e revisadas.

## Verificação e transição

Seis testes do empacotador cobrem bytes reproduzíveis, snapshot/artefato alterados, fonte não fixada, import de rede e colisão entre entry sintético e real. Quatro testes do runtime cobrem paridade integral de um caso sintético, ausência de versão, mutação da identidade/interface e negativas de escopo/histórico. A fixture congelada tem dois títulos fictícios e vive em `packages/testing-fixtures/assets/receivables-preparation`. O checker acrescenta regressão de imutabilidade da identidade técnica.

O módulo técnico torna-se verificável no boot, mas permanece sem produtor e sem RPC de execução. Não há DDL, migração, backfill, grant, chamada a provedor ou dado descartável em produção. `execution_r01_provenance_unavailable` permanece até o recibo SQL e o replay obrigatório no consumidor. CI, implantação no mesmo commit e catálogo pertencem ao completion; este arquivo não antecipa sua aprovação.

TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01 e TRUST-OPS-03. Engenharia de execução fecha em seguida, ainda no incremento 3, loader de autoridade, recibo privado, dependências, corrida de pausa/revogação e retirada do callback legado. Rollback usa a imagem anterior; nenhum estado novo no banco. A etapa 17 continua aberta; a 18 e ativação de clientes não começam por inferência.
