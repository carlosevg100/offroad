# Onda 21: revisão de abertura e delta de segurança

Baseline revisada: `3354eaa29fcfcb847d82c165d060006c64eb0d9c`, em `main`.
Esta revisão autoriza a atualização do inventário para a onda corrente; não declara
implantação, migração aplicada, disponibilidade em produção ou auditoria independente da etapa 21.

## Delta revisado

| Fronteira | Decisão e verificação exigida |
| --- | --- |
| Download | Exigir acesso e finalidade de exportação atuais, revisão exata e recibo físico com SHA-256/tamanho. Revalidar depois do I/O. |
| Upload | Receber candidata em quarentena, conferir bytes e scanner antes do parser. Manifesto recebido nunca é autoridade. |
| Correspondência | Usar recibo histórico e mapa estrutural capturado pelo produtor autorizado; nunca aproximar blocos por semelhança de texto. |
| Comparação | Comparar base, arquivo recebido e cabeça atual; manter diferenças com identificadores únicos, inclusive cópias e perdas de tags. |
| Premissas | Preservar configuração, premissa, período e valor aprovado exato. Registrar proposta humana; refazer cálculo no motor. Cache e fórmula editada não são resultado financeiro autorizado. |
| Texto e claims | Contribuição humana tem autoria e base próprias. Texto editado perde claims e suportes antigos até nova sustentação; nunca sobrescrever revisão. |
| Arquivos hostis | Limitar ZIP, expansão, entradas e XML; não executar macros, fórmulas ou instruções do documento. PDF admite exportação, não reimportação editável. |
| Storage e worker | Usar sessão e lease delimitadas; recusar bytes alterados, revogação e tentativa de caminho ou formato não autorizado. Sem URL arbitrária e sem service-role na aplicação. |
| Produtor e templates | Reproduzir o produtor fixado; aplicar overlays autorizados em cadeia limitada. Template indisponível e conversão não suportada falham explicitamente. |

Os controles envolvidos são `TRUST-DATA-01`, `TRUST-DATA-02`, `TRUST-DATA-03`,
`TRUST-APP-01`, `TRUST-APP-02`, `TRUST-AI-01`, `TRUST-SDLC-01` e `TRUST-OPS-01`.
As lacunas gerais do inventário permanecem abertas; esta onda não encerra certificação,
pentest, IAM efetivo, política de retenção, restore ou garantia universal de fornecedores.

## Evidência e promoção

Os arquivos imutáveis em `main` comprovam somente o escopo de seus próprios contratos e
registros. O plano `docs/build/arcabouco/etapa-21-execucao.md` é referência de desenho.
Os testes e o runner de revisão integrada da etapa 20 preservam a distinção entre prova
nativa na CI e atos humanos no staging; a presença do runner não comprova sua execução remota.
O código novo da etapa 21 recebe evidência de execução no run real da CI e, após merge,
pino Git do commit publicado. Não atribuir essa evidência a produção antes da implantação.

A cadência continua por onda: abertura revisada, atualização após mudança material e fechamento
com evidência da entrega. Não estender observação histórica nem modificar o relógio do gate.

## Gates que dependem do catálogo aplicado

1. `check-stage0-inventory.py`: versões dos arquivos existem no journal real de produção;
   catálogo do replay e contratos inventariados devem coincidir com produção e staging.
2. `verify-effective-function-bodies.py`: bytes de funções reescritas vêm de catálogo real
   após replay ou aplicação, nunca de montagem manual de SQL.
3. Migrações da etapa 21: recolher carimbos, catálogos e journal de ambos os ambientes após
   aplicação. Um catálogo CI pode orientar a revisão, mas não substitui a prova instalada.
4. Publicação: CI, merge, web e worker no mesmo commit e negativos de revogação precisam de
   recibos próprios. Esta revisão não os antecipa.
