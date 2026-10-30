# Originador de FIDC: execução de R1, R2 e R3

Estado: candidato em implementação, ainda sem publicação nem liberação dos novos métodos.
Branch: `feat/fidc-originator-execution`, base `a1ce4a774bb5866d5f9dccfc87e964f4b64f7dc0`.

O fundador determinou a conclusão do percurso do originador depois de a apresentação de 30/10 não ter a entrega pronta. O alvo é o produto em uso normal: documentos, base adotada, cálculo, parecer, página de resultado e atualização. Os três públicos da Offroad são preservados. A perspectiva aqui é a do originador que analisa o cedente para o comitê.

## Implementado e conferido localmente

- Núcleo de crédito: 31 testes focados; sem régua, classe ou limite padrão. Prazo da operação explícito, limite bancário não utilizado separado, vencimento original preservado, prazo atual para elegibilidade e carteira vazia como lacuna.
- Histórico e recomposição financeira: 14 testes. Exercícios e períodos intermediários comparáveis, crescimento só no mesmo intervalo, balanço e dívida usada contra SCR.
- Pontes de faturamento, carteira e PDD: sete testes; recompra, cobrança do sacado e recuperação de perdas antigas separados. Cancelamento só afeta EBITDA em estimativa explicitamente confirmada.
- Participações indiretas: nove testes. Notação e escala: nove testes.
- Checagem do kit reaproveita o inventário C09; lista e atualidade da instituição, seleção de versão, entidade e datas: nove testes.
- Revisão de crédito com trechos, versões, unidade, escala, fundo e reconciliações; 20 testes. Revisão documental de cadastro: 14 testes. Leitura de tokens: quatro testes.
- Base confirmada, compositor, contratos, fingerprint, pacotes dos três tipos e atualizações de pedido: 14 testes; autoria profissional e contratos: três testes.
- Fonte citada contra camada autorizada, versão, hash e trecho: nove testes do worker. A guarda é auxiliar interna, ainda sem consumidor novo exposto.
- Entrada do kit na conversa: seis testes do worker; o pedido passa ao C09 existente. O pacote work-plan havia passado 834 testes antes da ampliação final do verbo de conferência; deve repetir.
- Três procedimentos candidatos e contratos canônicos gerados. Catálogo de autoria registra os executores, sem TaskSpec, sem publicação, sem perfil nem liberação.
- Parser efetivamente rodado nos PDFs sintéticos: 22 chegadas, 21 arquivos únicos, 26 páginas, 28.694 caracteres. Recibo separado, sem modelo, upload ou aprovação de extração. Nenhum custo novo de provedor.

Os totais acima são testes focados, não ensaio com modelo ou aprovação dos métodos. A verificação global precisa fechar na revisão final. Sua primeira execução identificou metadados incompletos de autoria e foi interrompida; corrigidos, o pacote credit-playbook passou 66 arquivos e 545 testes antes dos últimos ajustes de contrato. Não há declaração de prontidão em produção.

## O que ainda impede chamar o percurso de pronto

1. Ligar extração por papel e guarda de fontes ao loader autorizado e à conversa; origem, unidade e vínculo entre fontes explícitos no cartão.
2. Completar persistência, página bilíngue, resposta citada e atualização no caminho normal. Não há novo endpoint ou consumidor de dados registrado nesta fundação.
3. Fechar o ensaio de cada chegada contra o gabarito completo; o dossiê estruturado não é prova de extração de PDFs. A primeira etapa mantém SCR antigo e cadeia incompleta como pendência.
4. Revisão independente sem condição, aprovação profissional real do fundador, publicação, captura, perfil, proveniência e liberação. Não converter a ordem de executar em aprovação de conteúdo.
5. Ensaio nativo com modelo real e teto de custo, banco e navegador; CI e implantação web/worker no mesmo commit.
6. Para carteiras que excedem a base imutável de 1 MiB, usar conjuntos governados por referência; não aumentar a base nem truncar títulos. O proponente atual recusa com nome um caso acima do limite, ainda não é a solução para essas carteiras.

Não há nova fonte externa de SCR, birô, PEP ou tribunal contratada por esta implementação. R3 distingue relatórios entregues de consultas realmente executadas. Nenhuma aprovação de crédito, cadastro ou compra é emitida no lugar do responsável.

## Custos e credenciais

Reutilizar respostas já pagas em correções determinísticas. Cada teste pago indispensável terá alvo, teto e recibo, sem repetir o conjunto amplo antes de corrigir o caminho. A sessão local AWS expirou e está sendo renovada no fluxo oficial da conta já autorizada. Nenhuma credencial deve ser impressa ou enviada em arquivos de evidência.

## Retorno seguro

Métodos e snapshots publicados são mantidos. Não se edita migração aplicada. Este candidato não muda RLS, grants, dados de clientes ou as liberações já existentes. Um erro parcial não será tratado como documento concluído nem como parecer aprovado.

## Segurança e operação desta fundação

Controles afetados: TRUST-DATA-01 (escopo e direitos herdados), TRUST-AI-02 (texto documental como dado e ponteiros verificados) e TRUST-SDLC-01 (autoria, revisão e liberação separadas). Nenhuma migração, RLS, grant, provedor, retenção ou telemetria foi alterada. Não há consulta externa, envio a terceiro ou novo consumidor de produção por estes módulos. A guarda de camada não concede acesso: seu chamador futuro deverá usar o loader e a política atuais. Testes negativos cobrem outro trabalho/entidade, base alterada, seção duplicada, fonte não autorizada, versão/hash/trecho divergentes e consulta pública sem recibo real. Nenhum dado de cliente entra nas fixtures.

Reversão: reverter esta alteração de código; os candidatos não têm liberações a revogar e os métodos publicados continuam com seus snapshots. Antes de ativar os novos métodos, exigem-se a revisão de segurança da superfície real, o manifesto de consumidores, gates de banco quando houver migração e ensaio da leitura após revogação.
