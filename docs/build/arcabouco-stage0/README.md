# Inventário e eval técnico da etapa 0

O mapa fixa os objetos observados e o destino de cada um no roteiro. Não declara as correções 1A/1B/1C prontas. Os objetos privados continuam sujeitos às falhas documentadas até as entregas de segurança.

- `OBJECT-MAP.md`: pacotes/apps, tabelas, funções, políticas, triggers, views, migrações e entradas da aplicação com destino e motivo.
- `object-decisions.json`: decisões revisáveis separadas do coletor, contratos por ambiente, fontes e referências de módulos.
- `SOURCE-LINEAGE.md`: resolução das 75 funções e dez tabelas antes sem origem localizada. Inclui criação direta, mudança de schema, cópia/transformação dinâmica e matriz de nomes.
- `catalogue-production.json` e `catalogue-staging.json`: respostas de consultas de metadados de 14/09/2026. Não contêm linhas de clientes.
- `catalogue-differences.json`: 61 objetos presentes somente em staging. Os contratos capturados dos objetos comuns coincidem. Este resultado não compara o corpo integral de funções nem conteúdo das tabelas.
- `../schema-history/recovered-wave1-manifest.json`: sete arquivos de produção recuperados e nove registros exclusivos de staging arquivados. Arquivar SQL não remove os objetos do ambiente.

## O que o gate verifica

Após aplicar todas as migrações em um banco limpo, o job Database coleta o catálogo com `scripts/ci/stage0-catalogue.sql` e executa `check-stage0-inventory.py`. Um objeto sem decisão, assinatura desconhecida, mudança de ACL, RLS, SECURITY DEFINER, search_path, predicado de policy ou destino de trigger reprova. O replay exige o contrato de produção; os objetos exclusivos de staging são proibidos nesse replay.

ACLs usam nomes de roles e privilégios, sem OIDs, e suas linhas são ordenadas semanticamente na comparação. IDs/OIDs internos, estatísticas, dados de negócio e timestamps de captura não integram o contrato de igualdade. Somente public/private e políticas Storage estão no escopo; catálogos e schemas internos da plataforma não são confundidos com objetos da aplicação. As concessões do proprietário das relações/funções permanecem registradas; não se omitem privilégios para fazer o gate passar.

O checker também verifica a cobertura de pacotes, migrações, page/route/layout/server actions/proxy, existência de fontes com âncoras e isolamento dos nove arquivos de staging. A inclusão de uma função ou entrada nova não recebe decisão automaticamente. Alteração intencional exige atualizar o mapa na etapa que a implementa.

A consulta não captura corpo de função, colunas ou todas as constraints: contratos SQL de aplicação e a comparação das funções/tabelas recuperadas verificam esses aspectos no escopo recuperado. Este gate de cobertura e superfície não substitui testes negativos de acesso, replay, catálogo de migrações ou verificação de deploy.

## Consumidores e legado

As referências de pacote usam specifiers completos de import/export/require, não substring. Isso elimina a classificação incorreta da palavra `web` como consumidor do app. Referência de tipo ou script não prova execução; ausência de importador não prova ausência de consumidor indireto. Wrappers privados não recebem os chamadores públicos apenas porque têm o mesmo nome. Nenhum pacote, função, trigger ou dado é apagado por essa classificação.

Os aliases SQL têm âncora de origem/transformação e identidade no catálogo instalado. O replay real, e não a ocorrência do nome no texto, comprova que o histórico produz a assinatura e superfície registrada. Fontes de trigger podem apontar a função alvo quando a criação é gerada dinamicamente; esse vínculo vem de pg_trigger.

## Execução local efetuada

Dez testes Python passaram: catálogo aprovado coberto; sobrecarga nova; concessão EXECUTE a anon; policy permissiva; trigger não inventariado; objeto exclusivo de staging promovido; decisão removida; destino de trigger alterado; entrada sem decisão; ordem de ACL sem mudança de permissão. As consultas capturadas de produção (1.284 objetos) e staging (1.345 objetos) passaram no checker.

O replay CI, merge e deploy são gates distintos e ainda precisam de evidência na conclusão da etapa. O registro final das PRs abertas/encerradas será incorporado pela execução principal após conferir as ações remotas; esta preparação não afirma que foram fechadas.

## Contradições documentais tratadas nesta entrega

AGENTS.md deixa de afirmar extração exclusiva por fixture sem alegar suporte universal. O comentário da fila deixa de fixar sete comandos; o comentário de CI identifica 27 migrações como baseline histórica. Manter separados R01 publicado, executores implementados, preview e métodos candidatos. Busca SQL real não depende de retrieveGoverned ser usado; testes de resolveMethodology não provam aplicação no worker. XLSX com fórmulas não equivale a Office nativo. ROADMAP.md e FOUNDER-ACTS.md registram os atos e marcos atualizados. A correção de comportamentos de acesso e perfil permanece nas etapas 1A/1B/1C.
