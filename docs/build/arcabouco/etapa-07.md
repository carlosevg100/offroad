# Etapa 7: direitos de uso antes da recuperação

Status: schema instalado nos dois ambientes; CI, merge e deploy exato pendentes.
A renovação do inventário da onda 6 foi publicada pela PR 637, commit
`658faa75da0fb9b65d5a2f7f363434cf7ea7b948`.

Migração: staging `20260917024611`, produção `20260917025326`, MD5
`26955f303ed38f67f5ed3708476b64e7`. O arquivo usa o carimbo de produção.
São 35 superfícies novas; catálogos de produção/staging têm 1657/1718 objetos.
Os 325 arquivos de migração têm versão no journal de produção. Tipos gerados de produção;
32 funções em paridade; advisors de segurança sem lints nos dois ambientes.

O backfill de produção tem 28 versões, 28 direitos por aceite explícito e 28 eventos com
suas auditorias e outbox. Há uma versão de biblioteca com licença própria e nenhuma
licença de reutilização pública presumida. A verificação sem identidade devolveu zero
fontes e zero resultados; clientes não leem direitos privados nem inserem dependências,
e `anon` não executa o comando de direitos. Nenhum dado descartável foi criado em produção.

## Contrato

`private.source_rights_versions` registra revisões imutáveis de operações, finalidade,
audiência, vigência, prazo de armazenamento e evidência. Direito restringe a política de
acesso; não concede acesso. O comando exige leitura e administração da origem, deriva o
autor da sessão e rejeita revisão desatualizada. Cada append gera evento, auditoria e outbox
na mesma transação, inclusive o backfill.

O backfill usa somente aceite explícito de direitos de informação e termos, do mesmo autor
e organização, anterior ao upload. Não infere licença pelo nome, domínio ou cargo. Sem essa
prova, a versão fica sem direito de uso. Os estados de verificação de bytes da etapa 6
continuam independentes: uma licença não comprova a integridade de um arquivo.

`private.resource_dependencies` fixa a revisão de direito de cada fonte de um derivado.
A avaliação intersecta as revisões fixadas e as atuais, incluindo os ancestrais. Revogar
nega o uso; ampliar uma licença não reescreve a restrição fixada. Ciclos, referências entre
organizações e alterações destrutivas das arestas são recusados. O comando verifica o limite
de mil versões para cada ancestral afetado antes de aceitar uma nova aresta.

## Caminhos efetivos

- `search_authorized_resources_v1` materializa candidatos elegíveis antes de score, limite
  e snippet; `search_case_retrieval` passa a ser seu adaptador.
- Fontes, versões, documentos, chunks, perfis e camadas mantêm RLS e recebem a restrição
  adicional de direito vigente. Download exige exportação; leitura não implica download.
- `worker_load_retrieval_context` filtra os quatro corpora antes do ranking. Chunks cujo
  hash não corresponde ao texto são inelegíveis. O worker atua como o humano delegado.
- `job_authority_is_current_v1` exige processamento e armazenamento das fontes do job.
  Revogação invalida a revisão do job; regrant não ressuscita a capability antiga.
- O único seed comprovadamente próprio da biblioteca preserva licença explícita. Novas
  versões, notas de mandato e precedentes sem evidência permanecem inelegíveis.
- Cache público exige licença explícita para URL e hash do payload completo, com prazos.
  Os comandos de cache validam direitos também na leitura e serializam com revogação na
  organização que concedeu a licença. Copiar somente `contentHash` não licencia outro texto.

`retrieveGoverned` agora chama a RPC real, sob capability, e valida sua resposta. O ranking
JavaScript usado somente pelos testes foi retirado; filtros estruturados de mandato,
construção de chunks e validação de citações permanecem. As provas de autorização residem
nos testes SQL, não numa simulação em memória.

## Riscos e limites do incremento

A ausência de licença de reutilização impede persistir memória compartilhada. O pipeline
preserva a resposta da pesquisa corrente e registra a falha de escrita de cache pelo seu
contrato existente; não fabrica uma licença para elevar a taxa de cache.

Memória privada entre dossiês permanece desligada até 17/18. As arestas desta etapa ligam
versões de fonte; execução e protocolo de artefato ampliam o contrato em 17/18/19/21.
Publicar método, cofre ou artefato continua exigindo os incrementos 12/13/20. Prazo de
armazenamento vencido já nega uso, mas eliminação física, hold e recibos por destino são 22.
Os termos de provedores e sua elegibilidade de retenção continuam na etapa 16.

## Verificação exigida

Testes SQL cobrem ausência de direito, finalidade, expiração, exportação negada, restrições
fixadas e atuais, duas fontes conflitantes, ciclos, corrupção de chunk, revogação de job,
cache sem licença e após revogação. A bateria legada continua obrigatória. Fixtures
declaram direitos sintéticos dentro de transações com rollback; não alteram o avaliador.

O teste integrado conserva a medição da indexação de 520 chunks reais em tamanho. Seu
timeout específico não vaza para a drenagem posterior de centenas de eventos; cada entrega
da outbox tem um limite independente de dois segundos. Catálogo, grants, journals, advisors, tipos gerados e ambos os checkers passaram. A implantação
do commit final ainda é necessária para declarar a etapa entregue.

## Resultados do eval instalado

Os 76 contratos SQL passaram em staging com rollback. Uma falha de transporte foi repetida
com sucesso; a fixture de Storage passou a informar `object.get_authenticated`, preservando
a exigência de operação revogável. Falhas e repetições permanecem no recibo externo.

| Teste novo | Prova | Resultado |
| --- | --- | --- |
| `source_rights_retrieval.sql` | Ausência, finalidade, exportação/Storage, hash, duas fontes, restrição fixada, auditoria | PASS |
| `source_rights_deadline.sql` | Expiração dentro da mesma requisição longa | PASS |
| `source_rights_worker_revocation.sql` | Revogação de processamento e não ressurreição da capability | PASS |
| `source_rights_retrieval_delivery.sql` | Revogação de derivação entre seleção e entrega | PASS |
| `source_rights_search_isolation.sql` | Outro dossiê, administrador sem leitura, entrypoint privado e contexto selecionado | PASS |
| `source_rights_performance.sql` | 501 chunks, 12 resultados, EXPLAIN/BUFFERS e índices do grafo/direitos | PASS |

A medição do candidato reduziu a busca de 4238 ms para 61 ms ao avaliar fontes e escopos
uma vez, sem afrouxar os predicados de RLS; o teste instalado registra seu próprio plano e
tempo. O núcleo privado da busca é definer por essa razão, deriva o sujeito da sessão,
reaplica exatamente as verificações de sessão/oportunidade e só entrega fontes autorizadas.
O acesso direto às tabelas conserva RLS.

`authorized-retrieval.test.ts` tem cinco provas: RPC vinculada à capability, negação sem
cache, limite de query antes da chamada, rejeição de resposta inválida e citações/scores
preservados. O pacote passou 47 testes; worker passou 584; `pnpm check` passou nos 44 pacotes
antes da publicação, com nova execução obrigatória após atualizar os tipos e os recibos.
