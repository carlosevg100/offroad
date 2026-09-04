# ADR 0022: as três camadas do moat entram como contrato antes de entrar como comportamento

Status: accepted
Data: 2026-09-04

## Contexto

A revisão de arquitetura de 4 de setembro (`docs/build/ARCHITECTURE_REVIEW_2026-09-04.md`) e a
Fase 0 aprovada no mesmo dia fixaram a sequência: confiabilidade do trilho atual, cinco casos
gold congelados, roteador por intenção só em sombra. O fundador acrescentou, a partir da leitura
de como os melhores produtos verticais de IA operam, três camadas que a Offroad ainda não tem e
que são o que diferencia um bom workflow isolado de um ambiente institucional de trabalho:

1. **Leitura comprovadamente completa.** Retrieval responde "quais trechos parecem relevantes";
   crédito precisa responder "tudo que é material foi examinado". Um covenant não pode depender
   dos dez chunks mais semelhantes.
2. **Metodologia institucional configurável.** Um banco, uma gestora e um fundo de crédito
   analisam o mesmo caso de formas diferentes. Não basta saber finanças; é preciso codificar como
   aquela instituição trabalha, sem que o cargo do usuário passe a comandar o workflow.
3. **Inteligência proativa governada.** A Offroad deve poder dizer o que mudou, por que importa e
   o que fazer a respeito, sem que ninguém tenha perguntado, e sem que isso vire risco não
   solicitado sobre uma base ainda não homologada.

Construir comportamento proativo agora seria risco não solicitado. Construir os contratos agora
é barato e obriga cada fase seguinte a implementar contra eles.

## Decisão

1. **Toda `TaskSpec` declara suas estratégias de leitura** (`readingStrategies` em
   `packages/work-plan`): busca exata, recuperação semântica, consulta estruturada, leitura
   exaustiva do corpus, conciliação entre versões, comparação original versus aditivo, varredura
   contra thresholds. O padrão deriva da classe de execução; extração, conciliação, garantias,
   covenants e monitoramento têm sobrescritas explícitas. Uma tarefa sem estratégia não existe.
2. **O runtime produz um manifesto de leitura por tarefa** (`readingManifestSchema` em
   `packages/agent-contracts`): arquivos, versões, páginas, seções, períodos e dimensões cobertos
   e não cobertos, com motivo. Uma estratégia exaustiva não pode deixar arquivo parcialmente lido.
3. **O Intent Envelope v1 tem duas camadas** (`intentEnvelopeSchema`): núcleo de roteamento com
   oito campos, e contexto governado de execução, onde regime de evidência, autoridade,
   organização, projeto e documentos vêm do sistema e o modelo nunca escreve. As vinte famílias
   do Atlas vivem como composições nomeadas derivadas dos nove trabalhos primários.
4. **Autonomia é uma escada de sete degraus** (`autonomyLadder`), cada degrau um conjunto de
   efeitos permitidos. Efeito externo existe só no último degrau, atrás de uma pessoa e do gate
   de autorização exata. A Offroad nunca envia material, contata investidor ou decide.
5. **Todo achado carrega origem** (`findingsLedgerEntrySchema`): solicitado ou descoberto; o que
   foi identificado, por que agora, por que é material, evidência e cálculo, confiança, decisão
   ou artefato afetado, hipótese contrária e próximo teste. Um achado descoberto só é aceito por
   uma pessoa.
6. **Toda diferença entre duas execuções se explica** (`changeExplanationSchema`): qual fonte,
   fato, premissa, cálculo, versão de modelo, pack ou política mudou, e quais outputs moveram. Um
   output que moveu sem causa invalida a explicação.
7. **O benchmark mede omissões e falsos alertas** (`benchmarkScorecardSchema`), não só o que
   foi encontrado. Um caso não passa com omissão material.
8. **O perfil organizacional passa a armazenar metodologia**, não só cadastro: definições
   financeiras, ajustes permitidos, thresholds, elegibilidade, mandato, templates, sequência de
   revisão, cenários mínimos, métricas obrigatórias, capacidades, decisões e correções
   anteriores. A intenção comanda o workflow; a metodologia modifica critérios, checks e
   apresentação. O objeto é a próxima migração desta série.
9. **A entrada de quem tem projetos ativos passa a ser um briefing de trabalho e uma fila de
   decisões**, ordenados pela responsabilidade da pessoa naquele trabalho. O chat continua sendo
   a porta para intenção, correção e aprofundamento. Isso depende dos achados e dos monitores e
   só entra depois dos casos reativos verdes.
10. **Três monitores iniciais** (vencimentos, liquidez e headroom de covenant; novas divulgações
    versus snapshot anterior; novas oportunidades versus mandatos) são homologados depois dos
    cinco casos gold, nunca antes.

## Consequências

- Nenhum comportamento em produção muda com esta ADR. Muda o que as próximas fases têm de
  implementar e o que os testes exigem.
- Os cinco casos gold passam a conter achados que o sistema deveria encontrar sem pergunta, e o
  scorecard de cada um registra omissões e falsos alertas.
- O `FindingsLedger`, o manifesto de leitura e a explicação de mudança são os três objetos que a
  Fase 1 (linhagem e snapshot) persiste.
- O roteador de produção continua intocado até o envelope provar intenção composta, correção e
  abstenção em sombra.

## Não decidido por esta ADR

- schema físico das tabelas de metodologia, achados e manifesto;
- quais monitores rodam com que frequência e com que orçamento;
- como o briefing de entrada é renderizado.
