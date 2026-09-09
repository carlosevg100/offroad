# Marco de produto: documentos, trabalho e entrega

Baseline: main `292d26b26ad4eccb676d085adead3d80e4ccc839`, 8 de setembro de 2026.
Execução em `feat/advisor-work-products`. Complementa o Blueprint e o Program Board; não substitui suas fontes canônicas nem promove capacidades universais.

## Resultado perseguido

Um mesmo ambiente permite comparar propostas recebidas, preparar reunião e revisar oportunidade, a partir dos documentos autorizados. O resultado deve ser específico ao pedido, acessível ao lado da conversa, persistente e exportável em Word editável. Companhias, assessores/DCM e analistas/investidores compartilham a capacidade; cargo não determina autorização.

## Implementação deste corte

- O executor documental lê o objetivo exato do plano aceito, nunca a primeira mensagem histórica. O contexto é obtido por capability e congelado junto do input existente.
- O pipeline de documentos já conserva camadas dos formatos suportados. O adaptador verifica documento, versão e hash, aloca trechos entre arquivos e declara cobertura parcial. Não depende de um caso de demonstração específico.
- Três famílias de seções: termos/diferenças/esclarecimentos; companhia/discussão/perguntas; operação/proteções/riscos. Observações são excertos da fonte. Interpretações ficam identificadas como hipóteses, com perguntas de validação. Não calcula economics ou emite decisão de crédito.
- Resultado, vínculo do plano e invocações integram o snapshot/manifesto da execução existente. Sem resultado de modelo válido não há produto fabricado.
- Leitura e download exigem execução concluída e atual, organização/projeto, despacho aceito, fontes atuais e fingerprints correspondentes. Mudanças invalidam a leitura corrente, sem reescrever histórico.
- A área de trabalho oferece seleção e endereço de resultado. A conversa mantém seu rascunho durante a navegação. Resultados existentes de reunião e do preview preservam seus contratos.
- Word reproduz a versão persistida e seu idioma, com hipóteses, lacunas e fontes; não reanalisa nem traduz ao baixar. É material preliminar privado, sem autorização de divulgação.

## Limites que impedem declarar o marco completo

Pedidos documentais compatíveis com documentos disponíveis podem agora receber um plano próprio Q01/Q02/Q03 quando ainda não existe plano financeiro. O usuário confirma o entendimento e aprova esse plano; o worker executa somente o trabalho documental, antes do motor financeiro, usando o transporte `case_analysis` existente. O escopo depende do plano aceito, dos tasks persistidos e do vínculo SQL, nunca apenas de palavras no pedido. Planos financeiros existentes não são substituídos automaticamente. Isso ainda não é despacho universal nem elimina a confirmação inicial. Comparação qualitativa não é comparação financeira calculada. Pesquisa pública e matching não são executados por este módulo. Não entrega PPTX/XLSX/PDF nem homologação setorial ampla.

O gateway usa a política existente para informação restrita e o orçamento do job; não cria um provedor nem aumenta o teto de gasto. Nova chamada e sua latência precisam de validação com modelo real. O E2E específico depende de worker com provedor autorizado; um teste pulado não comprova a jornada.

## Evidências deste corte

- Testes obrigatórios do executor e do runner completo, com três intenções, layers reais codificadas, fontes divergentes e invocações contabilizadas.
- Testes de reader e rota: organização/projeto, autorização revogada, resultado adulterado, fonte alterada, execução posterior, corrida de leitura, versão solicitada e idioma original.
- SQL de `execution_proposal_revision.sql` executado em staging isolado, com rollback e ausência de fixtures residuais. Advisors de segurança: zero achados após as migrações.
- Word gerado pelo renderer real e inspecionado visualmente. QA de componentes usa dados sintéticos identificados, sem comprovar autorização ou execução de provedor.
- Gate local completo `pnpm check` aprovado com Node 24: 43/43 tarefas em lint, typecheck, testes e build. Log: `/private/tmp/offroad-advisor-work-products-check-network.log`. Build exigiu acesso de rede para concluir no ambiente local. CI e implantação ainda pendentes; não presumir sucesso futuro.

## Aceite do marco integrado

1. Pedidos dos três públicos percorrem upload, entendimento, plano, aprovação, execução e entrega na aplicação.
2. O conteúdo diferencia as três intenções e aponta limites materiais.
3. O usuário abre, retoma e baixa a mesma versão; mudança de fonte/plano exige novo trabalho aprovado.
4. Revisão de domínio e execução com provedor real aprovadas em casos independentes.
5. Interface, arquivo, segurança, custo, latência e recuperação passam seus gates.

## Rollout e retomada

Aplicar primeiro a migração aditiva de leitura; publicar web compatível; ativar o marcador e verificar worker exato. O boot novo exige `document-work-product-request-binding.v1`. Até o rollout verificado, este corte não está disponível em produção. Rollback preserva snapshots e fontes; não concede permissão de download sem vínculo atual. Controles afetados: AI-05/AI-08, TRUST-APP-02, TRUST-DATA-02, TRUST-SDLC-01.

Próxima integração: homologar o caminho documental proporcional já implementado com provedor real e expandir revisão de escopo e perguntas antes do primeiro plano. Cálculos financeiros continuam dependendo da seleção econômica já planejada. A homologação com modelo real e os arquivos institucionais seguintes pertencem ao mesmo marco de produto.

## Continuação: execução documental independente

Registro Q01/Q02/Q03 especificado e métodos documentais canônicos candidatos em credit-playbook; presença no registro não promove qualidade. O plano visível tem três etapas reais e declara ausência de cálculo e divulgação. Snapshot documental não fabrica demonstrações financeiras, matching ou aprovação de crédito. O painel usa o escopo do plano atual e as perguntas do resultado vinculado.

Migração `20260909001238_documentary_execution_scope_binding.sql` aplicada somente em staging. Regressão confirma marker isolado, snapshot isolado, tarefas financeiras misturadas e target financeiro recusados; plano documental exato aceito. Rollback limpo e advisors de segurança sem achados.

Gate manual `.github/workflows/document-work-product-live.yml` preparado para três intenções repetidas com executor real, seis tentativas e teto compartilhado de USD 3. Mantém ambiente protegido e execução somente em main. Ainda não executado; não equivale a E2E autenticado, homologação de domínio ou liberação de produto. A validação exige integrar código para tornar esse workflow disponível em main; não alterar a fronteira OIDC para executar código de branch com segredos.

Gate local final da continuação: `pnpm check` aprovado, 43/43 tarefas por etapa; 397 testes do worker e 413 testes web. Log `/private/tmp/offroad-standalone-check-release.log`. Worker exige também `documentary-execution-scope.v1`, introduzido pela migração aditiva `20260909001714_worker_runtime_schema_contract.sql`, aplicada somente em staging. O caminho financeiro não gera produto documental adicional. Proposta documental sem escopo SQL válido falha sem executar análise financeira. CI deste novo head, provedor real e produção ainda devem ser verificados.
