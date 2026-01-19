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
      academy_events: {
        Row: {
          all_day: boolean
          category: string
          created_at: string
          created_by: string
          description: string | null
          end_at: string | null
          id: string
          is_announcement: boolean
          location: string | null
          pinned: boolean
          start_at: string
          teacher_id: string | null
          title: string
          visibility: string
        }
        Insert: {
          all_day?: boolean
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          end_at?: string | null
          id?: string
          is_announcement?: boolean
          location?: string | null
          pinned?: boolean
          start_at: string
          teacher_id?: string | null
          title: string
          visibility?: string
        }
        Update: {
          all_day?: boolean
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string | null
          id?: string
          is_announcement?: boolean
          location?: string | null
          pinned?: boolean
          start_at?: string
          teacher_id?: string | null
          title?: string
          visibility?: string
        }
        Relationships: []
      }
      assistant_tasks: {
        Row: {
          assignee: string
          created_at: string
          created_by: string | null
          created_by_role: string | null
          due_date: string | null
          id: string
          notes: string | null
          priority: string
          related_student_id: string | null
          related_teacher_id: string | null
          status: string
          task_date: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          related_student_id?: string | null
          related_teacher_id?: string | null
          status?: string
          task_date?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          related_student_id?: string | null
          related_teacher_id?: string | null
          status?: string
          task_date?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tasks_related_student_id_fkey"
            columns: ["related_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_tasks_related_teacher_id_fkey"
            columns: ["related_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          inactive_reason: string | null
          inactive_until: string | null
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
          inactive_reason?: string | null
          inactive_until?: string | null
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
          inactive_reason?: string | null
          inactive_until?: string | null
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
      curriculum_map: {
        Row: {
          course: string
          created_at: string
          curriculum_version: string
          flow_summary: string
          id: string
          keywords: string[] | null
          next_summary: string | null
          next_unit_key: string | null
          school_level: string
          subject: string
          unit_key: string
          unit_title: string
        }
        Insert: {
          course: string
          created_at?: string
          curriculum_version: string
          flow_summary: string
          id?: string
          keywords?: string[] | null
          next_summary?: string | null
          next_unit_key?: string | null
          school_level: string
          subject: string
          unit_key: string
          unit_title: string
        }
        Update: {
          course?: string
          created_at?: string
          curriculum_version?: string
          flow_summary?: string
          id?: string
          keywords?: string[] | null
          next_summary?: string | null
          next_unit_key?: string | null
          school_level?: string
          subject?: string
          unit_key?: string
          unit_title?: string
        }
        Relationships: []
      }
      curriculum_map_backup_math: {
        Row: {
          course: string | null
          created_at: string | null
          curriculum_version: string | null
          flow_summary: string | null
          id: string | null
          keywords: string[] | null
          next_summary: string | null
          next_unit_key: string | null
          school_level: string | null
          subject: string | null
          unit_key: string | null
          unit_title: string | null
        }
        Insert: {
          course?: string | null
          created_at?: string | null
          curriculum_version?: string | null
          flow_summary?: string | null
          id?: string | null
          keywords?: string[] | null
          next_summary?: string | null
          next_unit_key?: string | null
          school_level?: string | null
          subject?: string | null
          unit_key?: string | null
          unit_title?: string | null
        }
        Update: {
          course?: string | null
          created_at?: string | null
          curriculum_version?: string | null
          flow_summary?: string | null
          id?: string | null
          keywords?: string[] | null
          next_summary?: string | null
          next_unit_key?: string | null
          school_level?: string | null
          subject?: string | null
          unit_key?: string | null
          unit_title?: string | null
        }
        Relationships: []
      }
      event_attachments: {
        Row: {
          created_at: string
          event_id: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_name: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "academy_events"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          scope: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          name: string
          scope?: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          scope?: string
          teacher_id?: string | null
        }
        Relationships: []
      }
      homework_alert_ack: {
        Row: {
          acknowledged_at: string
          id: string
          source_lesson_id: string
          student_id: string
          subject: string
          teacher_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          source_lesson_id: string
          student_id: string
          subject: string
          teacher_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          source_lesson_id?: string
          student_id?: string
          subject?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_alert_ack_source_lesson_id_fkey"
            columns: ["source_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_alert_ack_source_lesson_id_fkey"
            columns: ["source_lesson_id"]
            isOneToOne: false
            referencedRelation: "overdue_lesson_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_alert_ack_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          attendance_status: string[] | null
          class_id: string | null
          course: string | null
          created_at: string
          curriculum_unit_key: string | null
          curriculum_version: string | null
          draft_created_at: string
          english_grammar_unit: string | null
          english_pass_fail: string | null
          english_reading_units: string[] | null
          homework_check_note: string | null
          homework_status: string
          id: string
          korean_categories: string[] | null
          learning_issues: string[] | null
          learning_issues_note: string | null
          lesson_date: string
          lesson_range: string
          lesson_types: string[] | null
          next_lesson_goal: string | null
          notes: string | null
          prev_homework_override_at: string | null
          prev_homework_override_by: string | null
          prev_homework_override_text: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submitted: boolean
          submitted_at: string | null
          teacher_id: string
          test_assistant: string | null
          test_date: string | null
          test_name: string | null
          test_notes: string | null
          test_result: string
          test_result_text: string | null
          test_time: string | null
          test_title: string | null
          understanding_score: number | null
          updated_at: string
        }
        Insert: {
          attendance_status?: string[] | null
          class_id?: string | null
          course?: string | null
          created_at?: string
          curriculum_unit_key?: string | null
          curriculum_version?: string | null
          draft_created_at?: string
          english_grammar_unit?: string | null
          english_pass_fail?: string | null
          english_reading_units?: string[] | null
          homework_check_note?: string | null
          homework_status: string
          id?: string
          korean_categories?: string[] | null
          learning_issues?: string[] | null
          learning_issues_note?: string | null
          lesson_date?: string
          lesson_range: string
          lesson_types?: string[] | null
          next_lesson_goal?: string | null
          notes?: string | null
          prev_homework_override_at?: string | null
          prev_homework_override_by?: string | null
          prev_homework_override_text?: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submitted?: boolean
          submitted_at?: string | null
          teacher_id: string
          test_assistant?: string | null
          test_date?: string | null
          test_name?: string | null
          test_notes?: string | null
          test_result?: string
          test_result_text?: string | null
          test_time?: string | null
          test_title?: string | null
          understanding_score?: number | null
          updated_at?: string
        }
        Update: {
          attendance_status?: string[] | null
          class_id?: string | null
          course?: string | null
          created_at?: string
          curriculum_unit_key?: string | null
          curriculum_version?: string | null
          draft_created_at?: string
          english_grammar_unit?: string | null
          english_pass_fail?: string | null
          english_reading_units?: string[] | null
          homework_check_note?: string | null
          homework_status?: string
          id?: string
          korean_categories?: string[] | null
          learning_issues?: string[] | null
          learning_issues_note?: string | null
          lesson_date?: string
          lesson_range?: string
          lesson_types?: string[] | null
          next_lesson_goal?: string | null
          notes?: string | null
          prev_homework_override_at?: string | null
          prev_homework_override_by?: string | null
          prev_homework_override_text?: string | null
          student_id?: string
          subject?: Database["public"]["Enums"]["subject_type"]
          submitted?: boolean
          submitted_at?: string | null
          teacher_id?: string
          test_assistant?: string | null
          test_date?: string | null
          test_name?: string | null
          test_notes?: string | null
          test_result?: string
          test_result_text?: string | null
          test_time?: string | null
          test_title?: string | null
          understanding_score?: number | null
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
      report_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          prompt_text: string
          template_name: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          prompt_text: string
          template_name: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          prompt_text?: string
          template_name?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      student_subject_teachers: {
        Row: {
          created_at: string
          id: string
          student_id: string
          subject: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          student_id: string
          subject: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          subject?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subject_teachers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          email: string | null
          followup_2w_done_subjects: string[]
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
          followup_2w_done_subjects?: string[]
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
          followup_2w_done_subjects?: string[]
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
      task_attachments: {
        Row: {
          created_at: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_name: string
          storage_path: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name: string
          storage_path: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assistant_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_student_links: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      team_note_attachments: {
        Row: {
          created_at: string
          file_size: number | null
          id: string
          mime_type: string | null
          note_id: string
          original_name: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          note_id: string
          original_name: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          note_id?: string
          original_name?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "team_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      team_note_replies: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          note_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          note_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_note_replies_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "team_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      team_notes: {
        Row: {
          body: string | null
          class_id: string | null
          created_at: string
          created_by: string
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          priority: string
          scope: string
          status: string
          student_id: string | null
          target_role: string | null
          target_user_id: string | null
          teacher_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          class_id?: string | null
          created_at?: string
          created_by: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          scope?: string
          status?: string
          student_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
          teacher_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          scope?: string
          status?: string
          student_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
          teacher_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      test_visits: {
        Row: {
          created_at: string
          created_by: string | null
          english_pass_fail: string | null
          id: string
          notes: string | null
          student_id: string
          subject: string
          test_assistant: string | null
          test_result_text: string | null
          visit_date: string
          visit_time: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          english_pass_fail?: string | null
          id?: string
          notes?: string | null
          student_id: string
          subject: string
          test_assistant?: string | null
          test_result_text?: string | null
          visit_date?: string
          visit_time: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          english_pass_fail?: string | null
          id?: string
          notes?: string | null
          student_id?: string
          subject?: string
          test_assistant?: string | null
          test_result_text?: string | null
          visit_date?: string
          visit_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      weekly_jobs_log: {
        Row: {
          created_at: string
          id: string
          job_name: string
          message: string | null
          run_at: string
          schedule_text: string | null
          scheduler_source: string | null
          status: string
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_name: string
          message?: string | null
          run_at?: string
          schedule_text?: string | null
          scheduler_source?: string | null
          status?: string
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_name?: string
          message?: string | null
          run_at?: string
          schedule_text?: string | null
          scheduler_source?: string | null
          status?: string
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          avg_understanding: number | null
          common_issues: string[] | null
          debug_info: string | null
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
          debug_info?: string | null
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
          debug_info?: string | null
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
      create_assistant_task: {
        Args: {
          _assignee: string
          _due_date: string
          _notes: string
          _related_teacher_id: string
          _title: string
        }
        Returns: Json
      }
      generate_weekly_reports: {
        Args: {
          _student_ids?: string[]
          _week_end: string
          _week_start: string
        }
        Returns: undefined
      }
      generate_weekly_reports_scheduled: {
        Args: {
          _student_ids?: string[]
          _week_end: string
          _week_start: string
        }
        Returns: undefined
      }
      get_admin_kpis: {
        Args: {
          _end_date: string
          _start_date: string
          _subject?: string
          _teacher_id?: string
        }
        Returns: Json
      }
      get_prev_homework_status_for_roster: {
        Args: { _pairs: Json; _today?: string }
        Returns: {
          class_id: string
          debug_reason: string
          first_subject: boolean
          first_subject_date: string
          followup_2w_due: boolean
          homework_status: string
          prev_lesson_date: string
          student_id: string
          subject: string
        }[]
      }
      get_teacher_roster_sheet: { Args: { _date?: string }; Returns: Json }
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
      update_lesson_test_fields:
        | {
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
        | {
            Args: {
              _lesson_id: string
              _test_date?: string
              _test_name?: string
              _test_notes?: string
              _test_result?: string
              _test_result_text?: string
              _test_time?: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _lesson_id: string
              _test_assistant?: string
              _test_date?: string
              _test_name?: string
              _test_notes?: string
              _test_result?: string
              _test_result_text?: string
              _test_time?: string
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
