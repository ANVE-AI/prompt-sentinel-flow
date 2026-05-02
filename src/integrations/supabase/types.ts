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
      api_keys: {
        Row: {
          created_at: string
          custom_auth_header: string | null
          custom_auth_scheme: string | null
          custom_base_url: string | null
          custom_chat_path: string | null
          custom_extra_headers: Json | null
          custom_kind: string | null
          custom_model_suggestions: string[] | null
          custom_models_path: string | null
          custom_models_url: string | null
          custom_path_prefix: string | null
          custom_response_format: string | null
          endpoint_id: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          model_default: string
          name: string
          provider: string
          provider_key_encrypted: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_auth_header?: string | null
          custom_auth_scheme?: string | null
          custom_base_url?: string | null
          custom_chat_path?: string | null
          custom_extra_headers?: Json | null
          custom_kind?: string | null
          custom_model_suggestions?: string[] | null
          custom_models_path?: string | null
          custom_models_url?: string | null
          custom_path_prefix?: string | null
          custom_response_format?: string | null
          endpoint_id?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          model_default?: string
          name: string
          provider: string
          provider_key_encrypted?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_auth_header?: string | null
          custom_auth_scheme?: string | null
          custom_base_url?: string | null
          custom_chat_path?: string | null
          custom_extra_headers?: Json | null
          custom_kind?: string | null
          custom_model_suggestions?: string[] | null
          custom_models_path?: string | null
          custom_models_url?: string | null
          custom_path_prefix?: string | null
          custom_response_format?: string | null
          endpoint_id?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          model_default?: string
          name?: string
          provider?: string
          provider_key_encrypted?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
          user_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
          user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      endpoint_shares: {
        Row: {
          created_at: string
          endpoint_id: string
          id: string
          owner_user_id: string
          permission: string
          shared_with_email: string
          shared_with_user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          id?: string
          owner_user_id: string
          permission?: string
          shared_with_email: string
          shared_with_user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          id?: string
          owner_user_id?: string
          permission?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_shares_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoints: {
        Row: {
          auth_header: string | null
          auth_scheme: string
          base_url: string
          chat_path: string | null
          created_at: string
          default_model: string | null
          extra_headers: Json
          id: string
          kind: string
          model_suggestions: string[]
          models_path: string | null
          models_url: string | null
          name: string
          path_prefix: string | null
          provider_key_encrypted: string | null
          response_format: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_header?: string | null
          auth_scheme?: string
          base_url: string
          chat_path?: string | null
          created_at?: string
          default_model?: string | null
          extra_headers?: Json
          id?: string
          kind?: string
          model_suggestions?: string[]
          models_path?: string | null
          models_url?: string | null
          name: string
          path_prefix?: string | null
          provider_key_encrypted?: string | null
          response_format?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_header?: string | null
          auth_scheme?: string
          base_url?: string
          chat_path?: string | null
          created_at?: string
          default_model?: string | null
          extra_headers?: Json
          id?: string
          kind?: string
          model_suggestions?: string[]
          models_path?: string | null
          models_url?: string | null
          name?: string
          path_prefix?: string | null
          provider_key_encrypted?: string | null
          response_format?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      key_behavior_profiles: {
        Row: {
          api_key_id: string
          encoded_ratio_mean: number
          prompt_len_m2: number
          prompt_len_mean: number
          sample_count: number
          top_models: Json
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          api_key_id: string
          encoded_ratio_mean?: number
          prompt_len_m2?: number
          prompt_len_mean?: number
          sample_count?: number
          top_models?: Json
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          api_key_id?: string
          encoded_ratio_mean?: number
          prompt_len_m2?: number
          prompt_len_mean?: number
          sample_count?: number
          top_models?: Json
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      model_aliases: {
        Row: {
          alias: string
          api_key_id: string
          created_at: string
          id: string
          target_endpoint_id: string | null
          target_model: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alias: string
          api_key_id: string
          created_at?: string
          id?: string
          target_endpoint_id?: string | null
          target_model: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string
          api_key_id?: string
          created_at?: string
          id?: string
          target_endpoint_id?: string | null
          target_model?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          allowed_keywords: string[]
          block_message: string
          blocked_keywords: string[]
          updated_at: string
          use_global_defaults: boolean
          user_id: string
        }
        Insert: {
          allowed_keywords?: string[]
          block_message?: string
          blocked_keywords?: string[]
          updated_at?: string
          use_global_defaults?: boolean
          user_id: string
        }
        Update: {
          allowed_keywords?: string[]
          block_message?: string
          blocked_keywords?: string[]
          updated_at?: string
          use_global_defaults?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      policy_intents: {
        Row: {
          action: string
          created_at: string
          id: string
          intent: string
          min_confidence: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          intent: string
          min_confidence?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          intent?: string
          min_confidence?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_rules: {
        Row: {
          applies_to_intents: string[]
          config: Json
          created_at: string
          direction: string
          enabled: boolean
          id: string
          kind: string
          name: string
          severity: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applies_to_intents?: string[]
          config?: Json
          created_at?: string
          direction?: string
          enabled?: boolean
          id?: string
          kind: string
          name: string
          severity?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applies_to_intents?: string[]
          config?: Json
          created_at?: string
          direction?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
          severity?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_settings: {
        Row: {
          behavioral_action: string
          behavioral_churn_threshold: number
          behavioral_encoding_ratio_step: number
          behavioral_length_multiplier: number
          behavioral_persona_threshold: number
          created_at: string
          enable_behavioral: boolean
          enable_fuzzy_keywords: boolean
          enable_heuristics: boolean
          enable_injection_guard: boolean
          enable_intent: boolean
          enable_normalizer: boolean
          enable_patterns: boolean
          enable_semantic_keywords: boolean
          injection_action: string
          intent_shadow_mode: boolean
          semantic_threshold: number
          strict_mode: boolean
          throttle_flag_threshold: number
          throttle_window_minutes: number
          updated_at: string
          user_id: string
          workspace_purpose: string | null
        }
        Insert: {
          behavioral_action?: string
          behavioral_churn_threshold?: number
          behavioral_encoding_ratio_step?: number
          behavioral_length_multiplier?: number
          behavioral_persona_threshold?: number
          created_at?: string
          enable_behavioral?: boolean
          enable_fuzzy_keywords?: boolean
          enable_heuristics?: boolean
          enable_injection_guard?: boolean
          enable_intent?: boolean
          enable_normalizer?: boolean
          enable_patterns?: boolean
          enable_semantic_keywords?: boolean
          injection_action?: string
          intent_shadow_mode?: boolean
          semantic_threshold?: number
          strict_mode?: boolean
          throttle_flag_threshold?: number
          throttle_window_minutes?: number
          updated_at?: string
          user_id: string
          workspace_purpose?: string | null
        }
        Update: {
          behavioral_action?: string
          behavioral_churn_threshold?: number
          behavioral_encoding_ratio_step?: number
          behavioral_length_multiplier?: number
          behavioral_persona_threshold?: number
          created_at?: string
          enable_behavioral?: boolean
          enable_fuzzy_keywords?: boolean
          enable_heuristics?: boolean
          enable_injection_guard?: boolean
          enable_intent?: boolean
          enable_normalizer?: boolean
          enable_patterns?: boolean
          enable_semantic_keywords?: boolean
          injection_action?: string
          intent_shadow_mode?: boolean
          semantic_threshold?: number
          strict_mode?: boolean
          throttle_flag_threshold?: number
          throttle_window_minutes?: number
          updated_at?: string
          user_id?: string
          workspace_purpose?: string | null
        }
        Relationships: []
      }
      policy_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          policy: Json
          rules: Json
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          policy?: Json
          rules?: Json
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          policy?: Json
          rules?: Json
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          clerk_user_id: string
          created_at: string
          email: string | null
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          email?: string | null
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      request_logs: {
        Row: {
          api_key_id: string | null
          block_reason: string | null
          created_at: string
          detected_intent: string | null
          id: string
          intent_confidence: number | null
          latency_ms: number | null
          messages: Json | null
          model: string | null
          provider: string
          response: Json | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
          verdict: string | null
          verdict_layers: Json | null
        }
        Insert: {
          api_key_id?: string | null
          block_reason?: string | null
          created_at?: string
          detected_intent?: string | null
          id?: string
          intent_confidence?: number | null
          latency_ms?: number | null
          messages?: Json | null
          model?: string | null
          provider: string
          response?: Json | null
          status: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
          verdict?: string | null
          verdict_layers?: Json | null
        }
        Update: {
          api_key_id?: string | null
          block_reason?: string | null
          created_at?: string
          detected_intent?: string | null
          id?: string
          intent_confidence?: number | null
          latency_ms?: number | null
          messages?: Json | null
          model?: string | null
          provider?: string
          response?: Json | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
          verdict?: string | null
          verdict_layers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      route_steps: {
        Row: {
          created_at: string
          endpoint_id: string
          id: string
          model: string
          position: number
          route_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          id?: string
          model: string
          position: number
          route_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          id?: string
          model?: string
          position?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_steps_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          description: string | null
          fallback_on_429: boolean
          fallback_on_5xx: boolean
          fallback_on_timeout: boolean
          id: string
          name: string
          timeout_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fallback_on_429?: boolean
          fallback_on_5xx?: boolean
          fallback_on_timeout?: boolean
          id?: string
          name: string
          timeout_ms?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fallback_on_429?: boolean
          fallback_on_5xx?: boolean
          fallback_on_timeout?: boolean
          id?: string
          name?: string
          timeout_ms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_endpoint_shares: {
        Args: { _email: string; _user_id: string }
        Returns: number
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
