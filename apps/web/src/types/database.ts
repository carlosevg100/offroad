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
          collateral_summary: string | null
          company_id: string
          created_at: string
          created_by: string
          currency: string
          desired_term_months: number | null
          desired_timing: string | null
          expected_outcome: string | null
          id: string
          organization_id: string
          output_locale: string
          purpose: string
          purpose_category: string | null
          rationale: string | null
          repayment_source: string | null
          requested_amount: number
          status: string
          strategic_importance: string | null
          updated_at: string
        }
        Insert: {
          collateral_summary?: string | null
          company_id: string
          created_at?: string
          created_by: string
          currency: string
          desired_term_months?: number | null
          desired_timing?: string | null
          expected_outcome?: string | null
          id?: string
          organization_id: string
          output_locale?: string
          purpose: string
          purpose_category?: string | null
          rationale?: string | null
          repayment_source?: string | null
          requested_amount: number
          status?: string
          strategic_importance?: string | null
          updated_at?: string
        }
        Update: {
          collateral_summary?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          desired_term_months?: number | null
          desired_timing?: string | null
          expected_outcome?: string | null
          id?: string
          organization_id?: string
          output_locale?: string
          purpose?: string
          purpose_category?: string | null
          rationale?: string | null
          repayment_source?: string | null
          requested_amount?: number
          status?: string
          strategic_importance?: string | null
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
          headquarters_city: string | null
          headquarters_state: string | null
          id: string
          jurisdiction_code: string
          legal_identifier_hash: string | null
          legal_identifier_last4: string | null
          legal_name: string
          organization_id: string
          reporting_currency: string
          sector: string | null
          subsector: string | null
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_name?: string | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          id?: string
          jurisdiction_code: string
          legal_identifier_hash?: string | null
          legal_identifier_last4?: string | null
          legal_name: string
          organization_id: string
          reporting_currency?: string
          sector?: string | null
          subsector?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_name?: string | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          id?: string
          jurisdiction_code?: string
          legal_identifier_hash?: string | null
          legal_identifier_last4?: string | null
          legal_name?: string
          organization_id?: string
          reporting_currency?: string
          sector?: string | null
          subsector?: string | null
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
      case_artifact_manifests: {
        Row: {
          created_at: string
          created_by: string
          id: string
          input_fingerprint: string
          intake_session_id: string
          locale: string
          manifest: Json
          manifest_fingerprint: string
          organization_id: string
          processing_run_id: string | null
          schema_version: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          input_fingerprint: string
          intake_session_id: string
          locale: string
          manifest: Json
          manifest_fingerprint: string
          organization_id: string
          processing_run_id?: string | null
          schema_version: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          input_fingerprint?: string
          intake_session_id?: string
          locale?: string
          manifest?: Json
          manifest_fingerprint?: string
          organization_id?: string
          processing_run_id?: string | null
          schema_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_artifact_manifests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_artifact_manifests_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_artifact_manifests_organization_id_processing_run_id_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      claim_decisions: {
        Row: {
          claim_fingerprint: string
          claim_id: string
          decided_at: string
          decided_by: string
          decision: string
          id: string
          intake_session_id: string
          organization_id: string
          reason: string
          source_manifest_id: string
          source_registry_fingerprint: string
        }
        Insert: {
          claim_fingerprint: string
          claim_id: string
          decided_at?: string
          decided_by: string
          decision: string
          id?: string
          intake_session_id: string
          organization_id: string
          reason: string
          source_manifest_id: string
          source_registry_fingerprint: string
        }
        Update: {
          claim_fingerprint?: string
          claim_id?: string
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          reason?: string
          source_manifest_id?: string
          source_registry_fingerprint?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_decisions_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "claim_decisions_organization_id_source_manifest_id_fkey"
            columns: ["organization_id", "source_manifest_id"]
            isOneToOne: false
            referencedRelation: "case_artifact_manifests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      document_intake_sessions: {
        Row: {
          archetype: string | null
          collateral_kinds: string[] | null
          confirmed_at: string | null
          created_at: string
          current_run_id: string | null
          expected_rate: string | null
          extraction_version: string
          geography: string | null
          id: string
          instruments: string[] | null
          journey: string
          locale: string
          opportunity_id: string | null
          organization_id: string
          pipeline_version: string | null
          processing_completed_at: string | null
          processing_started_at: string | null
          requested_amount: number | null
          requested_grace_months: number | null
          requested_term_months: number | null
          result_summary: Json
          sector: string | null
          started_by: string
          status: string
          updated_at: string
        }
        Insert: {
          archetype?: string | null
          collateral_kinds?: string[] | null
          confirmed_at?: string | null
          created_at?: string
          current_run_id?: string | null
          expected_rate?: string | null
          extraction_version?: string
          geography?: string | null
          id?: string
          instruments?: string[] | null
          journey: string
          locale?: string
          opportunity_id?: string | null
          organization_id: string
          pipeline_version?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          requested_amount?: number | null
          requested_grace_months?: number | null
          requested_term_months?: number | null
          result_summary?: Json
          sector?: string | null
          started_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          archetype?: string | null
          collateral_kinds?: string[] | null
          confirmed_at?: string | null
          created_at?: string
          current_run_id?: string | null
          expected_rate?: string | null
          extraction_version?: string
          geography?: string | null
          id?: string
          instruments?: string[] | null
          journey?: string
          locale?: string
          opportunity_id?: string | null
          organization_id?: string
          pipeline_version?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          requested_amount?: number | null
          requested_grace_months?: number | null
          requested_term_months?: number | null
          result_summary?: Json
          sector?: string | null
          started_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_intake_sessions_current_run_fkey"
            columns: ["organization_id", "current_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "document_intake_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_sessions_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      document_layers: {
        Row: {
          bucket_id: string
          byte_size: number | null
          created_at: string
          document_version: number
          id: string
          layer_kind: string
          object_path: string
          organization_id: string
          parser_versions: Json
          processing_run_id: string | null
          sha256: string | null
          source_document_id: string
          stats: Json
          status: string
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          document_version?: number
          id?: string
          layer_kind: string
          object_path: string
          organization_id: string
          parser_versions?: Json
          processing_run_id?: string | null
          sha256?: string | null
          source_document_id: string
          stats?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          document_version?: number
          id?: string
          layer_kind?: string
          object_path?: string
          organization_id?: string
          parser_versions?: Json
          processing_run_id?: string | null
          sha256?: string | null
          source_document_id?: string
          stats?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_layers_organization_id_processing_run_id_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "document_layers_organization_id_source_document_id_fkey"
            columns: ["organization_id", "source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      document_profiles: {
        Row: {
          accounting_basis: string | null
          classifier: Json
          confidence: number
          created_at: string
          currency: string | null
          document_kind: string
          document_version: number
          entity_name: string | null
          entity_role: string | null
          entity_scope: string | null
          evidence_rank: number
          fiscal_year: number | null
          id: string
          information_class: string
          language: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          processing_run_id: string | null
          quality: Json
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          scale: number | null
          source_document_id: string
          suggested_folder: string | null
          suggested_name: string | null
          summary: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          accounting_basis?: string | null
          classifier?: Json
          confidence: number
          created_at?: string
          currency?: string | null
          document_kind: string
          document_version?: number
          entity_name?: string | null
          entity_role?: string | null
          entity_scope?: string | null
          evidence_rank: number
          fiscal_year?: number | null
          id?: string
          information_class: string
          language?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          processing_run_id?: string | null
          quality?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scale?: number | null
          source_document_id: string
          suggested_folder?: string | null
          suggested_name?: string | null
          summary?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          accounting_basis?: string | null
          classifier?: Json
          confidence?: number
          created_at?: string
          currency?: string | null
          document_kind?: string
          document_version?: number
          entity_name?: string | null
          entity_role?: string | null
          entity_scope?: string | null
          evidence_rank?: number
          fiscal_year?: number | null
          id?: string
          information_class?: string
          language?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          processing_run_id?: string | null
          quality?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scale?: number | null
          source_document_id?: string
          suggested_folder?: string | null
          suggested_name?: string | null
          summary?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_profiles_organization_id_processing_run_id_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "document_profiles_organization_id_source_document_id_fkey"
            columns: ["organization_id", "source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["organization_id", "id"]
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
      extraction_feedback: {
        Row: {
          anchor_verified: boolean
          candidate_id: string
          confidence: number
          corrected_value: Json | null
          created_at: string
          created_by: string
          decision: string
          document_kind: string | null
          evidence_rank: number
          extraction_method: string
          extractor_key: string
          field_group: string
          field_path: string
          id: string
          intake_session_id: string
          organization_id: string
          proposed_value: Json
          reviewer_comment: string | null
          source_document_id: string | null
          value_type: string
        }
        Insert: {
          anchor_verified: boolean
          candidate_id: string
          confidence: number
          corrected_value?: Json | null
          created_at?: string
          created_by?: string
          decision: string
          document_kind?: string | null
          evidence_rank: number
          extraction_method: string
          extractor_key: string
          field_group: string
          field_path: string
          id?: string
          intake_session_id: string
          organization_id: string
          proposed_value: Json
          reviewer_comment?: string | null
          source_document_id?: string | null
          value_type: string
        }
        Update: {
          anchor_verified?: boolean
          candidate_id?: string
          confidence?: number
          corrected_value?: Json | null
          created_at?: string
          created_by?: string
          decision?: string
          document_kind?: string | null
          evidence_rank?: number
          extraction_method?: string
          extractor_key?: string
          field_group?: string
          field_path?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          proposed_value?: Json
          reviewer_comment?: string | null
          source_document_id?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_feedback_organization_id_candidate_id_fkey"
            columns: ["organization_id", "candidate_id"]
            isOneToOne: false
            referencedRelation: "intake_field_candidates"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "extraction_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_feedback_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
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
      fund_directory: {
        Row: {
          bucket: string | null
          claimed_at: string | null
          claimed_by_organization_id: string | null
          cnpj: string | null
          created_at: string
          cvm_code: string | null
          id: string
          kind: string
          legal_name: string
          notes: string | null
          short_name: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          bucket?: string | null
          claimed_at?: string | null
          claimed_by_organization_id?: string | null
          cnpj?: string | null
          created_at?: string
          cvm_code?: string | null
          id?: string
          kind: string
          legal_name: string
          notes?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          bucket?: string | null
          claimed_at?: string | null
          claimed_by_organization_id?: string | null
          cnpj?: string | null
          created_at?: string
          cvm_code?: string | null
          id?: string
          kind?: string
          legal_name?: string
          notes?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_directory_claimed_by_organization_id_fkey"
            columns: ["claimed_by_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_mandate_observations: {
        Row: {
          criterion: string
          fund_id: string
          id: string
          note: string | null
          observed_at: string
          provenance: string
          recorded_at: string
          recorded_by: string | null
          source_url: string | null
          value: Json
        }
        Insert: {
          criterion: string
          fund_id: string
          id?: string
          note?: string | null
          observed_at: string
          provenance: string
          recorded_at?: string
          recorded_by?: string | null
          source_url?: string | null
          value: Json
        }
        Update: {
          criterion?: string
          fund_id?: string
          id?: string
          note?: string | null
          observed_at?: string
          provenance?: string
          recorded_at?: string
          recorded_by?: string | null
          source_url?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fund_mandate_observations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
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
      intake_field_candidates: {
        Row: {
          anchor_precision: string | null
          anchor_verified: boolean
          confidence: number
          created_at: string
          created_by: string
          currency: string | null
          entity_name: string | null
          entity_scope: string | null
          evidence_rank: number
          extraction_method: string
          extractor_key: string
          field_group: string
          field_path: string
          id: string
          information_class: string
          intake_session_id: string
          is_primary: boolean
          label: string
          normalized_value: Json
          organization_id: string
          period_end: string | null
          period_start: string | null
          processing_run_id: string | null
          raw_value: string | null
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_comment: string | null
          source_anchor: Json
          source_document_id: string | null
          unit: string | null
          updated_at: string
          value_scale: number | null
          value_type: string
          verifier_flags: Json
        }
        Insert: {
          anchor_precision?: string | null
          anchor_verified?: boolean
          confidence: number
          created_at?: string
          created_by: string
          currency?: string | null
          entity_name?: string | null
          entity_scope?: string | null
          evidence_rank: number
          extraction_method: string
          extractor_key: string
          field_group: string
          field_path: string
          id?: string
          information_class: string
          intake_session_id: string
          is_primary?: boolean
          label: string
          normalized_value: Json
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          processing_run_id?: string | null
          raw_value?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          source_anchor: Json
          source_document_id?: string | null
          unit?: string | null
          updated_at?: string
          value_scale?: number | null
          value_type: string
          verifier_flags?: Json
        }
        Update: {
          anchor_precision?: string | null
          anchor_verified?: boolean
          confidence?: number
          created_at?: string
          created_by?: string
          currency?: string | null
          entity_name?: string | null
          entity_scope?: string | null
          evidence_rank?: number
          extraction_method?: string
          extractor_key?: string
          field_group?: string
          field_path?: string
          id?: string
          information_class?: string
          intake_session_id?: string
          is_primary?: boolean
          label?: string
          normalized_value?: Json
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          processing_run_id?: string | null
          raw_value?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          source_anchor?: Json
          source_document_id?: string | null
          unit?: string | null
          updated_at?: string
          value_scale?: number | null
          value_type?: string
          verifier_flags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "intake_field_candidates_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "intake_field_candidates_organization_id_source_document_id_fkey"
            columns: ["organization_id", "source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "intake_field_candidates_run_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      intake_information_answers: {
        Row: {
          answer: string | null
          answered_by: string
          created_at: string
          id: string
          intake_session_id: string
          note: string | null
          organization_id: string
          requirement_id: string
          response: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          answered_by: string
          created_at?: string
          id?: string
          intake_session_id: string
          note?: string | null
          organization_id: string
          requirement_id: string
          response?: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          answered_by?: string
          created_at?: string
          id?: string
          intake_session_id?: string
          note?: string | null
          organization_id?: string
          requirement_id?: string
          response?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_information_answers_organization_id_intake_session__fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      intake_issues: {
        Row: {
          blocks_external_outputs: boolean
          candidate_ids: string[]
          created_at: string
          description: string
          evidence: Json | null
          exception_type: string | null
          field_group: string | null
          field_path: string | null
          id: string
          impacted_outputs: Json
          intake_session_id: string
          issue_type: string
          organization_id: string
          owner_role: string | null
          priority: string
          processing_run_id: string | null
          proposed_resolution: Json | null
          resolution_hint: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          blocks_external_outputs?: boolean
          candidate_ids?: string[]
          created_at?: string
          description: string
          evidence?: Json | null
          exception_type?: string | null
          field_group?: string | null
          field_path?: string | null
          id?: string
          impacted_outputs?: Json
          intake_session_id: string
          issue_type: string
          organization_id: string
          owner_role?: string | null
          priority: string
          processing_run_id?: string | null
          proposed_resolution?: Json | null
          resolution_hint?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          blocks_external_outputs?: boolean
          candidate_ids?: string[]
          created_at?: string
          description?: string
          evidence?: Json | null
          exception_type?: string | null
          field_group?: string | null
          field_path?: string | null
          id?: string
          impacted_outputs?: Json
          intake_session_id?: string
          issue_type?: string
          organization_id?: string
          owner_role?: string | null
          priority?: string
          processing_run_id?: string | null
          proposed_resolution?: Json | null
          resolution_hint?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_issues_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "intake_issues_run_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
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
          city: string | null
          country_code: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          legal_name: string | null
          model_monthly_ceiling_usd: number
          name: string
          organization_type: string
          pipeline_enabled: boolean
          provider_type: string | null
          sector: string | null
          state_code: string | null
          subsector: string | null
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          legal_name?: string | null
          model_monthly_ceiling_usd?: number
          name: string
          organization_type: string
          pipeline_enabled?: boolean
          provider_type?: string | null
          sector?: string | null
          state_code?: string | null
          subsector?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          legal_name?: string | null
          model_monthly_ceiling_usd?: number
          name?: string
          organization_type?: string
          pipeline_enabled?: boolean
          provider_type?: string | null
          sector?: string | null
          state_code?: string | null
          subsector?: string | null
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
      processing_jobs: {
        Row: {
          attempts: number
          available_at: string
          capability_sha256: string | null
          created_at: string
          id: string
          intake_session_id: string
          kind: string
          last_error: Json | null
          lease_expires_at: string | null
          leased_by: string | null
          max_attempts: number
          model_calls: number
          model_cost_usd: number
          organization_id: string
          payload: Json
          processing_run_id: string
          result: Json | null
          source_document_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          capability_sha256?: string | null
          created_at?: string
          id?: string
          intake_session_id: string
          kind: string
          last_error?: Json | null
          lease_expires_at?: string | null
          leased_by?: string | null
          max_attempts?: number
          model_calls?: number
          model_cost_usd?: number
          organization_id: string
          payload?: Json
          processing_run_id: string
          result?: Json | null
          source_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          capability_sha256?: string | null
          created_at?: string
          id?: string
          intake_session_id?: string
          kind?: string
          last_error?: Json | null
          lease_expires_at?: string | null
          leased_by?: string | null
          max_attempts?: number
          model_calls?: number
          model_cost_usd?: number
          organization_id?: string
          payload?: Json
          processing_run_id?: string
          result?: Json | null
          source_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "processing_jobs_organization_id_processing_run_id_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "processing_jobs_organization_id_source_document_id_fkey"
            columns: ["organization_id", "source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      processing_runs: {
        Row: {
          budget: Json
          completed_at: string | null
          created_at: string
          created_by: string
          error: Json | null
          id: string
          intake_session_id: string
          model_calls: number
          model_cost_usd: number
          organization_id: string
          pipeline_version: string
          run_no: number
          stages: Json
          started_at: string | null
          status: string
          trigger: string
          updated_at: string
          usage: Json
          versions: Json
        }
        Insert: {
          budget?: Json
          completed_at?: string | null
          created_at?: string
          created_by: string
          error?: Json | null
          id?: string
          intake_session_id: string
          model_calls?: number
          model_cost_usd?: number
          organization_id: string
          pipeline_version: string
          run_no: number
          stages?: Json
          started_at?: string | null
          status?: string
          trigger: string
          updated_at?: string
          usage?: Json
          versions?: Json
        }
        Update: {
          budget?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error?: Json | null
          id?: string
          intake_session_id?: string
          model_calls?: number
          model_cost_usd?: number
          organization_id?: string
          pipeline_version?: string
          run_no?: number
          stages?: Json
          started_at?: string | null
          status?: string
          trigger?: string
          updated_at?: string
          usage?: Json
          versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "processing_runs_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
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
      provider_contacts: {
        Row: {
          created_at: string
          created_by: string
          email: string
          full_name: string
          fund_id: string | null
          id: string
          is_primary: boolean
          job_title: string | null
          organization_id: string
          phone: string | null
          routing_criteria: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email: string
          full_name: string
          fund_id?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          organization_id: string
          phone?: string | null
          routing_criteria?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          full_name?: string
          fund_id?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          organization_id?: string
          phone?: string | null
          routing_criteria?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_contacts_organization_id_fund_id_fkey"
            columns: ["organization_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["organization_id", "id"]
          },
        ]
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
      sounding_events: {
        Row: {
          actor: string
          created_at: string
          created_by: string
          event_type: string
          id: string
          indication: Json | null
          intake_session_id: string
          investor_id: string
          note: string | null
          occurred_at: string
          organization_id: string
          question_id: string | null
          sounding_id: string
        }
        Insert: {
          actor: string
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          indication?: Json | null
          intake_session_id: string
          investor_id: string
          note?: string | null
          occurred_at?: string
          organization_id: string
          question_id?: string | null
          sounding_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          indication?: Json | null
          intake_session_id?: string
          investor_id?: string
          note?: string | null
          occurred_at?: string
          organization_id?: string
          question_id?: string | null
          sounding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sounding_events_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sounding_events_organization_id_investor_id_fkey"
            columns: ["organization_id", "investor_id"]
            isOneToOne: false
            referencedRelation: "sounding_investors"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sounding_events_organization_id_sounding_id_fkey"
            columns: ["organization_id", "sounding_id"]
            isOneToOne: false
            referencedRelation: "soundings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      sounding_investors: {
        Row: {
          created_at: string
          fund_directory_id: string | null
          id: string
          intake_session_id: string
          investor_kind: string
          investor_name: string
          organization_id: string
          sounding_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fund_directory_id?: string | null
          id?: string
          intake_session_id: string
          investor_kind: string
          investor_name: string
          organization_id: string
          sounding_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fund_directory_id?: string | null
          id?: string
          intake_session_id?: string
          investor_kind?: string
          investor_name?: string
          organization_id?: string
          sounding_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sounding_investors_fund_directory_id_fkey"
            columns: ["fund_directory_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sounding_investors_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sounding_investors_organization_id_sounding_id_fkey"
            columns: ["organization_id", "sounding_id"]
            isOneToOne: false
            referencedRelation: "soundings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      soundings: {
        Row: {
          cdi_pct: number
          created_at: string
          created_by: string
          currency: string
          id: string
          intake_session_id: string
          ipca_pct: number | null
          method: string
          organization_id: string
          status: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          cdi_pct: number
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          intake_session_id: string
          ipca_pct?: number | null
          method?: string
          organization_id: string
          status?: string
          target_amount: number
          updated_at?: string
        }
        Update: {
          cdi_pct?: number
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          intake_session_id?: string
          ipca_pct?: number | null
          method?: string
          organization_id?: string
          status?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "soundings_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: true
            referencedRelation: "document_intake_sessions"
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
          document_version: number
          evidence_rank: number | null
          id: string
          intake_session_id: string | null
          mime_type: string | null
          object_path: string
          opportunity_id: string | null
          organization_id: string
          original_name: string
          processing_status: string
          scan_result: Json | null
          sha256: string | null
          sha256_verified_at: string | null
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          byte_size?: number | null
          classification?: string
          created_at?: string
          created_by: string
          document_version?: number
          evidence_rank?: number | null
          id?: string
          intake_session_id?: string | null
          mime_type?: string | null
          object_path: string
          opportunity_id?: string | null
          organization_id: string
          original_name: string
          processing_status?: string
          scan_result?: Json | null
          sha256?: string | null
          sha256_verified_at?: string | null
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number | null
          classification?: string
          created_at?: string
          created_by?: string
          document_version?: number
          evidence_rank?: number | null
          id?: string
          intake_session_id?: string | null
          mime_type?: string | null
          object_path?: string
          opportunity_id?: string | null
          organization_id?: string
          original_name?: string
          processing_status?: string
          scan_result?: Json | null
          sha256?: string | null
          sha256_verified_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_intake_session_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
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
      accept_intake_candidates: {
        Args: {
          p_candidate_ids: string[]
          p_organization_id: string
          p_session_id: string
        }
        Returns: number
      }
      attach_intake_session_to_opportunity: {
        Args: {
          p_opportunity_id: string
          p_organization_id: string
          p_session_id: string
        }
        Returns: Json
      }
      begin_intake_processing: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: undefined
      }
      begin_processing_run: {
        Args: {
          p_budget?: Json
          p_documents: Json
          p_organization_id: string
          p_pipeline_version: string
          p_session_id: string
          p_trigger: string
        }
        Returns: Json
      }
      claim_case_brief: {
        Args: {
          p_lease_seconds?: number
          p_organization_id: string
          p_session_id: string
        }
        Returns: boolean
      }
      complete_intake_processing: {
        Args: {
          p_candidates: Json
          p_issues: Json
          p_organization_id: string
          p_session_id: string
          p_summary?: Json
        }
        Returns: Json
      }
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
      confirm_document_intake: {
        Args: {
          p_organization_id: string
          p_output_locale?: string
          p_session_id: string
        }
        Returns: Json
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
      fail_intake_session: {
        Args: {
          p_organization_id: string
          p_reason: string
          p_session_id: string
        }
        Returns: undefined
      }
      initialize_professional_onboarding: {
        Args: {
          p_full_name: string
          p_job_title?: string
          p_journey: string
          p_locale?: string
        }
        Returns: string
      }
      record_case_model_spend: {
        Args: {
          p_calls?: number
          p_cost_usd: number
          p_organization_id: string
          p_session_id: string
        }
        Returns: undefined
      }
      read_processing_model_lineage: {
        Args: {
          p_organization_id: string
          p_processing_run_id?: string | null
          p_session_id: string
        }
        Returns: Json
      }
      record_case_snapshot: {
        Args: {
          p_case_state: Json
          p_manifest: Json
          p_organization_id: string
          p_processing_run_id: string | null
          p_session_id: string
        }
        Returns: string
      }
      record_claim_decision: {
        Args: {
          p_claim_fingerprint: string
          p_claim_id: string
          p_decision: string
          p_organization_id: string
          p_reason: string
          p_session_id: string
        }
        Returns: string
      }
      record_document_verification: {
        Args: {
          p_document_id: string
          p_organization_id: string
          p_processing_status: string
          p_sha256: string
        }
        Returns: undefined
      }
      record_intake_analysis: {
        Args: { p_organization_id: string; p_patch: Json; p_session_id: string }
        Returns: undefined
      }
      review_intake_candidate: {
        Args: {
          p_candidate_id: string
          p_comment?: string
          p_decision: string
          p_normalized_value?: Json
          p_organization_id: string
          p_session_id: string
        }
        Returns: undefined
      }
      worker_claim_job: {
        Args: { p_lease_seconds?: number; p_worker_token: string }
        Returns: Json
      }
      worker_complete_job: {
        Args: { p_capability_token: string; p_job_id: string; p_result?: Json }
        Returns: Json
      }
      worker_fail_job: {
        Args: {
          p_capability_token: string
          p_error: Json
          p_job_id: string
          p_retry_in_seconds?: number
          p_retryable?: boolean
        }
        Returns: Json
      }
      worker_load_case_input: {
        Args: { p_capability_token: string; p_job_id: string }
        Returns: Json
      }
      worker_load_claim_decisions: {
        Args: { p_capability_token: string; p_job_id: string }
        Returns: Json
      }
      worker_record_case_snapshot: {
        Args: {
          p_capability_token: string
          p_case_state: Json
          p_job_id: string
          p_manifest: Json
        }
        Returns: string
      }
      worker_heartbeat: {
        Args: {
          p_capability_token: string
          p_job_id: string
          p_lease_seconds?: number
        }
        Returns: Json
      }
      worker_record_candidates: {
        Args: {
          p_candidates: Json
          p_capability_token: string
          p_job_id: string
        }
        Returns: Json
      }
      worker_record_document_result: {
        Args: {
          p_capability_token: string
          p_job_id: string
          p_layer: Json
          p_profile: Json
          p_scan_result: Json
        }
        Returns: Json
      }
      worker_write_stage_result: {
        Args: {
          p_capability_token: string
          p_detail?: Json
          p_job_id: string
          p_stage: string
          p_status: string
          p_usage?: Json
        }
        Returns: Json
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
