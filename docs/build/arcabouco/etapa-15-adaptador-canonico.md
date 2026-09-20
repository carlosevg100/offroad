# Etapa15: adaptador canônico do mapa direcional

O bloco `capital-planning-compatibility` de `prepare-capital-structure-decision.md` é a fonte
única das regras e famílias do adaptador público existente. A geração é conferida byte a byte
na CI. Regenerar com `node packages/credit-playbook/scripts/generate-capital-planning-policy.mjs`
e depois regenerar o manifesto de runtime. O hash da política integra contexto, input e cache.
A atualização preserva as regras e onze famílias; apenas a marca histórica muda para Offroad.
O bloco não publica, aprova ou ativa o procedimento candidato. A substituição do adaptador
acontece no contrato de execução da17, após publicação humana e gates correspondentes.

O evento `capital.first-useful-artifact.v1` mede o intervalo entre entrada no worker e
persistência do mapa final mais conclusão da tarefa. Duração usa relógio monotônico, nunca
textos ou números financeiros. Falha de persistência não registra sucesso nem duração útil.
Relógio inválido produz null. Fila e entrega no navegador não estão incluídas; a17 instrumenta
o intervalo percebido pelo usuário. A medida local não sustenta promessa de latência.

Nove testes novos mais quatro contrafactuais existentes verificam política, autoridade,
fronteira de medição, erro e execução. Sem migração ou fixture em produção.
