# Etapa 17 / 3B: consumidor com autoridade e proveniência

O worker consulta a fila atual para execuções de capital cujo manifesto está instalado, renova a autorização durante o cálculo e grava somente sob autoridade corrente. O produtor permanece privado e não há perfil operacional ou ativação de cliente nesta entrega. R01 conserva seu motor e seu caminho anterior; a adaptação ao envelope comum continua na etapa 17.

## Fronteiras e dados

TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01 e TRUST-OPS-03. O caminho é conta operacional autenticada + token vinculado → claim SQL → contrato e snapshot imutáveis → reserva única → cálculo em thread interrompível → settlement dos bytes → commit com revalidação. Os cinco RPCs públicos são invoker, concedidos somente a authenticated; os comandos internos e o produtor conservam seus grants fechados. Uma conta sem a vinculação explícita não usa o token de outra.

O cálculo recebe somente arquivo instalado, hash e snapshot, sem credenciais, capabilities ou ambiente herdado. O programa da thread é constante; dados nunca são interpolados no código. Limites de memória, bytes e duração são aplicados. Abort aguarda a terminação da thread. Logs contêm nomes de eventos e identificadores operacionais, sem documentos, valores, tokens ou diagnóstico remoto. Nenhuma chamada de modelo/provedor é acrescentada.

A alternância da fila ocorre antes da consulta: erro no consumidor novo não impede o legado. Uma última tentativa expirada é encerrada tecnicamente sem fabricar resultado, restaurar saldo ou reativar acesso. A limpeza usa tentativa de lock e ignora organização em disputa para não bloquear o heartbeat que preserva o lease.

## Proveniência antecipada

Antecipar esta fronteira antes de publicar o consumidor foi decisão do executor sob a autoridade permanente de 21/09/2026, com revisão independente; não houve ato do fundador. Hash confere integridade, não origem ou direito de uso. `execution_capital_payload_current_v1` exige capital v4 exato e vincula o corpo do pacote ao trabalho, finalidade e pins. Envelopes embutidos precisam conservar bytes e fingerprint da versão persistida. Cada entrada dessa versão precisa estar no grupo correto de adoções/hipóteses, com decisão, versão e fingerprint. Referências em seletores, recomendações, condições e âncoras também são verificadas.

Definições contratuais conferem identidade, texto, fonte e âncora. Observações conferem a relação com a fonte; referências avulsas fecham entidade/dossiê/definição/fontes, direitos fixados e direitos atuais. Uma revisão ampla atual não substitui a restrição da revisão guardada na observação ou definição. A validação ocorre no request e nas revalidações da execução, incluindo o commit.

Origens de cálculo fornecidas em `adoptionLinks.origins` são recusadas enquanto não houver recibo autoritativo de publicação da derivação para observação. O fingerprint apresentado pelo chamador não serve como esse recibo. Isso não altera o motor aprovado; impede alimentar o consumidor com uma origem ainda não comprovável. Engenharia de execução deve entregar essa publicação vinculada no incremento de artefato/produtor da etapa 17, antes de liberar o respectivo caminho. Não declarar a etapa 17 pronta sem essa fronteira e a adaptação de R01.

## Verificação

As suítes `execution_consumer`, `execution_consumer_exhaustion`, `execution_commands` e `execution_lifecycle` verificam conta/token, operação lógica única, resultado igual ao settlement, autoridade corrente, orçamento e exaustão. `execution_capital_provenance` verifica bytes adulterados com hash novo, dependência omitida, contexto divergente, âncora oculta, definição desconhecida, origem sem recibo, observação associada à fonte errada, expiração dos direitos fixados e revogação.

Os testes do worker exercitam deadline real com CPU ocupada, revogação no heartbeat, shutdown, settlement/commit separados, retries e transporte. O teste concorrente acrescenta disputa entre limpeza e heartbeat. A CI E2E cria definições e uma contribuição inicial pelos comandos reais, carrega uma versão sintética completa no banco e remapeia o pacote financeiro para essas identidades. Exige que o worker implantado retorne bytes canônicos e hashes iguais ao executor publicado, com uma operação settled. A prova completa tem 173 hipóteses e 63 definições; a prova reduzida não a substitui. Registra separadamente o tempo de preparação e o tempo do pedido até o resultado persistido, sem apresentá-lo como medida da experiência de interface.

A primeira CI excedeu 60 segundos ao preparar 173 revisões históricas sucessivas. A fixture passou a carregar uma versão completa com os mesmos inputs e constraints; não desabilita triggers, RLS ou checks, nem altera o caminho de produção. O preparo completo passou em staging com statement_timeout de 25 segundos. O limite de execução de 31 segundos e o prazo das consultas do consumidor permanecem iguais.

## Publicação e reversão

As migrações são `execution_consumer_authority` e `execution_capital_provenance`. O carimbo final deve ser o registrado em produção, com SQL idêntico ao de staging. A conta operacional existente recebe vinculação explícita por identidade conferida, sem membership. Nenhum cliente, perfil ou pedido é provisionado em produção.

Aplicação conferida em 22/09/2026: produção `20260922194243` e `20260922194250`; staging `20260922181059` e `20260922193702`, respectivamente. Os dois textos SQL, 20 funções e dois índices coincidem entre ambientes. Inventários de 2152 objetos em produção e 2213 em staging passaram, assim como os 18 testes negativos do checker e cinco testes do histórico recuperado. Segurança Supabase sem lints. A conta operacional foi vinculada sem membership; perfis, execuções e resultados permanecem vazios. O gate local completo passou; a integração do worker e a CI ainda são gates de publicação.

Reversão operacional retorna a imagem anterior e mantém o consumidor sem perfis/pedidos; não remover verificações nem reabrir grants para fazê-lo funcionar. Migrar DDL corretivamente, sem editar arquivos já aplicados. CI, journals/catálogos, segurança, main e web/worker no mesmo commit são requisitos de fechamento. Este documento descreve a implementação; o completion externo registra as provas e não pode ser substituído por esta descrição.
