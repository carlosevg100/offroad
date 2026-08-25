# Offroad Capital: plano de execução bulletproof

Status: aprovado para execução pelo fundador em 24/08/2026

## Objetivo

Transformar os componentes existentes em um trilho institucional reproduzível, no qual toda
afirmação material mantém evidência, toda conta é determinística, toda regra é versionada e nenhum
case chega a um provedor de capital sem passar por gates explícitos.

## O que já existe e será aproveitado

- parsers, OCR, classificação, extração ancorada e worker;
- conciliação determinística, cálculos e análise de crédito;
- parecer da operação, estrutura indicativa e materiais;
- gateway multi-provedor com budget, cassettes e structured outputs;
- harness de extração, replay e execução da mesa sobre gold facts;
- testes de RLS e defesas de parser;
- seis gold cases focados principalmente em leitura e extração.

Não existe ainda um runner único desde documentos brutos até o estado terminal, um manifesto com
todo o lineage, auditoria semântica independente, fábrica paramétrica ou vertical exaustivo de
recebíveis.

## Gate 1: contratos fundamentais

- [x] ADR da taxonomia v2.
- [x] Taxonomia ortogonal publicada pela ontologia.
- [x] Seis estados operacionais e regra de direcionamento externo.
- [x] Schema do manifesto unificado.
- [x] Contrato de gold case com oito camadas.
- [x] Adaptador do catálogo legado de instrumentos para a taxonomia v2.
- [x] Persistência atômica e append-only do manifesto em snapshots e artefatos reais.
- [x] Fingerprint econômico cobre sessão, fontes, candidatos, respostas, layers, run e versões.
- [x] Linhagem content-free registra tentativa, modelo, custo e hashes de prompt, input e output.

## Gate 2: harness integrado

- [x] Contrato do runner governa nove camadas em ordem fixa, valida a saída de cada etapa,
  classifica falhas e interrompe todo o downstream após bloqueio ou erro.
- [x] Budget por etapa e por case é um hard gate com custo e chamadas contabilizados.
- [x] O motor único executa candidatos e documentos classificados, conciliação, cálculos,
  estrutura, materiais, matching e resultado.
- [x] O worker encadeia automaticamente a análise econômica depois do último documento, recebe
  evidências e mandatos por capability temporária e grava o snapshot atestado. O navegador não
  pode mais atestar nem substituir esse resultado.
- [x] Identidades e critérios completos dos provedores permanecem no job privado. O workspace da
  empresa recebe somente contagens, exclusões estruturais e lacunas necessárias ao direcionamento.
- [x] Cada camada produz saída validada, fingerprint, duração e uso próprios.
- [x] O relatório separa erro de leitura, erro de conciliação, erro de cálculo, erro de política,
  erro de material e erro de matching.
- [x] Custo por case e número de chamadas são gates, não apenas métricas.
- [x] O CI recusa regressões críticas no trilho implementado, incluindo contratos, budgets,
  isolamento, append-only, build e jornadas E2E.
- [x] O relatório identifica a versão do motor; o manifesto já inclui playbook, mercado, modelo e templates.

## Gate 3: caso corporativo âncora

- [x] Data room artesanal de expansão corporativa.
- [x] Gabarito completo das oito camadas.
- [x] Estruturas viáveis e inelegíveis explicitadas.
- [x] Teaser, credit memo, term sheet indicativo e Q&A auditados.
- [x] Matching com inclusões e exclusões explicáveis.
- [x] Estado terminal correto.
- [ ] Revisão econômica do fundador e revisão independente dos temas materiais.

## Gate 4: claims e publicação

- [x] Registro individual de claims e dependências.
- [x] Auditor numérico determinístico.
- [x] Verificador semântico independente.
- [x] Alteração de um fato identifica todos os artefatos afetados.
- [x] Claim material reprovado bloqueia publicação.
- [x] Aprovação humana e trilha de decisão persistidas.

## Gate 5: fábrica paramétrica

- [x] Schema declarativo de cenário.
- [x] Geradores de empresa, demonstrações, dívida, documentos e loan tape.
- [x] Gabaritos derivados dos parâmetros.
- [x] Perturbações de formato, evidência, conflito e segurança.
- [x] Casos âncora artesanais permanecem separados dos casos gerados.

### Evidência de aceite do Gate 5

O pacote `@offroad/case-factory` mantém uma única verdade econômica declarativa e deriva dela os
documentos, candidatos, carteira, mandatos e gabaritos. Os casos gerados atravessam as nove etapas
de `@offroad/case-engine` em PT e EN. O caso de sala suja prova que conflito permanece visível,
texto hostil não vira fato e suporte sem âncora confirmada bloqueia publicação, inclusive quando
chega a um claim por meio de um cálculo. A carteira gerada fecha exatamente em saldo, atraso e
concentração. Os anchors artesanais continuam fora da fábrica e preservam seus gabaritos próprios.

Este gate valida geração e o trilho econômico a partir de candidatos ancorados. Ele não substitui
os testes dos parsers sobre arquivos binários reais e não conclui a vertical de recebíveis/FIDC.

