# ADR 0012: Fronteira de assessoria DCM e jornada progressiva do cliente

Status: accepted, fundador em 25/08/2026

Data: 2026-08-25

Substitui a linguagem de parecer e recomendação do ADR 0009 sem alterar seus contratos de
taxonomia, lineage, gold cases ou governança.

## Contexto

A Offroad Capital não é uma casa de crédito, não administra capital de terceiros e não toma a
decisão de investir. Ela atua como uma mesa institucional de originação e assessoria DCM. Seu
trabalho é compreender a companhia e a necessidade de capital, construir uma base financeira
confiável, desenvolver alternativas tecnicamente suportáveis, estruturar a operação de forma
indicativa, preparar materiais de padrão institucional, mapear o mercado e realizar uma
introdução qualificada.

O financiador mantém integralmente underwriting, diligência, comitê, decisão de crédito,
negociação de termos finais, documentação, desembolso e monitoramento.

O produto também não pode transformar o House Playbook em uma lista interminável de exigências.
O cliente deve enviar o que já tem, no formato em que estiver. O sistema lê primeiro, identifica
o que já foi respondido e apresenta apenas o próximo lote material de solicitações.

## Decisão

1. O produto passa a adotar um blueprint canônico de doze etapas em
   `packages/credit-playbook/src/dcm-blueprint.ts`.
2. Cada etapa declara objetivo, experiência do cliente, trabalho do sistema, trabalho da mesa,
   outputs, critério de saída, alegações proibidas e atividades reservadas ao financiador.
3. O resultado operacional deixa de usar parecer, recomendação e viabilidade como sinônimos de
   decisão de crédito. Os estados passam a ser:
   - informação insuficiente;
   - lacunas materiais de informação;
   - alternativas em desenvolvimento;
   - estrutura suportável com ajustes;
   - pronta para introdução autorizada pelo cliente;
   - configuração solicitada não suportada.
4. Uma configuração não suportada não é uma rejeição de crédito. É uma conclusão técnica sobre a
   configuração pedida com as evidências e premissas disponíveis, acompanhada de alternativas
   quando elas preservam o objetivo econômico.
5. A introdução só é permitida quando análise, materiais, screening de mandatos, gate da
   plataforma e autorização explícita do cliente estão concluídos.
6. A autorização do cliente é permissão para divulgar uma versão identificada a destinatários
   identificados. Não é aprovação de crédito.
7. O gate de release externo da plataforma é governança de software. Não é sign-off econômico.
8. O `credit_memo` é um memorando de crédito preparado pela assessoria para avaliação do
   financiador. Não é o investment memorandum interno do fundo e não contém decisão de comitê.
9. O term sheet é sempre indicativo e não vinculante.
10. O cliente vê no máximo cinco solicitações ativas, quatro por padrão. Diligência e fechamento
    são exibidos apenas como roadmap e nunca como tarefas de intake.
11. O sistema nunca pergunta novamente algo já respondido por documento, resposta ou evidência
    equivalente.
12. Pedidos granulares, como contrato a contrato ou título a título, só aparecem quando a
    alternativa em análise realmente depende dessa granularidade e a materialidade justifica.

## Fronteira operacional

### Offroad faz

- originação e enquadramento da necessidade de capital;
- leitura, classificação, extração e conciliação de informações;
- cálculos financeiros reproduzíveis e análise técnica;
- desenvolvimento de alternativas e estruturação indicativa;
- teaser, memorando de crédito, modelo financeiro e term sheet indicativo;
- mapeamento de mandatos, shortlist e introdução qualificada;
- coordenação de respostas rastreáveis e atualização dos materiais.

### Offroad não faz

- comprometer capital ou garantir captação;
- emitir parecer de crédito vinculante;
- recomendar investimento em nome do financiador;
- aprovar crédito ou substituir comitê;
- executar diligência independente do financiador;
- definir termos finais, documentos definitivos, desembolso ou monitoramento.

## Consequências

- O vocabulário antigo pode continuar existindo em tipos internos de cálculo durante a migração,
  mas não pode aparecer como alegação externa.
- Materiais devem carregar disclaimer explícito da posição de assessoria DCM.
- Testes passam a bloquear afirmações de aprovação, compromisso, garantia de funding ou termos
  finais pela Offroad.
- O playbook completo continua rigoroso; a experiência do cliente passa a ser progressiva.
- O ponto terminal da Offroad é a introdução qualificada autorizada. O processo do financiador
  começa depois dela.

