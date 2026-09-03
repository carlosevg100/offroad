# ADR 0020: Sistema agêntico limitado para trabalho de DCM

Status: accepted

Data: 2026-09-03

## Contexto

A arquitetura anterior compilava seis pontos de entrada em DAGs estáticos e corretamente
governados. Essa base evita ações sem autorização, mistura de tenant e números produzidos por
LLM. Ela, porém, não representa o trabalho real de uma mesa de DCM. Um caso muda quando chega um
documento, uma fonte pública contradiz uma premissa, uma pergunta é respondida ou uma hipótese
falha. Nesse momento o sistema precisa decompor o problema novamente, executar trabalhos em
paralelo, medir suficiência e formular a próxima pergunta com maior impacto decisório.

O defeito tornou-se concreto: projetos com documentos privados eram retirados dos executores
especializados. O produto preservava o trilho mais valioso, mas não conseguia percorrê-lo a partir
da conversa.

## Decisão

A Offroad terá duas camadas complementares.

### 1. Control plane determinístico

O control plane define identidade, tenant, permissões, versões, orçamento, dependências, políticas
de dados, gates de aprovação e efeitos permitidos. Ele continua soberano sobre:

- escrita no estado canônico;
- cálculos financeiros;
- divulgação de informação privada;
- produção de material externo;
- contato com investidores ou financiadores;
- limites de custo, recência, retries e tempo;
- promoção de procedimentos e modelos.

Nenhum modelo pode ampliar essas permissões.

### 2. Work plane agêntico limitado

O Deal Captain pode construir e revisar um plano dentro das capacidades liberadas pelo control
plane. Ele pode:

- decompor o objetivo em trabalhos especializados;
- iniciar pesquisa pública e análise privada em paralelo quando permitido;
- reconhecer o que já existe no projeto antes de perguntar;
- medir a cobertura das informações por decisão;
- pedir apenas as lacunas materiais ainda não respondidas;
- adicionar, adiar ou superseder trabalhos quando surgirem novas evidências;
- recomendar alternativas com premissas, evidências e pontos não resolvidos explícitos;
- encaminhar produtos de trabalho a um verificador independente.

Os especialistas são executores limitados por contrato e procedimento, não personas livres. O
plano é dinâmico; as capacidades, os efeitos e os gates não são.

## Memória canônica

Cada projeto mantém seis registros distintos e vinculados:

1. **Contexto:** objetivo do usuário, companhia, audiência, restrições e histórico relevante.
2. **Evidência:** mensagens, âncoras de documentos, fontes públicas, fatos conciliados e cálculos.
3. **Cobertura:** o que está verificado, parcial, conflitante, ausente ou inaplicável.
4. **Decisões:** pergunta decisória, alternativas, recomendação, racional, premissas e revisão.
5. **Plano:** revisões do plano e trabalhos especializados, com dependências, orçamento e estado.
6. **Produtos:** análises, modelos e materiais produzidos a partir de uma versão exata dos registros
   anteriores.

Histórico de outra organização nunca participa de retrieval. Memória pública reutilizável é
separada de memória privada do projeto. Contexto anterior só é mencionado ao usuário quando existe
e é relevante; a ausência de contexto não deve aparecer como uma etapa artificial na interface.

## Contrato de perguntas

Uma pergunta ao usuário precisa apontar a decisão que pode alterar, por que importa e qual evidência
é aceitável. O sistema apresenta no máximo três perguntas ativas por vez, priorizadas por:

1. ganho de informação;
2. materialidade da decisão;
3. facilidade de resposta;
4. penalidade por redundância.

Uma pasta de documentos é uma resposta válida. O sistema classifica, extrai, reconcilia e mede a
cobertura antes de pedir que o usuário redigite informações já presentes nos arquivos.

## Registro de decisão, não chain of thought

O produto não persiste raciocínio privado de modelos. Persiste um registro institucional revisável:
conclusão, alternativas consideradas, evidências, premissas, incertezas, cálculos determinísticos e
correções humanas. Esse é o ativo de treinamento e avaliação que acumula conhecimento sem depender
de uma transcrição opaca de pensamento.

## Interface

A unidade visual é a conversa do projeto. Atividade real aparece na linha do tempo enquanto ocorre:
pesquisa, leitura, conciliação, cálculo, verificação e produção. Resultados e arquivos abrem no painel
de trabalho do mesmo projeto. Não existe uma sequência rígida de formulários nem um relatório final
separado da conversa como experiência principal.

## Consequências

- O Task Registry deixa de ser uma ordem fixa e passa a ser o limite de capacidade disponível.
- Cada mudança material cria nova revisão de plano; histórico não é reescrito.
- Trabalho concluído e ainda válido é preservado após replanejamento.
- Uma recomendação pode permanecer aberta por insuficiência de evidência sem ser tratada como erro.
- Um efeito externo continua impossível sem autorização explícita e específica.
- A primeira vertical de promoção é documento privado até entendimento, lacunas, análise e
  recomendação. Matching e introdução permanecem downstream e não bloqueiam essa vertical.

## Implementação inicial

- contratos: `packages/agent-contracts/src/work-system.ts`;
- persistência: migration `20260903020710_agentic_dcm_work_system.sql`;
- procedures e TaskSpecs: `packages/credit-playbook` e `packages/work-plan`;
- cálculo: `packages/financial-core`;
- execução: `apps/document-worker`;
- conversa, atividade e artefatos: `apps/web`.

Este ADR altera o item 4 do ADR 0013. `deterministic_pipeline` deixa de significar ordem fixa de
trabalho. Passa a significar control plane determinístico com planejamento agêntico limitado.
