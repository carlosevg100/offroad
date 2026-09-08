# Aprovação do plano: contrato e prova de entrega

Estado em 08/09/2026: [PR #547](https://github.com/carlosevg100/offroad/pull/547) integrado em main `31e5a92830f50e21e2d17f4a93d3ed4d1403dd40`; banco de produção atualizado. Worker e aplicação web verificados após publicação.

[Quality 34184277267](https://github.com/carlosevg100/offroad/actions/runs/34184277267) e todos os checks obrigatórios/de segurança passaram: 20 E2E aprovados, 10 testes dependentes de provedores pulados. O E2E público de preview exerce aprovação explícita antes da execução. O E2E privado histórico usa fallback determinístico e não comprova a jornada privada completa com worker real.

As 11 migrações foram aplicadas em produção, com runtime por último. O repositório reconcilia seus nomes com as versões publicadas `20260908035022`–`20260908035058`, preservando integralmente os corpos. Probe de contratos: todos verdadeiros, nenhum job ativo observado. Advisors de produção: segurança zero achados; performance 200 INFO, zero WARN e zero ERROR. Não foram criadas fixtures de produção para provar a jornada.

Publicação operacional verificada: [worker 34184940826](https://github.com/carlosevg100/offroad/actions/runs/34184940826) concluído com sucesso, incluindo PRIMARY exata e capacidade desejada/em execução positiva. Vercel publicou main `31e5a92830f50e21e2d17f4a93d3ed4d1403dd40`; homepage e projeto autenticado existente foram conferidos no navegador, com inventário novo, histórico e nove artefatos anteriores preservados. Nenhuma execução ou fixture foi criada em produção para essa verificação.

Follow-up ainda local, fora do SHA integrado acima: decimais exatos em evidências; downloads condicionados a fingerprint válido de artefato; rótulos de preview localizados somente para snapshots novos; e E2E exigindo versão numérica maior após ajuste. Gate local completo do follow-up aprovado: 43 tarefas. CI e publicação desta atualização permanecem vinculados à sua própria revisão. Não promovem capacidades de exportação institucional, provedores, Drive, matching ou introduções.

## Resultado exigido

O usuário recebe um inventário honesto e um plano antes da análise substantiva. Aprovar libera somente a versão apresentada, sobre os inputs materiais registrados. O mesmo contrato cobre chat, atalhos públicos e continuação privada após os gates de entendimento e informações. Upload, preparação do plano e consulta de estado não equivalem a autorização de análise ou divulgação externa.

Um trabalho retido sem briefing deve gerar uma proposta determinística a partir do plano canônico real. Esse preparo não chama um modelo, não produz conclusões financeiras e não declara fontes pesquisadas como disponíveis. Planos pequenos podem conter uma ou duas frentes reais; três a sete continuam sendo a orientação usual. A apresentação não inventa tarefas para atingir um mínimo visual. A interface oferece o próximo passo na conversa do projeto; a vista especializada não pode apresentar trabalho retido como análise em execução.

## Critérios de aceite

- Arquivos processados e informações verificadas aparecem separados; todos os requisitos abertos e não examinados são acessíveis em ambos os idiomas.
- Aceite vincula organização, projeto, briefing, versão/fingerprint, plano, job, payload e inputs materiais. Nenhuma permissão é inferida do estado da interface.
- Clique repetido e retry do mesmo comando não duplicam execução. Uma resposta visual perdida permite atualizar o estado sem aprovar outra vez.
- Plano obsoleto, alteração material, edição em curso, tenant errado e payload trocado não autorizam execução ou promoção de resultado.
- Perguntas de acompanhamento e manutenção operacional de documentos não invalidam materialmente o plano. Fatos revisados e premissas relevantes invalidam quando mudam.
- Um job invalidado consegue registrar encerramento e consumo já ocorrido sem publicar resultado obsoleto; não permanece preso nem bloqueia outros projetos.
- Entradas existentes não ficam sem caminho de avanço. Os testes exercitam proposta, aprovação persistida, reload, execução e nova aprovação após mudança material.

## Segurança e privacidade

Controles afetados: IAM-05, IAM-12, DATA-02, DATA-03, DATA-12, DATA-13, AI-04, AI-08 e AI-09. Esta mudança implementa partes delimitadas desses controles; não comprova conformidade enterprise do programa inteiro.

Dados: metadados documentais e requisitos existentes permanecem no projeto autorizado. O registro de aprovação inclui identidades, hashes e referência ao trabalho; os inputs financeiros permanecem nas fontes canônicas. Não há novo provedor, compartilhamento externo ou ampliação de visibilidade. Auditoria deve respeitar a política existente de acesso e retenção; conteúdo financeiro não deve entrar em telemetria operacional.

Os dois ledgers privados de controle recebem políticas restritivas de negação explícita, conservando os grants anteriores. A escrita comprovada nessa fundação é a operação SQL privilegiada; o grant de EXECUTE para service_role isoladamente não cria um endpoint utilizável, pois o namespace privado não é acessível a esse papel e não existe wrapper público implementado. Esta entrega não amplia esses acessos.

Revisão independente identificou invalidação excessiva/insuficiente, ordenação de locks e encerramento de jobs obsoletos. Os achados desta entrega foram corrigidos e cobertos pelas regressões publicadas. Testes históricos preparam fixtures sintéticas com um plano real e aceite explícito; flags que desligam gates não são aceitas.

## Sequência de validação e rollout

1. Finalizar SQL e contrato de worker; rever autorização, invalidação, locks e todos os entrypoints afetados.
2. Aplicar migrações somente no staging isolado, executar regressões transacionais, gerar tipos e revisar advisors. Nunca copiar dados de produção.
3. Executar o gate local completo em Node 24. Abrir PR com evidência exata; aguardar Quality de aplicação, banco reconstruído do zero, E2E e Vercel.
4. Verificar a fila e aplicar as dependências em sequência. Nesta publicação não havia jobs ativos. As correções `execution_approval_trigger_record_scope` e `execution_approval_unbound_revision_metadata` foram aplicadas imediatamente após `explicit_execution_brief_approval`, antes das demais. As transações separadas têm uma janela intermediária em que gravações podem falhar; não caracterizar esse procedimento como atômico ou sem interrupção. Aplicar o marcador de runtime somente depois de todas as dependências.
5. Promover o commit aprovado. O merge dispara web e worker independentemente: a interface pode chegar antes e manter o trabalho aguardando. A imagem antiga já iniciada não verifica novamente o marcador, mas seus reinícios falham após a mudança; a imagem nova confere o contrato antes de consumir jobs. Verificar a task definition PRIMARY exata e a capacidade desejada/em execução positiva, além da publicação web e das rotas afetadas. Não criar fixtures em produção para provar a jornada.

## Contenção e recuperação

Não desabilitar a aprovação para recuperar disponibilidade. Se proposta ou aceite falhar, conservar fontes e plano e manter a análise retida. Reverter apenas a aplicação ou o worker pode perder a interface de continuidade e não desfaz o novo contrato do banco: uma reversão exige avaliação conjunta dessas versões. Preservar registros de aceite e auditoria; correção deve avançar por nova migração, sem editar uma migration aplicada nem liberar jobs em massa.

Não incluído nesta entrega: pesquisa pública universal, conector Drive, suíte completa de exportação institucional, matching de capital e introduções. Essas capacidades mantêm seus próprios gates do blueprint.
