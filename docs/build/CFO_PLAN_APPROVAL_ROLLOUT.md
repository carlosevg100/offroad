# Aprovação do plano: contrato e prova de entrega

Estado: implementação candidata. Este documento não é evidência de rollout concluído.

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

Revisão independente identificou invalidação excessiva/insuficiente, ordenação de locks e encerramento de jobs obsoletos. Esses achados precisam estar corrigidos e cobertos por testes antes de promoção. Testes históricos podem preparar fixtures sintéticas com um plano real e aceite explícito; flags que desligam gates não são aceitas.

## Sequência de validação e rollout

1. Finalizar SQL e contrato de worker; rever autorização, invalidação, locks e todos os entrypoints afetados.
2. Aplicar migrações somente no staging isolado, executar regressões transacionais, gerar tipos e revisar advisors. Nunca copiar dados de produção.
3. Executar o gate local completo em Node 24. Abrir PR com evidência exata; aguardar Quality de aplicação, banco reconstruído do zero, E2E e Vercel.
4. Aplicar a expansão compatível em produção e promover o worker correspondente. O contrato de schema impede uma imagem incompatível de consumir jobs. Trabalhos sem aprovação permanecem retidos.
5. Publicar a aplicação, verificar páginas públicas e rotas afetadas e registrar a versão efetivamente entregue. Não criar fixtures em produção para provar a jornada.

## Contenção e recuperação

Não desabilitar a aprovação para recuperar disponibilidade. Se proposta ou aceite falhar, conservar fontes e plano e manter a análise retida. Reverter apenas a aplicação ou o worker pode perder a interface de continuidade e não desfaz o novo contrato do banco: uma reversão exige avaliação conjunta dessas versões. Preservar registros de aceite e auditoria; correção deve avançar por nova migração, sem editar uma migration aplicada nem liberar jobs em massa.

Não incluído nesta entrega: pesquisa pública universal, conector Drive, suíte completa de exportação institucional, matching de capital e introduções. Essas capacidades mantêm seus próprios gates do blueprint.
