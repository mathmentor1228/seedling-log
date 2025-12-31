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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          att_date: string
          created_at: string
          id: string
          note: string | null
          status: string
          student_id: string
        }
        Insert: {
          att_date: string
          created_at?: string
          id?: string
          note?: string | null
          status: string
          student_id: string
        }
        Update: {
          att_date?: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedules: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_students: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          schedule: string | null
          subject: Database["public"]["Enums"]["subject_type"]
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          schedule?: string | null
          subject: Database["public"]["Enums"]["subject_type"]
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          schedule?: string | null
          subject?: Database["public"]["Enums"]["subject_type"]
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      homework_assignments: {
        Row: {
          assigned_date: string
          check_status: string
          checked_at: string | null
          checked_by: string | null
          content: string
          created_at: string | null
          id: string
          lesson_record_id: string | null
          notes: string | null
          result: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
        }
        Insert: {
          assigned_date?: string
          check_status?: string
          checked_at?: string | null
          checked_by?: string | null
          content: string
          created_at?: string | null
          id?: string
          lesson_record_id?: string | null
          notes?: string | null
          result?: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
        }
        Update: {
          assigned_date?: string
          check_status?: string
          checked_at?: string | null
          checked_by?: string | null
          content?: string
          created_at?: string | null
          id?: string
          lesson_record_id?: string | null
          notes?: string | null
          result?: string | null
          student_id?: string
          subject?: Database["public"]["Enums"]["subject_type"]
        }
        Relationships: [
          {
            foreignKeyName: "homework_assignments_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "lesson_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_assignments_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "overdue_lesson_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_records: {
        Row: {
          class_id: string | null
          created_at: string
          draft_created_at: string
          homework_status: string
          id: string
          learning_issues: string[] | null
          lesson_date: string
          lesson_range: string
          next_lesson_goal: string | null
          notes: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submitted: boolean
          submitted_at: string | null
          teacher_id: string
          test_date: string | null
          test_name: string | null
          test_notes: string | null
          test_result: string
          test_result_text: string | null
          understanding_score: number
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          draft_created_at?: string
          homework_status: string
          id?: string
          learning_issues?: string[] | null
          lesson_date?: string
          lesson_range: string
          next_lesson_goal?: string | null
          notes?: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submitted?: boolean
          submitted_at?: string | null
          teacher_id: string
          test_date?: string | null
          test_name?: string | null
          test_notes?: string | null
          test_result?: string
          test_result_text?: string | null
          understanding_score: number
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          draft_created_at?: string
          homework_status?: string
          id?: string
          learning_issues?: string[] | null
          lesson_date?: string
          lesson_range?: string
          next_lesson_goal?: string | null
          notes?: string | null
          student_id?: string
          subject?: Database["public"]["Enums"]["subject_type"]
          submitted?: boolean
          submitted_at?: string | null
          teacher_id?: string
          test_date?: string | null
          test_name?: string | null
          test_notes?: string | null
          test_result?: string
          test_result_text?: string | null
          understanding_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string
          email: string | null
          grade: string | null
          id: string
          name: string
          notes: string | null
          parent_phone: string | null
          phone: string | null
          school: string | null
          status: string | null
          student_code: string | null
          student_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          grade?: string | null
          id?: string
          name: string
          notes?: string | null
          parent_phone?: string | null
          phone?: string | null
          school?: string | null
          status?: string | null
          student_code?: string | null
          student_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          grade?: string | null
          id?: string
          name?: string
          notes?: string | null
          parent_phone?: string | null
          phone?: string | null
          school?: string | null
          status?: string | null
          student_code?: string | null
          student_phone?: string | null
          updated_at?: string
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
      weekly_reports: {
        Row: {
          avg_understanding: number | null
          common_issues: string[] | null
          generated_at: string
          homework_completion_rate: number | null
          id: string
          parent_message: string | null
          parent_sent_at: string | null
          parent_sent_status: string | null
          principal_comment: string | null
          principal_comment_enabled: boolean | null
          risk_level: string | null
          sent_at: string | null
          sent_by: string | null
          sent_status: string | null
          student_id: string
          student_message: string | null
          student_sent_at: string | null
          student_sent_status: string | null
          subject_breakdown: Json | null
          summary: string | null
          total_lessons: number
          week_end: string
          week_start: string
        }
        Insert: {
          avg_understanding?: number | null
          common_issues?: string[] | null
          generated_at?: string
          homework_completion_rate?: number | null
          id?: string
          parent_message?: string | null
          parent_sent_at?: string | null
          parent_sent_status?: string | null
          principal_comment?: string | null
          principal_comment_enabled?: boolean | null
          risk_level?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_status?: string | null
          student_id: string
          student_message?: string | null
          student_sent_at?: string | null
          student_sent_status?: string | null
          subject_breakdown?: Json | null
          summary?: string | null
          total_lessons?: number
          week_end: string
          week_start: string
        }
        Update: {
          avg_understanding?: number | null
          common_issues?: string[] | null
          generated_at?: string
          homework_completion_rate?: number | null
          id?: string
          parent_message?: string | null
          parent_sent_at?: string | null
          parent_sent_status?: string | null
          principal_comment?: string | null
          principal_comment_enabled?: boolean | null
          risk_level?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_status?: string | null
          student_id?: string
          student_message?: string | null
          student_sent_at?: string | null
          student_sent_status?: string | null
          subject_breakdown?: Json | null
          summary?: string | null
          total_lessons?: number
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      overdue_lesson_drafts: {
        Row: {
          draft_created_at: string | null
          id: string | null
          lesson_date: string | null
          overdue_hours: number | null
          student_id: string | null
          student_name: string | null
          subject: Database["public"]["Enums"]["subject_type"] | null
          teacher_id: string | null
          teacher_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      generate_weekly_reports: {
        Args: { _week_end: string; _week_start: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      teacher_owns_student: {
        Args: { _student_id: string; _teacher_id: string }
        Returns: boolean
      }
      update_homework_check: {
        Args: {
          _check_status: string
          _homework_id: string
          _notes?: string
          _result: string
        }
        Returns: boolean
      }
      update_lesson_test_fields: {
        Args: {
          _lesson_id: string
          _test_date?: string
          _test_name?: string
          _test_notes?: string
          _test_result?: string
          _test_result_text?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "assistant"
      subject_type: "수학" | "과학" | "영어" | "국어"
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
      app_role: ["admin", "teacher", "assistant"],
      subject_type: ["수학", "과학", "영어", "국어"],
    },
  },
} as const
