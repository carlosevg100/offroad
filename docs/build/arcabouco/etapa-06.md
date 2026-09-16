# Etapa 6: fonte lógica e versão imutável

O OK do fundador autoriza fonte, versão e vínculos, com tratamento dos riscos neste incremento. Identidade não concede acesso a outro dossiê. Direitos de uso e recuperação pertencem à etapa 7; entradas privadas adicionais de execução e continuidade permanecem em 17/18.

## Implementação e transição

`public.sources` identifica o documento lógico; `source_versions` fixa bytes, hash declarado, tamanho, caminho e versão legada; `source_bindings` registra usos explícitos. O ID antigo de `source_documents` continua sendo o ID da versão exata. Upload legado e RPC nova escrevem a projeção e os objetos canônicos na mesma transação. Nome igual nunca funde documentos. A deduplicação continua restrita ao lote autorizado. Upload direto de oportunidade omite a nova coluna e recebe identidade por default/trigger, sem novo grant.

Perfis, camadas, fatos, candidatos, chunks e jobs conservam a referência à versão, mesmo quando a projeção é retirada. Perfis/camadas possuem FK composta para a versão legada exata. Remover um documento retira o uso da sessão e não destrói bytes nem outra utilização. Referências históricas de recurso sobrevivem à exclusão do recurso, mas não concedem autoridade: o FK vivo fica nulo e a leitura é negada. Não há purge físico neste incremento; retenção e purge governado serão implementados na etapa 22.

Leitura exige autoridade na origem e em um vínculo ativo. Download exige também finalidade de exportação, antes e depois do I/O. Storage rejeita alteração e exclusão de bytes registrados; uploads ainda não registrados podem ser limpos. Retry de camada aceita apenas bytes idênticos e revalida a delegação. O job fixa o ID da versão e recusa substituição. Nenhum conteúdo de documento é acrescentado à auditoria; são usados os eventos permitidos de operação/ID.

## Correção da confirmação de bytes

A reprodução anterior em staging comprovou que um membro sem grant podia alterar hash e confirmação pela RPC `record_document_verification`. As funções pública e privada agora estão sem EXECUTE; a implementação privada também nega a operação. A web deixou de usar esse caminho. O teste `source_version_identity.sql` comprova negação tanto ao membro sem grant como ao usuário com acesso ao documento.

Só o resultado de um worker com job, lease, conta e capability válidos registra prova em `private.source_version_verifications`. Organização, documento, versão, operação, tamanho e hash observado precisam corresponder ao job e à versão. Recibos são imutáveis; retry é idempotente; hash divergente ou delegação revogada é negado. O worker atual já produz o recibo completo, permitindo migração antes do deploy.

O backfill não confunde um carimbo produzido pelo caminho vulnerável com prova. Os 28 documentos existentes entram como `legacy_unverified`; os 17 carimbos antigos são preservados em `legacy_verification_claim` e retirados da projeção confiável. Nenhum hash declarado, byte, perfil ou camada foi apagado. Nova confirmação depende de processamento real autorizado, sem fabricar recibos nem reprocessar dados de cliente para demonstrar o rollout.

## Instalação e eval

| Migração | Staging | Produção | MD5 SQL no journal |
| --- | --- | --- | --- |
| logical_sources_and_versions | 20260916211117 | 20260916212202 | e60fd8157897f27a62dc34b135deab2c |
| source_identity_legacy_insert_default | 20260916211402 | 20260916212209 | 21277ebbddd939d43cecc08a3bfb5901 |

Os arquivos usam os carimbos de produção; tipos gerados de produção. 27 funções comparadas são idênticas nos dois ambientes. Catálogos: 41 superfícies novas, 1622 objetos em produção, 1683 em staging e 323 arquivos presentes no journal de produção. Diferenças históricas aprovadas de staging permanecem preservadas. Ambos os checkers passaram.

