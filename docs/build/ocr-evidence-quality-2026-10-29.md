# Confiança e escala da evidência OCR

Estado: candidato. O trabalho corrige a formação da camada de leitura, sem aprovar extrações ou alterar resultados já adotados.

## Reprodução

Duas regressões falharam na implementação anterior: a linha `Receita 9.400.000` com confiança 0,2 reaparecia no texto porque seu bloco tinha média 0,8; um bloco cujas linhas eram todas recusadas também reaparecia integralmente. O filtro por linha era aplicado às tabelas, mas não à prosa restante.

## Correção

Somente linhas acima do piso já existente alimentam texto ou escala. As sequências separadas por linha recusada ou tabela ficam em blocos distintos, com as próprias posições. O aviso registra a lacuna por página. Um bloco sem posições por linha continua usando a confiança do bloco, que é a informação disponível; não se inventa confiança por palavra.

Também é corrigida a evidência formada só por tabela: ela conta como texto legível, contribui para a estimativa de conteúdo e preserva escala declarada no cabeçalho. PDFs digitalizados recebem as declarações de escala produzidas pelo OCR, que antes ficavam fora dos metadados do PDF original sem texto. Unidades são detectadas somente a partir da declaração literal; não se inferem pela grandeza do número. Declarações divergentes são preservadas.

## Evidência

- As duas regressões iniciais falharam antes da correção.
- 49 testes do parser passaram, incluindo linha recusada, bloco todo recusado, lacuna sem concatenação, escala de linha confiável e tabela sem prosa, além da escala no PDF digitalizado.
- Typecheck do parser passou.
- Gate completo, CI e promoção: pendentes.

## Segurança, alcance e retorno

DOC-02/DOC-06/DOC-09/DOC-10 e AI-06. Nenhuma redução do piso de confiança, do limite de páginas ou da revisão humana. Nenhum direito ou fornecedor novo. Todo conteúdo mantém `scanned: true` e os avisos de revisão; isso não demonstra exatidão de qualquer scan. A confiança média não garante cada palavra ou número. Os testes unitários usam engine sintético, além do arquivo de PDF digitalizado já existente no corpus.

Versão da camada OCR: `ocr-1.2.0`. Fontes, camadas anteriores, aprovações e resultados guardados não são reescritos automaticamente. Para fontes já lidas, a nova leitura precisa de reprocessamento governado; esta proposta não invalida caches ou revisões de método por fora do fluxo. A leitura de pasta C09 tem sua própria versão, contrato e cache; ampliar o transporte de avisos e cabeçalhos até essa leitura exige verificação e promoção próprias. O candidato não afirma resolver essa etapa.

Reverter o candidato restaura a formação anterior; os bytes das fontes e os recibos continuam compatíveis. Sem migração ou backfill.
