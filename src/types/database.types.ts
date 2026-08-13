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
      ai_request_log: {
        Row: {
          created_at: string
          id: string
          input: Json
          kind: string
          outcome: string
          tokens: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input: Json
          kind: string
          outcome: string
          tokens?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input?: Json
          kind?: string
          outcome?: string
          tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      bike_catalog: {
        Row: {
          brand: string
          components: Json
          confidence: number | null
          created_at: string
          display: Json
          id: string
          model: string
          source_url: string | null
          status: string
          updated_at: string
          version: string
          year: number
        }
        Insert: {
          brand: string
          components: Json
          confidence?: number | null
          created_at?: string
          display: Json
          id?: string
          model: string
          source_url?: string | null
          status?: string
          updated_at?: string
          version?: string
          year: number
        }
        Update: {
          brand?: string
          components?: Json
          confidence?: number | null
          created_at?: string
          display?: Json
          id?: string
          model?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          version?: string
          year?: number
        }
        Relationships: []
      }
      bikes: {
        Row: {
          active: boolean
          brand: string | null
          color: string | null
          created_at: string
          frame_size: string | null
          id: string
          image_url: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          serial_number: string | null
          strava_gear_id: string | null
          total_hours: number | null
          total_km: number | null
          type: string | null
          updated_at: string
          usage_updated_at: string | null
          user_id: string
          warranty: string | null
          wheel_size: string | null
          year: number | null
        }
        Insert: {
          active?: boolean
          brand?: string | null
          color?: string | null
          created_at?: string
          frame_size?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          strava_gear_id?: string | null
          total_hours?: number | null
          total_km?: number | null
          type?: string | null
          updated_at?: string
          usage_updated_at?: string | null
          user_id: string
          warranty?: string | null
          wheel_size?: string | null
          year?: number | null
        }
        Update: {
          active?: boolean
          brand?: string | null
          color?: string | null
          created_at?: string
          frame_size?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          strava_gear_id?: string | null
          total_hours?: number | null
          total_km?: number | null
          type?: string | null
          updated_at?: string
          usage_updated_at?: string | null
          user_id?: string
          warranty?: string | null
          wheel_size?: string | null
          year?: number | null
        }
        Relationships: []
      }
      component_interval_notifications: {
        Row: {
          channel: string
          level: string
          notified_at: string
          service_interval_id: string
          user_id: string
        }
        Insert: {
          channel: string
          level: string
          notified_at?: string
          service_interval_id: string
          user_id: string
        }
        Update: {
          channel?: string
          level?: string
          notified_at?: string
          service_interval_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_interval_notifications_service_interval_id_fkey"
            columns: ["service_interval_id"]
            isOneToOne: false
            referencedRelation: "component_interval_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_interval_notifications_service_interval_id_fkey"
            columns: ["service_interval_id"]
            isOneToOne: false
            referencedRelation: "component_service_intervals"
            referencedColumns: ["id"]
          },
        ]
      }
      component_service_intervals: {
        Row: {
          component_id: string
          created_at: string
          id: string
          includes: string[] | null
          interval_type: string
          interval_value: number
          name: string
          slot: number
          updated_at: string
          user_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          includes?: string[] | null
          interval_type: string
          interval_value: number
          name: string
          slot: number
          updated_at?: string
          user_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          includes?: string[] | null
          interval_type?: string
          interval_value?: number
          name?: string
          slot?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_service_intervals_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_service_intervals_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components_status"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          bike_hours_at_install: number | null
          bike_hours_at_retire: number | null
          bike_id: string
          bike_km_at_install: number | null
          bike_km_at_retire: number | null
          brand: string | null
          category: string | null
          created_at: string
          id: string
          initial_hours: number | null
          initial_km: number | null
          install_date: string | null
          interval_type: string | null
          interval_value: number | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          retired_at: string | null
          serial_number: string | null
          updated_at: string
          user_id: string
          warranty: string | null
          year: number | null
        }
        Insert: {
          bike_hours_at_install?: number | null
          bike_hours_at_retire?: number | null
          bike_id: string
          bike_km_at_install?: number | null
          bike_km_at_retire?: number | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          initial_hours?: number | null
          initial_km?: number | null
          install_date?: string | null
          interval_type?: string | null
          interval_value?: number | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          retired_at?: string | null
          serial_number?: string | null
          updated_at?: string
          user_id: string
          warranty?: string | null
          year?: number | null
        }
        Update: {
          bike_hours_at_install?: number | null
          bike_hours_at_retire?: number | null
          bike_id?: string
          bike_km_at_install?: number | null
          bike_km_at_retire?: number | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          initial_hours?: number | null
          initial_km?: number | null
          install_date?: string | null
          interval_type?: string | null
          interval_value?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          retired_at?: string | null
          serial_number?: string | null
          updated_at?: string
          user_id?: string
          warranty?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "components_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          bike_hours_at_intervention: number | null
          bike_km_at_intervention: number | null
          component_id: string
          created_at: string
          date: string
          description: string | null
          hours_used: number | null
          id: string
          kms: number | null
          notes: string | null
          reset_interval_id: string | null
          resets_interval: boolean
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bike_hours_at_intervention?: number | null
          bike_km_at_intervention?: number | null
          component_id: string
          created_at?: string
          date: string
          description?: string | null
          hours_used?: number | null
          id?: string
          kms?: number | null
          notes?: string | null
          reset_interval_id?: string | null
          resets_interval?: boolean
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bike_hours_at_intervention?: number | null
          bike_km_at_intervention?: number | null
          component_id?: string
          created_at?: string
          date?: string
          description?: string | null
          hours_used?: number | null
          id?: string
          kms?: number | null
          notes?: string | null
          reset_interval_id?: string | null
          resets_interval?: boolean
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_reset_interval_id_fkey"
            columns: ["reset_interval_id"]
            isOneToOne: false
            referencedRelation: "component_interval_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_reset_interval_id_fkey"
            columns: ["reset_interval_id"]
            isOneToOne: false
            referencedRelation: "component_service_intervals"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_profiles: {
        Row: {
          brand: string
          category: string | null
          confidence: number | null
          created_at: string
          id: string
          intervals: Json
          model: string
          source_url: string | null
          status: string
          updated_at: string
          year: number | null
        }
        Insert: {
          brand: string
          category?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          intervals: Json
          model: string
          source_url?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand?: string
          category?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          intervals?: Json
          model?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: string
          component_id: string | null
          episode_date: string | null
          id: string
          sent_at: string
          service_interval_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          channel?: string
          component_id?: string | null
          episode_date?: string | null
          id?: string
          sent_at?: string
          service_interval_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          channel?: string
          component_id?: string | null
          episode_date?: string | null
          id?: string
          sent_at?: string
          service_interval_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_service_interval_id_fkey"
            columns: ["service_interval_id"]
            isOneToOne: false
            referencedRelation: "component_interval_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_service_interval_id_fkey"
            columns: ["service_interval_id"]
            isOneToOne: false
            referencedRelation: "component_service_intervals"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      strava_activities: {
        Row: {
          activity_date: string | null
          activity_name: string | null
          bike_id: string
          distance_km: number
          elapsed_time_hours: number | null
          elevation_gain_m: number | null
          moving_time_hours: number
          processed_at: string
          strava_activity_id: number
        }
        Insert: {
          activity_date?: string | null
          activity_name?: string | null
          bike_id: string
          distance_km: number
          elapsed_time_hours?: number | null
          elevation_gain_m?: number | null
          moving_time_hours: number
          processed_at?: string
          strava_activity_id: number
        }
        Update: {
          activity_date?: string | null
          activity_name?: string | null
          bike_id?: string
          distance_km?: number
          elapsed_time_hours?: number | null
          elevation_gain_m?: number | null
          moving_time_hours?: number
          processed_at?: string
          strava_activity_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "strava_activities_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_connections: {
        Row: {
          access_token: string
          athlete_id: number
          created_at: string
          expires_at: string
          last_manual_sync_at: string | null
          refresh_token: string
          scopes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          athlete_id: number
          created_at?: string
          expires_at: string
          last_manual_sync_at?: string | null
          refresh_token: string
          scopes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          athlete_id?: number
          created_at?: string
          expires_at?: string
          last_manual_sync_at?: string | null
          refresh_token?: string
          scopes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      component_interval_status: {
        Row: {
          bike_hours_at_install: number | null
          bike_id: string | null
          bike_km_at_install: number | null
          component_created_at: string | null
          component_id: string | null
          component_name: string | null
          id: string | null
          install_date: string | null
          interval_type: string | null
          interval_value: number | null
          last_intervention_date: string | null
          last_service_hours: number | null
          last_service_km: number | null
          name: string | null
          retired_at: string | null
          slot: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "component_service_intervals_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_service_intervals_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      components_status: {
        Row: {
          bike_hours_at_install: number | null
          bike_hours_at_retire: number | null
          bike_id: string | null
          bike_km_at_install: number | null
          bike_km_at_retire: number | null
          brand: string | null
          category: string | null
          created_at: string | null
          id: string | null
          initial_hours: number | null
          initial_km: number | null
          install_date: string | null
          interval_type: string | null
          interval_value: number | null
          last_intervention_date: string | null
          last_service_hours: number | null
          last_service_km: number | null
          model: string | null
          name: string | null
          notes: string | null
          purchase_date: string | null
          retired_at: string | null
          serial_number: string | null
          updated_at: string | null
          user_id: string | null
          warranty: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "components_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_interval_notification: {
        Args: {
          p_channel: string
          p_level: string
          p_service_interval_id: string
          p_user_id: string
        }
        Returns: {
          claimed: boolean
          previous_level: string
          previous_notified_at: string
        }[]
      }
      release_interval_notification: {
        Args: {
          p_channel: string
          p_claimed_level: string
          p_previous_level: string
          p_previous_notified_at: string
          p_service_interval_id: string
        }
        Returns: undefined
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
