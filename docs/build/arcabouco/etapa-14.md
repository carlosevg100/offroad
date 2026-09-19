# Etapa 14: composição e publicação de métodos

O método da casa passa por candidata, revisão técnica, publicação e adoção explícita.
As seis tabelas `method_components`, `method_component_versions`, `method_releases`,
`method_release_components`, `method_review_records` e `method_scope_bindings` preservam
versões, origens e atos humanos. Todas exigem tenant, RLS forçada, leitura autorizada e
escrita por comando atômico. O worker não recebe poder de autoria ou publicação.

A alçada é a do cofre: o administrador do cliente designa publicadores no produto.
Ser criador ou administrador não concede publicação. A política exige, por padrão,
revisor diferente do autor e do publicador; sua alteração pelo administrador é auditada
e não altera grants. A revisão fixa manifesto e evidências. Publicação revalida a alçada
do revisor, a composição e seus direitos, sob o lock canônico de autoridade do tenant.

O compositor aceita apenas parâmetros tipados nos pontos declarados. Organização,
unidade e tipo de trabalho têm precedência explícita, com todas as origens preservadas.
Dois valores no mesmo nível geram conflito. Lei, definição contratual, fórmulas, gates,
rastreabilidade e barreiras não são patches. A fonte é uma versão publicada do cofre,
com fingerprint e direitos atuais. O hash persistido identifica os bytes JSONB da
composição aprovada; o hash de proposta TypeScript não substitui essa identidade.

## Produto e transição

`/[locale]/app/settings/method` mostra métodos de referência, sua aprovação e evidências,
candidatas da casa, conteúdo das adaptações, revisões, publicação, adoção e retirada.
O editor usa campos tipados, justificativa e seleção de fonte publicada; não pede JSON.
A lista é paginada e a troca de vínculo exige a versão anterior, inclusive fora da página.
Um recibo limitado permite retirar publicação cuja fonte ficou inacessível sem expor conteúdo.

`save_organization_methodology_v1` agora cria somente candidata. A tabela antiga conserva
histórico; os loaders não a tratam como método ativo. `resolveMethodology`,
`methodologyChecks`, os defaults financeiros e o merge raso antigo foram retirados.
Produção não tinha linhas nessa tabela antes da migração; nenhuma aprovação foi inventada.

O catálogo de plataforma importa somente R01, com sua aprovação humana de 10/09/2026,
manifesto `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`
e evidências fixadas. Esse executor aprovado não declara pontos de adaptação. Os demais
procedimentos continuam candidatos; o conteúdo de estrutura de capital não foi promovido.

O carregamento de R01 fixa a publicação em `private.processing_run_method_pins`.
Uma nova adoção não troca o método de um trabalho em curso. A retirada bloqueia o uso;
não há fallback automático. O callback confere novamente o vínculo antes de persistir.
Durante rollout, a imagem anterior recebe o vínculo calculado pelo servidor; esse adaptador
não aceita escolha de release pelo cliente nem reescreve resultados históricos. O executor
genérico de parâmetros e referências será conectado ao contrato das etapas 17/18; até lá,
composição incompatível é recusada. Vinculação por unidade exige trabalho explicitamente
vinculado, sem inferir unidade pelo perfil da pessoa.

## Provas técnicas

- `compose-method.test.ts`: precedência, origem, ambiguidade, tipagem e invariantes.
- `method_release_publication.sql`: alçada, separação, revisão vencida, tenant, idempotência,
  worker sem publicação, imutabilidade e retirada sem fallback.
- `method_composition_rights.sql`: fonte publicada, restrição herdada, parâmetro tipado,
  covenant, barreira e fonte retirada depois da revisão.
- `method_execution_pin.sql`: composição fixada apesar de nova adoção, vínculo imutável,
  callback forjado negado e retirada alcançando execução.
- `test-method-publication-concurrency.py`: duas sessões reais disputam publicação/adoção;
  a segunda transação não mistura composição nem substitui a primeira.
- `method-publication.spec.ts`: autor, revisor e publicador na interface, histórico,
  adoção, retirada, PT/EN e capturas desktop/mobile.
- `published-method-binding.test.ts`: vínculo ausente ou manifesto adulterado recusados.
- `method-publication.test.ts`: identidade, tenant e alçada nunca vêm do formulário.
- `organization_methodology.sql` e `rls_non_interference.sql`: legado sem atalho.

Os 95 contratos SQL passaram em staging, com rollback. Check local integral passou.
As quatro migrações têm SQL idêntico nos journals: produção `20260919143037`,
`20260919143040`, `20260919143043`, `20260919143046`; staging `20260919135827`,
`20260919140956`, `20260919141545`, `20260919142246`. Tipos foram gerados de produção.
Os checkers conferem 354 arquivos no journal de produção e 80 novas superfícies.
Security advisors: zero lints nos dois ambientes; nenhum novo FK sem índice.
CI, concorrência em duas sessões e deploy exato passaram; a jornada de interface e suas capturas foram conferidas.

## Riscos nos incrementos correspondentes

Etapa 15: conteúdo profissional de estrutura de capital requer aprovação do fundador.
Etapa 16: registrar elegibilidade e retenção reais por provedor/modelo/recurso; retenção
zero continua opção comercial futura. Etapas 17/18: consumir parâmetros e fontes sob
contrato de execução, retirar o adaptador do callback e ampliar revogação aos consumidores
persistentes. Etapa 18: destino operacional dos alarmes AWS. Etapas 22/23: auditoria e
revogação completas e retirada final dos caminhos históricos. Nada disso é declarado pronto
por esta entrega. A próxima onda exige novo OK.

Controles: mínimo privilégio, segregação de funções, isolamento, integridade, proveniência,
direitos herdados e auditoria sem conteúdo. Não há novo provedor ou dado enviado a modelo.
Contenção: retirada de publicação, revogação de grant ou pausa de R01; conservar o histórico
e corrigir por migração posterior, sem apagar os atos humanos ou reabrir o legado.

## Entrega verificada

PR 664 entregue em `819d14311faf01743968696ccdb174be0f1254ec`; main Quality 35449997808, Security 35449997806 e worker 35449997850 aprovados. Web Vercel 6542179204 e ECS 373 no commit exato, 1/1 e polling saudável.

Inventário de fechamento: 187 evidências e 18 lacunas preservadas. A omissão de qualquer uma
das treze provas novas bloqueia o inventário. O completion externo registra a entrega do
próprio commit de conciliação; próxima onda ainda não iniciada.
