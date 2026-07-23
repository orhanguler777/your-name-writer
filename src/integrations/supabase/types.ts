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
      announcements: {
        Row: {
          id: string
          title: string
          description: string | null
          file_url: string | null
          file_type: string | null
          start_date: string | null
          end_date: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          file_url?: string | null
          file_type?: string | null
          start_date?: string | null
          end_date?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          file_url?: string | null
          file_type?: string | null
          start_date?: string | null
          end_date?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      polls: {
        Row: {
          id: string
          title: string
          question: string
          image_url: string | null
          status: string
          sent_to_whatsapp: boolean
          sent_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          question: string
          image_url?: string | null
          status?: string
          sent_to_whatsapp?: boolean
          sent_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          question?: string
          image_url?: string | null
          status?: string
          sent_to_whatsapp?: boolean
          sent_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          id: string
          poll_id: string
          option_text: string
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          option_text: string
          created_at?: string
        }
        Update: {
          id?: string
          poll_id?: string
          option_text?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          }
        ]
      }
      poll_votes: {
        Row: {
          id: string
          poll_id: string
          option_id: string
          phone_number: string
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          option_id: string
          phone_number: string
          created_at?: string
        }
        Update: {
          id?: string
          poll_id?: string
          option_id?: string
          phone_number?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_bot_logs: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          related_filters: Json | null
          user_id: string | null
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          related_filters?: Json | null
          user_id?: string | null
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          related_filters?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      complaint_assignment_feedback: {
        Row: {
          complaint_id: string
          corrected_by: string | null
          created_at: string
          id: string
          new_department_id: string | null
          old_department_id: string | null
          reason: string | null
        }
        Insert: {
          complaint_id: string
          corrected_by?: string | null
          created_at?: string
          id?: string
          new_department_id?: string | null
          old_department_id?: string | null
          reason?: string | null
        }
        Update: {
          complaint_id?: string
          corrected_by?: string | null
          created_at?: string
          id?: string
          new_department_id?: string | null
          old_department_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_assignment_feedback_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_assignment_feedback_new_department_id_fkey"
            columns: ["new_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_assignment_feedback_old_department_id_fkey"
            columns: ["old_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_attachments: {
        Row: {
          complaint_id: string
          created_at: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          complaint_id: string
          created_at?: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          complaint_id?: string
          created_at?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_attachments_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_responses: {
        Row: {
          complaint_id: string
          created_at: string
          id: string
          responder_id: string | null
          response_text: string
          response_type: string | null
        }
        Insert: {
          complaint_id: string
          created_at?: string
          id?: string
          responder_id?: string | null
          response_text: string
          response_type?: string | null
        }
        Update: {
          complaint_id?: string
          created_at?: string
          id?: string
          responder_id?: string | null
          response_text?: string
          response_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_responses_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          address: string | null
          ai_category: string | null
          ai_confidence_score: number | null
          ai_department_id: string | null
          assigned_department_id: string | null
          assigned_personnel_id: string | null
          category: string | null
          citizen_email: string | null
          citizen_name: string | null
          citizen_phone: string | null
          citizen_user_id: string | null
          complaint_text: string
          created_at: string
          id: string
          language: string | null
          latitude: number | null
          longitude: number | null
          neighborhood_id: string | null
          priority: string | null
          resolved_at: string | null
          satisfaction_score: number | null
          source: string | null
          status: string
          updated_at: string
          wants_human_representative: boolean
        }
        Insert: {
          address?: string | null
          ai_category?: string | null
          ai_confidence_score?: number | null
          ai_department_id?: string | null
          assigned_department_id?: string | null
          assigned_personnel_id?: string | null
          category?: string | null
          citizen_email?: string | null
          citizen_name?: string | null
          citizen_phone?: string | null
          citizen_user_id?: string | null
          complaint_text: string
          created_at?: string
          id?: string
          language?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          satisfaction_score?: number | null
          source?: string | null
          status?: string
          updated_at?: string
          wants_human_representative?: boolean
        }
        Update: {
          address?: string | null
          ai_category?: string | null
          ai_confidence_score?: number | null
          ai_department_id?: string | null
          assigned_department_id?: string | null
          assigned_personnel_id?: string | null
          category?: string | null
          citizen_email?: string | null
          citizen_name?: string | null
          citizen_phone?: string | null
          citizen_user_id?: string | null
          complaint_text?: string
          created_at?: string
          id?: string
          language?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          satisfaction_score?: number | null
          source?: string | null
          status?: string
          updated_at?: string
          wants_human_representative?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "complaints_ai_department_id_fkey"
            columns: ["ai_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_assigned_department_id_fkey"
            columns: ["assigned_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          deputy_mayor_id: string | null
          description: string | null
          id: string
          name: string
          responsible_person_name: string | null
          responsible_person_phone: string | null
        }
        Insert: {
          created_at?: string
          deputy_mayor_id?: string | null
          description?: string | null
          id?: string
          name: string
          responsible_person_name?: string | null
          responsible_person_phone?: string | null
        }
        Update: {
          created_at?: string
          deputy_mayor_id?: string | null
          description?: string | null
          id?: string
          name?: string
          responsible_person_name?: string | null
          responsible_person_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_deputy_mayor_id_fkey"
            columns: ["deputy_mayor_id"]
            isOneToOne: false
            referencedRelation: "deputy_mayors"
            referencedColumns: ["id"]
          },
        ]
      }
      deputy_mayors: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      mayor_daily_message_targets: {
        Row: {
          department_id: string
          id: string
          is_read: boolean
          message_id: string
          read_at: string | null
        }
        Insert: {
          department_id: string
          id?: string
          is_read?: boolean
          message_id: string
          read_at?: string | null
        }
        Update: {
          department_id?: string
          id?: string
          is_read?: boolean
          message_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mayor_daily_message_targets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mayor_daily_message_targets_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "mayor_daily_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mayor_daily_messages: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          priority: string | null
          send_date: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string | null
          send_date?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string | null
          send_date?: string | null
          title?: string
        }
        Relationships: []
      }
      neighborhoods: {
        Row: {
          created_at: string
          district: string | null
          id: string
          name: string
          population: number | null
        }
        Insert: {
          created_at?: string
          district?: string | null
          id?: string
          name: string
          population?: number | null
        }
        Update: {
          created_at?: string
          district?: string | null
          id?: string
          name?: string
          population?: number | null
        }
        Relationships: []
      }
      personnel: {
        Row: {
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_attendance: {
        Row: {
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          date: string
          has_overtime: boolean
          id: string
          is_late: boolean
          missing_checkout: boolean
          personnel_id: string
        }
        Insert: {
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          date: string
          has_overtime?: boolean
          id?: string
          is_late?: boolean
          missing_checkout?: boolean
          personnel_id: string
        }
        Update: {
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          has_overtime?: boolean
          id?: string
          is_late?: boolean
          missing_checkout?: boolean
          personnel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_attendance_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          deputy_mayor_id: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          deputy_mayor_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          deputy_mayor_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_deputy_mayor_id_fkey"
            columns: ["deputy_mayor_id"]
            isOneToOne: false
            referencedRelation: "deputy_mayors"
            referencedColumns: ["id"]
          },
        ]
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
      vehicles: {
        Row: {
          created_at: string
          department_id: string | null
          estimated_return_date: string | null
          id: string
          maintenance_reason: string | null
          maintenance_start_date: string | null
          notes: string | null
          plate_number: string
          status: string
          updated_at: string
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          estimated_return_date?: string | null
          id?: string
          maintenance_reason?: string | null
          maintenance_start_date?: string | null
          notes?: string | null
          plate_number: string
          status?: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          estimated_return_date?: string | null
          id?: string
          maintenance_reason?: string | null
          maintenance_start_date?: string | null
          notes?: string | null
          plate_number?: string
          status?: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_department: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "vatandas" | "cozum_masasi" | "mudurluk" | "baskan" | "admin"
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
      app_role: ["vatandas", "cozum_masasi", "mudurluk", "baskan", "admin"],
    },
  },
} as const
