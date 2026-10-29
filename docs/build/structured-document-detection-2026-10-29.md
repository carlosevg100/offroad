# Identificação de planilhas por conteúdo

Estado: candidato; não é liberação dos formatos antigos no produto.

## Reprodução e correção

Prova anterior com bytes nativos: três de seis formatos falharam no leitor (XLSB como ZIP, FODS como XML e DBF como binário desconhecido). A quarentena recusou cinco de seis, incluindo XLS e ODS; sua lista autorizada não inclui esses formatos. O suporte da biblioteca não demonstrava o suporte do produto.

O leitor agora refina as assinaturas genéricas pela estrutura real: pacote XLSB com declaração de conteúdo e partes binárias, raiz/namespace/corpo de planilha ODF sem entidade ou DTD, DBF com cabeçalho, campos, terminador e área de registros coerentes. A extensão ou o MIME declarado não estabelecem essa identidade. Um arquivo renomeado mantém seu tipo e registra a divergência.

A política de quarentena v3 corrige outro bloqueio: um navegador sem MIME específico envia `application/octet-stream`, que passa a ser tratado como declaração ausente. Isso não aceita formato novo nem dispensa inspeção. O fallback textual é limitado a CSV/TSV/TXT/PRN; texto com extensão arbitrária não ganha identidade de CSV.

## Verificação

- 24 testes focados do leitor e regressões de conversão passaram.
- Suíte inteira dos parsers: 58 testes em 6 arquivos passaram.
- Suíte de inteligência documental: 91 testes em 8 arquivos passaram.
- Typecheck do parser e da inteligência documental passou. O fallback de texto com extensão arbitrária foi reproduzido como aceitação indevida e passou a ser recusado por tipo não suportado.
- `pnpm check` completo passou no commit `006c5d178ec07d66c81e92d253a8abe17a38f5f5`: lint, typecheck, testes e build em 44 pacotes. Uma tentativa anterior, sobreposta a outra regressão, excedeu os 5 segundos de um teste numérico não alterado; a execução sem sobreposição passou, com o mesmo teste em 2,6 segundos. Nenhum limite desse teste foi alterado.
- CI e promoção: pendentes.

## Segurança e alcance

DOC-02/DOC-06/DOC-07/DOC-09/DOC-10: detecção estrutural, limites existentes do ZIP, entidades XML recusadas, identidade/versão de leitura e negativos de falsificação/corrupção. APP-10 preservado. Não há novos grants, fontes, provedores, migrations ou publicação de método. A versão da política muda para `offroad.document-quarantine.2026-10-29.v3`, sem alterar políticas já guardadas em recibos antigos.

Os controles de conteúdo ativo para os formatos legados precisam ser ampliados antes de autorizar sua entrada. Não se remove `unsupported_type` sem implementar a inspeção equivalente de macros, conteúdo embutido, ligações externas e fórmulas. A C09 publicada também tem um conjunto próprio de formatos e precisa de nova versão para incorporá-los com honestidade. Essas duas partes não foram resolvidas por este candidato. UTF-16 em FODS e variantes DBF fora das estruturas verificadas não estão comprovados.

Retorno: reverter o candidato; preservados arquivos originais e recibos antigos. Nenhum dado de cliente foi usado: workbooks e scanner dos testes são sintéticos, e a prova de scanner desta suíte não é uma execução de ClamAV real.

## Referências técnicas

- [Formatos da biblioteca SheetJS](https://docs.sheetjs.com/docs/miscellany/formats/).
- [Estrutura dBASE III documentada pela Embarcadero](https://blogs.embarcadero.com/dbase-dbf-file-structure/).
- Testes `structured-spreadsheet.test.ts`, `universal.test.ts` e `governed-document-quarantine.test.ts`.
