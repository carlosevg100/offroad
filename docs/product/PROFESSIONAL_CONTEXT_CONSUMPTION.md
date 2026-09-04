# Contrato de consumo do contexto profissional

Este documento existe porque coletar um dado sem dizer o que ele faz é pior do que não coletar.
Ele define, para cada resposta do onboarding profissional, quem lê, o que pode mudar e o que
nunca pode mudar. Nada fora desta tabela tem permissão para consumir o perfil.

Estado em 04/09/2026: a coleta e a separação de dados estão implementadas
(`20260904164935_professional_context_multi_select`). O consumo estruturado descrito na seção 3
ainda **não** está implementado; hoje o perfil chega aos modelos como um bloco de contexto.
Este documento é a especificação desse trabalho, não o registro de que ele já ocorreu.

## 1. Onde cada coisa mora

O desenho separa quatro naturezas de fato que antes estavam na mesma linha.

| Natureza | Onde | Quem pode gravar | O que carrega |
|---|---|---|---|
| Perfil pessoal | `professional_context_profiles` | a própria pessoa | formas de uso, funções, áreas de atuação, objetivos |
| Vínculo declarado | `professional_context_profiles.institution_name` | a própria pessoa | o nome da organização que ela diz que trabalha |
| Capacidade da organização | `institution_capability_profiles` | quem administra a organização | balanço, advisory, estruturação, distribuição, produtos, geografias, moedas, com `source_kind`, `updated_by` e `last_confirmed_at` |
| Mandato de capital | ainda não modelado | investidor ou financiador | ticket, setores, instrumentos, prazo, retorno, garantia, senioridade, jurisdição, restrições |

A distinção que importa: **o que uma pessoa diz sobre o próprio trabalho custa nada aceitar; o
que uma instituição consegue fazer tem consequência em matching e no que o produto pode
afirmar.** Por isso o formulário de onboarding grava o primeiro e não grava o segundo. Ele
registra apenas o nome da organização, e mesmo assim só quando a pessoa disse que trabalha em
uma.

O mandato de capital fica fora do onboarding profissional por decisão explícita: ele pertence à
organização investidora, não à pessoa que preencheu um cadastro.

## 2. Mapa de consumo

| Campo coletado | Componente que lê | Decisão que pode influenciar | Decisão que NUNCA pode influenciar |
|---|---|---|---|
| `use_forms` | entrada do workspace, roteador de pedido | sugestões iniciais; não presumir vínculo institucional quando não há | acesso a documento; permissão para falar por uma instituição |
| `institution_name` | memória de projeto, contexto do Deal Captain | recuperar o contexto daquela organização e não de outra | provar emprego; provar autorização para representar |
| `professional_roles` | Deal Captain, redator do entregável | profundidade, linguagem, o que é perguntado, o que é priorizado na leitura | quais alternativas econômicas existem; qual número é verdadeiro |
| `practice_areas` | orquestração do trabalho | quais procedimentos e artifacts entram primeiro no plano | eliminar procedimento aplicável ao caso |
| `primary_objectives` | entrada do workspace, formato do entregável | exemplos, atalhos, formato provável da entrega | limitar o que a pessoa pode fazer na plataforma |
| `institution_capability_profiles.operating_models` | roteador de execução, preparação de pitch | destacar, em camada separada, os caminhos provavelmente executáveis por aquela instituição | remover uma alternativa do universo; afirmar capacidade sem confirmação |
| mandato de capital | matching | filtro de mandato | substituir a análise da companhia |

## 3. O que o consumo precisa provar

A análise é **company-first**. O perfil muda a lente e a entrega, nunca o fato.

Duas pessoas com os mesmos documentos e a mesma pergunta recebem:

- os mesmos números, as mesmas fontes, as mesmas âncoras de evidência e o mesmo universo de
  alternativas;
- abordagens, perguntas seguintes e entregáveis diferentes.

Exemplo. Pergunta idêntica sobre a mesma companhia:

- **Banker** que atua em DCM e corporate banking, com estruturação e distribuição na
  organização, e que usa a Offroad para preparar reuniões: a entrega tem forma de preparação de
  pitch, a linguagem é de mercado, a função não é perguntada de novo, a investigação da companhia
  é ampla, todas as alternativas relevantes aparecem e, **em camada separada**, aquelas mais
  compatíveis com a atuação declarada são destacadas, sem afirmar que a instituição tem a
  capacidade correspondente.
- **Analista de crédito**: a mesma verdade financeira, organizada como análise de crédito.
  Qualidade dos resultados, conciliação, geração de caixa, liquidez, alavancagem, covenants,
  garantias, downside, capacidade de pagamento, pontos de diligência e estrutura de memorando.

## 4. O que o onboarding nunca pode fazer

As respostas não podem:

1. limitar o universo de alternativas;
2. autorizar acesso a documentos;
3. conceder permissão para falar em nome de uma instituição;
4. ser tratadas como mandato de investimento;
5. comprovar capacidade de crédito ou distribuição;
6. autorizar contato com investidores;
7. substituir o contexto específico do projeto;
8. transformar uma preferência em fato.

O perfil é orientação. Não é evidência da companhia, mandato, autorização nem verdade
institucional.

## 5. O que falta

1. Entregar o contexto ao Deal Captain de forma estruturada, e não como texto de contexto.
2. Adaptar, a partir dele: sugestões da entrada, perguntas contextuais, profundidade das
   análises, estrutura dos outputs e artifacts recomendados.
3. Mostrar nas configurações o contexto efetivamente em uso, com a possibilidade de editar,
   remover ou desconsiderar o perfil em uma conversa específica.
4. Testes por função provando a seção 3: mesma verdade financeira, abordagem diferente, nenhuma
   capacidade inventada, nenhuma alternativa eliminada.
5. Modelar o mandato de capital e vínculos múltiplos como tabelas próprias.

A implementação só estará completa quando o item 4 existir e passar.
