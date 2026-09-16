# Revisão do inventário: onda 2

O OK do fundador após a onda 1 autoriza a próxima fronteira do roteiro: etapas 2 e 4. Não autoriza as etapas dependentes nem telas administrativas adiadas. Esta mudança é a renovação de governança prévia aos merges da onda, sem DDL ou alteração de comportamento do produto.

O snapshot ativo, manifesto de evidências e contrato canônico passam atomicamente a `wave-2`, com baseline `9620406b8d3b9624a68bf611b40791e289f90a90`. Os 47 itens de evidência são resolvidos por hash; as referências de código usam o commit já mesclado. As três correções concluídas saem do registro de gaps abertos e entram como requisitos de evidência das respectivas fronteiras, incluindo regressões de criador, revogação por recurso e ausência de perfil nos loaders. Os outros 18 gaps conservam severidade, alvos e tratamento.

O [histórico encerrado da onda 1](history/wave-1-final-review.md) retém o snapshot inicial e as provas finais. O programa histórico continua apontando aos mesmos bytes do seu documento imutável, agora arquivado; sua validade não substitui o gate corrente. A observação AWS foi recolhida novamente do run 35043135776 e continua limitada a observação sem autoridade de atestação.

Testes adicionados: remoção de cada evidência de regressão bloqueia a validação; identidade encerrada da onda anterior não autoriza o snapshot corrente. Os testes de adulteração agora atacam uma onda futura, preservando a negação original. Permanecem bloqueios para mudança material não revisada, observação expirada, contrato externo adulterado e fechamento fabricado de gaps.

Controles afetados: TRUST-GOV-02, TRUST-ID-01, TRUST-DATA-01, TRUST-AI-01 e TRUST-SDLC-01. Nenhum provedor, grant, segredo, migração ou efeito externo novo. Cada alteração material nas etapas 2/4 exige nova reconciliação das fontes afetadas antes de usar o inventário como prova atual. Rollback preserva o histórico e não restaura um snapshot da onda encerrada como autorização corrente.
