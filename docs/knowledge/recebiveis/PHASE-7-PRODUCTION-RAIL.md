# Fase 7: trilho de produção da vertical de recebíveis

Data: 28/08/2026

Status: candidate. Implementação, gate local e CI de banco concluídos; staging e replay controlado
de produção ainda obrigatórios. CI aprovado no PR #300, run `33201518095`.

## Objetivo

Executar, no produto real, a vertical comprovada nos gold cases. Um arquivo enviado pela
companhia deve atravessar gate, parser, persistência de evidência, montagem do universo,
controles, cálculos, elegibilidade e plano de coleta sem fixture, montagem manual de objeto ou
acesso a conteúdo de outra organização.

Esta fase não libera materiais, não recomenda financiador à companhia e não realiza contato
externo. Ela transforma a sala entregue em um relatório interno reproduzível e em solicitações
de evidência compreensíveis.

## Contrato de persistência

1. Cada documento processado produz uma representação canônica endereçável.
2. A representação é comprimida antes de sair do worker e fica somente no schema `private`.
3. O banco verifica hash, tamanho, documento, versão, sessão e capability do job antes de
   aceitar o fragmento.
4. Repetir o mesmo job é idempotente. Tentar substituir a mesma versão por bytes diferentes é
   erro de integridade.
5. O job de caso lê apenas fragmentos das versões atuais dos documentos da própria sessão.
6. O conjunto exato entra no frozen input da execução controlada. Replay não relê estado
   mutável.
7. ZIP fiscal suportado é analisado como amostra de NF-e e eventos. ZIP genérico permanece
   recusado.

## Montagem do caso

O montador determinístico identifica a base de títulos por cabeçalhos, preserva cada linha e
produz:

- títulos e saldos em aberto;
- liquidações quando data e valor estão disponíveis;
- sacados e consolidação identificável por raiz de CNPJ;
- datas canônicas separadas;
- cobertura declarada para cada série de eventos;
- limitações explícitas para prorrogações, recompra, gravames e eventos não entregues.

Ausência não vira zero. Série não entregue recebe `not_provided`; série parcialmente observável
recebe `partial`. Uma planilha sem os campos mínimos não é adivinhada e vira tarefa de coleta.

## Saída de produto

O snapshot do caso inclui o relatório da vertical com:

- classificação e evidência;
- métricas determinísticas e procedência;
- defeitos detectados;
- fatos de rota decididos e desconhecidos;
- lote atual de até cinco solicitações;
- backlog;
- blockers e limites de uso.

A interface exibe o que foi medido, o que merece esclarecimento e o próximo lote. Identidade de
financiador, critérios internos e plano de mandato não são expostos à companhia.

## Gates de aprovação

1. O replay bruto Vertentes continua fechando os oito defeitos e quatro perguntas.
2. O mesmo acervo, enviado pelo caminho do worker, produz o mesmo `datasetHash` e o mesmo
   conjunto de controles.
3. Duas execuções com os mesmos documentos produzem o mesmo fingerprint.
4. Troca de documento altera o fingerprint e agenda nova análise uma única vez.
5. Fragmento truncado, adulterado, excessivo ou de outra sessão é rejeitado.
6. RLS e capability impedem leitura ou escrita cruzada.
7. A UI funciona em pt-BR e en-US, inclusive em `prefers-reduced-motion`.
8. `pnpm check`, testes SQL, build do worker e build do web passam.
9. Staging recebe um caso sintético completo antes de produção.
10. Produção continua em rollout controlado e sem saída externa.

## Implementado no candidate

- codec privado `gzip-json-v1` com verificação de SHA-256, limites comprimido e descomprimido e
  rejeição de adulteração;
- RPCs capability-bound para registrar evidência, carregar o conjunto atual do case e carregar
  programas de capital com suas observações exatas;
- persistência idempotente e imutável por organização, sessão, documento, versão e tipo;
- conversão do resultado de CSV, XLSX e XLS em evidência de documento e de ZIP fiscal em evidência
  NF-e;
- reconstrução do universo bruto de títulos sem usar gold, fixture reservado ou objeto manual;
- execução integrada das Fases 1, 2A, 2B, 4, 5 e 6 no job real do case;
- relatório privado completo e snapshot público sem identidade ou critérios internos de
  financiadores;
- painel de recebíveis em português e inglês;
- testes de codec, parser, integração do worker, não vazamento, ausência de histórico, RLS e
  contexto privado de programas;
- `pnpm check` verde em Node 24.19.0 nos 41 pacotes.

## Gates ainda abertos

1. Concluído no PR #300: GitHub CI reconstruiu todas as migrations e aprovou RLS, lint, Playwright
   e o quality gate dos 41 pacotes no run `33201518095`.
2. Aplicar a migration em staging, confirmar Security Advisor sem achados e executar o caso por
   upload real, sem inserção manual de payload.
3. Repetir o mesmo processamento e provar mesmo fingerprint e nenhuma duplicação de fragmento.
4. Alterar um documento e provar novo fingerprint e exatamente uma nova análise.
5. Exercitar fragmento adulterado, capability inválida e tentativa cross-tenant.
6. Promover worker e web somente depois dos gates anteriores.
7. Em produção, executar um caso controlado, observar todas as etapas do job e validar a tela PT e
   EN. O universo real de programas pode estar vazio; não criar programa fictício para obter uma
   shortlist.
8. Registrar run, commit, deployment, hashes e resultados em `ACCEPTANCE_EVIDENCE.md` antes de
   declarar a vertical pronta para teste oficial.
