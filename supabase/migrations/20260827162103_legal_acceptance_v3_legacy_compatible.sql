-- Legal Gate 0, version 3.
--
-- The first clickwrap authorizes only private preliminary work. It does not prove corporate
-- representation and it never authorizes market outreach. Representation evidence and the exact
-- distribution package remain separate downstream gates.

alter table public.platform_legal_documents
  add column acceptance_statement text,
  add column information_rights_statement text;

update public.platform_legal_documents
set
  acceptance_statement = case locale
    when 'pt-BR' then 'Li e concordo com o termo integral identificado nesta versão.'
    else 'I have read and agree to the full terms identified in this version.'
  end,
  information_rights_statement = case locale
    when 'pt-BR' then 'Confirmo que posso disponibilizar estas informações para esta análise privada.'
    else 'I confirm that I may provide this information for this private analysis.'
  end
where acceptance_statement is null
   or information_rights_statement is null;

alter table public.platform_legal_documents
  alter column acceptance_statement set not null,
  alter column information_rights_statement set not null,
  add constraint platform_legal_documents_acceptance_statement_check
    check (char_length(trim(acceptance_statement)) between 20 and 1000),
  add constraint platform_legal_documents_information_rights_statement_check
    check (char_length(trim(information_rights_statement)) between 20 and 1000);

-- Every term that is displayed and accepted is now covered by the immutable version hash. Earlier
-- versions retain their original hashes; this trigger applies when a new version is inserted.
create or replace function private.set_legal_document_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.document_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          E'\n',
          new.document_key,
          new.version,
          new.locale,
          new.title,
          new.rendered_text,
          new.body_sections::text,
          new.acceptance_statement,
          new.information_rights_statement
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

drop trigger platform_legal_documents_set_hash on public.platform_legal_documents;
create trigger platform_legal_documents_set_hash
before insert or update of document_key, version, locale, title, rendered_text, body_sections,
  acceptance_statement, information_rights_statement
on public.platform_legal_documents
for each row execute function private.set_legal_document_hash();

update public.platform_legal_documents
set status = 'superseded'
where document_key = 'private_workspace_terms'
  and status = 'active';

insert into public.platform_legal_documents (
  document_key,
  version,
  locale,
  title,
  rendered_text,
  body_sections,
  acceptance_statement,
  information_rights_statement,
  status,
  effective_at
) values
(
  'private_workspace_terms',
  '2026-08-27-v3',
  'pt-BR',
  'Termo de Confidencialidade e Autorização de Trabalho Preliminar',
  $pt$
TERMO DE CONFIDENCIALIDADE E AUTORIZAÇÃO DE TRABALHO PRELIMINAR
Versão 2026-08-27-v3

Este Termo estabelece os compromissos assumidos pela Offroad Capital, responsável pela plataforma offroad.capital, em relação às informações disponibilizadas pelo usuário identificado no aceite eletrônico sobre a companhia indicada no projeto. Offroad, usuário e companhia são referidos conforme o contexto abaixo.

1. FINALIDADE

1.1. O usuário poderá disponibilizar à Offroad informações societárias, financeiras, contratuais, operacionais e comerciais para que a Offroad, em ambiente privado, compreenda a companhia e a operação pretendida, organize e concilie informações, analise alternativas de estrutura, prepare materiais preliminares e identifique internamente potenciais financiadores. Essas atividades constituem a Finalidade deste Termo.

1.2. A Offroad utilizará as informações exclusivamente para a Finalidade e para a operação técnica, a segurança e a auditoria da plataforma.

2. INFORMAÇÕES CONFIDENCIAIS

2.1. São confidenciais todas as informações disponibilizadas pelo usuário ou pela companhia, em qualquer formato, estejam ou não marcadas como confidenciais. Também são confidenciais os materiais derivados dessas informações, a identidade da companhia e a existência das tratativas.

2.2. Não são confidenciais as informações que a Offroad consiga demonstrar que: a) eram públicas sem violação deste Termo; b) já estavam legitimamente em seu poder sem dever de sigilo; c) foram recebidas de terceiro autorizado e sem dever de confidencialidade; ou d) foram desenvolvidas de forma independente, sem uso das informações recebidas neste projeto.

3. COMPROMISSOS DA OFFROAD

3.1. A Offroad manterá as informações em sigilo e empregará medidas técnicas e administrativas adequadas para protegê-las contra acesso, uso, alteração, perda ou divulgação não autorizados.

