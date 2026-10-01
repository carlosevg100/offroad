# Etapa 20 / 3Q: admissão dos bytes pelo adaptador comum

## Escopo

`apps/document-worker/src/capital-public-capture-adapter.ts` reúne as RPCs já publicadas de contexto metadata, entrega, licença e retenção. Abre uma cápsula sob capability de job e admite uma fonte pública individual por vez. Os seis produtores continuam no caminho atual; seu corte depende da fixação do input exato. Esta divisão prepara a integração prevista no 3Q, sem antecipar outro pacote ou onda.

## Contrato

O chamador fornece `deliveryKey` e `requestId` estáveis, payload público estrito e, opcionalmente, os quatro pinos exatos da licença. O banco resolve o pino quando ele não foi fornecido. O adaptador não inventa direito pelo HTTPS, hash, provider, citation ou condição comercial do gateway. Congela a cópia validada antes da primeira espera.

Só o reason único `retention_storage_not_resolved` admite retenção. Falta de licença, closure ou origem retorna `unresolved` sem payload, sem retenção e sem acesso a Storage. Erro de autoridade interrompe a chamada e não expõe mensagem do banco ou conteúdo. Um intent não licenciado permanece imutável: uma licença futura exige uma nova tentativa com identidade explícita, nunca atualização retroativa.

Após retenção, o adaptador lê o objeto pela versão física exata. A leitura confere allocation e prazos do recibo e revalida autoridade antes e depois do download. A SHA-256 dos bytes precisa ser a fingerprint integral da entrega SQL; o objeto parseado precisa ser igual ao pedido. Não se usa `JSON.stringify` como canonicalizador PostgreSQL. Ordem de chaves e Unicode não mudam a igualdade dos valores. Nenhuma cópia permanente adicional é criada.

O retorno `retained` contém payload e referência exata da retenção. Não significa cápsula, tarefa, input, manifest, revisão ou artefato completo. O adaptador não fecha conjuntos vazios nem resolve fontes privadas, catálogo ou fontes indiretas por ausência de citações; a closure pública continua sendo comprovada pelo SQL. Não oferece replay de artefato; o replay de upload mantém os IDs e relê os bytes sob autoridade atual.

## Verificação e próximo corte

O teste composto usa o adaptador e a implementação real de retenção com Supabase/Storage simulados, sem substituir a retenção por um recibo fake. Exercita Unicode e canonicalização, licença/closure faltante, mutação concorrente, revogação na última leitura, receipt de outra allocation, troca de bytes/payload, replay sem overwrite, pinos incompletos e contrato tentando declarar metadata completa. Os testes SQL, Storage físico e corridas da retenção permanecem na CI de database. Nenhum teste cria dados em produção.

Sem migração ou mudança de autorização; journals e funções remotos são revalidados. Quality, Security, produção web/worker no mesmo commit e revisão independente são necessários para completion. O gate completo do 3Q continua no mapa.

Riscos do próximo incremento: uma composição de input que duplica snippets fora do bucket contorna purge; corrigir por referências retidas e componentes privados imutáveis, reconstruindo e verificando o hash do input efetivo enquanto os direitos forem vigentes. Uma pesquisa histórica reconstituída a partir de citações não comprova bytes originais; manter restrita e exigir captura prospectiva. Retenção da origem não torna derivados automaticamente liberáveis; essa restrição precisa entrar no writer nativo antes do corte dos produtores. Controles: APP-02/08/11, DATA-02/03/09, AI-08 e OPS-10.
