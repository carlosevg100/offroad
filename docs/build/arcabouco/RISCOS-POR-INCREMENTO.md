# Riscos por incremento

Onda 7 · 17/09/2026 · Baseline entregue: `a4ff8caaaa7c91d65cbfa8020a1a6e70044cf561`. Etapa 8 autorizada; etapa 9 não iniciada.

O responsável técnico pelo incremento trata os riscos abaixo antes de pedir seu aceite. Vincular um risco a uma etapa não o resolve nem autoriza uma capacidade que dependa dele. O inventário canônico conserva severidades, responsáveis funcionais e lacunas de comprovação. Cada fechamento registra evidência, teste e limitação; ausência de prova mantém o item aberto.

## Riscos dos objetos do arcabouço

| Risco | Incremento responsável | Prova de fechamento |
| --- | --- | --- |
| Sobrescrever bytes de uma versão ou trocar sua âncora | 6 | Escrita rejeitada; nova versão independente; referência antiga preservada |
| Deduplicação revelar documento de outro escopo | 6 | Busca de hash limitada ao escopo autorizado e negação entre tenants e dossiês |
| Hash histórico presumido verdadeiro | 6 | Backfill distingue `legacy_unverified`; verificação exige bytes e evento, sem fabricar prova |
| Remoção de vínculo destruir outro uso | 6 | Dois vínculos; remover um conserva versão e uso autorizado restante |
| Projeção administrativa apresentar negação como acesso concedido | 6, correção encontrada no eval | Allow visível; revogação sai da lista, preserva deny e nega download |
| Inspeção de PDF confundir bytes de imagem com código ou perder ações comprimidas | 6 | Inspeção estrutural; regressões de nomes escapados/objetos comprimidos e limites de expansão/profundidade, sem alterar o corpus |
| Identidade pública ampliar memória privada | 7, 17 e 18 | Direitos antes da busca; inputs adicionais declarados, delegação e dependências; loader privado entre dossiês permanece desativado até essas provas |
| Ranking transformar hipótese em dado adotado | 8 e 9 | Observações coexistem; adoção explícita, versionada por finalidade |
| Publicação sem ato humano ou aprovação reaproveitada | 12, 13 e 20 | Versão e efeito fixados; worker não publica; nova revisão material exige novo ato |
| Fallback de IA violar retenção ou finalidade | 16 | Elegibilidade por conta, provedor, modelo e recurso, inclusive fallback; condições atuais documentadas; retenção zero não é pré-requisito |
| Job continuar com acesso revogado ou inputs alterados | 17 e 18 | Manifesto fixado, delegação revalidada, dependência invalidada e retomada idempotente |
| Derivado ou reimportação perder restrição | 19 e 21 | Linhagem e restrições herdadas; contribuição não sobrescreve base nem conserva citação falsa |
| Revogação negar leitura mas deixar cópia utilizável | 22 | Recibo por destino: busca, cache, job, artefato e Storage; restore não reativa acesso |
| Alarmes sem ação de notificação | 18, antes de ativar continuidade | Destino operacional autorizado configurado e entrega de alerta testada; estado `OK` sozinho não comprova notificação |

## Lacunas gerais do inventário (18)