3.2. O acesso será limitado às pessoas e aos prestadores que precisem das informações para a Finalidade, sujeitos a obrigações de confidencialidade e segurança compatíveis com este Termo.

3.3. A Offroad poderá utilizar provedores de infraestrutura, armazenamento, segurança, processamento de documentos e inteligência artificial necessários à plataforma. Esses provedores deverão atuar sob condições contratuais de confidencialidade, segurança e uso limitado dos dados.

3.4. A Offroad não utilizará as informações confidenciais deste projeto para treinar modelos próprios ou de terceiros disponibilizados ao público, salvo autorização prévia, específica e por escrito da companhia.

3.5. Se uma divulgação for exigida por lei, regulação ou autoridade competente, a Offroad limitará a divulgação ao mínimo necessário e, quando juridicamente permitido, comunicará previamente a companhia.

4. NENHUMA DISTRIBUIÇÃO AUTOMÁTICA

4.1. Este aceite permite apenas o trabalho privado de preparação. Nenhuma informação, identidade ou material será apresentado a financiadores ou a outros terceiros para fins de distribuição sem autorização posterior, prévia, específica e registrada.

4.2. A autorização de distribuição deverá identificar os materiais e suas versões, a forma de identificação da companhia e os destinatários ou o universo de destinatários aprovado. Uma autorização não se estende automaticamente a versões, materiais ou destinatários diferentes.

4.3. Este Termo não constitui contratação de assessoria, exclusividade, mandato, procuração ou autorização para representar a companhia perante o mercado. Eventual contratação comercial dependerá de instrumento próprio.

5. DECLARAÇÃO DO USUÁRIO E REPRESENTAÇÃO

5.1. O usuário confirma que pode disponibilizar as informações enviadas para a análise privada descrita neste Termo e que não utilizará a plataforma para informações obtidas de forma ilícita ou em violação de obrigação de confidencialidade conhecida.

5.2. Este aceite não comprova, por si só, poderes para representar a companhia perante terceiros. A Offroad poderá solicitar confirmação da companhia ou outra evidência adequada antes de qualquer distribuição externa.

5.3. A preparação poderá começar com informações incompletas. O usuário deverá responder de boa-fé e corrigir informações que reconheça como inexatas. A Offroad identificará lacunas e discrepâncias ao longo do trabalho.

6. TITULARIDADE E MATERIAIS

6.1. As informações fornecidas permanecem de titularidade de seus respectivos titulares. A Offroad não recebe licença para uso fora da Finalidade.

6.2. As metodologias, os modelos, os templates e as ferramentas da Offroad permanecem de sua titularidade. O conteúdo específico da companhia permanece sujeito ao sigilo e ao controle de distribuição estabelecidos neste Termo.

7. PRAZO, RETENÇÃO E ELIMINAÇÃO

7.1. As obrigações de confidencialidade vigoram por cinco anos contados do recebimento de cada informação. Informações que constituam segredo de negócio permanecem protegidas enquanto conservarem essa natureza, na medida permitida pela lei aplicável.

7.2. Encerrada a Finalidade, a Offroad eliminará ou anonimizará as informações conforme sua política de retenção e as limitações técnicas aplicáveis. Poderão ser preservados registros necessários para cumprir obrigação legal, exercer direitos, manter auditoria de segurança ou integrar rotinas de backup, sempre sujeitos às obrigações de confidencialidade.

8. DADOS PESSOAIS

8.1. Havendo dados pessoais, as partes observarão a Lei nº 13.709/2018. Os papéis de controlador e operador serão definidos conforme a decisão e a finalidade de cada atividade de tratamento.

8.2. A Offroad poderá atuar como operadora quando processar dados segundo instruções da companhia para preparar o projeto, e como controladora nas atividades próprias de gestão de conta, segurança, prevenção a fraude, auditoria, conformidade e administração do serviço.

8.3. O tratamento deverá respeitar os princípios de finalidade, adequação, necessidade, transparência e segurança. Dados pessoais desnecessários à Finalidade não devem ser enviados.

9. DISPOSIÇÕES GERAIS E ACEITE ELETRÔNICO

9.1. Este Termo não obriga as partes a celebrar negócio, não constitui parecer de crédito e não cria expectativa ou garantia de captação, aprovação, diligência ou investimento.

9.2. O aceite eletrônico é admitido pelas partes como meio válido de manifestação de vontade e de comprovação da autoria e integridade do registro, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001.