Leitura de produção: 28 fontes, 28 versões e 28 vínculos para 28 documentos; zero divergências de hash, tamanho, caminho, versão ou identidade. Os 24 perfis e 24 conjuntos de camadas permanecem. Nenhum fixture foi criado em produção. Segurança: zero lints nos dois ambientes. Performance: nenhum novo FK sem índice; os 30 avisos históricos e a configuração histórica de conexões de Auth permanecem registrados, sem removê-los para aparentar limpeza. Índices novos sem uso estatístico são esperados antes do tráfego.

69 contratos SQL passaram no candidato e os 69 passaram novamente no schema instalado, com fixtures sintéticos e rollback. Nomes e horários em `etapa-06-installed-eval.json`; instalação e contagens em `etapa-06-installation.json`. O contrato novo cobre versões com mesmo nome, retry, outra utilização, página/célula, tenant diferente, mutação de bytes, Storage, recibo legítimo, recibo forjado e revogação. Os contratos anteriores de aprovação obsoleta agora criam outra versão em vez de alterar a antiga.

Testes TS novos: quatro do contrato de fonte, três do payload de job, três de retry imutável de camada e cinco da rota de download. A rota testa negação inicial, sessão anônima, sucesso sem cache, revogação durante I/O e segunda autorização inválida. `pnpm check` passou nos 44 pacotes antes da publicação; CI, merge e implantação do commit final ainda são exigidos para fechar a etapa.

A primeira CI encontrou dependência do fixture antigo no carimbo da RPC revogada. O suporte E2E agora prepara uma lease local limitada e usa a conta de worker sem membership, o cliente real de Storage e o gate E0 para ler os bytes efetivamente enviados. O scanner do teste é explicitamente sintético e aceita só os hashes do corpus versionado; não é prova de qualidade de antivírus. A RPC de resultado registra o recibo real de integridade. A execução de suporte fica cancelada após E0, sem declarar pipeline completo ou disparar análise. O helper recusa hosts externos e nunca roda contra staging ou produção. O código de autorização e a exigência de verificação não foram relaxados.

O exercício do E0 revelou outro defeito: a busca textual de `/JS` nos bytes brutos confundia dados de imagem comprimida com JavaScript. `pdf-structure.ts` agora inspeciona os objetos PDF usando `pdf-lib` 1.17.1, já versionado no repositório e declarado também neste pacote. A política passa a `offroad.document-quarantine.2026-09-16.v2`. A inspeção decodifica nomes escapados e objetos comprimidos, sem interpretar bytes de imagem como tokens. Descompressão de objetos/xref é limitada antes do parser pelo orçamento de inspeção (8 MiB padrão), com limite de quantidade/profundidade; filtros estruturais não suportados falham fechados. Não se alterou o corpus. Seis regressões cobrem o memorial real, ações/nomes escapados, JavaScript comprimido, criptografia/embutidos, expansão excessiva e estrutura inválida. Os oito arquivos do corpus passaram novamente pelo E0 local.

## Riscos e contenção

Os quatro riscos de fonte da etapa 6 têm testes e prova de backfill; a confirmação indevida foi corrigida no schema instalado. O fechamento do inventário só encerra o achado com o commit entregue. As 18 lacunas gerais continuam no registro `RISCOS-POR-INCREMENTO.md`, cada uma com incremento e prova exigida.

Rollback de aplicação preserva o schema: versões imutáveis e revogação da RPC não são revertidas. Se um consumidor antigo tentar sobrescrever camada ou confirmar hash, a operação falha fechada; corrigir o consumidor em novo commit. Correção de DDL usa outra migração. Nenhuma tela administrativa, direito contratual, entrada privada entre dossiês, Temporal, provedor ou integração é habilitada aqui.

## Entrega e conciliação

A implementação foi mesclada e implantada pela PR 635. A revisão `docs/security/history/wave-5-final-review.md` fixa o commit, CI e runtime efetivamente observados; a conciliação tem gates e recibos finais próprios no completion externo. O teste de revogação espera o grant desaparecer da resposta do servidor antes da leitura negativa; não reutiliza o aviso salvo da concessão anterior. A etapa seguinte continua dependente do OK do fundador.
