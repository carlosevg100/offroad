# Etapa 20 / 3Q: retenção verificável do insumo público

## Escopo deste incremento

A fundação 3Q registra identidade, fingerprint e licença de cada entrega pública sem conservar o conteúdo. Este incremento acrescenta um bucket privado para o JSON canônico exato, uma alocação imutável ligada a job, tenant, delivery, direito e versão de política, além de leitura e eliminação com prazo. Não integra ainda os produtores da pesquisa pública nem muda o estado `unresolved` das cápsulas, entregas ou releases. Os produtores entram nos incrementos seguintes do 3Q; confirmação e conversa continuam para 3R.

## Contrato operacional

- `capital-input-capture` aceita apenas `application/json`, até 1 MiB, sem versionamento. O caminho é `organization_id/allocation_id/payload.json`; não há atualização nem URL assinada. A conta autenticada do worker recebe apenas a operação, o caminho e a janela autorizados pelo banco.
- `worker_prepare_capital_public_payload_v1` fixa o JSONB canônico, sua SHA-256 e o prazo mais curto entre política local e direitos de todas as fontes pinadas e correntes. Repetir request e bytes devolve a mesma alocação. Conteúdo divergente, licença revogada, contexto trocado ou janela expirada são negados.
- O worker faz upload sem overwrite, relê os bytes pela versão exata, confere tamanho e SHA-256, e entrega o recibo a `worker_commit_capital_public_payload_v1`. O SQL confere identidade, versão, metadados, job e autorização de novo. O banco não calcula a SHA dos bytes do Storage; o recibo de integridade física é uma atestação do worker verificada pelos testes independentes.
- `worker_read_capital_public_payload_v1` revalida job, pessoa, tenant, direitos, fila e objeto. O worker autoriza antes e depois de reler os bytes, e só retorna bytes cuja identidade e hash permaneçam os mesmos.
- Um loop de purge separado do job atual faz polling a cada 30 segundos. Retirada de binding, nova versão de direito ou mudança de dependência antecipa a linha exata da fila. A conta do purger ainda precisa de token vigente, mas a exclusão não depende do job ou da pessoa que perderam acesso. DELETE e ausência confirmada por Storage precedem o ACK; falhas voltam à fila. O prazo de purge antecede o vencimento do direito. Backlog vencido ou ausência de heartbeat fecham a admissão de novas alocações.
- A política nasce com admissão desligada. O rollout de habilitação só ocorre após CI com Storage real, worker compatível em produção e prova de polling. O controle de admissão permite contenção sem alterar direitos históricos; desligá-lo não suspende a eliminação.

## Aceite e transição

Testes SQL verificam grants/RLS, negados, deadlines, replay, imutabilidade, fila e ausência de promoção. Um teste HTTP em stack Supabase descartável confirma upload, download, hash, revogação e exclusão física, incluindo perda do ACK após DELETE. Corridas em duas sessões exercitam política, binding e dois purgers em ambas as ordens. A mesma CI executa o contrato antes do merge. Em staging e produção, o journal, as definições efetivas e o catálogo precisam concordar com os arquivos; produção não recebe dados descartáveis.

O próximo incremento integra primeiro os produtores de pesquisa empresarial com esse adaptador. O material histórico sem bytes capturados continua restrito; não se recompõe conteúdo passado por pesquisa nova. Controles relacionados: DATA-02, DATA-03, DATA-09, APP-02, APP-08, APP-11, AI-08 e OPS-10. Riscos que exigem contenção: versão habilitada no bucket, fila vencida, heartbeat ausente, deleção sem prova física e perda de direito durante leitura.
