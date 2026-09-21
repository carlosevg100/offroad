# Etapa 16: revisão das condições de processamento

Revisão de 21/09/2026. As observações autenticadas de conta e versão de credencial estão nos JSONs deste diretório. São identificadores, sem segredos. Nenhuma inferência nem dado de cliente foi enviado durante a coleta. Região `global` significa ausência de compromisso de residência regional, não residência no Brasil.

## Condições verificadas

**OpenAI.** A API não usa conteúdo para treinamento sem adesão. A conta observada mantém compartilhamento desabilitado. Responses com `store:false` evita armazenamento de respostas para recuperação; monitoramento de abuso pode conservar conteúdo e metadados derivados por 30 dias. Os modelos GPT-5.6 usam cache estendido, com limite de 24 horas. Há exceções legais e de segurança. O prazo do schema estruturado não ficou demonstrado: esse recurso permanece sem atestado. Arquivos persistentes, execução em background e ferramentas externas não herdam autorização de inferência. Fonte: [Data controls](https://developers.openai.com/api/docs/guides/your-data).

**Anthropic.** A organização identificada pela chave coincide com a organização observada no painel, com retenção padrão de 30 dias e sem adesão ao programa de compartilhamento. Messages, PDF inline, cache de prompt e schema são recursos distintos. Schema fica em cache até 24 horas desde o último uso; o cache de prompt segue seu TTL. Conteúdo sinalizado pode ter retenção excepcional de até dois anos, além de obrigação legal. A leitura administrativa do workspace não está disponível à chave de inferência; não se afirma contrato de retenção zero. Fontes: [retenção da API](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) e [prazo padrão](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).

**Perplexity e Firecrawl.** Não há prova suficiente para autorizar os recursos Search e Scrape das contas efetivas. A declaração de Perplexity para Chat Completions não cobre automaticamente Search. Permanecem desconhecidos e bloqueados; a pesquisa pública pode usar OpenAI quando elegível. Fontes: [Perplexity](https://docs.perplexity.ai/docs/resources/privacy-security) e [Firecrawl](https://www.firecrawl.dev/privacy-policy).

## Regra operacional

Não treinamento e retenção limitada bastam quando o direito da fonte permite. Retenção zero continua opção comercial futura. O teto operacional ordinário é 30 dias, reduzido pelo prazo mais curto de qualquer fonte atual ou direito fixado nas dependências. Exceções legais, investigação de segurança e aplicação das políticas são declaradas separadamente; o teto ordinário não é apresentado como garantia absoluta de eliminação.

`metadataSeconds` cobre metadados derivados do conteúdo, sujeitos à mesma condição dos logs; não afirma eliminação de cadastros de conta ou registros contábeis do provedor. O worker não envia cadastro de clientes em campos auxiliares de metadados. Qualquer ampliação desse transporte exige nova revisão.

Atestados têm validade explícita. Rever na próxima onda, em mudança de modelo, recurso, conta, chave, região, termo ou configuração e antes da validade terminar. Renovação exige nova evidência e nova identidade, com revogação da anterior. Uma falha de revisão nega uso; não renova silenciosamente.

O manifesto do procedimento publicado na etapa 15 permanece fixado. O controle da pesquisa envolve seu transporte no worker, preservando o executor publicado. SDKs não repetem chamadas sem passar novamente pelo gateway; redirecionamentos são recusados.
