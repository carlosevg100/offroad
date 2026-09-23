# Etapa 17 / 3J: sujeito humano no núcleo de execução

`private.request_work_execution_as_subject_v1` recebe o sujeito explicitamente dentro do núcleo fechado. O wrapper humano existente continua derivando-o da sessão autenticada. A validação de entrada, fontes verificadas, perfil publicado, orçamento e idempotência permanece no mesmo request; nenhum JWT é alterado.

O trigger de `work_execution` cruza principal humano, manifesto, trabalho e autor do processing run já persistidos, em vez de começar pela conta técnica da sessão. A conta que transporta a operação não ganha acesso ao trabalho nem se torna seu sujeito. A derivação dos demais kinds permanece igual. Não há grant novo, produtor ou ativação R01.

O teste `execution_explicit_subject.sql` prova negação de sujeito ausente, inacessível, banido e revogado; preservação da identidade humana no job e no run sem alteração da sessão; ausência de concessão ao transportador; replay idempotente; fechamento das roles da API. As suítes existentes e a concorrência do consumidor continuam obrigatórias. Staging usa rollback; produção não recebe dados de teste.

TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01. A função interna não autentica um worker por si só: antes de qualquer futuro wrapper, a ponte deve derivar o sujeito de um job cuja conta, token, capability, tentativa e lease sejam válidos. O recibo precisa estar vinculado integralmente à execução e passar por replay independente. Pausa concorrente, metadados correntes, orçamento total e substituição do callback antigo continuam no incremento 3 antes da conexão R01.

Rollback operacional mantém o núcleo privado sem novos callers. Migração, catálogos, CI e implantação do commit exato são registrados no completion; este documento não antecipa aprovação dos testes ou conclusão da etapa 17.
