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

O caminho novo ainda entra pelo `case_analysis` aprovado existente. Não é despacho universal de tarefas independentes, nem elimina as etapas privadas anteriores. Comparação qualitativa não é comparação financeira calculada. Pesquisa pública e matching não são executados por este módulo. Não entrega PPTX/XLSX/PDF nem homologação setorial ampla.

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

Próxima integração após este corte: despacho proporcional do trabalho documental e perguntas/revisões específicas, sem obrigar um processo de estruturação completo. Cálculos financeiros continuam dependendo da seleção econômica já planejada. A homologação com modelo real e os arquivos institucionais seguintes pertencem ao mesmo marco de produto.