| Identificador | Incremento e tratamento | Critério de encerramento |
| --- | --- | --- |
| SG-LIVE-CONFIG | Cada onda verifica seu escopo; 16 integra provedores; 22 consolida | Recibos atuais das plataformas, configurações e fronteiras, sem inferir IAM de login administrativo |
| SG-ENV-SEPARATION | 6 comprova uploads e fixtures isolados; 16 cobre saídas externas | Credenciais, destinos e testes negativos por ambiente; nenhum dado de cliente copiado para staging |
| SG-DATA-LIFECYCLE | 6 distingue vínculo e versão; 7 direitos; 22 retenção | Exportação, hold e purge com recibos e prazos por classe; imutabilidade não impede purge governado |
| SG-BACKUP-RESTORE | 22 | Restore isolado com RPO/RTO medidos, integridade e revogação preservada |
| SG-VENDOR-ASSURANCE | 16 para transmissão; 22 para armazenamento e ciclo de vida | Evidência atual de contratos, subprocessadores, região, retenção e saída por fornecedor material |
| SG-PROVIDER-ASSURANCE | 16 | Condições atuais verificadas e gate aplicado antes de transmitir, inclusive fallback |
| SG-TELEMETRY-ASSURANCE | 15 e 17 nas métricas de resposta útil; 22 consolida | Eventos permitidos, destino, retenção e ausência de conteúdo financeiro e pessoal comprovados |
| SG-PRIVILEGED-ACCESS | Cada alteração de credencial/role; 17 fixa identidade de execução | Inventário nominal, fatores e privilégios mínimos; teste negativo fora do escopo; não é recertificação de clientes pelo fundador |
| SG-ENDPOINTS | Trilha operacional de segurança, antes da prontidão 24 | Evidência real de criptografia, bloqueio, atualização e recuperação dos dispositivos; código não substitui gestão operacional |
| SG-REGION-MAP | 16 | Mapa real de armazenamento, processamento e transferências por destino habilitado |
| SG-PRIVACY-RECORDS | 7 direitos; 22 ciclo de vida | Registro de tratamento, bases, avisos e atendimento de direitos coerentes com o fluxo instalado |
| SG-OWNER-ASSIGNMENT | Trilha operacional, revisada a cada onda; antes da prontidão 24 | Responsáveis e suplentes reais com aceite registrado; atribuição funcional ou agente de código não equivalem a nomeação humana |
| SG-DEPLOY-DIAGNOSTICS | Incremento que mudar o deploy; no máximo 17 antes do novo executor | Prova com a role exata e recursos limitados; sucesso pretendido e negação fora do escopo |
| SG-CODEX-CI-AGENT-BOUNDARY | 16 antes de habilitar avaliação externa com dados privados | Credenciais isoladas, corpus e ferramentas limitados, egress controlado e testes de injeção/exfiltração; manter capacidade não comprovada desabilitada |
| SG-SCHEMA-BEFORE-CODE | 6 controla ordem e compatibilidade; 17 automatiza dependência | Recibo de migração precede deploy; gate de release impede imagem incompatível, inclusive rollback |
| SG-ENV-DATA-MAPPING | 6 mapeia documentos e camadas; 16 integra destinos | Matriz ambiente × classe × fluxo com permitido/proibido/condicional e teste de roteamento |
| SG-LOGGING-CONTENT-SAFETY | 6 cobre novos caminhos de documento; 17 cobre executor; 22 consolida | Logger com allowlist e testes de falha sem texto, prompts, URLs assinadas ou valores financeiros |
| SG-ASSET-DISCOVERY | Cada onda inventaria o que cria; 23 fecha superfície | Dependências, serviços, imagens e caminhos externos classificados; checker rejeita superfície sem dono |

Os marcos 12 e 17 incluem a revisão dos riscos vencidos de seus incrementos. A etapa 24 não recebe como “resolvido” um item apenas agendado. Dependência operacional que não possa ser satisfeita é reportada com opções concretas no incremento responsável; não acrescenta silenciosamente novos atos exclusivos do fundador.

## Achado adicional na abertura da etapa 6

`SG-SOURCE-VERIFICATION-AUTHORITY` (crítico): em staging, membro sem grant conseguiu alterar SHA-256 e `sha256_verified_at` pela RPC `record_document_verification`. Reprodução sintética com rollback, sem mutação em produção. Etapa 6 corrige a autoridade e a prova de bytes antes do backfill. O inventário passa a 19 lacunas, sem encerrar as 18 anteriores. A abertura do inventário registra o problema; não declara a função segura.

## Fechamento da etapa 6

Os seis riscos específicos de fonte acima têm implementação e regressão neste incremento. `SG-SOURCE-VERIFICATION-AUTHORITY` foi encerrado com a PR 635 implantada, a reprodução negada e o contrato de recibo delegado. O registro de abertura permanece como histórico. O inventário ativo volta a 18 lacunas gerais, sem considerar como encerradas as dependências de outros incrementos. Provas e limites em `etapa-06.md` e `docs/security/history/wave-5-final-review.md`.

## Tratamento técnico da etapa 7

Direito desconhecido nega uso; prazo usa relógio corrente e é reavaliado na entrega;
cache exige payload licenciado exato e lock da organização licenciadora; derivado intersecta
direitos fixados e atuais; revogação invalida a capability existente. Testes negativos e
medição em `etapa-07.md`. O caminho de ranking JavaScript usado apenas por testes foi retirado.
Essas provas não encerram SG-DATA-LIFECYCLE/SG-PRIVACY-RECORDS: purge, hold e recibos são 22.
Inputs privados adicionais e manifesto permanecem em 17/18; protocolo de artefatos em 19/21.
Implementação publicada e verificada; provas em `docs/security/history/wave-6-final-review.md`.
A conciliação final registra seus próprios gates e deploy no completion externo.

## Tratamento em execução na etapa 8

O risco de ranking como autoridade alcança os consumidores de capacidade, estrutura e
modelos, além da reconciliação. O botão, ações e política morta de aceitação por confiança
são retirados; revisão individual registra contribuição. Decimais atravessam extração e
edição sem conversão para ponto flutuante. SQL em staging verifica append, versões, direitos
fixados, revogação, origem e projeções; os recibos finais dependem da publicação da etapa.
Adoção explícita permanece na etapa 9. As 18 lacunas gerais continuam abertas.