9.3. A Offroad manterá registro da versão e do hash do Termo, das declarações exibidas, do usuário, da organização, da data e hora e dos metadados técnicos disponíveis no momento do aceite. A íntegra da versão aceita permanecerá acessível ao usuário.

9.4. Alterações materiais produzirão uma nova versão e poderão exigir novo aceite. Aceites anteriores permanecerão preservados em registro imutável.

9.5. Este Termo é regido pelas leis brasileiras. O foro competente será definido conforme a legislação aplicável e eventual instrumento comercial celebrado entre as partes.
  $pt$,
  '[
    {"heading":"Uso limitado","body":"As informações são utilizadas somente para compreender a companhia, estruturar a oportunidade, preparar os materiais e operar este ambiente privado."},
    {"heading":"Sigilo e segurança","body":"O acesso fica restrito à equipe e aos sistemas necessários, sujeitos a obrigações de confidencialidade, segurança e uso limitado."},
    {"heading":"Você permanece no controle","body":"Os materiais podem ser revisados durante a preparação. Este aceite não comprova representação perante terceiros e não constitui mandato ou exclusividade."},
    {"heading":"Nada vai ao mercado sem outro aceite","body":"Qualquer apresentação a financiadores exige autorização posterior e específica sobre materiais, identificação e destinatários."}
  ]'::jsonb,
  'Li e concordo com o Termo de Confidencialidade e Autorização de Trabalho Preliminar, versão 2026-08-27-v3.',
  'Confirmo que posso disponibilizar estas informações para esta análise privada.',
  'active',
  now()
),
(
  'private_workspace_terms',
  '2026-08-27-v3',
  'en-US',
  'Confidentiality and Preliminary Work Authorization Terms',
  $en$
CONFIDENTIALITY AND PRELIMINARY WORK AUTHORIZATION TERMS
Version 2026-08-27-v3

These Terms set out the commitments undertaken by Offroad Capital, responsible for the offroad.capital platform, regarding information provided by the user identified in the electronic acceptance about the company identified in the project. Offroad, the user and the company are referred to as appropriate below.

1. PURPOSE

1.1. The user may provide Offroad with corporate, financial, contractual, operational and commercial information so that Offroad may, within a private environment, understand the company and proposed transaction, organize and reconcile information, analyze structuring alternatives, prepare preliminary materials and internally identify potential capital providers. These activities constitute the Purpose of these Terms.

1.2. Offroad will use the information solely for the Purpose and for the technical operation, security and audit of the platform.

2. CONFIDENTIAL INFORMATION

2.1. All information provided by the user or company in any format is confidential, whether or not marked as confidential. Materials derived from that information, the identity of the company and the existence of the discussions are also confidential.

2.2. Information is not confidential if Offroad can demonstrate that it: a) was publicly available without breach of these Terms; b) was already lawfully in its possession without a duty of confidentiality; c) was received from an authorized third party without a duty of confidentiality; or d) was developed independently without using information received for this project.

3. OFFROAD COMMITMENTS

3.1. Offroad will keep the information confidential and use appropriate technical and administrative measures to protect it against unauthorized access, use, alteration, loss or disclosure.

3.2. Access will be limited to people and service providers who need the information for the Purpose and who are subject to confidentiality and security obligations consistent with these Terms.

3.3. Offroad may use infrastructure, storage, security, document processing and artificial intelligence providers required to operate the platform. Those providers must operate under contractual confidentiality, security and limited data-use conditions.

3.4. Offroad will not use confidential project information to train proprietary or third-party models made available to the public unless the company gives prior, specific written authorization.

3.5. If disclosure is required by law, regulation or a competent authority, Offroad will limit disclosure to what is strictly necessary and, where legally permitted, notify the company in advance.

4. NO AUTOMATIC DISTRIBUTION

4.1. This acceptance permits only private preparation work. No information, identity or material will be presented to capital providers or other third parties for distribution purposes without a later, prior, specific and recorded authorization.

4.2. A distribution authorization must identify the materials and their versions, the manner in which the company is identified and the approved recipients or recipient universe. An authorization does not automatically extend to different versions, materials or recipients.

4.3. These Terms do not constitute an advisory engagement, exclusivity arrangement, mandate, power of attorney or authorization to represent the company before the market. Any commercial engagement will require a separate instrument.

5. USER DECLARATION AND REPRESENTATION

5.1. The user confirms that they may provide the submitted information for the private analysis described in these Terms and will not use the platform for information obtained unlawfully or in breach of a known confidentiality obligation.

5.2. This acceptance does not, by itself, prove authority to represent the company before third parties. Offroad may request company confirmation or other appropriate evidence before any external distribution.

