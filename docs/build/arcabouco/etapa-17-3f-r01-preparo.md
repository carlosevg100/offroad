# Etapa 17 / 3F: preparação reproduzível de R01

## Problema e comportamento

Uma montagem histórica com dataset coincidente prevalecia sobre um rascunho posterior, inclusive incompleto ou em conflito. `receivables-method-input-resolution.ts` passa a usar o rascunho sempre que ele existe. A montagem histórica só atende à compatibilidade quando não existe rascunho. Não altera o cálculo financeiro nem o método publicado.

`receivables-preparer-entry.ts` recompõe universo e detecção a partir dos fragments verificados e do escopo confirmado. `receivables-preparation-history.ts` reproduz os patches de documento e de resposta com os mesmos parsers, compara todas as revisões e exige valores de contexto/método resolvidos independentemente. Um patch genérico contribui um target; seus grupos e referências correspondem exatamente à origem desse valor. Método não atesta fatos contábeis, controles de títulos ou tratamento de achados. `receivables-preparation.ts` liga cada valor do input ao draft, universo, escopo ou transformação, incluindo listas vazias, títulos reordenados e recebimentos sem vínculo.

## Fronteira de autoridade e transição

Preparação local não concede acesso, não prova readiness e não chama o cálculo. O consumidor futuro deve obter histórico, respostas e valores pelo loader SQL privado, revalidar seus objetos sob lock e executar o replay inteiro; não pode receber referências livres do cliente. Readiness continua pertencendo ao bundle publicado, incluindo o gate de finding inexistente. Referências internas de tratamento de achados têm de estar resolvidas, além dos bytes de disposition/rationale.

A fonte deste preparador técnico precisa estar em main antes de sua captura imutável no próximo vínculo. Sua versão é separada do artefato financeiro histórico; não atribuir retroativamente preparação ao bundle R01. Nesta entrega, somente a correção de precedência modifica o consumidor existente. Os três módulos novos são a fonte testada da captura seguinte. Não existe DDL, perfil operacional, claim R01, produtor público ou grant novo. `execution_r01_provenance_unavailable` permanece.

## Pronto e risco remanescente

Check local completo, revisão independente, CI Quality/Security, merge, web e worker no mesmo commit e conferência de catálogo sem DDL pertencem ao completion externo. Testes novos cobrem sucessor, conflito, draft incompleto/desatualizado, fontes por valor, replay de documento/resposta, alterações de autor/campo/dataset, história incompleta, parâmetros publicados, troca de referências, escopo/bytes alterados e disposições adulteradas.

TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01. Dados privados permanecem no processo existente; nenhum provedor, egresso ou telemetria de conteúdo foi introduzido. A reversão usa a imagem anterior, mas reintroduziria a precedência defeituosa; preferir correção adiante. O risco de autorização do preparador é tratado no próximo vínculo do incremento 3 por recibo SQL, dependências, pausas e revogação. Não liberar a fila antes dessa prova. Os quatro alarmes sem destinatários permanecem na etapa 18.

Nenhuma decisão adicional do fundador é necessária para continuar a etapa 17. Este incremento não fecha a etapa nem autoriza a 18.
