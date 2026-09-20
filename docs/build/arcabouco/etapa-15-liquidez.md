# Etapa 15: liquidez por datas

## Contrato entregue neste incremento

`packages/financial-core/src/liquidity-calendar.ts` calcula saldo inicial + entradas - saídas para cada data efetiva com fluxo e para o encerramento do horizonte. O saldo inicial corresponde ao fim da data de abertura; eventos só podem ocorrer depois dela e até o encerramento. A convenção obrigatória é `end_of_day_netting`: entradas e saídas no mesmo dia são compensadas, sem prometer cobertura intradiária ou ajustar dia útil. O calendário distingue as contas disponível e restrita; nenhuma liberação de caixa restrito é inferida. Transferências e suas datas exigem entradas/saídas explicitamente fundamentadas.

Valores são decimais normalizados de até 24 dígitos inteiros e 8 casas decimais; somas/subtrações são exatas dentro dos limites declarados, sem arredondar pequenos déficits para zero. Taxa, refinanciamento, ingresso futuro e liberação de garantia não são presumidos. Uma ausência propaga desconhecido a partir de sua data apenas na conta afetada. Cobertura parcial permanece parcial mesmo quando todos os eventos informados têm valor. Picos e primeiras datas de déficit são dos saldos conhecidos, não garantia de cobertura de fluxos ausentes. `calculated` significa cálculo dos operandos declarados, nunca previsão certa ou crédito aprovado.

`packages/financial-model/src/adopted-liquidity-calendar.ts` recebe uma base imutável pelo leitor SQL autorizado. Exige entidade, perímetro, moeda, definição e cenário correspondentes, estoques na data de abertura e fluxos diários na data efetiva. Estoque observado e cenário projetado são declarados separadamente. Os caminhos `liquidity.available_cash`, `liquidity.restricted_cash`, `liquidity.cash_inflow` e `liquidity.cash_outflow` impedem rebatizar EBITDA como fluxo. Um agregado anual não é distribuído por datas implicitamente. Adoções ausentes e reutilização da mesma contribuição em mais de um operando são recusadas; valor explicitamente ausente mantém a justificativa. Escala de apresentação não é aplicada novamente.

O resultado conserva vínculos de operandos, contribuições completas, hipóteses, fingerprint da base, identidade da fórmula e versões dos motores. Integridade de bytes não prova permissão: o leitor autorizado continua obrigatório. Nenhuma rota nova aceita envelopes enviados diretamente pelo usuário.

## Verificação e transição

12 testes novos em `liquidity-calendar.test.ts`: identidade independente 10 - 40 = -30, depois +80 = 50; caixa restrito100 separado; agregação diária; ausência; cobertura parcial; déficit inicial e precisão; quitação PIK pelo motor de dívida existente; cinco valores inválidos; datas, repetição e ausência sem justificativa. 11 testes em `adopted-liquidity-calendar.test.ts`: identidade e contribuições; lacuna; sete dimensões incompatíveis; EBITDA, integridade, escopo e duplicação; reprodução da revisão anterior e cenários distintos. Fixture sintética em `packages/testing-fixtures/src/capital-structure-decision.ts`. Nenhum valor de teste é default de produção.

Contrato e motor são aditivos e ainda não ligados a uma nova experiência do usuário. O adaptador `capital_planning` atual segue protegido; não há legado removido porque sua substituição depende da composição financeira completa. Sem DDL, backfill ou novo efeito externo. Manifestos de autoria regenerados; método e artefato executável R01 permanecem fixados. Check integral/CI/deploy comprovados no completion externo antes de fechar o incremento.

## Riscos nos incrementos correspondentes

15: calendarização efetiva e convenções contratuais, modelos de caixa, preço/instrumentos, sensibilidades, covenants, suficiência, autoria profissional e medida de resposta útil. Sem uma data fundamentada, não se inventa vencimento para fazer o cálculo rodar. Antes da integração, investigar a intermitência de contribuição compartilhada registrada na PR677, owner Codex; não ampliar timeout por conveniência. Publicação exige conteúdo realmente aprovado.

16: condições reais de retenção por recurso; 17: execução e dependências sob manifesto fixado e nova medida de resposta útil; 18: destinos dos alarmes e renovação recorrente da sessão operacional; 19: cálculo e bytes por revisão; 21: exportação/reimportação. Não antecipar Temporal, Office nativo ou ensaios de usuários. A etapa 15 não está concluída por este incremento.