5.3. Preparation may begin with incomplete information. The user must respond in good faith and correct information they recognize as inaccurate. Offroad will identify gaps and discrepancies throughout the work.

6. OWNERSHIP AND MATERIALS

6.1. Supplied information remains the property of its respective owners. Offroad receives no license to use it outside the Purpose.

6.2. Offroad methodologies, models, templates and tools remain its property. Company-specific content remains subject to the confidentiality and distribution controls established in these Terms.

7. TERM, RETENTION AND DELETION

7.1. Confidentiality obligations remain in effect for five years from receipt of each item of information. Trade secrets remain protected for as long as they retain that status, to the extent permitted by applicable law.

7.2. When the Purpose ends, Offroad will delete or anonymize information in accordance with its retention policy and applicable technical limitations. Records required to comply with law, exercise rights, maintain security audits or form part of backup routines may be preserved, always subject to confidentiality obligations.

8. PERSONAL DATA

8.1. Where personal data is involved, the parties will comply with Brazilian Law No. 13,709/2018. Controller and processor roles will be determined according to the decision-making authority and purpose of each processing activity.

8.2. Offroad may act as processor when processing data on company instructions to prepare the project, and as controller for its own account management, security, fraud prevention, audit, compliance and service administration activities.

8.3. Processing must comply with purpose limitation, adequacy, necessity, transparency and security principles. Personal data unnecessary for the Purpose should not be submitted.

9. GENERAL PROVISIONS AND ELECTRONIC ACCEPTANCE

9.1. These Terms do not require the parties to enter into any transaction, do not constitute a credit opinion and create no expectation or guarantee of financing, approval, diligence or investment.

9.2. The parties accept electronic acceptance as a valid means of expressing intent and evidencing authorship and integrity under article 10, paragraph 2, of Brazilian Provisional Measure No. 2,200-2/2001.

9.3. Offroad will retain the version and hash of these Terms, the declarations displayed, the user, organization, date and time and technical metadata available at acceptance. The full accepted version will remain available to the user.

9.4. Material amendments will produce a new version and may require renewed acceptance. Earlier acceptances will remain preserved in an immutable record.

9.5. These Terms are governed by Brazilian law. The competent venue will be determined under applicable law and any commercial agreement entered into by the parties.
  $en$,
  '[
    {"heading":"Limited use","body":"Information is used only to understand the company, structure the opportunity, prepare materials and operate this private environment."},
    {"heading":"Confidentiality and security","body":"Access is restricted to the team and systems required for the work, subject to confidentiality, security and limited-use obligations."},
    {"heading":"You remain in control","body":"Materials may be reviewed during preparation. This acceptance does not prove representation before third parties and creates no mandate or exclusivity."},
    {"heading":"Nothing reaches the market without another approval","body":"Any presentation to capital providers requires a later, specific authorization covering materials, identification and recipients."}
  ]'::jsonb,
  'I have read and agree to the Confidentiality and Preliminary Work Authorization Terms, version 2026-08-27-v3.',
  'I confirm that I may provide this information for this private analysis.',
  'active',
  now()
);

-- Preserve the earlier corporate-authority assertion exactly as historical evidence. It must not
-- be renamed or reinterpreted. V3 records a narrower information-rights declaration in a distinct
-- column, while corporate representation remains a separate downstream ledger.
alter table public.organization_legal_acceptances
  alter column authority_declared drop not null,
  drop constraint organization_legal_acceptances_authority_declared_check;

alter table public.organization_legal_acceptances
  add column information_rights_declared boolean,
  add column terms_agreed boolean,
  add column acceptance_statement text,
  add column information_rights_statement text,
  add column acceptance_method text not null default 'clickwrap',
  add column accepted_ip inet,
  add column accepted_user_agent text;

alter table public.organization_legal_acceptances
  add constraint organization_legal_acceptances_authority_declared_check
    check (authority_declared is null or authority_declared),
  add constraint organization_legal_acceptances_information_rights_declared_check
    check (information_rights_declared is null or information_rights_declared),
  add constraint organization_legal_acceptances_terms_agreed_check
    check (terms_agreed is null or terms_agreed),
  add constraint organization_legal_acceptances_acceptance_statement_check
    check (acceptance_statement is null
      or char_length(trim(acceptance_statement)) between 20 and 1000),
  add constraint organization_legal_acceptances_information_rights_statement_check
    check (information_rights_statement is null
      or char_length(trim(information_rights_statement)) between 20 and 1000),
  add constraint organization_legal_acceptances_acceptance_method_check
    check (acceptance_method in ('clickwrap')),
  add constraint organization_legal_acceptances_user_agent_check
    check (accepted_user_agent is null or char_length(accepted_user_agent) between 1 and 1000);

