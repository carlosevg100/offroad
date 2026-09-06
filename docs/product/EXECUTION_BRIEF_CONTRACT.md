# Execution Brief Contract

Versão: `execution-brief.v1`

Status: compiler implementado; integração com produto ainda ausente

## Para que existe

O Execution Brief é o acordo visível entre o pedido do usuário e o trabalho que a Offroad pretende
executar. Ele aparece antes de pesquisa extensa, leitura de uma pasta, modelagem ou produção de
material. Não é uma resposta pronta nem um checklist fixo.

O objetivo é permitir que o usuário veja, ajuste e conteste:

- o resultado que a Offroad entendeu;
- a base que será reaproveitada, pesquisada ou solicitada;
- as frentes de trabalho específicas para aquela intenção;
- as análises e os outputs de cada frente;
- as dependências e os checkpoints;
- as premissas explícitas;
- o tipo de autorização necessário para começar.

## Fonte de verdade

O compiler vive em `packages/work-plan/src/execution-brief.ts`. Ele recebe um grafo já compilado e
produz duas projeções:

1. uma versão interna com IDs de tarefas, dependências e autoridade;
2. uma versão visível sem IDs, topologia, providers, agentes ou raciocínio privado.

O modelo pode ajudar a normalizar intenção e redigir copy específica antes do compiler. Não pode
adicionar uma tarefa, ocultar uma dependência ou inferir autoridade. O fingerprint muda quando
objetivo, fontes, tarefas, premissas, checkpoints ou autoridade mudam.

## Regras fail-closed implementadas

O compiler recusa o brief quando:

- possui menos de três ou mais de sete frentes;
- uma tarefa do grafo fica escondida;
- uma frente contém tarefa que não está no grafo;
- a mesma tarefa aparece em duas frentes;
- uma frente não possui tarefa, fonte planejada, análise, output ou razão de inclusão;
- um checkpoint aponta para frente inexistente;
- uma fonte marcada como disponível não está autorizada;
- uma premissa não é editável ou não declara base;
- um efeito externo não possui autoridade externa explícita;
- a copy expõe linguagem interna;
- o título usa um dos padrões genéricos proibidos.

Fontes são declaradas como `available`, `to_research` ou `to_request` e classificadas como
`public`, `private` ou `restricted`. O contexto visível como já conhecido inclui somente fonte
disponível e autorizada.

## Execução e aprovação

O modo não é escolhido livremente pelo texto:

- `start_after_display`: trabalho interno, reversível e com custo limitado;
- `confirm_before_expensive_work`: trabalho material ou caro definido pelo envelope de execução;
- `approve_external_effect`: qualquer envio, introdução ou outro efeito externo.

Essa regra não substitui consentimento de disclosure nem autorização por destinatário, que
continuam sendo controles próprios.

## Especialização sem fragmentação

As seis famílias atuais usam o mesmo contrato e o mesmo registry, mas possuem frentes e copy
distintas:

| Trabalho inicial | Diferença visível no brief |
| --- | --- |
| companhia na ótica de dívida | base histórica, projeção de caixa, capacidade e diagnóstico |
| reunião ou tese de originação | resultado da conversa, visão própria, ideias e mercado |
| necessidade de capital | necessidade econômica, sizing, folga, downside e formas de financiar |
| estrutura a partir de documentos | mandato contido na pasta, conciliação, suficiência e estrutura |
| revisão de operação | vigência, emendas, cross-references, economics, covenants e ajustes |
| materiais e processo | disclosure, base congelada, termos, ondas de abordagem e template |

As receitas são projeções de prefixos do grafo M/D/C/S/K/A. Elas não criam executores e não
promovem TaskSpecs. Novas composições devem acrescentar ou especializar receita sem criar uma nova
interface por persona.

## Evidência atual

`packages/work-plan/src/execution-brief.test.ts` prova:

- reunião com análise prospectiva, dívida, downside, alternativas e comparáveis no grafo;
- revisão de operação estruturalmente diferente, incluindo emendas, referências cruzadas,
  indexação, covenants e waterfall;
- fingerprint estável e modo de execução derivado;
- projeção visível sem IDs ou autoridade interna;
- bloqueio de plano genérico, tarefa inventada, tarefa escondida e fonte não autorizada;
- aprovação obrigatória para efeito externo.

## O que ainda não está pronto

Este contrato não está em produção. Faltam:

1. persistir versão, fingerprint, edição e diff;
2. ligar o router universal ao compiler;
3. renderizar o card premium no projeto real;
4. permitir editar, remover, adicionar, pausar e replanejar;
5. converter cada frente em estados de Live Work;
6. provar seis intenções na interface e os adversariais correspondentes;
7. promover somente os escopos que possuam executores e métodos homologados.

Até esses itens passarem, a capacidade permanece `specified/none/implemented`: existe como
implementação testada de domínio, mas não como experiência disponível ao usuário.
