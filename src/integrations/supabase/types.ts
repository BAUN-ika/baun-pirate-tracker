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
      app_settings: {
        Row: {
          baun_passcode_hash: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          baun_passcode_hash: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          baun_passcode_hash?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      highscore_entries: {
        Row: {
          created_at: string
          id: string
          ikariam_username: string
          period_end: string
          period_start: string
          pirate_points: number
          rank: number
          submission_id: string
          submitted_by_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ikariam_username: string
          period_end: string
          period_start: string
          pirate_points: number
          rank: number
          submission_id: string
          submitted_by_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ikariam_username?: string
          period_end?: string
          period_start?: string
          pirate_points?: number
          rank?: number
          submission_id?: string
          submitted_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highscore_entries_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "highscore_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      highscore_submissions: {
        Row: {
          created_at: string
          entries_count: number
          id: string
          period_end: string
          period_start: string
          raw_text: string
          submitted_by_user_id: string
        }
        Insert: {
          created_at?: string
          entries_count?: number
          id?: string
          period_end: string
          period_start: string
          raw_text: string
          submitted_by_user_id: string
        }
        Update: {
          created_at?: string
          entries_count?: number
          id?: string
          period_end?: string
          period_start?: string
          raw_text?: string
          submitted_by_user_id?: string
        }
        Relationships: []
      }
      ikariam_accounts: {
        Row: {
          collected_by_user_id: string | null
          created_at: string
          current_pirate_points: number
          fortress_coordinates: string | null
          id: string
          ikariam_username: string
          last_collected_at: string | null
          last_updated_at: string
          owner_user_id: string
        }
        Insert: {
          collected_by_user_id?: string | null
          created_at?: string
          current_pirate_points?: number
          fortress_coordinates?: string | null
          id?: string
          ikariam_username: string
          last_collected_at?: string | null
          last_updated_at?: string
          owner_user_id: string
        }
        Update: {
          collected_by_user_id?: string | null
          created_at?: string
          current_pirate_points?: number
          fortress_coordinates?: string | null
          id?: string
          ikariam_username?: string
          last_collected_at?: string | null
          last_updated_at?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      pirate_missions: {
        Row: {
          completed_at: string | null
          completes_at: string
          created_at: string
          id: string
          ikariam_account_id: string
          mission_type: Database["public"]["Enums"]["mission_type"]
          reward_points: number
          started_at: string
          status: Database["public"]["Enums"]["mission_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completes_at: string
          created_at?: string
          id?: string
          ikariam_account_id: string
          mission_type: Database["public"]["Enums"]["mission_type"]
          reward_points: number
          started_at?: string
          status?: Database["public"]["Enums"]["mission_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completes_at?: string
          created_at?: string
          id?: string
          ikariam_account_id?: string
          mission_type?: Database["public"]["Enums"]["mission_type"]
          reward_points?: number
          started_at?: string
          status?: Database["public"]["Enums"]["mission_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pirate_missions_ikariam_account_id_fkey"
            columns: ["ikariam_account_id"]
            isOneToOne: false
            referencedRelation: "ikariam_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          username: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          username: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_due_pirate_missions: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "glavni_pirat" | "korisnik"
      mission_status: "pending" | "completed" | "cancelled"
      mission_type: "mission_8h" | "mission_16h"
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
    Enums: {
      app_role: ["admin", "glavni_pirat", "korisnik"],
      mission_status: ["pending", "completed", "cancelled"],
      mission_type: ["mission_8h", "mission_16h"],
    },
  },
} as const
