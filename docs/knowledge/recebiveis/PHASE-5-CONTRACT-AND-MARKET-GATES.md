# Fase 5: fatos contratuais e verdade de mercado

Data: 28/08/2026

## Objetivo

Fechar duas fontes de falso positivo antes de promover a vertical de recebíveis:

1. um documento ausente ou uma busca sem ocorrência não pode provar titularidade,
   cessibilidade, inexistência de ônus, entrega ou controle de duplicidade;
2. uma transação observada ou inferência da mesa não pode ser tratada como política,
   apetite ou capacidade atuais de um financiador.

O gate não produz parecer de crédito, aprovação, recomendação externa ou autorização de
contato. Ele organiza fatos comprovados, limitações, conflitos e solicitações necessárias
para a análise técnica e o direcionamento interno posterior.

## Contrato dos fatos da operação

Cada observação de um fato deve carregar:

- identificador imutável;
- fato observado e estado verdadeiro ou falso;
- escopo da observação;
- cobertura completa ou parcial;
- data de observação e, quando aplicável, validade;
- fonte, responsável pela fonte e procedência `[M]`, `[C]` ou `[E]`;
- explicação que possa ser apresentada em auditoria.

As regras de resolução são determinísticas:

- `[E]` nunca decide;
- evidência vencida nunca decide;
- evidência futura é inválida;
- cobertura parcial favorável não promove o fato para verdadeiro ou falso;
- ausência de evidência deixa o fato como `unknown`;
- conflito material deixa o fato como `unknown` e abre bloqueio explícito;
- um ônus ou cessão anterior comprovado em qualquer parte da carteira mantém o fato
  `unresolved_prior_assignment_or_lien` como verdadeiro até segregação ou resolução;
- o motor sempre retorna todos os fatos esperados. O que não foi comprovado aparece como
  lacuna, nunca desaparece da saída.

## Contrato dos mandatos

As fontes têm usos diferentes:

| Fonte | Política e critérios | Apetite e capacidade atuais |
|---|---|---|
| Declaração direta | sim, enquanto vigente | sim, enquanto vigente |
| Confirmação de relacionamento | sim, enquanto vigente | sim, enquanto vigente |
| Regra publicada | sim, enquanto vigente | não |
| Transação observada | pesquisa e triagem | não |
| Inferência da mesa | pesquisa e triagem | não |

Toda observação deve identificar a fonte e quem a registrou. Divergência entre fontes
vigentes permanece visível e impede o uso decisório do critério. A shortlist interna só
pode alcançar `live_appetite_confirmed` quando política, apetite e capacidade passam pelos
respectivos gates.

## Golds obrigatórios

1. evidência completa e coerente resolve o fato;
2. amostra favorável permanece `unknown`;
3. ausência de dívida observada não prova inexistência de ônus;
4. ônus comprovado em parte da carteira bloqueia até resolução;
5. cláusulas contratuais conflitantes permanecem `unknown`;
6. evidência vencida e estimada não decide;
7. transação observada não confirma política;
8. regra publicada confirma política, mas não capacidade nem apetite;
9. declaração direta ou relacionamento, vigente e identificado, pode confirmar o estado
   ao vivo;
10. o runner preserva as fronteiras de não recomendação e não contato.

## Fora de escopo deste gate

- diligência jurídica conclusiva;
- parecer legal ou de crédito;
- confirmação por registro externo ainda não integrado;
- negociação, documentação, funding ou fechamento;
- divulgação de identidade de financiadores à companhia.
