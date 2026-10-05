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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      action_requests: {
        Row: {
          ai_reasoning: string | null
          conversation_id: string
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          error: string | null
          executed_at: string | null
          id: string
          options: Json
          payload: Json
          result: Json | null
          shop_id: string
          status: Database["public"]["Enums"]["action_status"]
          type: Database["public"]["Enums"]["action_type"]
        }
        Insert: {
          ai_reasoning?: string | null
          conversation_id: string
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          options?: Json
          payload: Json
          result?: Json | null
          shop_id: string
          status?: Database["public"]["Enums"]["action_status"]
          type: Database["public"]["Enums"]["action_type"]
        }
        Update: {
          ai_reasoning?: string | null
          conversation_id?: string
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          options?: Json
          payload?: Json
          result?: Json | null
          shop_id?: string
          status?: Database["public"]["Enums"]["action_status"]
          type?: Database["public"]["Enums"]["action_type"]
        }
        Relationships: [
          {
            foreignKeyName: "action_requests_conversation_id_shop_id_fkey"
            columns: ["conversation_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "action_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          category: Database["public"]["Enums"]["auto_category"]
          confidence_threshold: number
          mode: Database["public"]["Enums"]["auto_mode"]
          shop_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["auto_category"]
          confidence_threshold?: number
          mode?: Database["public"]["Enums"]["auto_mode"]
          shop_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["auto_category"]
          confidence_threshold?: number
          mode?: Database["public"]["Enums"]["auto_mode"]
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused: boolean
          channel: Database["public"]["Enums"]["channel"]
          created_at: string | null
          customer_id: string | null
          external_thread_id: string | null
          id: string
          last_message_at: string | null
          reply_token: string
          sentiment: string | null
          shop_id: string
          status: Database["public"]["Enums"]["conv_status"]
          subject: string | null
          tags: string[]
        }
        Insert: {
          ai_paused?: boolean
          channel: Database["public"]["Enums"]["channel"]
          created_at?: string | null
          customer_id?: string | null
          external_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          reply_token?: string
          sentiment?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["conv_status"]
          subject?: string | null
          tags?: string[]
        }
        Update: {
          ai_paused?: boolean
          channel?: Database["public"]["Enums"]["channel"]
          created_at?: string | null
          customer_id?: string | null
          external_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          reply_token?: string
          sentiment?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["conv_status"]
          subject?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "conversations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          email: string | null
          id: string
          name: string | null
          shop_id: string
          shopify_customer_id: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          name?: string | null
          shop_id: string
          shopify_customer_id?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          name?: string | null
          shop_id?: string
          shopify_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          conversation_id: string | null
          created_at: string | null
          id: number
          rating: number | null
          shop_id: string
        }
        Insert: {
          comment?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: number
          rating?: number | null
          shop_id: string
        }
        Update: {
          comment?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: number
          rating?: number | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_conversation_id_shop_id_fkey"
            columns: ["conversation_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      filtered_emails: {
        Row: {
          created_at: string | null
          from_email: string | null
          id: number
          reason: string | null
          shop_id: string
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          from_email?: string | null
          id?: number
          reason?: string | null
          shop_id: string
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          from_email?: string | null
          id?: number
          reason?: string | null
          shop_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filtered_emails_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge: {
        Row: {
          content: string
          id: string
          kind: Database["public"]["Enums"]["knowledge_kind"]
          shop_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          id?: string
          kind: Database["public"]["Enums"]["knowledge_kind"]
          shop_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          id?: string
          kind?: Database["public"]["Enums"]["knowledge_kind"]
          shop_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          confidence: number | null
          conversation_id: string
          created_at: string | null
          delivered_at: string | null
          delivery_error: string | null
          external_message_id: string | null
          id: string
          reasoning: string | null
          rfc_message_id: string | null
          role: Database["public"]["Enums"]["msg_role"]
          shop_id: string
          status: Database["public"]["Enums"]["msg_status"]
        }
        Insert: {
          body: string
          confidence?: number | null
          conversation_id: string
          created_at?: string | null
          delivered_at?: string | null
          delivery_error?: string | null
          external_message_id?: string | null
          id?: string
          reasoning?: string | null
          rfc_message_id?: string | null
          role: Database["public"]["Enums"]["msg_role"]
          shop_id: string
          status: Database["public"]["Enums"]["msg_status"]
        }
        Update: {
          body?: string
          confidence?: number | null
          conversation_id?: string
          created_at?: string | null
          delivered_at?: string | null
          delivery_error?: string | null
          external_message_id?: string | null
          id?: string
          reasoning?: string | null
          rfc_message_id?: string | null
          role?: Database["public"]["Enums"]["msg_role"]
          shop_id?: string
          status?: Database["public"]["Enums"]["msg_status"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_shop_id_fkey"
            columns: ["conversation_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "messages_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          role: string
          shop_id: string
          user_id: string
        }
        Insert: {
          role?: string
          shop_id: string
          user_id: string
        }
        Update: {
          role?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          agent_name: string
          agent_tone: string
          cancel_at_period_end: boolean
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          inbound_email: string | null
          inbound_hash: string
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          setup: Json
          shopify_connected_at: string | null
          shopify_domain: string | null
          shopify_refresh_expires_at: string | null
          shopify_refresh_token_enc: string | null
          shopify_scopes: string | null
          shopify_token_enc: string | null
          shopify_token_expires_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          support_from_email: string | null
          trial_ends_at: string | null
        }
        Insert: {
          agent_name?: string
          agent_tone?: string
          cancel_at_period_end?: boolean
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          inbound_email?: string | null
          inbound_hash?: string
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          setup?: Json
          shopify_connected_at?: string | null
          shopify_domain?: string | null
          shopify_refresh_expires_at?: string | null
          shopify_refresh_token_enc?: string | null
          shopify_scopes?: string | null
          shopify_token_enc?: string | null
          shopify_token_expires_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          support_from_email?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          agent_name?: string
          agent_tone?: string
          cancel_at_period_end?: boolean
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          inbound_email?: string | null
          inbound_hash?: string
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          setup?: Json
          shopify_connected_at?: string | null
          shopify_domain?: string | null
          shopify_refresh_expires_at?: string | null
          shopify_refresh_token_enc?: string | null
          shopify_scopes?: string | null
          shopify_token_enc?: string | null
          shopify_token_expires_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          support_from_email?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          id: number
          input_tokens: number | null
          kind: string
          model: string | null
          output_tokens: number | null
          shop_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          id?: number
          input_tokens?: number | null
          kind: string
          model?: string | null
          output_tokens?: number | null
          shop_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          id?: number
          input_tokens?: number | null
          kind?: string
          model?: string | null
          output_tokens?: number | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_action_request: {
        Args: { p_id: string; p_options: Json }
        Returns: {
          action_conversation_id: string
          action_shop_id: string
        }[]
      }
      claim_sandbox_run: {
        Args: { p_free_text: boolean; p_shop_id: string }
        Returns: {
          event_id: number
          remaining: number
        }[]
      }
      disconnect_shopify: { Args: { p_shop_id: string }; Returns: undefined }
      finish_sandbox_run: {
        Args: {
          p_event_id: number
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
        }
        Returns: undefined
      }
      is_member: { Args: { s: string }; Returns: boolean }
      link_stripe_customer: {
        Args: { p_customer_id: string; p_shop_id: string }
        Returns: undefined
      }
      record_agent_result: {
        Args: {
          p_actions: Json
          p_conversation: Json
          p_conversation_id: string
          p_reply: Json
          p_shop_id: string
          p_source_message_id: string
          p_usage: Json
        }
        Returns: string
      }
      reject_action_request: {
        Args: { p_id: string }
        Returns: {
          action_conversation_id: string
          action_shop_id: string
        }[]
      }
      release_sandbox_run: { Args: { p_event_id: number }; Returns: undefined }
      shopify_connection_status: {
        Args: { p_shop_id: string }
        Returns: {
          connected_at: string
          domain: string
          needs_reconnect: boolean
          scopes: string
        }[]
      }
    }
    Enums: {
      action_status:
        | "pending"
        | "approved"
        | "rejected"
        | "executing"
        | "executed"
        | "failed"
      action_type: "refund" | "cancel" | "address_change"
      auto_category:
        | "order_status"
        | "product"
        | "shipping"
        | "policy"
        | "general"
        | "refund"
        | "cancel"
        | "address_change"
      auto_mode: "off" | "copilot" | "autopilot"
      channel: "email" | "chat" | "sandbox"
      conv_status:
        | "open"
        | "ai_drafted"
        | "awaiting_approval"
        | "escalated"
        | "human"
        | "resolved"
      knowledge_kind: "policy" | "faq" | "brand" | "example_reply"
      msg_role: "customer" | "ai" | "human" | "system"
      msg_status: "draft" | "sent" | "rejected" | "received"
      plan_tier: "trial" | "starter" | "growth" | "scale"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_status: [
        "pending",
        "approved",
        "rejected",
        "executing",
        "executed",
        "failed",
      ],
      action_type: ["refund", "cancel", "address_change"],
      auto_category: [
        "order_status",
        "product",
        "shipping",
        "policy",
        "general",
        "refund",
        "cancel",
        "address_change",
      ],
      auto_mode: ["off", "copilot", "autopilot"],
      channel: ["email", "chat", "sandbox"],
      conv_status: [
        "open",
        "ai_drafted",
        "awaiting_approval",
        "escalated",
        "human",
        "resolved",
      ],
      knowledge_kind: ["policy", "faq", "brand", "example_reply"],
      msg_role: ["customer", "ai", "human", "system"],
      msg_status: ["draft", "sent", "rejected", "received"],
      plan_tier: ["trial", "starter", "growth", "scale"],
    },
  },
} as const
