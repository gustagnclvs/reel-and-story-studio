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
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          id: string
          last_error: string | null
          password_enc: string
          password_last2: string
          profile_photo_url: string | null
          proxy: string | null
          sessionid_enc: string | null
          status: string
          steps_state: Json
          sticker_h: number
          sticker_text: string
          sticker_w: number
          sticker_x: number
          sticker_y: number
          story_link: string | null
          totp_secret_enc: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_error?: string | null
          password_enc: string
          password_last2?: string
          profile_photo_url?: string | null
          proxy?: string | null
          sessionid_enc?: string | null
          status?: string
          steps_state?: Json
          sticker_h?: number
          sticker_text?: string
          sticker_w?: number
          sticker_x?: number
          sticker_y?: number
          story_link?: string | null
          totp_secret_enc?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          last_error?: string | null
          password_enc?: string
          password_last2?: string
          profile_photo_url?: string | null
          proxy?: string | null
          sessionid_enc?: string | null
          status?: string
          steps_state?: Json
          sticker_h?: number
          sticker_text?: string
          sticker_w?: number
          sticker_x?: number
          sticker_y?: number
          story_link?: string | null
          totp_secret_enc?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      batches: {
        Row: {
          config: Json
          continue_on_step_error: boolean
          created_at: string
          dry_run: boolean
          id: string
          last_job_finished_at: string | null
          pause_s: number
          status: string
        }
        Insert: {
          config?: Json
          continue_on_step_error?: boolean
          created_at?: string
          dry_run?: boolean
          id?: string
          last_job_finished_at?: string | null
          pause_s?: number
          status?: string
        }
        Update: {
          config?: Json
          continue_on_step_error?: boolean
          created_at?: string
          dry_run?: boolean
          id?: string
          last_job_finished_at?: string | null
          pause_s?: number
          status?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          account_id: string
          batch_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          log: Json
          params: Json
          started_at: string | null
          status: string
          step_atual: string | null
          steps: Json
          video_id: string | null
        }
        Insert: {
          account_id: string
          batch_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          log?: Json
          params?: Json
          started_at?: string | null
          status?: string
          step_atual?: string | null
          steps?: Json
          video_id?: string | null
        }
        Update: {
          account_id?: string
          batch_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          log?: Json
          params?: Json
          started_at?: string | null
          status?: string
          step_atual?: string | null
          steps?: Json
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          caption: string | null
          created_at: string
          duration_s: number | null
          hashtags: string[]
          id: string
          last_error: string | null
          name: string
          scene_label: string | null
          status: string
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          duration_s?: number | null
          hashtags?: string[]
          id?: string
          last_error?: string | null
          name?: string
          scene_label?: string | null
          status?: string
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          duration_s?: number | null
          hashtags?: string[]
          id?: string
          last_error?: string | null
          name?: string
          scene_label?: string | null
          status?: string
          storage_path?: string
        }
        Relationships: []
      }
    }
    Views: {
      accounts_safe: {
        Row: {
          created_at: string | null
          has_session: boolean | null
          has_totp: boolean | null
          id: string | null
          last_error: string | null
          password_last2: string | null
          profile_photo_url: string | null
          proxy: string | null
          status: string | null
          steps_state: Json | null
          sticker_h: number | null
          sticker_text: string | null
          sticker_w: number | null
          sticker_x: number | null
          sticker_y: number | null
          story_link: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          has_session?: never
          has_totp?: never
          id?: string | null
          last_error?: string | null
          password_last2?: string | null
          profile_photo_url?: string | null
          proxy?: string | null
          status?: string | null
          steps_state?: Json | null
          sticker_h?: number | null
          sticker_text?: string | null
          sticker_w?: number | null
          sticker_x?: number | null
          sticker_y?: number | null
          story_link?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          has_session?: never
          has_totp?: never
          id?: string | null
          last_error?: string | null
          password_last2?: string | null
          profile_photo_url?: string | null
          proxy?: string | null
          status?: string | null
          steps_state?: Json | null
          sticker_h?: number | null
          sticker_text?: string | null
          sticker_w?: number | null
          sticker_x?: number | null
          sticker_y?: number | null
          story_link?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
