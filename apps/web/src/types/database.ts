export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          organization_id: string
          projection_id: string
          requested_by: string
          requested_scopes: string[]
          responded_at: string | null
          responded_by: string | null
          source_organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id: string
          projection_id: string
          requested_by: string
          requested_scopes: string[]
          responded_at?: string | null
          responded_by?: string | null
          source_organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          projection_id?: string
          requested_by?: string
          requested_scopes?: string[]
          responded_at?: string | null
          responded_by?: string | null
          source_organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_source_organization_id_projection_id_fkey"
            columns: ["source_organization_id", "projection_id"]
            isOneToOne: false
            referencedRelation: "published_opportunity_projections"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          id: number
          metadata: Json
          occurred_at: string
          organization_id: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          id?: never
          metadata?: Json
          occurred_at?: string
          organization_id: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          id?: never
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_evidence: {
        Row: {
          created_at: string
          evidence_kind: string
          evidence_reference: string | null
          expires_at: string | null
          id: string
          opportunity_id: string
          organization_id: string
          powers: string[]
          representative_user_id: string
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          evidence_kind: string
          evidence_reference?: string | null
          expires_at?: string | null
          id?: string
          opportunity_id: string
          organization_id: string
          powers?: string[]
          representative_user_id: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          evidence_kind?: string
          evidence_reference?: string | null
          expires_at?: string | null
          id?: string
          opportunity_id?: string
          organization_id?: string
          powers?: string[]
          representative_user_id?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authority_evidence_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      calculation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input_hash: string
          opportunity_id: string
          organization_id: string
          outputs: Json
          policy_version: string
          status: string
          warnings: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          engine_version: string
          id?: string
          input_hash: string
          opportunity_id: string
          organization_id: string
          outputs?: Json
          policy_version: string
          status: string
          warnings?: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input_hash?: string
          opportunity_id?: string
          organization_id?: string
          outputs?: Json
          policy_version?: string
          status?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "calculation_runs_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      capital_requests: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          currency: string
          desired_term_months: number | null
          id: string
          organization_id: string
          output_locale: string
          purpose: string
          requested_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          currency: string
          desired_term_months?: number | null
          id?: string
          organization_id: string
          output_locale?: string
          purpose: string
          requested_amount: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          desired_term_months?: number | null
          id?: string
          organization_id?: string
          output_locale?: string
          purpose?: string
          requested_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_requests_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_name: string | null
          id: string
          jurisdiction_code: string
          legal_identifier_hash: string | null
          legal_name: string
          organization_id: string
          reporting_currency: string
          sector: string | null
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_name?: string | null
          id?: string
          jurisdiction_code: string
          legal_identifier_hash?: string | null
          legal_name: string
          organization_id: string
          reporting_currency?: string
          sector?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_name?: string | null
          id?: string
          jurisdiction_code?: string
          legal_identifier_hash?: string | null
          legal_name?: string
          organization_id?: string
          reporting_currency?: string
          sector?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_grants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          opportunity_id: string
          organization_id: string
          projection_id: string
          purpose: string
          recipient_organization_id: string
          revoked_at: string | null
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          opportunity_id: string
          organization_id: string
          projection_id: string
          purpose: string
          recipient_organization_id: string
          revoked_at?: string | null
          scopes: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          opportunity_id?: string
          organization_id?: string
          projection_id?: string
          purpose?: string
          recipient_organization_id?: string
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disclosure_grants_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "disclosure_grants_organization_id_projection_id_fkey"
            columns: ["organization_id", "projection_id"]
            isOneToOne: false
            referencedRelation: "published_opportunity_projections"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "disclosure_grants_recipient_organization_id_fkey"
            columns: ["recipient_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_facts: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string
          currency: string | null
          fact_type: string
          id: string
          label: string
          opportunity_id: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_anchor: Json
          source_document_id: string | null
          unit: string | null
          updated_at: string
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by: string
          currency?: string | null
          fact_type: string
          id?: string
          label: string
          opportunity_id: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_anchor: Json
          source_document_id?: string | null
          unit?: string | null
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string
          currency?: string | null
          fact_type?: string
          id?: string
          label?: string
          opportunity_id?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_anchor?: Json
          source_document_id?: string | null
          unit?: string | null
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_facts_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "evidence_facts_organization_id_source_document_id_fkey"
            columns: ["organization_id", "source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      financial_line_items: {
        Row: {
          account_code: string
          adjusted_value: number | null
          created_at: string
          financial_period_id: string
          id: string
          label: string
          opportunity_id: string
          organization_id: string
          reported_value: number | null
          source_fact_id: string | null
          updated_at: string
        }
        Insert: {
          account_code: string
          adjusted_value?: number | null
          created_at?: string
          financial_period_id: string
          id?: string
          label: string
          opportunity_id: string
          organization_id: string
          reported_value?: number | null
          source_fact_id?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string
          adjusted_value?: number | null
          created_at?: string
          financial_period_id?: string
          id?: string
          label?: string
          opportunity_id?: string
          organization_id?: string
          reported_value?: number | null
          source_fact_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_line_items_organization_id_financial_period_id_fkey"
            columns: ["organization_id", "financial_period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_line_items_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_line_items_organization_id_source_fact_id_fkey"
            columns: ["organization_id", "source_fact_id"]
            isOneToOne: false
            referencedRelation: "evidence_facts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          created_at: string
          currency: string
          ends_on: string
          id: string
          opportunity_id: string
          organization_id: string
          period_kind: string
          starts_on: string
          status: string
          unit_scale: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          ends_on: string
          id?: string
          opportunity_id: string
          organization_id: string
          period_kind: string
          starts_on: string
          status?: string
          unit_scale?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          ends_on?: string
          id?: string
          opportunity_id?: string
          organization_id?: string
          period_kind?: string
          starts_on?: string
          status?: string
          unit_scale?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      funds: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          status: string
          strategy: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
          status?: string
          strategy: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          strategy?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mandate_versions: {
        Row: {
          confidence: number
          constraints: Json
          created_at: string
          created_by: string
          fund_id: string
          id: string
          organization_id: string
          provenance: Json
          source_kind: string
          status: string
          valid_from: string
          valid_until: string | null
          version_number: number
        }
        Insert: {
          confidence?: number
          constraints: Json
          created_at?: string
          created_by: string
          fund_id: string
          id?: string
          organization_id: string
          provenance?: Json
          source_kind: string
          status?: string
          valid_from: string
          valid_until?: string | null
          version_number: number
        }
        Update: {
          confidence?: number
          constraints?: Json
          created_at?: string
          created_by?: string
          fund_id?: string
          id?: string
          organization_id?: string
          provenance?: Json
          source_kind?: string
          status?: string
          valid_from?: string
          valid_until?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mandate_versions_organization_id_fund_id_fkey"
            columns: ["organization_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      match_results: {
        Row: {
          created_at: string
          fit_reasons: Json
          fund_id: string
          hard_filter_status: string
          id: string
          mandate_version_id: string
          match_run_id: string
          mismatch_reasons: Json
          organization_id: string
          provider_organization_id: string
          rank: number
          score: number
        }
        Insert: {
          created_at?: string
          fit_reasons?: Json
          fund_id: string
          hard_filter_status: string
          id?: string
          mandate_version_id: string
          match_run_id: string
          mismatch_reasons?: Json
          organization_id: string
          provider_organization_id: string
          rank: number
          score: number
        }
        Update: {
          created_at?: string
          fit_reasons?: Json
          fund_id?: string
          hard_filter_status?: string
          id?: string
          mandate_version_id?: string
          match_run_id?: string
          mismatch_reasons?: Json
          organization_id?: string
          provider_organization_id?: string
          rank?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_results_organization_id_match_run_id_fkey"
            columns: ["organization_id", "match_run_id"]
            isOneToOne: false
            referencedRelation: "match_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "match_results_provider_organization_id_fund_id_fkey"
            columns: ["provider_organization_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "match_results_provider_organization_id_mandate_version_id_fkey"
            columns: ["provider_organization_id", "mandate_version_id"]
            isOneToOne: false
            referencedRelation: "mandate_versions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      match_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input_hash: string
          objective: string
          opportunity_id: string
          organization_id: string
          scenario_version_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          engine_version: string
          id?: string
          input_hash: string
          objective?: string
          opportunity_id: string
          organization_id: string
          scenario_version_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input_hash?: string
          objective?: string
          opportunity_id?: string
          organization_id?: string
          scenario_version_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_runs_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "match_runs_organization_id_scenario_version_id_fkey"
            columns: ["organization_id", "scenario_version_id"]
            isOneToOne: false
            referencedRelation: "scenario_versions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          answers: Json
          completed_at: string | null
          created_at: string
          current_step: string
          journey: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: string
          journey: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: string
          journey?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          capital_request_id: string
          company_id: string
          created_at: string
          created_by: string
          currency: string
          fingerprint_hash: string | null
          id: string
          lead_user_id: string
          organization_id: string
          purpose: string
          readiness_status: string
          requested_amount: number
          stage: string
          title: string
          updated_at: string
        }
        Insert: {
          capital_request_id: string
          company_id: string
          created_at?: string
          created_by: string
          currency: string
          fingerprint_hash?: string | null
          id?: string
          lead_user_id: string
          organization_id: string
          purpose: string
          readiness_status?: string
          requested_amount: number
          stage?: string
          title: string
          updated_at?: string
        }
        Update: {
          capital_request_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          fingerprint_hash?: string | null
          id?: string
          lead_user_id?: string
          organization_id?: string
          purpose?: string
          readiness_status?: string
          requested_amount?: number
          stage?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_organization_id_capital_request_id_fkey"
            columns: ["organization_id", "capital_request_id"]
            isOneToOne: false
            referencedRelation: "capital_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      opportunity_assignments: {
        Row: {
          assigned_by: string
          assignment_role: string
          created_at: string
          expires_at: string | null
          opportunity_id: string
          organization_id: string
          permissions: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          assignment_role: string
          created_at?: string
          expires_at?: string | null
          opportunity_id: string
          organization_id: string
          permissions?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          assignment_role?: string
          created_at?: string
          expires_at?: string | null
          opportunity_id?: string
          organization_id?: string
          permissions?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_assignments_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          email_hash: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email_hash: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email_hash?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          joined_at?: string | null
          organization_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country_code: string | null
          created_at: string
          created_by: string
          id: string
          legal_name: string | null
          name: string
          organization_type: string
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          created_by: string
          id?: string
          legal_name?: string | null
          name: string
          organization_type: string
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          created_by?: string
          id?: string
          legal_name?: string | null
          name?: string
          organization_type?: string
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Relationships: []
      }
      output_artifacts: {
        Row: {
          artifact_type: string
          created_at: string
          created_by: string
          current_version_number: number
          id: string
          opportunity_id: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          artifact_type: string
          created_at?: string
          created_by: string
          current_version_number?: number
          id?: string
          opportunity_id: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          artifact_type?: string
          created_at?: string
          created_by?: string
          current_version_number?: number
          id?: string
          opportunity_id?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_artifacts_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      output_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          evidence_coverage: number
          id: string
          locale: string
          organization_id: string
          output_artifact_id: string
          payload: Json
          payload_hash: string
          review_status: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          evidence_coverage?: number
          id?: string
          locale: string
          organization_id: string
          output_artifact_id: string
          payload: Json
          payload_hash: string
          review_status?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          evidence_coverage?: number
          id?: string
          locale?: string
          organization_id?: string
          output_artifact_id?: string
          payload?: Json
          payload_hash?: string
          review_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "output_versions_organization_id_output_artifact_id_fkey"
            columns: ["organization_id", "output_artifact_id"]
            isOneToOne: false
            referencedRelation: "output_artifacts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          job_title: string | null
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          job_title?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      published_opportunity_projections: {
        Row: {
          amount_max: number
          amount_min: number
          approved_at: string | null
          approved_by: string | null
          collateral_types: string[]
          created_at: string
          currency: string
          expires_at: string | null
          geography: string
          id: string
          opportunity_id: string
          organization_id: string
          sector: string
          source_output_version_id: string | null
          status: string
          structure_types: string[]
          summary: string
          term_months_max: number | null
          term_months_min: number | null
          version_number: number
        }
        Insert: {
          amount_max: number
          amount_min: number
          approved_at?: string | null
          approved_by?: string | null
          collateral_types?: string[]
          created_at?: string
          currency: string
          expires_at?: string | null
          geography: string
          id?: string
          opportunity_id: string
          organization_id: string
          sector: string
          source_output_version_id?: string | null
          status?: string
          structure_types?: string[]
          summary: string
          term_months_max?: number | null
          term_months_min?: number | null
          version_number: number
        }
        Update: {
          amount_max?: number
          amount_min?: number
          approved_at?: string | null
          approved_by?: string | null
          collateral_types?: string[]
          created_at?: string
          currency?: string
          expires_at?: string | null
          geography?: string
          id?: string
          opportunity_id?: string
          organization_id?: string
          sector?: string
          source_output_version_id?: string | null
          status?: string
          structure_types?: string[]
          summary?: string
          term_months_max?: number | null
          term_months_min?: number | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_opportunity_project_organization_id_opportunity__fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "published_opportunity_project_organization_id_source_outpu_fkey"
            columns: ["organization_id", "source_output_version_id"]
            isOneToOne: false
            referencedRelation: "output_versions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      scenario_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          input_hash: string
          organization_id: string
          structure_scenario_id: string
          terms: Json
          validation_status: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          input_hash: string
          organization_id: string
          structure_scenario_id: string
          terms: Json
          validation_status?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          input_hash?: string
          organization_id?: string
          structure_scenario_id?: string
          terms?: Json
          validation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_versions_organization_id_structure_scenario_id_fkey"
            columns: ["organization_id", "structure_scenario_id"]
            isOneToOne: false
            referencedRelation: "structure_scenarios"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      source_documents: {
        Row: {
          bucket_id: string
          byte_size: number | null
          classification: string
          created_at: string
          created_by: string
          id: string
          mime_type: string | null
          object_path: string
          opportunity_id: string
          organization_id: string
          original_name: string
          processing_status: string
          sha256: string | null
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          byte_size?: number | null
          classification?: string
          created_at?: string
          created_by: string
          id?: string
          mime_type?: string | null
          object_path: string
          opportunity_id: string
          organization_id: string
          original_name: string
          processing_status?: string
          sha256?: string | null
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number | null
          classification?: string
          created_at?: string
          created_by?: string
          id?: string
          mime_type?: string | null
          object_path?: string
          opportunity_id?: string
          organization_id?: string
          original_name?: string
          processing_status?: string
          sha256?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      structure_scenarios: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          opportunity_id: string
          organization_id: string
          scenario_kind: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          opportunity_id: string
          organization_id: string
          scenario_kind: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          opportunity_id?: string
          organization_id?: string
          scenario_kind?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_scenarios_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          input_version: string
          opportunity_id: string | null
          organization_id: string
          safe_metrics: Json
          started_by: string
          status: string
          workflow_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          input_version: string
          opportunity_id?: string | null
          organization_id: string
          safe_metrics?: Json
          started_by: string
          status: string
          workflow_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          input_version?: string
          opportunity_id?: string | null
          organization_id?: string
          safe_metrics?: Json
          started_by?: string
          status?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_onboarding: {
        Args: {
          p_country_code?: string
          p_journey: string
          p_legal_name?: string
          p_name: string
          p_website?: string
        }
        Returns: string
      }
      create_opportunity_intake: {
        Args: {
          p_currency: string
          p_desired_term_months: number
          p_legal_name: string
          p_organization_id: string
          p_output_locale?: string
          p_purpose: string
          p_requested_amount: number
          p_sector: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
