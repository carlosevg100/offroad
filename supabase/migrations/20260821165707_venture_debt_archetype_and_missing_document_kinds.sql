-- Two checks that had fallen behind the ontology.
--
-- `customer_concentration` was added to the document kinds on 21/08 and never reached this
-- constraint: a classifier that recognised a customer-concentration sheet would have had its
-- profile refused at insert. `cap_table` and `metrics_report` arrive with the venture-debt
-- archetype, and the archetype itself joins the session check.

alter table public.document_intake_sessions
  drop constraint if exists document_intake_sessions_archetype_check;
alter table public.document_intake_sessions
  add constraint document_intake_sessions_archetype_check
  check (archetype is null or archetype in (
    'working_capital', 'growth_expansion', 'acquisition', 'refinance', 'equipment_finance', 'venture_debt', 'other'
  ));

alter table public.document_profiles
  drop constraint if exists document_profiles_document_kind_check;
alter table public.document_profiles
  add constraint document_profiles_document_kind_check
  check (document_kind in (
    'audited_financial_statements', 'auditor_report_only', 'reviewed_interim_statements',
    'trial_balance', 'erp_export', 'management_accounts', 'bank_statements', 'open_finance_export',
    'debt_schedule', 'loan_agreement', 'debenture_indenture', 'collateral_inventory',
    'appraisal_report', 'receivables_aging', 'payables_aging', 'business_plan',
    'financial_model', 'budget', 'investor_deck', 'cim', 'teaser', 'project_memorandum',
    'technical_report', 'capital_request_letter', 'company_registration', 'corporate_docs',
    'tax_clearance', 'regulatory_filing', 'customer_concentration', 'customer_contract',
    'supplier_contract', 'insurance_policy', 'cap_table', 'metrics_report', 'other'
  ));
