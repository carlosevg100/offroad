# Etapa 17 / 3H: leitura da autoridade para preparar R01

O preparador fixado recebe fontes verificadas, escopo confirmado, histórico contínuo e respostas efetivamente persistidas. A leitura privada deriva organização, trabalho, sessão e sujeito do job; não aceita esses campos do cliente. Conta operacional e capability devem coincidir. Trabalho e sessão exigem leitura e trabalho separadamente, inclusive quando uma fonte também possui outro vínculo acessível.

`worker_load_receivables_preparation_v1` chama `r01_preparation_authority_v1`. O hash do conjunto reproduz a serialização do preparador, incluindo Unicode e seleção de abas v1/v2. Cada fragmento fixa versão, hashes, revisão de direitos, binding e fechamento transitivo. Histórico é selecionado por esse conjunto, ordenado por revisão e conferido contra o patch causador e os hashes persistidos. Um rascunho mais novo de outro conjunto não prevalece.

`r01_response_authority_v1` cruza pedido, mensagem humana, autor, conteúdo, metadata, vínculo tipado e conjunto de fontes. A conta do worker não substitui o sujeito humano. `r01_adopted_value_v1` resolve apenas caminho/valor de decisão presente na versão indicada, no mesmo trabalho e no contexto `r01:<datasetHash>`, finalidade `receivables underwriting`. Conserva hipótese como hipótese, sem converter prosa ou unidades. O snapshot privado conserva dimensões e referências da adoção para a conferência semântica posterior.

O R01 publicado não declara pontos de extensão tipados. Por isso um parâmetro `house_method`, mesmo acompanhado de texto publicado, é recusado. Esta entrega não escreve conteúdo profissional nem cria defaults para contornar essa ausência.

## Fronteira e pronto

Nenhuma função nova recebe grant, wrapper público, perfil ou produtor. É uma leitura interna testada, ainda sem consumidor autorizado. O replay do preparador continua obrigatório; a leitura SQL não prova suficiência, fidelidade de transformação nem autorização para calcular. Testes SQL usam rollback em staging/CI; a fixture financeira é a mesma de `packages/testing-fixtures`, lida pelo teste, sem cópia para produção. `rls_non_interference.sql` verifica ausência de acesso direto. Os testes novos entram automaticamente na CI existente.

TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01. Migração, carimbos dos dois ambientes, tipos/advisors, CI, web e worker no mesmo commit pertencem ao completion. Rollback operacional mantém os consumidores anteriores; as funções privadas não têm callers liberados.

## Próximo vínculo do mesmo incremento 3

O recibo revalida o snapshot sob locks e fixa os direitos inicialmente utilizados, além dos atuais. Adoções precisam ter moeda, escala, unidade, período, cenário, entidade/perímetro e definição compatíveis com o destino antes do cálculo; o loader conserva esses dados e não afirma essa compatibilidade. O consumidor faz replay obrigatório e aplica readiness do método publicado. Request, claim, heartbeat, commit, leitura e callback legado precisam consumir o mesmo recibo. Pausa concorrente, inclusive primeira linha de pausa de uma organização, pertence a essa ligação. `execution_r01_provenance_unavailable` permanece até os testes integrados passarem. Nenhuma etapa 18 nem ativação para clientes decorre deste incremento.