drop function public.accept_private_workspace_terms(text, text, text, boolean);
drop function private.accept_private_workspace_terms(text, text, text, boolean);

create function private.accept_private_workspace_terms(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_terms_agreed boolean,
  p_information_rights_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  legal_document public.platform_legal_documents;
  acceptance_id uuid;
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  client_ip inet;
  user_agent text := left(nullif(request_headers ->> 'user-agent', ''), 1000);
  raw_client_ip text := nullif(
    trim(split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1)),
    ''
  );
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(trim(coalesce(p_signatory_name, ''))) not between 2 and 160
    or (nullif(trim(coalesce(p_signatory_title, '')), '') is not null
      and char_length(trim(p_signatory_title)) not between 2 and 160)
    or not coalesce(p_terms_agreed, false)
    or not coalesce(p_information_rights_declared, false) then
    raise exception 'invalid_private_workspace_acceptance' using errcode = '22023';
  end if;

  begin
    if raw_client_ip is not null then
      client_ip := raw_client_ip::inet;
    end if;
  exception when invalid_text_representation then
    client_ip := null;
  end;

  select progress.organization_id into target_organization_id
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator')
  order by progress.updated_at desc
  limit 1;
  if target_organization_id is null then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  select document.* into legal_document
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = p_locale
    and document.status = 'active'
    and document.effective_at <= now()
  order by document.effective_at desc
  limit 1;
  if not found then
    raise exception 'active_private_workspace_terms_not_found' using errcode = 'P0002';
  end if;

  select acceptance.id into acceptance_id
  from public.organization_legal_acceptances acceptance
  where acceptance.organization_id = target_organization_id
    and acceptance.document_key = legal_document.document_key
    and acceptance.document_version = legal_document.version;

  if acceptance_id is not null then
    return acceptance_id;
  end if;

  insert into public.organization_legal_acceptances (
    organization_id,
    legal_document_id,
    document_key,
    document_version,
    document_hash,
    accepted_by,
    signatory_name,
    signatory_title,
    authority_declared,
    information_rights_declared,
    terms_agreed,
    acceptance_statement,
    information_rights_statement,
    acceptance_method,
    accepted_ip,
    accepted_user_agent,
    locale
  ) values (
    target_organization_id,
    legal_document.id,
    legal_document.document_key,
    legal_document.version,
    legal_document.document_hash,
    caller_id,
    trim(p_signatory_name),
    nullif(trim(coalesce(p_signatory_title, '')), ''),
    null,
    true,
    true,
    legal_document.acceptance_statement,
    legal_document.information_rights_statement,
    'clickwrap',
    client_ip,
    user_agent,
    p_locale
  )
  returning id into acceptance_id;

  return acceptance_id;
end;
$$;

create function public.accept_private_workspace_terms(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_terms_agreed boolean,
  p_information_rights_declared boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_private_workspace_terms(
    p_locale,
    p_signatory_name,
    p_signatory_title,
    p_terms_agreed,
    p_information_rights_declared
  );
$$;

revoke all on function private.accept_private_workspace_terms(text, text, text, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.accept_private_workspace_terms(text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function private.accept_private_workspace_terms(text, text, text, boolean, boolean)
  to authenticated;
grant execute on function public.accept_private_workspace_terms(text, text, text, boolean, boolean)
  to authenticated;

comment on column public.organization_legal_acceptances.acceptance_statement is
  'Exact clickwrap contract assent displayed for V3 and later acceptances; null for legacy rows.';
comment on column public.organization_legal_acceptances.information_rights_statement is
  'Exact limited-purpose information-rights declaration for V3 and later; null for legacy rows.';
comment on column public.organization_legal_acceptances.authority_declared is
  'Historical corporate-authority assertion from V1/V2; null for V3 and later acceptances.';
comment on column public.organization_legal_acceptances.information_rights_declared is
  'Limited-purpose right-to-provide-information declaration from V3 and later; null for legacy rows.';
comment on column public.organization_legal_acceptances.accepted_ip is
  'Client IP observed by the Data API at acceptance, when available.';
comment on column public.organization_legal_acceptances.accepted_user_agent is
  'User agent observed by the Data API at acceptance, when available.';
