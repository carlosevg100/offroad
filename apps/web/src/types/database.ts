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
    PostgrestVersion: "14.5"
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
      agent_change_proposals: {
        Row: {
          base_manifest_fingerprint: string
          base_projection_updated_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          expires_at: string
          id: string
          impact_summary: string
          intake_session_id: string
          organization_id: string
          proposal: Json
          proposal_fingerprint: string
          proposed_at: string
          proposed_by: string
          proposed_by_kind: string
          rationale: string
          source_manifest_id: string | null
          source_message_id: string | null
          status: string
          target: string
          title: string
          updated_at: string
        }
        Insert: {
          base_manifest_fingerprint: string
          base_projection_updated_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expires_at: string
          id: string
          impact_summary: string
          intake_session_id: string
          organization_id: string
          proposal: Json
          proposal_fingerprint: string
          proposed_at: string
          proposed_by: string
          proposed_by_kind: string
          rationale: string
          source_manifest_id?: string | null
          source_message_id?: string | null
          status?: string
          target: string
          title: string
          updated_at?: string
        }
        Update: {
          base_manifest_fingerprint?: string
          base_projection_updated_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expires_at?: string
          id?: string
          impact_summary?: string
          intake_session_id?: string
          organization_id?: string
          proposal?: Json
          proposal_fingerprint?: string
          proposed_at?: string
          proposed_by?: string
          proposed_by_kind?: string
          rationale?: string
          source_manifest_id?: string | null
          source_message_id?: string | null
          status?: string
          target?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_change_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_change_proposals_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agent_change_proposals_organization_id_source_manifest_id_fkey"
            columns: ["organization_id", "source_manifest_id"]
            isOneToOne: false
            referencedRelation: "case_artifact_manifests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agent_change_proposals_source_message_fkey"
            columns: ["organization_id", "source_message_id"]
            isOneToOne: false
            referencedRelation: "agent_messages"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          intake_session_id: string
          organization_id: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          intake_session_id: string
          organization_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversations_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: true
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          created_by: string
          error_code: string | null
          id: string
          intake_session_id: string
          locale: string
          metadata: Json
          organization_id: string
          proposal_id: string | null
          reply_to_message_id: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          created_by: string
          error_code?: string | null
          id: string
          intake_session_id: string
          locale: string
          metadata?: Json
          organization_id: string
          proposal_id?: string | null
          reply_to_message_id?: string | null
          role: string
          status: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          created_by?: string
          error_code?: string | null
          id?: string
          intake_session_id?: string
          locale?: string
          metadata?: Json
          organization_id?: string
          proposal_id?: string | null
          reply_to_message_id?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_organization_id_conversation_id_fkey"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agent_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agent_messages_organization_id_proposal_id_fkey"
            columns: ["organization_id", "proposal_id"]
            isOneToOne: false
            referencedRelation: "agent_change_proposals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agent_messages_organization_id_reply_to_message_id_fkey"
            columns: ["organization_id", "reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "agent_messages"
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
      capital_provider_programs: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          legal_entity_name: string | null
          program_name: string
          provider_id: string
          provider_kind: string
          recorded_by: string | null
          route_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          legal_entity_name?: string | null
          program_name: string
          provider_id: string
          provider_kind: string
          recorded_by?: string | null
          route_ids: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          legal_entity_name?: string | null
          program_name?: string
          provider_id?: string
          provider_kind?: string
          recorded_by?: string | null
          route_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_provider_programs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
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
      case_execution_comparisons: {
        Row: {
          baseline_execution_id: string
          candidate_execution_id: string
          comparable: boolean
          comparison_fingerprint: string
          created_at: string
          critical_count: number
          differences: Json
          id: string
          mode: string
          organization_id: string
          passed: boolean
          warning_count: number
        }
        Insert: {
          baseline_execution_id: string
          candidate_execution_id: string
          comparable: boolean
          comparison_fingerprint: string
          created_at?: string
          critical_count: number
          differences: Json
          id?: string
          mode: string
          organization_id: string
          passed: boolean
          warning_count: number
        }
        Update: {
          baseline_execution_id?: string
          candidate_execution_id?: string
          comparable?: boolean
          comparison_fingerprint?: string
          created_at?: string
          critical_count?: number
          differences?: Json
          id?: string
          mode?: string
          organization_id?: string
          passed?: boolean
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_execution_comparisons_organization_id_baseline_execut_fkey"
            columns: ["organization_id", "baseline_execution_id"]
            isOneToOne: false
            referencedRelation: "controlled_case_executions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_execution_comparisons_organization_id_candidate_execu_fkey"
            columns: ["organization_id", "candidate_execution_id"]
            isOneToOne: true
            referencedRelation: "controlled_case_executions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_execution_comparisons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_red_flag_reviews: {
        Row: {
          created_at: string
          decided_at: string
          decided_by: string
          decision: string
          evidence_ids: Json
          flag_fingerprint: string
          flag_id: string
          id: string
          intake_session_id: string
          organization_id: string
          rationale: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decided_by: string
          decision: string
          evidence_ids?: Json
          flag_fingerprint: string
          flag_id: string
          id?: string
          intake_session_id: string
          organization_id: string
          rationale: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          decided_by?: string
          decision?: string
          evidence_ids?: Json
          flag_fingerprint?: string
          flag_id?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          rationale?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_red_flag_reviews_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      case_retrieval_chunks: {
        Row: {
          chunk_key: string
          content: string
          content_hash: string
          created_at: string
          document_version: number
          id: string
          intake_session_id: string
          locale: string
          opportunity_id: string | null
          organization_id: string
          processing_run_id: string
          search_vector: unknown
          source_anchor: Json
          source_document_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          chunk_key: string
          content: string
          content_hash: string
          created_at?: string
          document_version: number
          id?: string
          intake_session_id: string
          locale?: string
          opportunity_id?: string | null
          organization_id: string
          processing_run_id: string
          search_vector?: unknown
          source_anchor: Json
          source_document_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          chunk_key?: string
          content?: string
          content_hash?: string
          created_at?: string
          document_version?: number
          id?: string
          intake_session_id?: string
          locale?: string
          opportunity_id?: string | null
          organization_id?: string
          processing_run_id?: string
          search_vector?: unknown
          source_anchor?: Json
          source_document_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_retrieval_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_retrieval_chunks_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_retrieval_chunks_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_retrieval_chunks_organization_id_processing_run_id_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_retrieval_chunks_organization_id_source_document_id_fkey"
            columns: ["organization_id", "source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
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
      conduct_policies: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          disclaimer_id: string
          id: string
          methodology_source: string
          rules: Json
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disclaimer_id: string
          id?: string
          methodology_source: string
          rules?: Json
          status?: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
          version: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disclaimer_id?: string
          id?: string
          methodology_source?: string
          rules?: Json
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          version?: string
        }
        Relationships: []
      }
      controlled_case_executions: {
        Row: {
          baseline_execution_id: string | null
          comparison_passed: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          critical_regression_count: number
          id: string
          input_fingerprint: string | null
          intake_session_id: string
          manifest_fingerprint: string | null
          mode: string
          model_policy_version: string
          organization_id: string
          pipeline_version: string
          processing_run_id: string
          report_fingerprint: string | null
          started_at: string | null
          status: string
          updated_at: string
          warning_count: number
        }
        Insert: {
          baseline_execution_id?: string | null
          comparison_passed?: boolean | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          critical_regression_count?: number
          id?: string
          input_fingerprint?: string | null
          intake_session_id: string
          manifest_fingerprint?: string | null
          mode: string
          model_policy_version: string
          organization_id: string
          pipeline_version: string
          processing_run_id: string
          report_fingerprint?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          warning_count?: number
        }
        Update: {
          baseline_execution_id?: string | null
          comparison_passed?: boolean | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          critical_regression_count?: number
          id?: string
          input_fingerprint?: string | null
          intake_session_id?: string
          manifest_fingerprint?: string | null
          mode?: string
          model_policy_version?: string
          organization_id?: string
          pipeline_version?: string
          processing_run_id?: string
          report_fingerprint?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "controlled_case_executions_organization_id_baseline_execut_fkey"
            columns: ["organization_id", "baseline_execution_id"]
            isOneToOne: false
            referencedRelation: "controlled_case_executions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "controlled_case_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_case_executions_organization_id_intake_session__fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "controlled_case_executions_organization_id_processing_run__fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: true
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      deal_state_objects: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_kind: string
          dependencies: Json
          id: string
          input_fingerprint: string
          intake_session_id: string
          object_fingerprint: string
          object_type: string
          object_version: number
          organization_id: string
          payload: Json
          status: string
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_kind: string
          dependencies?: Json
          id?: string
          input_fingerprint: string
          intake_session_id: string
          object_fingerprint: string
          object_type: string
          object_version: number
          organization_id: string
          payload?: Json
          status: string
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_kind?: string
          dependencies?: Json
          id?: string
          input_fingerprint?: string
          intake_session_id?: string
          object_fingerprint?: string
          object_type?: string
          object_version?: number
          organization_id?: string
          payload?: Json
          status?: string
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_state_objects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_state_objects_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      decline_communications: {
        Row: {
          channel: string
          created_at: string
          id: string
          intake_session_id: string
          mandate_decision_fingerprint: string
          mandate_decision_id: string
          message_fingerprint: string
          organization_id: string
          recipient: string
          sent_at: string
          sent_by: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          intake_session_id: string
          mandate_decision_fingerprint: string
          mandate_decision_id: string
          message_fingerprint: string
          organization_id: string
          recipient: string
          sent_at?: string
          sent_by: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          intake_session_id?: string
          mandate_decision_fingerprint?: string
          mandate_decision_id?: string
          message_fingerprint?: string
          organization_id?: string
          recipient?: string
          sent_at?: string
          sent_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "decline_communications_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "decline_communications_organization_id_mandate_decision_id_fkey"
            columns: ["organization_id", "mandate_decision_id"]
            isOneToOne: false
            referencedRelation: "offroad_mandate_decisions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      diligence_surprises: {
        Row: {
          corrective_action_id: string | null
          created_at: string
          description: string
          id: string
          intake_session_id: string
          organization_id: string
          reported_at: string
          reported_by: string
          responsible_procedure_id: string | null
        }
        Insert: {
          corrective_action_id?: string | null
          created_at?: string
          description: string
          id?: string
          intake_session_id: string
          organization_id: string
          reported_at?: string
          reported_by: string
          responsible_procedure_id?: string | null
        }
        Update: {
          corrective_action_id?: string | null
          created_at?: string
          description?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          reported_at?: string
          reported_by?: string
          responsible_procedure_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diligence_surprises_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
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
      document_intake_sessions: {
        Row: {
          advisor_authorization: Json | null
          analysis_scope: Json | null
          analysis_scope_suggestions: Json | null
          archetype: string | null
          archived_at: string | null
          archived_by: string | null
          capital_consequence: string | null
          capital_currency: string | null
          capital_objective: string | null
          capital_urgency: string | null
          client_company_id: string | null
          collateral_kinds: string[] | null
          company_profile: Json
          company_profile_confirmed_at: string | null
          confirmed_at: string | null
          created_at: string
          current_run_id: string | null
          expected_rate: string | null
          extraction_version: string
          geography: string | null
          id: string
          identity_policy: string
          instruments: string[] | null
          journey: string
          locale: string
          opportunity_id: string | null
          organization_id: string
          pipeline_version: string | null
          privacy_status: string
          processing_completed_at: string | null
          processing_started_at: string | null
          project_name: string | null
          representation_kind: string | null
          representation_status: string
          representation_verified_at: string | null
          representation_verified_by: string | null
          requested_amount: number | null
          requested_grace_months: number | null
          requested_term_months: number | null
          result_summary: Json
          route_checks: Json
          sector: string | null
          started_by: string
          status: string
          updated_at: string
        }
        Insert: {
          advisor_authorization?: Json | null
          analysis_scope?: Json | null
          analysis_scope_suggestions?: Json | null
          archetype?: string | null
          archived_at?: string | null
          archived_by?: string | null
          capital_consequence?: string | null
          capital_currency?: string | null
          capital_objective?: string | null
          capital_urgency?: string | null
          client_company_id?: string | null
          collateral_kinds?: string[] | null
          company_profile?: Json
          company_profile_confirmed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          current_run_id?: string | null
          expected_rate?: string | null
          extraction_version?: string
          geography?: string | null
          id?: string
          identity_policy?: string
          instruments?: string[] | null
          journey: string
          locale?: string
          opportunity_id?: string | null
          organization_id: string
          pipeline_version?: string | null
          privacy_status?: string
          processing_completed_at?: string | null
          processing_started_at?: string | null
          project_name?: string | null
          representation_kind?: string | null
          representation_status?: string
          representation_verified_at?: string | null
          representation_verified_by?: string | null
          requested_amount?: number | null
          requested_grace_months?: number | null
          requested_term_months?: number | null
          result_summary?: Json
          route_checks?: Json
          sector?: string | null
          started_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          advisor_authorization?: Json | null
          analysis_scope?: Json | null
          analysis_scope_suggestions?: Json | null
          archetype?: string | null
          archived_at?: string | null
          archived_by?: string | null
          capital_consequence?: string | null
          capital_currency?: string | null
          capital_objective?: string | null
          capital_urgency?: string | null
          client_company_id?: string | null
          collateral_kinds?: string[] | null
          company_profile?: Json
          company_profile_confirmed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          current_run_id?: string | null
          expected_rate?: string | null
          extraction_version?: string
          geography?: string | null
          id?: string
          identity_policy?: string
          instruments?: string[] | null
          journey?: string
          locale?: string
          opportunity_id?: string | null
          organization_id?: string
          pipeline_version?: string | null
          privacy_status?: string
          processing_completed_at?: string | null
          processing_started_at?: string | null
          project_name?: string | null
          representation_kind?: string | null
          representation_status?: string
          representation_verified_at?: string | null
          representation_verified_by?: string | null
          requested_amount?: number | null
          requested_grace_months?: number | null
          requested_term_months?: number | null
          result_summary?: Json
          route_checks?: Json
          sector?: string | null
          started_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_intake_sessions_organization_client_company_fkey"
            columns: ["organization_id", "client_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
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
      engagement_conflict_reviews: {
        Row: {
          case_fingerprint: string
          counterparties: Json
          created_at: string
          id: string
          intake_session_id: string
          organization_id: string
          rationale: string
          reviewed_at: string
          reviewed_by: string
          status: string
        }
        Insert: {
          case_fingerprint: string
          counterparties?: Json
          created_at?: string
          id?: string
          intake_session_id: string
          organization_id: string
          rationale: string
          reviewed_at?: string
          reviewed_by: string
          status: string
        }
        Update: {
          case_fingerprint?: string
          counterparties?: Json
          created_at?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          rationale?: string
          reviewed_at?: string
          reviewed_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_conflict_reviews_organization_id_intake_session_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
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
          program_id: string | null
          provenance: string
          recorded_at: string
          recorded_by: string | null
          source_url: string | null
          valid_until: string | null
          value: Json
        }
        Insert: {
          criterion: string
          fund_id: string
          id?: string
          note?: string | null
          observed_at: string
          program_id?: string | null
          provenance: string
          recorded_at?: string
          recorded_by?: string | null
          source_url?: string | null
          valid_until?: string | null
          value: Json
        }
        Update: {
          criterion?: string
          fund_id?: string
          id?: string
          note?: string | null
          observed_at?: string
          program_id?: string | null
          provenance?: string
          recorded_at?: string
          recorded_by?: string | null
          source_url?: string | null
          valid_until?: string | null
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
          {
            foreignKeyName: "fund_mandate_observations_program_fk"
            columns: ["fund_id", "program_id"]
            isOneToOne: false
            referencedRelation: "capital_provider_programs"
            referencedColumns: ["provider_id", "id"]
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
      governed_precedent_chunks: {
        Row: {
          citation_key: string
          content: string
          content_hash: string
          created_at: string
          id: string
          precedent_id: string
          search_vector: unknown
          tags: string[]
        }
        Insert: {
          citation_key: string
          content: string
          content_hash: string
          created_at?: string
          id?: string
          precedent_id: string
          search_vector?: unknown
          tags?: string[]
        }
        Update: {
          citation_key?: string
          content?: string
          content_hash?: string
          created_at?: string
          id?: string
          precedent_id?: string
          search_vector?: unknown
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "governed_precedent_chunks_precedent_id_fkey"
            columns: ["precedent_id"]
            isOneToOne: false
            referencedRelation: "governed_precedents"
            referencedColumns: ["id"]
          },
        ]
      }
      governed_precedents: {
        Row: {
          anonymization_report: Json
          anonymization_status: string
          anonymized_payload_hash: string
          approved_at: string | null
          approved_by: string | null
          authorization_id: string
          created_at: string
          governance_status: string
          id: string
          precedent_kind: string
        }
        Insert: {
          anonymization_report: Json
          anonymization_status: string
          anonymized_payload_hash: string
          approved_at?: string | null
          approved_by?: string | null
          authorization_id: string
          created_at?: string
          governance_status: string
          id?: string
          precedent_kind: string
        }
        Update: {
          anonymization_report?: Json
          anonymization_status?: string
          anonymized_payload_hash?: string
          approved_at?: string | null
          approved_by?: string | null
          authorization_id?: string
          created_at?: string
          governance_status?: string
          id?: string
          precedent_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "governed_precedents_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "precedent_authorizations"
            referencedColumns: ["id"]
          },
        ]
      }
      house_playbook_chunks: {
        Row: {
          archetype: string | null
          chunk_key: string
          content: string
          content_hash: string
          created_at: string
          domain: string
          id: string
          locale: string
          playbook_version_id: string
          search_vector: unknown
          source_ref: string
          tags: string[]
        }
        Insert: {
          archetype?: string | null
          chunk_key: string
          content: string
          content_hash: string
          created_at?: string
          domain: string
          id?: string
          locale: string
          playbook_version_id: string
          search_vector?: unknown
          source_ref: string
          tags?: string[]
        }
        Update: {
          archetype?: string | null
          chunk_key?: string
          content?: string
          content_hash?: string
          created_at?: string
          domain?: string
          id?: string
          locale?: string
          playbook_version_id?: string
          search_vector?: unknown
          source_ref?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "house_playbook_chunks_playbook_version_id_fkey"
            columns: ["playbook_version_id"]
            isOneToOne: false
            referencedRelation: "house_playbook_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      house_playbook_versions: {
        Row: {
          approval_basis: string
          approved_at: string | null
          approved_by: string | null
          content_hash: string
          created_at: string
          id: string
          semantic_version: string
          status: string
        }
        Insert: {
          approval_basis: string
          approved_at?: string | null
          approved_by?: string | null
          content_hash: string
          created_at?: string
          id?: string
          semantic_version: string
          status: string
        }
        Update: {
          approval_basis?: string
          approved_at?: string | null
          approved_by?: string | null
          content_hash?: string
          created_at?: string
          id?: string
          semantic_version?: string
          status?: string
        }
        Relationships: []
      }
      intake_domain_events: {
        Row: {
          created_by: string
          event_hash: string
          event_id: string
          event_type: string
          id: string
          intake_session_id: string
          occurred_at: string
          organization_id: string
          payload: Json
          payload_version: number
          recorded_at: string
          sequence: number
        }
        Insert: {
          created_by: string
          event_hash: string
          event_id: string
          event_type: string
          id?: string
          intake_session_id: string
          occurred_at: string
          organization_id: string
          payload: Json
          payload_version?: number
          recorded_at?: string
          sequence: number
        }
        Update: {
          created_by?: string
          event_hash?: string
          event_id?: string
          event_type?: string
          id?: string
          intake_session_id?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
          payload_version?: number
          recorded_at?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "intake_domain_events_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
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
      mandate_note_embeddings: {
        Row: {
          citation: Json
          content: string
          content_hash: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          fund_id: string
          id: string
          note_kind: string
          observation_id: string | null
          observed_at: string
        }
        Insert: {
          citation: Json
          content: string
          content_hash: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          fund_id: string
          id?: string
          note_kind: string
          observation_id?: string | null
          observed_at: string
        }
        Update: {
          citation?: Json
          content?: string
          content_hash?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          fund_id?: string
          id?: string
          note_kind?: string
          observation_id?: string | null
          observed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mandate_note_embeddings_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mandate_note_embeddings_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: true
            referencedRelation: "fund_mandate_observations"
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
      market_distribution_policies: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          learning_gate_anchor_count: number
          mandate_max_age_months: number
          methodology_source: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          version: string
          wave_limit: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          learning_gate_anchor_count?: number
          mandate_max_age_months: number
          methodology_source: string
          status?: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
          version: string
          wave_limit: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          learning_gate_anchor_count?: number
          mandate_max_age_months?: number
          methodology_source?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          version?: string
          wave_limit?: number
        }
        Relationships: []
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
      material_communication_records: {
        Row: {
          channel: string
          content_fingerprint: string
          created_at: string
          has_material_commitment: boolean
          id: string
          intake_session_id: string
          organization_id: string
          package_fingerprint: string
          recipient_id: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          channel: string
          content_fingerprint: string
          created_at?: string
          has_material_commitment?: boolean
          id?: string
          intake_session_id: string
          organization_id: string
          package_fingerprint: string
          recipient_id: string
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          channel?: string
          content_fingerprint?: string
          created_at?: string
          has_material_commitment?: boolean
          id?: string
          intake_session_id?: string
          organization_id?: string
          package_fingerprint?: string
          recipient_id?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_communication_record_organization_id_intake_sessi_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      offroad_mandate_decisions: {
        Row: {
          assessment_fingerprint: string
          conditions: Json
          created_at: string
          decided_at: string
          decided_by: string
          decision: string
          id: string
          intake_session_id: string
          organization_id: string
          path_back: string | null
          reason_codes: Json
        }
        Insert: {
          assessment_fingerprint: string
          conditions?: Json
          created_at?: string
          decided_at?: string
          decided_by: string
          decision: string
          id?: string
          intake_session_id: string
          organization_id: string
          path_back?: string | null
          reason_codes?: Json
        }
        Update: {
          assessment_fingerprint?: string
          conditions?: Json
          created_at?: string
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          path_back?: string | null
          reason_codes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "offroad_mandate_decisions_organization_id_intake_session_i_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
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
      organization_legal_acceptances: {
        Row: {
          acceptance_method: string
          acceptance_statement: string | null
          accepted_at: string
          accepted_by: string
          accepted_ip: unknown
          accepted_user_agent: string | null
          authority_declared: boolean | null
          created_at: string
          document_hash: string
          document_key: string
          document_version: string
          id: string
          information_rights_declared: boolean | null
          information_rights_statement: string | null
          legal_document_id: string
          locale: string
          organization_id: string
          signatory_name: string
          signatory_title: string | null
          terms_agreed: boolean | null
        }
        Insert: {
          acceptance_method?: string
          acceptance_statement?: string | null
          accepted_at?: string
          accepted_by: string
          accepted_ip?: unknown
          accepted_user_agent?: string | null
          authority_declared?: boolean | null
          created_at?: string
          document_hash: string
          document_key: string
          document_version: string
          id?: string
          information_rights_declared?: boolean | null
          information_rights_statement?: string | null
          legal_document_id: string
          locale: string
          organization_id: string
          signatory_name: string
          signatory_title?: string | null
          terms_agreed?: boolean | null
        }
        Update: {
          acceptance_method?: string
          acceptance_statement?: string | null
          accepted_at?: string
          accepted_by?: string
          accepted_ip?: unknown
          accepted_user_agent?: string | null
          authority_declared?: boolean | null
          created_at?: string
          document_hash?: string
          document_key?: string
          document_version?: string
          id?: string
          information_rights_declared?: boolean | null
          information_rights_statement?: string | null
          legal_document_id?: string
          locale?: string
          organization_id?: string
          signatory_name?: string
          signatory_title?: string | null
          terms_agreed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_legal_acceptances_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "platform_legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_legal_acceptances_organization_id_fkey"
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
      organization_rollout_policies: {
        Row: {
          created_at: string
          external_release_enabled: boolean
          organization_id: string
          policy_version: string
          promotion_basis: string
          state: string
          target_model_policy_version: string
          target_pipeline_version: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          external_release_enabled?: boolean
          organization_id: string
          policy_version?: string
          promotion_basis?: string
          state: string
          target_model_policy_version?: string
          target_pipeline_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          external_release_enabled?: boolean
          organization_id?: string
          policy_version?: string
          promotion_basis?: string
          state?: string
          target_model_policy_version?: string
          target_pipeline_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_rollout_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
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
      platform_legal_documents: {
        Row: {
          acceptance_statement: string
          body_sections: Json
          created_at: string
          document_hash: string
          document_key: string
          effective_at: string
          id: string
          information_rights_statement: string
          locale: string
          rendered_text: string
          status: string
          title: string
          version: string
        }
        Insert: {
          acceptance_statement: string
          body_sections: Json
          created_at?: string
          document_hash: string
          document_key: string
          effective_at: string
          id?: string
          information_rights_statement: string
          locale: string
          rendered_text: string
          status?: string
          title: string
          version: string
        }
        Update: {
          acceptance_statement?: string
          body_sections?: Json
          created_at?: string
          document_hash?: string
          document_key?: string
          effective_at?: string
          id?: string
          information_rights_statement?: string
          locale?: string
          rendered_text?: string
          status?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      precedent_authorizations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          authorized_purposes: string[]
          created_at: string
          expires_at: string | null
          id: string
          revoked_at: string | null
          scope: Json
          source_opportunity_id: string
          source_organization_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          authorized_purposes: string[]
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          scope: Json
          source_opportunity_id: string
          source_organization_id: string
          status: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          authorized_purposes?: string[]
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          scope?: Json
          source_opportunity_id?: string
          source_organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "precedent_authorizations_source_organization_id_source_opp_fkey"
            columns: ["source_organization_id", "source_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pricing_observations: {
        Row: {
          aggregate_authorized: boolean
          amortization_class: string
          amount: number
          confidentiality: string
          created_at: string
          evidence_locator: Json
          fee_bps: number
          hedge_bps: number
          id: string
          indexer: string
          instrument: string
          normalization_method: string
          normalized_spread_bps: number | null
          observed_on: string
          oid_bps: number
          quality: number
          quoted_spread_bps: number
          rating: string
          regime: string
          sector_group: string
          security_class: string
          source_id: string
          source_kind: string
          source_owner: string
          status: string
          tenor_months: number
          valid_until: string
          warrant_bps: number
        }
        Insert: {
          aggregate_authorized?: boolean
          amortization_class: string
          amount: number
          confidentiality: string
          created_at?: string
          evidence_locator: Json
          fee_bps?: number
          hedge_bps?: number
          id?: string
          indexer: string
          instrument: string
          normalization_method: string
          normalized_spread_bps?: number | null
          observed_on: string
          oid_bps?: number
          quality: number
          quoted_spread_bps: number
          rating: string
          regime: string
          sector_group: string
          security_class: string
          source_id: string
          source_kind: string
          source_owner: string
          status: string
          tenor_months: number
          valid_until: string
          warrant_bps?: number
        }
        Update: {
          aggregate_authorized?: boolean
          amortization_class?: string
          amount?: number
          confidentiality?: string
          created_at?: string
          evidence_locator?: Json
          fee_bps?: number
          hedge_bps?: number
          id?: string
          indexer?: string
          instrument?: string
          normalization_method?: string
          normalized_spread_bps?: number | null
          observed_on?: string
          oid_bps?: number
          quality?: number
          quoted_spread_bps?: number
          rating?: string
          regime?: string
          sector_group?: string
          security_class?: string
          source_id?: string
          source_kind?: string
          source_owner?: string
          status?: string
          tenor_months?: number
          valid_until?: string
          warrant_bps?: number
        }
        Relationships: []
      }
      pricing_policies: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          default_indexer: string
          id: string
          index_levels: Json
          max_amount_ratio: number
          max_band_width_bps: number
          max_tenor_delta_months: number
          methodology_source: string
          min_amount_ratio: number
          min_band_width_bps: number
          min_distinct_sources: number
          min_observations: number
          min_quality: number
          regime: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          default_indexer: string
          id?: string
          index_levels: Json
          max_amount_ratio: number
          max_band_width_bps: number
          max_tenor_delta_months: number
          methodology_source: string
          min_amount_ratio: number
          min_band_width_bps: number
          min_distinct_sources: number
          min_observations: number
          min_quality: number
          regime: string
          status?: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
          version: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          default_indexer?: string
          id?: string
          index_levels?: Json
          max_amount_ratio?: number
          max_band_width_bps?: number
          max_tenor_delta_months?: number
          methodology_source?: string
          min_amount_ratio?: number
          min_band_width_bps?: number
          min_distinct_sources?: number
          min_observations?: number
          min_quality?: number
          regime?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          version?: string
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          attempts: number
          available_at: string
          capability_sha256: string | null
          controlled_execution_id: string | null
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
          controlled_execution_id?: string | null
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
          controlled_execution_id?: string | null
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
            foreignKeyName: "processing_jobs_controlled_execution_fkey"
            columns: ["organization_id", "controlled_execution_id"]
            isOneToOne: false
            referencedRelation: "controlled_case_executions"
            referencedColumns: ["organization_id", "id"]
          },
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
      project_representation_evidence: {
        Row: {
          created_at: string
          evidence_reference: string | null
          evidence_type: string
          id: string
          intake_session_id: string
          organization_id: string
          representation_kind: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          statement: string
          status: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_reference?: string | null
          evidence_type: string
          id?: string
          intake_session_id: string
          organization_id: string
          representation_kind: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement: string
          status?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_reference?: string | null
          evidence_type?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          representation_kind?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement?: string
          status?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_representation_eviden_organization_id_intake_sessi_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
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
      public_research_runs: {
        Row: {
          created_at: string
          created_by: string
          failures: Json
          id: string
          intake_session_id: string
          organization_id: string
          plan: Json
          processing_run_id: string
          provider_chain: Json
          query_fingerprint: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          failures?: Json
          id?: string
          intake_session_id: string
          organization_id: string
          plan: Json
          processing_run_id: string
          provider_chain?: Json
          query_fingerprint: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string
          failures?: Json
          id?: string
          intake_session_id?: string
          organization_id?: string
          plan?: Json
          processing_run_id?: string
          provider_chain?: Json
          query_fingerprint?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_research_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_research_runs_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "public_research_runs_organization_id_processing_run_id_fkey"
            columns: ["organization_id", "processing_run_id"]
            isOneToOne: false
            referencedRelation: "processing_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      public_research_sources: {
        Row: {
          content_hash: string
          context_class: string
          created_at: string
          id: string
          intake_session_id: string
          organization_id: string
          provider: string
          published_at: string | null
          research_run_id: string
          retrieved_at: string
          snippet: string
          title: string
          topic: string
          url: string
        }
        Insert: {
          content_hash: string
          context_class?: string
          created_at?: string
          id?: string
          intake_session_id: string
          organization_id: string
          provider: string
          published_at?: string | null
          research_run_id: string
          retrieved_at: string
          snippet?: string
          title: string
          topic: string
          url: string
        }
        Update: {
          content_hash?: string
          context_class?: string
          created_at?: string
          id?: string
          intake_session_id?: string
          organization_id?: string
          provider?: string
          published_at?: string | null
          research_run_id?: string
          retrieved_at?: string
          snippet?: string
          title?: string
          topic?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_research_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_research_sources_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "public_research_sources_organization_id_research_run_id_fkey"
            columns: ["organization_id", "research_run_id"]
            isOneToOne: false
            referencedRelation: "public_research_runs"
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
      qualified_introduction_feedback_events: {
        Row: {
          amount: number | null
          case_fingerprint: string
          created_at: string
          currency: string | null
          event_type: string
          id: string
          intake_session_id: string
          note: string | null
          occurred_at: string
          organization_id: string
          qualified_introduction_id: string
          reason_code: string | null
          recorded_by: string
          requested_information_count: number | null
          source_kind: string
          supersedes_event_id: string | null
          updated_at: string
          verification_state: string
        }
        Insert: {
          amount?: number | null
          case_fingerprint: string
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          intake_session_id: string
          note?: string | null
          occurred_at: string
          organization_id: string
          qualified_introduction_id: string
          reason_code?: string | null
          recorded_by: string
          requested_information_count?: number | null
          source_kind: string
          supersedes_event_id?: string | null
          updated_at?: string
          verification_state: string
        }
        Update: {
          amount?: number | null
          case_fingerprint?: string
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          intake_session_id?: string
          note?: string | null
          occurred_at?: string
          organization_id?: string
          qualified_introduction_id?: string
          reason_code?: string | null
          recorded_by?: string
          requested_information_count?: number | null
          source_kind?: string
          supersedes_event_id?: string | null
          updated_at?: string
          verification_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualified_introduction_feedba_organization_id_intake_sessi_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_feedba_organization_id_qualified_in_fkey"
            columns: ["organization_id", "qualified_introduction_id"]
            isOneToOne: false
            referencedRelation: "qualified_introductions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_feedba_organization_id_supersedes_e_fkey"
            columns: ["organization_id", "supersedes_event_id"]
            isOneToOne: false
            referencedRelation: "qualified_introduction_feedback_events"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      qualified_introduction_plans: {
        Row: {
          authorization_snapshot: Json | null
          authorized_at: string | null
          authorized_by: string | null
          case_fingerprint: string
          created_at: string
          created_by: string
          id: string
          identity_policy: string
          intake_session_id: string
          material_fingerprint: string
          match_screen_fingerprint: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          technical_review_fingerprint: string | null
          technical_reviewed_at: string | null
          technical_reviewed_by: string | null
          updated_at: string
          wave_limit: number
        }
        Insert: {
          authorization_snapshot?: Json | null
          authorized_at?: string | null
          authorized_by?: string | null
          case_fingerprint: string
          created_at?: string
          created_by: string
          id?: string
          identity_policy?: string
          intake_session_id: string
          material_fingerprint: string
          match_screen_fingerprint?: string | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          technical_review_fingerprint?: string | null
          technical_reviewed_at?: string | null
          technical_reviewed_by?: string | null
          updated_at?: string
          wave_limit: number
        }
        Update: {
          authorization_snapshot?: Json | null
          authorized_at?: string | null
          authorized_by?: string | null
          case_fingerprint?: string
          created_at?: string
          created_by?: string
          id?: string
          identity_policy?: string
          intake_session_id?: string
          material_fingerprint?: string
          match_screen_fingerprint?: string | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          technical_review_fingerprint?: string | null
          technical_reviewed_at?: string | null
          technical_reviewed_by?: string | null
          updated_at?: string
          wave_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "qualified_introduction_plans_organization_id_intake_sessio_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      qualified_introduction_targets: {
        Row: {
          contact_status: string
          created_at: string
          created_by: string
          fund_directory_id: string | null
          id: string
          intake_session_id: string
          mandate_fingerprint: string
          mandate_revalidated_at: string | null
          mandate_revalidated_by: string | null
          mandate_revalidation_note: string | null
          match_screen_fingerprint: string
          organization_id: string
          plan_id: string
          position: number
          provider_fund_id: string | null
          provider_id: string
          provider_kind: string
          provider_name: string
          provider_organization_id: string | null
          provider_source: string
          rationale: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_contact_email: string | null
          resolved_contact_id: string | null
          resolved_contact_job_title: string | null
          resolved_contact_name: string | null
          resolved_contact_source: string | null
          updated_at: string
        }
        Insert: {
          contact_status?: string
          created_at?: string
          created_by: string
          fund_directory_id?: string | null
          id?: string
          intake_session_id: string
          mandate_fingerprint: string
          mandate_revalidated_at?: string | null
          mandate_revalidated_by?: string | null
          mandate_revalidation_note?: string | null
          match_screen_fingerprint: string
          organization_id: string
          plan_id: string
          position: number
          provider_fund_id?: string | null
          provider_id: string
          provider_kind: string
          provider_name: string
          provider_organization_id?: string | null
          provider_source: string
          rationale: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_contact_email?: string | null
          resolved_contact_id?: string | null
          resolved_contact_job_title?: string | null
          resolved_contact_name?: string | null
          resolved_contact_source?: string | null
          updated_at?: string
        }
        Update: {
          contact_status?: string
          created_at?: string
          created_by?: string
          fund_directory_id?: string | null
          id?: string
          intake_session_id?: string
          mandate_fingerprint?: string
          mandate_revalidated_at?: string | null
          mandate_revalidated_by?: string | null
          mandate_revalidation_note?: string | null
          match_screen_fingerprint?: string
          organization_id?: string
          plan_id?: string
          position?: number
          provider_fund_id?: string | null
          provider_id?: string
          provider_kind?: string
          provider_name?: string
          provider_organization_id?: string | null
          provider_source?: string
          rationale?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_contact_email?: string | null
          resolved_contact_id?: string | null
          resolved_contact_job_title?: string | null
          resolved_contact_name?: string | null
          resolved_contact_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualified_introduction_targets_fund_directory_id_fkey"
            columns: ["fund_directory_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualified_introduction_targets_organization_id_intake_sess_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_targets_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "qualified_introduction_plans"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_targets_provider_organization_id_pro_fkey"
            columns: ["provider_organization_id", "provider_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      qualified_introduction_recipients: {
        Row: {
          contact_email: string | null
          contact_id: string
          contact_job_title: string | null
          contact_name: string
          contact_source: string
          contact_uuid: string | null
          created_at: string
          fund_directory_id: string | null
          id: string
          intake_session_id: string
          is_anchor: boolean
          mandate_fingerprint: string
          material_manifest: Json
          organization_id: string
          plan_id: string
          position: number
          provider_fund_id: string | null
          provider_id: string
          provider_organization_id: string | null
          provider_source: string
          rationale: string
          recipient_name: string
          target_id: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_id: string
          contact_job_title?: string | null
          contact_name: string
          contact_source?: string
          contact_uuid?: string | null
          created_at?: string
          fund_directory_id?: string | null
          id?: string
          intake_session_id: string
          is_anchor?: boolean
          mandate_fingerprint: string
          material_manifest: Json
          organization_id: string
          plan_id: string
          position: number
          provider_fund_id?: string | null
          provider_id: string
          provider_organization_id?: string | null
          provider_source?: string
          rationale: string
          recipient_name: string
          target_id?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_id?: string
          contact_job_title?: string | null
          contact_name?: string
          contact_source?: string
          contact_uuid?: string | null
          created_at?: string
          fund_directory_id?: string | null
          id?: string
          intake_session_id?: string
          is_anchor?: boolean
          mandate_fingerprint?: string
          material_manifest?: Json
          organization_id?: string
          plan_id?: string
          position?: number
          provider_fund_id?: string | null
          provider_id?: string
          provider_organization_id?: string | null
          provider_source?: string
          rationale?: string
          recipient_name?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qualified_introduction_recipi_organization_id_intake_sessi_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_recipients_fund_directory_id_fkey"
            columns: ["fund_directory_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualified_introduction_recipients_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "qualified_introduction_plans"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_recipients_registered_fund_fk"
            columns: ["provider_organization_id", "provider_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introduction_recipients_target_fk"
            columns: ["organization_id", "target_id"]
            isOneToOne: true
            referencedRelation: "qualified_introduction_targets"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      qualified_introductions: {
        Row: {
          authorization_snapshot: Json
          case_fingerprint: string
          contact_email: string | null
          contact_id: string
          contact_job_title: string | null
          contact_name: string | null
          contact_source: string
          contact_uuid: string | null
          delivery_channel: string | null
          delivery_reference: string | null
          fund_directory_id: string | null
          id: string
          intake_session_id: string
          introduced_at: string
          introduced_by: string
          mandate_fingerprint: string
          material_fingerprint: string
          material_manifest: Json
          organization_id: string
          plan_id: string
          provider_fund_id: string | null
          provider_id: string
          provider_organization_id: string | null
          provider_source: string
          rationale: string
          recipient_id: string
        }
        Insert: {
          authorization_snapshot: Json
          case_fingerprint: string
          contact_email?: string | null
          contact_id: string
          contact_job_title?: string | null
          contact_name?: string | null
          contact_source?: string
          contact_uuid?: string | null
          delivery_channel?: string | null
          delivery_reference?: string | null
          fund_directory_id?: string | null
          id?: string
          intake_session_id: string
          introduced_at?: string
          introduced_by: string
          mandate_fingerprint: string
          material_fingerprint: string
          material_manifest: Json
          organization_id: string
          plan_id: string
          provider_fund_id?: string | null
          provider_id: string
          provider_organization_id?: string | null
          provider_source?: string
          rationale: string
          recipient_id: string
        }
        Update: {
          authorization_snapshot?: Json
          case_fingerprint?: string
          contact_email?: string | null
          contact_id?: string
          contact_job_title?: string | null
          contact_name?: string | null
          contact_source?: string
          contact_uuid?: string | null
          delivery_channel?: string | null
          delivery_reference?: string | null
          fund_directory_id?: string | null
          id?: string
          intake_session_id?: string
          introduced_at?: string
          introduced_by?: string
          mandate_fingerprint?: string
          material_fingerprint?: string
          material_manifest?: Json
          organization_id?: string
          plan_id?: string
          provider_fund_id?: string | null
          provider_id?: string
          provider_organization_id?: string | null
          provider_source?: string
          rationale?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualified_introductions_fund_directory_id_fkey"
            columns: ["fund_directory_id"]
            isOneToOne: false
            referencedRelation: "fund_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualified_introductions_organization_id_intake_session_id_fkey"
            columns: ["organization_id", "intake_session_id"]
            isOneToOne: false
            referencedRelation: "document_intake_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introductions_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "qualified_introduction_plans"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introductions_organization_id_recipient_id_fkey"
            columns: ["organization_id", "recipient_id"]
            isOneToOne: true
            referencedRelation: "qualified_introduction_recipients"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "qualified_introductions_registered_fund_fk"
            columns: ["provider_organization_id", "provider_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      red_flag_policies: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          materiality: Json
          methodology_source: string
          response_sla: Json
          status: string
          thresholds: Json
          updated_at: string
          valid_from: string
          valid_until: string | null
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          materiality?: Json
          methodology_source: string
          response_sla?: Json
          status?: string
          thresholds?: Json
          updated_at?: string
          valid_from: string
          valid_until?: string | null
          version: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          materiality?: Json
          methodology_source?: string
          response_sla?: Json
          status?: string
          thresholds?: Json
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          version?: string
        }
        Relationships: []
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
      accept_and_apply_agent_operation_brief_proposal: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_proposal_id: string
        }
        Returns: Json
      }
      accept_intake_candidates: {
        Args: {
          p_candidate_ids: string[]
          p_organization_id: string
          p_session_id: string
        }
        Returns: number
      }
      accept_private_workspace_terms: {
        Args: {
          p_information_rights_declared: boolean
          p_locale: string
          p_signatory_name: string
          p_signatory_title: string
          p_terms_agreed: boolean
        }
        Returns: string
      }
      apply_agent_operation_brief_proposal: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_proposal_id: string
        }
        Returns: Json
      }
      attach_intake_session_to_opportunity: {
        Args: {
          p_opportunity_id: string
          p_organization_id: string
          p_session_id: string
        }
        Returns: Json
      }
      authorize_qualified_introduction_plan: {
        Args: { p_material_fingerprint: string; p_plan_id: string }
        Returns: string
      }
      approve_match_shortlist: {
        Args: {
          p_match_screen_fingerprint: string
          p_organization_id: string
          p_selected_provider_ids: string[]
          p_session_id: string
        }
        Returns: string
      }
      approve_match_shortlist_and_prepare_plan: {
        Args: {
          p_match_screen_fingerprint: string
          p_organization_id: string
          p_selected_provider_ids: string[]
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
      enqueue_deal_state_analysis: {
        Args: {
          p_organization_id: string
          p_session_id: string
          p_trigger_source: string
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
      decide_agent_change_proposal: {
        Args: {
          p_decision: string
          p_organization_id: string
          p_proposal_id: string
          p_reason: string
        }
        Returns: string
      }
      decide_offroad_mandate: {
        Args: {
          p_assessment_fingerprint: string
          p_conditions?: Json
          p_decision: string
          p_intake_session_id: string
          p_organization_id: string
          p_path_back?: string
          p_reason_codes?: Json
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
      get_onboarding_bootstrap: { Args: { p_locale: string }; Returns: Json }
      get_workspace_bootstrap: { Args: never; Returns: Json }
      get_workspace_project_setup: {
        Args: { p_locale: string }
        Returns: Json
      }
      manage_workspace_project: {
        Args: {
          p_action: string
          p_project_name?: string
          p_session_id: string
        }
        Returns: Json
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
      start_onboarding_project: {
        Args: {
          p_identity_policy: string
          p_locale: string
          p_project_name: string
          p_representation_declared: boolean
        }
        Returns: string
      }
      start_workspace_project: {
        Args: {
          p_identity_policy: string
          p_locale: string
          p_project_name: string
          p_representation_declared: boolean
        }
        Returns: string
      }
      update_workspace_project: {
        Args: {
          p_identity_policy: string
          p_project_name: string
          p_session_id: string
        }
        Returns: string
      }
      read_processing_model_lineage: {
        Args: {
          p_organization_id: string
          p_processing_run_id?: string
          p_session_id: string
        }
        Returns: Json
      }
      record_agent_change_proposal: {
        Args: {
          p_organization_id: string
          p_proposal: Json
          p_session_id: string
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
      record_case_snapshot: {
        Args: {
          p_case_state: Json
          p_manifest: Json
          p_organization_id: string
          p_processing_run_id: string
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
      record_deal_state_object: {
        Args: {
          p_dependencies?: Json
          p_input_fingerprint: string
          p_object_type: string
          p_organization_id: string
          p_payload: Json
          p_session_id: string
          p_status: string
        }
        Returns: string
      }
      record_decline_communication: {
        Args: {
          p_channel: string
          p_intake_session_id: string
          p_mandate_decision_fingerprint: string
          p_mandate_decision_id: string
          p_message_fingerprint: string
          p_organization_id: string
          p_recipient: string
        }
        Returns: string
      }
      record_diligence_surprise: {
        Args: {
          p_corrective_action_id?: string
          p_description: string
          p_intake_session_id: string
          p_organization_id: string
          p_responsible_procedure_id?: string
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
      record_intake_capital_need_command: {
        Args: {
          p_collateral_kinds?: string[]
          p_consequence?: string
          p_currency?: string
          p_event_id: string
          p_expected_rate?: string
          p_geography?: string
          p_instruments?: string[]
          p_objective?: string
          p_organization_id: string
          p_requested_amount?: number
          p_requested_grace_months?: number
          p_requested_term_months?: number
          p_sector?: string
          p_session_id: string
          p_urgency?: string
          p_use_of_proceeds: string
        }
        Returns: Json
      }
      record_intake_information_command: {
        Args: {
          p_answer?: string
          p_event_id: string
          p_note?: string
          p_organization_id: string
          p_requirement_id: string
          p_response?: string
          p_session_id: string
        }
        Returns: Json
      }
      record_intake_request_ladders_command: {
        Args: {
          p_events: Json
          p_organization_id: string
          p_session_id: string
        }
        Returns: Json
      }
      record_material_communication: {
        Args: {
          p_channel: string
          p_content_fingerprint: string
          p_has_material_commitment?: boolean
          p_intake_session_id: string
          p_organization_id: string
          p_package_fingerprint: string
          p_recipient_id: string
        }
        Returns: string
      }
      record_qualified_introduction_feedback: {
        Args: {
          p_amount?: number
          p_currency?: string
          p_event_type: string
          p_introduction_id: string
          p_note?: string
          p_occurred_at: string
          p_reason_code?: string
          p_requested_information_count?: number
          p_source_kind: string
          p_supersedes_event_id?: string
          p_verification_state: string
        }
        Returns: string
      }
      register_intake_document_command: {
        Args: {
          p_bucket_id: string
          p_byte_size: number
          p_document_id: string
          p_event_id: string
          p_mime_type: string
          p_object_path: string
          p_organization_id: string
          p_original_name: string
          p_session_id: string
          p_sha256: string
        }
        Returns: Json
      }
      remove_intake_document_command: {
        Args: {
          p_document_id: string
          p_event_id: string
          p_organization_id: string
          p_session_id: string
        }
        Returns: Json
      }
      resolve_analysis_scope_suggestion_command: {
        Args: {
          p_decision: string
          p_organization_id: string
          p_reason: string
          p_role: string
          p_scope_event_id: string
          p_session_id: string
          p_suggestion_event_id: string
          p_suggestion_id: string
        }
        Returns: Json
      }
      restart_onboarding_intake: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: undefined
      }
      review_case_red_flag: {
        Args: {
          p_decision: string
          p_evidence_ids?: Json
          p_flag_fingerprint: string
          p_flag_id: string
          p_intake_session_id: string
          p_organization_id: string
          p_rationale: string
        }
        Returns: string
      }
      review_engagement_conflict: {
        Args: {
          p_case_fingerprint: string
          p_counterparties: Json
          p_intake_session_id: string
          p_organization_id: string
          p_rationale: string
          p_status: string
        }
        Returns: string
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
      revoke_advisor_authorization_command: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_reason: string
          p_session_id: string
        }
        Returns: Json
      }
      revoke_qualified_introduction_plan: {
        Args: { p_plan_id: string }
        Returns: string
      }
      save_guided_company_profile: {
        Args: {
          p_description: string
          p_identifier_hash: string
          p_identifier_last4: string
          p_legal_name: string
          p_name: string
          p_session_id: string
          p_website: string
        }
        Returns: undefined
      }
      save_project_company_profile: {
        Args: {
          p_description: string
          p_identifier_hash: string
          p_identifier_last4: string
          p_legal_name: string
          p_name: string
          p_session_id: string
          p_website: string
        }
        Returns: undefined
      }
      search_case_retrieval: {
        Args: {
          p_limit?: number
          p_opportunity_id: string
          p_organization_id: string
          p_query: string
        }
        Returns: {
          chunk_id: string
          citation_key: string
          content: string
          score: number
          source_anchor: Json
          source_document_id: string
        }[]
      }
      set_intake_archetype_command: {
        Args: {
          p_archetype: string
          p_confidence: string
          p_event_id: string
          p_organization_id: string
          p_rationale: string
          p_retest_triggers?: string[]
          p_session_id: string
        }
        Returns: Json
      }
      set_intake_operation_command: {
        Args: {
          p_archetype: string
          p_confidence: string
          p_frame_event_id: string
          p_organization_id: string
          p_rationale: string
          p_retest_triggers?: string[]
          p_route_event_id: string
          p_session_id: string
        }
        Returns: Json
      }
      set_intake_operation_context_command: {
        Args: {
          p_archetype: string
          p_authority_kind?: string
          p_authority_reference?: string
          p_authorization_event_id: string
          p_client_legal_name?: string
          p_confidence: string
          p_early_triage_event_id: string
          p_frame_event_id: string
          p_group_scope_event_id: string
          p_organization_id: string
          p_rationale: string
          p_retest_triggers?: string[]
          p_route_event_id: string
          p_scope_event_id: string
          p_session_id: string
        }
        Returns: Json
      }
      start_onboarding_intake: {
        Args: {
          p_identity_policy: string
          p_locale: string
          p_project_name: string
          p_representation_declared: boolean
        }
        Returns: string
      }
      start_workspace_intake: {
        Args: {
          p_identity_policy: string
          p_locale: string
          p_organization_id: string
          p_project_name: string
          p_representation_declared: boolean
        }
        Returns: string
      }
      submit_agent_message: {
        Args: {
          p_content: string
          p_locale: string
          p_message_id: string
          p_organization_id: string
          p_session_id: string
        }
        Returns: Json
      }
      verify_advisor_authorization_command: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_reason: string
          p_session_id: string
        }
        Returns: Json
      }
      worker_claim_job: {
        Args: { p_lease_seconds?: number; p_worker_token: string }
        Returns: Json
      }
      worker_complete_job: {
        Args: { p_capability_token: string; p_job_id: string; p_result?: Json }
        Returns: Json
      }
      worker_document_advisor_authorization: {
        Args: {
          p_capability_token: string
          p_event_id: string
          p_job_id: string
        }
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
      worker_freeze_case_input: {
        Args: {
          p_capability_token: string
          p_job_id: string
          p_live_input: Json
        }
        Returns: Json
      }
      worker_heartbeat: {
        Args: {
          p_capability_token: string
          p_job_id: string
          p_lease_seconds?: number
        }
        Returns: Json
      }
      worker_load_agent_context: {
        Args: { p_capability_token: string; p_job_id: string }
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
      worker_load_intake_events: {
        Args: { p_capability_token: string; p_job_id: string }
        Returns: Json
      }
      worker_load_receivables_evidence: {
        Args: { p_capability_token: string; p_job_id: string }
        Returns: Json
      }
      worker_load_receivables_provider_context: {
        Args: { p_capability_token: string; p_job_id: string }
        Returns: Json
      }
      worker_load_retrieval_context: {
        Args: {
          p_allowed_fund_ids?: string[]
          p_capability_token: string
          p_job_id: string
          p_limit?: number
          p_precedent_purpose?: string
          p_query: string
        }
        Returns: Json
      }
      worker_record_agent_failure: {
        Args: {
          p_capability_token: string
          p_error_code: string
          p_job_id: string
        }
        Returns: undefined
      }
      worker_record_agent_response: {
        Args: {
          p_assistant_message_id: string
          p_capability_token: string
          p_job_id: string
          p_proposal?: Json
          p_response: Json
        }
        Returns: Json
      }
      worker_record_analysis_scope_suggestions: {
        Args: {
          p_capability_token: string
          p_event_id: string
          p_job_id: string
          p_suggestions: Json
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
      worker_record_case_snapshot: {
        Args: {
          p_capability_token: string
          p_case_state: Json
          p_job_id: string
          p_manifest: Json
        }
        Returns: string
      }
      worker_record_controlled_execution: {
        Args: {
          p_capability_token: string
          p_comparison?: Json
          p_job_id: string
          p_manifest: Json
          p_report: Json
        }
        Returns: string
      }
      worker_record_deal_state_object: {
        Args: {
          p_capability_token: string
          p_dependencies?: Json
          p_input_fingerprint: string
          p_job_id: string
          p_object_type: string
          p_payload: Json
          p_status: string
        }
        Returns: string
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
      worker_record_intake_request_ladders: {
        Args: { p_capability_token: string; p_events: Json; p_job_id: string }
        Returns: Json
      }
      worker_record_public_research: {
        Args: {
          p_capability_token: string
          p_job_id: string
          p_plan: Json
          p_result: Json
        }
        Returns: string
      }
      worker_record_receivables_evidence: {
        Args: {
          p_capability_token: string
          p_content_kind: string
          p_content_sha256: string
          p_job_id: string
          p_payload_base64: string
          p_payload_sha256: string
          p_schema_version: string
          p_source_sha256: string
          p_uncompressed_bytes: number
        }
        Returns: Json
      }
      worker_record_retrieval_chunks: {
        Args: { p_capability_token: string; p_chunks: Json; p_job_id: string }
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