## Gate 6: vertical de recebíveis e FIDC

- [x] Playbook específico de carteira, cedente, sacados, servicing e estrutura.
- [ ] Casos âncora revisados por especialista.
- [x] Métricas de concentração, aging, inadimplência, perda, recuperação, diluição e recompra.
- [x] Reconciliação do loan tape com contabilidade e caixa.
- [x] Elegibilidade, reforços, gatilhos, waterfall e gaps operacionais.
- [x] Pelo menos vinte cenários paramétricos, incluindo recusa correta.

### Evidência de aceite funcional do Gate 6

O pacote `@offroad/receivables-analysis` modela o objeto econômico correto: o FIDC é o veículo de
capital, a cessão é o instrumento e a cobrança dos recebíveis é a fonte primária de pagamento. O
motor avalia título a título, calcula concentração por sacado e grupo, aging, inadimplência,
perdas, recuperação, diluição, recompra, substituição e prazo médio. Também reconcilia carteira,
contabilidade, cobrança declarada e caixa efetivamente recebido, aplica elegibilidade, limites de
concentração, advance rate, sobrecolateralização, subordinação, reserva e waterfall.

Vinte e oito cenários independentes cobrem o caminho limpo, remediação e recusa, sem confundir
informação incompleta com inviabilidade econômica. A cobertura inclui carteira
sem base elegível, divergência contábil, caixa não conciliado, registro conflitante, recebível
onerado, concentração, inadimplência, diluição, recompra, recuperação insuficiente, mapeamento de
caixa e insuficiência de reforço. A vertical executa dentro de `@offroad/case-engine`, chega ao
worker por um contrato estruturado validado e nunca libera direcionamento externo por conta
própria.

Dois casos âncora artesanais foram preparados, mas continuam marcados como `pending` até revisão
econômica independente. O sistema não declara uma revisão que ainda não ocorreu. A compilação
automática de loan tapes livres para o contrato estruturado também permanece fail-closed: um LLM
genérico não pode inventar linhas, lastro ou conciliação para ativar esta análise.

## Gate 7: retrieval governado

- [x] Case RAG isolado por organização e oportunidade.
- [x] House Playbook RAG versionado.
- [x] Mandatos estruturados como filtro duro; embeddings somente para notas abertas.
- [x] Citação, abstention e zero recuperação entre organizações.
- [x] Precedentes somente após autorização, anonimização e governança.

### Evidência de aceite funcional do Gate 7

O pacote `@offroad/governed-retrieval` separa evidência do case, House Playbook, notas abertas de
mandatos e precedentes em contratos independentes. Evidência do case só nasce de chunks ancorados
da camada determinística do parser e não aceita vetores. O playbook exige a versão aprovada exata e
orienta a análise sem se tornar prova de um fato da empresa.

O worker grava os chunks usando a capability do job documental. Antes de redigir, carrega apenas o
playbook aprovado. Depois do matching estruturado, somente ids de fundos com veredito `fits`
liberam busca em notas abertas. O estado público registra apenas versão, contagens, hash da consulta
e abstention; passagens e identidades continuam privadas.

No banco, RLS forçado, FKs compostas e comandos com capability preservam organização, sessão,
oportunidade, documento e run. Precedentes são recuperáveis somente quando autorização, propósito,
prazo, anonimização e governança permanecem válidos no momento da leitura. O teste de não
interferência cobre leitura própria, tenant cruzado, tentativa de escrita, capability forjada e
notas fora da lista permitida. A reconstrução completa da migração permanece obrigatória no CI
antes de produção.

## Gate 8: produção controlada

- [x] Staging Supabase separado, isolado e sem dados de produção; credenciais da aplicação e do
  worker permanecem próprias do ambiente antes do primeiro case acompanhado.
- [x] Replay imutável e shadow run: input congelado, execução candidata em run separada,
  comparação tipada e nenhum overwrite do snapshot público.
- [x] Canary por organização, com estados `off`, `shadow`, `canary`, `active` e `paused`, sem
  permissão de promoção pelo tenant.
- [ ] Dez cases reais acompanhados, corrigidos e reexecutados.
- [ ] Segundo lote de dez cases sem regressão crítica.
- [ ] Liberação externa gradual com aprovação.

ADR 0011 governa este Gate. Fixtures e gold cases não contam como case real. O primeiro lote libera
canary; o segundo lote deve ser distinto e, junto com aprovação explícita, libera `active`. Toda
organização permanece com saída externa desabilitada até a decisão final.

## Corte de lançamento

### Piloto interno

Taxonomia, estados, manifesto, runner completo, caso âncora, budget, autoaceite, staging e aprovação
humana antes de qualquer saída externa.

### Direcionamento a provedores de capital

Auditoria semântica, materiais aprovados, matching sem violação dura, trilha de auditoria,
isolamento validado e cases reais completos.

### Evolução posterior

RAG de precedentes, matching semântico avançado, centenas de variações e automação adicional de
aprovação.
