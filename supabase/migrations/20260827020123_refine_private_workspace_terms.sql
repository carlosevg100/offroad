-- Replace the first-use confidentiality terms with the compact, document-style
-- version approved for the onboarding experience. A new version intentionally
-- requires a fresh acceptance because the displayed legal record is immutable.

update public.platform_legal_documents
set status = 'superseded'
where document_key = 'private_workspace_terms'
  and status = 'active';

insert into public.platform_legal_documents (
  document_key, version, locale, title, rendered_text, body_sections, status, effective_at
) values
(
  'private_workspace_terms',
  '2026-08-27-v2',
  'pt-BR',
  'Confidencialidade',
  E'As informações recebidas nesta etapa são tratadas em caráter confidencial e utilizadas exclusivamente na estruturação da operação.\n\n01 · Sigilo\nAs informações não são divulgadas a terceiros. A identidade da companhia e a existência das tratativas também são confidenciais.\n\n02 · Uso\nAnálise da companhia, organização dos dados e estruturação da operação. Nenhuma outra finalidade.\n\n03 · Acesso\nRestrito à equipe responsável pelo projeto e aos sistemas que operam a plataforma, sujeitos às mesmas obrigações.\n\n04 · Distribuição\nNenhum material é apresentado a investidores sem autorização prévia e específica da companhia, que define os materiais, o critério de identificação e os destinatários.\n\n05 · Natureza deste aceite\nNão constitui contratação, exclusividade ou mandato para representar a companhia perante o mercado.\n\nO signatário declara dispor de poderes para disponibilizar as informações em nome da companhia e responde por sua veracidade.\n\nDeclaro ter lido e dou ciência dos termos acima, em nome da companhia.',
  '[
    {"heading":"Sigilo","body":"As informações não são divulgadas a terceiros. A identidade da companhia e a existência das tratativas também são confidenciais."},
    {"heading":"Uso","body":"Análise da companhia, organização dos dados e estruturação da operação. Nenhuma outra finalidade."},
    {"heading":"Acesso","body":"Restrito à equipe responsável pelo projeto e aos sistemas que operam a plataforma, sujeitos às mesmas obrigações."},
    {"heading":"Distribuição","body":"Nenhum material é apresentado a investidores sem autorização prévia e específica da companhia, que define os materiais, o critério de identificação e os destinatários."},
    {"heading":"Natureza deste aceite","body":"Não constitui contratação, exclusividade ou mandato para representar a companhia perante o mercado."}
  ]'::jsonb,
  'active',
  now()
),
(
  'private_workspace_terms',
  '2026-08-27-v2',
  'en-US',
  'Confidentiality',
  E'Information received at this stage is treated as confidential and used exclusively to structure the transaction.\n\n01 · Confidentiality\nInformation is not disclosed to third parties. The company identity and the existence of the discussions are also confidential.\n\n02 · Use\nCompany analysis, data organization and transaction structuring. No other purpose.\n\n03 · Access\nRestricted to the team responsible for the project and the systems that operate the platform, subject to the same obligations.\n\n04 · Distribution\nNo material is presented to investors without the company''s prior and specific authorization, which defines the materials, identity policy and recipients.\n\n05 · Nature of this acceptance\nThis acceptance does not constitute an engagement, exclusivity arrangement or mandate to represent the company before the market.\n\nThe signatory declares that they have authority to provide the information on behalf of the company and are responsible for its accuracy.\n\nI confirm that I have read and acknowledge the terms above on behalf of the company.',
  '[
    {"heading":"Confidentiality","body":"Information is not disclosed to third parties. The company identity and the existence of the discussions are also confidential."},
    {"heading":"Use","body":"Company analysis, data organization and transaction structuring. No other purpose."},
    {"heading":"Access","body":"Restricted to the team responsible for the project and the systems that operate the platform, subject to the same obligations."},
    {"heading":"Distribution","body":"No material is presented to investors without the company''s prior and specific authorization, which defines the materials, identity policy and recipients."},
    {"heading":"Nature of this acceptance","body":"This acceptance does not constitute an engagement, exclusivity arrangement or mandate to represent the company before the market."}
  ]'::jsonb,
  'active',
  now()
);
