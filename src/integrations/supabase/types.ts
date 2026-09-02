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
      admin_office_read_status: {
        Row: {
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_office_task_comments: {
        Row: {
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          author_name: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_office_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "admin_office_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_office_tasks: {
        Row: {
          assignee_name: string | null
          category: string
          completed_at: string | null
          completed_by_name: string | null
          created_at: string
          created_by: string
          created_by_name: string
          description: string | null
          id: string
          source_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_name?: string | null
          category?: string
          completed_at?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          description?: string | null
          id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string | null
          category?: string
          completed_at?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          description?: string | null
          id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string
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
      assistant_work_logs: {
        Row: {
          assistant_user_id: string
          clock_in_at: string
          clock_out_at: string | null
          created_at: string
          id: string
          notes: string | null
          total_minutes: number | null
          updated_at: string
        }
        Insert: {
          assistant_user_id: string
          clock_in_at: string
          clock_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          total_minutes?: number | null
          updated_at?: string
        }
        Update: {
          assistant_user_id?: string
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          total_minutes?: number | null
          updated_at?: string
        }
        Relationships: []
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
      attendance_logs: {
        Row: {
          assignment_id: string | null
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string | null
          date: string
          id: string
          recorded_by: string | null
          room_id: string | null
          student_id: string | null
          student_name: string | null
        }
        Insert: {
          assignment_id?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string | null
          date: string
          id?: string
          recorded_by?: string | null
          room_id?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Update: {
          assignment_id?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string | null
          date?: string
          id?: string
          recorded_by?: string | null
          room_id?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "room_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_schedules: {
        Row: {
          base_amount: number
          billing_month: string
          created_at: string
          discount_amount: number
          due_date: string
          extra_amount: number
          extra_memo: string | null
          final_amount: number
          id: string
          late_fee: number
          memo: string | null
          status: string
          student_course_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          base_amount?: number
          billing_month: string
          created_at?: string
          discount_amount?: number
          due_date: string
          extra_amount?: number
          extra_memo?: string | null
          final_amount?: number
          id?: string
          late_fee?: number
          memo?: string | null
          status?: string
          student_course_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          billing_month?: string
          created_at?: string
          discount_amount?: number
          due_date?: string
          extra_amount?: number
          extra_memo?: string | null
          final_amount?: number
          id?: string
          late_fee?: number
          memo?: string | null
          status?: string
          student_course_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_schedules_student_course_id_fkey"
            columns: ["student_course_id"]
            isOneToOne: false
            referencedRelation: "student_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_schedules_student_id_fkey"
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
          classroom_id: string | null
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
          classroom_id?: string | null
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
          classroom_id?: string | null
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
          {
            foreignKeyName: "class_schedules_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
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
      classrooms: {
        Row: {
          capacity: number
          created_at: string
          id: string
          is_active: boolean
          manager_name: string
          name: string
          sort_order: number
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          manager_name?: string
          name: string
          sort_order?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          manager_name?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      clinic_records: {
        Row: {
          assistant_attendance: boolean | null
          assistant_confirmed: boolean
          assistant_confirmed_at: string | null
          assistant_memo: string | null
          clinic_date: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          content: string
          created_at: string
          end_time: string | null
          id: string
          lesson_record_id: string | null
          next_clinic_memo: string | null
          room: string
          start_time: string | null
          student_id: string
          subject: string
          teacher_check_memo: string | null
          teacher_checked: boolean
          teacher_checked_at: string | null
          teacher_display_name: string | null
          teacher_id: string
          teacher_note: string | null
          teacher_note_shown: boolean
          updated_at: string
        }
        Insert: {
          assistant_attendance?: boolean | null
          assistant_confirmed?: boolean
          assistant_confirmed_at?: string | null
          assistant_memo?: string | null
          clinic_date: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          content: string
          created_at?: string
          end_time?: string | null
          id?: string
          lesson_record_id?: string | null
          next_clinic_memo?: string | null
          room?: string
          start_time?: string | null
          student_id: string
          subject: string
          teacher_check_memo?: string | null
          teacher_checked?: boolean
          teacher_checked_at?: string | null
          teacher_display_name?: string | null
          teacher_id: string
          teacher_note?: string | null
          teacher_note_shown?: boolean
          updated_at?: string
        }
        Update: {
          assistant_attendance?: boolean | null
          assistant_confirmed?: boolean
          assistant_confirmed_at?: string | null
          assistant_memo?: string | null
          clinic_date?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          content?: string
          created_at?: string
          end_time?: string | null
          id?: string
          lesson_record_id?: string | null
          next_clinic_memo?: string | null
          room?: string
          start_time?: string | null
          student_id?: string
          subject?: string
          teacher_check_memo?: string | null
          teacher_checked?: boolean
          teacher_checked_at?: string | null
          teacher_display_name?: string | null
          teacher_id?: string
          teacher_note?: string | null
          teacher_note_shown?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_records_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_records_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "lesson_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_records_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "overdue_lesson_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      congestion_predictions: {
        Row: {
          classroom_id: string | null
          created_at: string
          day_of_week: number
          hour: number
          id: string
          predicted_count: number
          prediction_date: string
        }
        Insert: {
          classroom_id?: string | null
          created_at?: string
          day_of_week: number
          hour: number
          id?: string
          predicted_count?: number
          prediction_date: string
        }
        Update: {
          classroom_id?: string | null
          created_at?: string
          day_of_week?: number
          hour?: number
          id?: string
          predicted_count?: number
          prediction_date?: string
        }
        Relationships: []
      }
      consultation_leads: {
        Row: {
          appointment_at: string | null
          consultation_summary: string | null
          converted_student_id: string | null
          created_at: string
          grade_year: number | null
          guardian_name: string | null
          guardian_phone: string
          id: string
          intake_submitted_at: string | null
          learning_concern: string | null
          outcome_note: string | null
          preferred_date: string | null
          preferred_time: string | null
          public_token: string
          referral_source: string | null
          school: string | null
          school_level: string | null
          status: string
          student_name: string
          student_phone: string | null
          subjects: string[]
          updated_at: string
        }
        Insert: {
          appointment_at?: string | null
          consultation_summary?: string | null
          converted_student_id?: string | null
          created_at?: string
          grade_year?: number | null
          guardian_name?: string | null
          guardian_phone: string
          id?: string
          intake_submitted_at?: string | null
          learning_concern?: string | null
          outcome_note?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          public_token?: string
          referral_source?: string | null
          school?: string | null
          school_level?: string | null
          status?: string
          student_name: string
          student_phone?: string | null
          subjects?: string[]
          updated_at?: string
        }
        Update: {
          appointment_at?: string | null
          consultation_summary?: string | null
          converted_student_id?: string | null
          created_at?: string
          grade_year?: number | null
          guardian_name?: string | null
          guardian_phone?: string
          id?: string
          intake_submitted_at?: string | null
          learning_concern?: string | null
          outcome_note?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          public_token?: string
          referral_source?: string | null
          school?: string | null
          school_level?: string | null
          status?: string
          student_name?: string
          student_phone?: string | null
          subjects?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_leads_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      course_policies: {
        Row: {
          course_name: string
          created_at: string
          description: string | null
          grade_target: string
          id: string
          monthly_fee: number
          subject: string
          updated_at: string
        }
        Insert: {
          course_name: string
          created_at?: string
          description?: string | null
          grade_target: string
          id?: string
          monthly_fee: number
          subject: string
          updated_at?: string
        }
        Update: {
          course_name?: string
          created_at?: string
          description?: string | null
          grade_target?: string
          id?: string
          monthly_fee?: number
          subject?: string
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
      daily_briefings: {
        Row: {
          briefing_date: string
          created_at: string
          generated_at: string
          generated_by: string | null
          highlights: Json
          id: string
          totals: Json
        }
        Insert: {
          briefing_date: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          id?: string
          totals?: Json
        }
        Update: {
          briefing_date?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          id?: string
          totals?: Json
        }
        Relationships: []
      }
      daily_report_sends: {
        Row: {
          id: string
          report_date: string
          sent_at: string
          student_id: string
          variables: Json | null
        }
        Insert: {
          id?: string
          report_date: string
          sent_at?: string
          student_id: string
          variables?: Json | null
        }
        Update: {
          id?: string
          report_date?: string
          sent_at?: string
          student_id?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_sends_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_acks: {
        Row: {
          acked_at: string
          acked_by: string | null
          acked_keys: string[]
          created_at: string
          finding_id: string
          group_count: number
          id: string
          record_count: number
        }
        Insert: {
          acked_at?: string
          acked_by?: string | null
          acked_keys?: string[]
          created_at?: string
          finding_id: string
          group_count?: number
          id?: string
          record_count?: number
        }
        Update: {
          acked_at?: string
          acked_by?: string | null
          acked_keys?: string[]
          created_at?: string
          finding_id?: string
          group_count?: number
          id?: string
          record_count?: number
        }
        Relationships: []
      }
      event_acks: {
        Row: {
          acknowledged_at: string
          event_id: string
          id: string
          user_id: string
          user_name: string
        }
        Insert: {
          acknowledged_at?: string
          event_id: string
          id?: string
          user_id: string
          user_name: string
        }
        Update: {
          acknowledged_at?: string
          event_id?: string
          id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_acks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "academy_events"
            referencedColumns: ["id"]
          },
        ]
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
      exam_analysis_items: {
        Row: {
          area: string | null
          classification: string | null
          content: string | null
          difficulty: string | null
          id: string
          item_number: number
          item_type: string | null
          note: string | null
          points: number | null
          problem_desc: string | null
          question_type: string | null
          report_id: string
          sort_order: number | null
          source_type: string | null
          unit_name: string | null
        }
        Insert: {
          area?: string | null
          classification?: string | null
          content?: string | null
          difficulty?: string | null
          id?: string
          item_number: number
          item_type?: string | null
          note?: string | null
          points?: number | null
          problem_desc?: string | null
          question_type?: string | null
          report_id: string
          sort_order?: number | null
          source_type?: string | null
          unit_name?: string | null
        }
        Update: {
          area?: string | null
          classification?: string | null
          content?: string | null
          difficulty?: string | null
          id?: string
          item_number?: number
          item_type?: string | null
          note?: string | null
          points?: number | null
          problem_desc?: string | null
          question_type?: string | null
          report_id?: string
          sort_order?: number | null
          source_type?: string | null
          unit_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_analysis_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "exam_analysis_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_analysis_report_views: {
        Row: {
          id: string
          report_id: string
          student_id: string | null
          viewed_at: string
          viewer_type: string
        }
        Insert: {
          id?: string
          report_id: string
          student_id?: string | null
          viewed_at?: string
          viewer_type: string
        }
        Update: {
          id?: string
          report_id?: string
          student_id?: string | null
          viewed_at?: string
          viewer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_analysis_report_views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "exam_analysis_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_analysis_report_views_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_analysis_reports: {
        Row: {
          answer_image_paths: Json | null
          answer_mode: string | null
          answer_pdf_path: string | null
          answers: Json | null
          avg_score: number | null
          card_image_paths: Json
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          exam_difficulty: string | null
          exam_period: string
          exam_scope: string | null
          exam_type: string
          exam_year: number
          grade: string
          id: string
          is_locked: boolean | null
          is_published: boolean
          locked_at: string | null
          locked_by: string | null
          locked_by_name: string | null
          original_pdf_path: string | null
          overall_review: string | null
          parent_message: string | null
          published_at: string | null
          school_name: string
          student_message: string | null
          study_links: Json | null
          subject: string
          textbook: string | null
          updated_at: string | null
        }
        Insert: {
          answer_image_paths?: Json | null
          answer_mode?: string | null
          answer_pdf_path?: string | null
          answers?: Json | null
          avg_score?: number | null
          card_image_paths?: Json
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          exam_difficulty?: string | null
          exam_period: string
          exam_scope?: string | null
          exam_type: string
          exam_year: number
          grade: string
          id?: string
          is_locked?: boolean | null
          is_published?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_by_name?: string | null
          original_pdf_path?: string | null
          overall_review?: string | null
          parent_message?: string | null
          published_at?: string | null
          school_name: string
          student_message?: string | null
          study_links?: Json | null
          subject: string
          textbook?: string | null
          updated_at?: string | null
        }
        Update: {
          answer_image_paths?: Json | null
          answer_mode?: string | null
          answer_pdf_path?: string | null
          answers?: Json | null
          avg_score?: number | null
          card_image_paths?: Json
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          exam_difficulty?: string | null
          exam_period?: string
          exam_scope?: string | null
          exam_type?: string
          exam_year?: number
          grade?: string
          id?: string
          is_locked?: boolean | null
          is_published?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_by_name?: string | null
          original_pdf_path?: string | null
          overall_review?: string | null
          parent_message?: string | null
          published_at?: string | null
          school_name?: string
          student_message?: string | null
          study_links?: Json | null
          subject?: string
          textbook?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_analysis_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_analysis_reports_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_deep_analysis_reports: {
        Row: {
          analysis_report_id: string
          created_at: string
          difficult_points: Json
          generated_by: string | null
          id: string
          overall_insights: string | null
          published_at: string | null
          published_by: string | null
          reviewed_by: string | null
          score_band_recommendations: Json
          status: string
          student_recommendations: Json
          teacher_notes: string | null
          updated_at: string
        }
        Insert: {
          analysis_report_id: string
          created_at?: string
          difficult_points?: Json
          generated_by?: string | null
          id?: string
          overall_insights?: string | null
          published_at?: string | null
          published_by?: string | null
          reviewed_by?: string | null
          score_band_recommendations?: Json
          status?: string
          student_recommendations?: Json
          teacher_notes?: string | null
          updated_at?: string
        }
        Update: {
          analysis_report_id?: string
          created_at?: string
          difficult_points?: Json
          generated_by?: string | null
          id?: string
          overall_insights?: string | null
          published_at?: string | null
          published_by?: string | null
          reviewed_by?: string | null
          score_band_recommendations?: Json
          status?: string
          student_recommendations?: Json
          teacher_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_deep_analysis_reports_analysis_report_id_fkey"
            columns: ["analysis_report_id"]
            isOneToOne: true
            referencedRelation: "exam_analysis_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_item_reviews: {
        Row: {
          created_at: string | null
          custom_reason: string | null
          error_types: Json | null
          id: string
          is_essay: boolean | null
          item_comment: string | null
          item_number: number
          overlay_x: number | null
          overlay_y: number | null
          page_number: number | null
          result: string | null
          review_id: string
          score_earned: number | null
        }
        Insert: {
          created_at?: string | null
          custom_reason?: string | null
          error_types?: Json | null
          id?: string
          is_essay?: boolean | null
          item_comment?: string | null
          item_number: number
          overlay_x?: number | null
          overlay_y?: number | null
          page_number?: number | null
          result?: string | null
          review_id: string
          score_earned?: number | null
        }
        Update: {
          created_at?: string | null
          custom_reason?: string | null
          error_types?: Json | null
          id?: string
          is_essay?: boolean | null
          item_comment?: string | null
          item_number?: number
          overlay_x?: number | null
          overlay_y?: number | null
          page_number?: number | null
          result?: string | null
          review_id?: string
          score_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_item_reviews_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "exam_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_prep_courses: {
        Row: {
          created_at: string
          created_by: string | null
          deadline_date: string
          deleted_at: string | null
          description: string | null
          id: string
          school_name: string | null
          subject: string
          teacher_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deadline_date: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          school_name?: string | null
          subject: string
          teacher_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deadline_date?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          school_name?: string | null
          subject?: string
          teacher_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exam_prep_enrollments: {
        Row: {
          change_reason: string | null
          confirmed_at: string | null
          course_id: string
          created_at: string
          id: string
          schedule_changed_at: string | null
          status: string
          student_id: string
        }
        Insert: {
          change_reason?: string | null
          confirmed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          schedule_changed_at?: string | null
          status?: string
          student_id: string
        }
        Update: {
          change_reason?: string | null
          confirmed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          schedule_changed_at?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_prep_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exam_prep_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_prep_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_prep_notifications: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          message: string | null
          notification_type: string
          student_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          student_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_prep_notifications_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exam_prep_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_prep_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_prep_schedules: {
        Row: {
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          deadline_date: string
          description: string | null
          end_time: string
          id: string
          schedule_date: string
          start_time: string
          status: string
          student_id: string
          subject: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline_date: string
          description?: string | null
          end_time: string
          id?: string
          schedule_date: string
          start_time: string
          status?: string
          student_id: string
          subject: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline_date?: string
          description?: string | null
          end_time?: string
          id?: string
          schedule_date?: string
          start_time?: string
          status?: string
          student_id?: string
          subject?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_prep_schedules_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_prep_sessions: {
        Row: {
          course_id: string
          created_at: string
          end_time: string
          id: string
          schedule_date: string
          session_label: string
          session_number: number
          start_time: string
        }
        Insert: {
          course_id: string
          created_at?: string
          end_time: string
          id?: string
          schedule_date: string
          session_label: string
          session_number: number
          start_time: string
        }
        Update: {
          course_id?: string
          created_at?: string
          end_time?: string
          id?: string
          schedule_date?: string
          session_label?: string
          session_number?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_prep_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exam_prep_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_prep_slot_students: {
        Row: {
          created_at: string
          id: string
          slot_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          slot_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          slot_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_prep_slot_students_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "exam_prep_time_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_prep_slot_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_prep_time_slots: {
        Row: {
          created_at: string
          end_time: string
          id: string
          session_id: string
          slot_order: number
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          session_id: string
          slot_order?: number
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          session_id?: string
          slot_order?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_prep_time_slots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_prep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_reviews: {
        Row: {
          created_at: string | null
          earned_score: number | null
          id: string
          is_published: boolean
          overall_comment: string | null
          published_at: string | null
          published_by: string | null
          published_by_name: string | null
          result_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          self_check_completed: boolean | null
          self_check_completed_at: string | null
          self_check_points_given: boolean | null
          template_id: string | null
          total_score: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          earned_score?: number | null
          id?: string
          is_published?: boolean
          overall_comment?: string | null
          published_at?: string | null
          published_by?: string | null
          published_by_name?: string | null
          result_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          self_check_completed?: boolean | null
          self_check_completed_at?: string | null
          self_check_points_given?: boolean | null
          template_id?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          earned_score?: number | null
          id?: string
          is_published?: boolean
          overall_comment?: string | null
          published_at?: string | null
          published_by?: string | null
          published_by_name?: string | null
          result_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          self_check_completed?: boolean | null
          self_check_completed_at?: string | null
          self_check_points_given?: boolean | null
          template_id?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_reviews_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_reviews_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: true
            referencedRelation: "student_exam_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_reviews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "exam_score_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_score_templates: {
        Row: {
          answer_image_paths: Json | null
          answer_mode: string | null
          answer_pdf_path: string | null
          answers: Json | null
          created_at: string
          created_by: string | null
          error_types: Json
          exam_period: string
          exam_type: string
          exam_year: number
          grade: string
          id: string
          items: Json
          school_name: string
          subject: string
          total_items: number
        }
        Insert: {
          answer_image_paths?: Json | null
          answer_mode?: string | null
          answer_pdf_path?: string | null
          answers?: Json | null
          created_at?: string
          created_by?: string | null
          error_types?: Json
          exam_period: string
          exam_type: string
          exam_year: number
          grade: string
          id?: string
          items?: Json
          school_name: string
          subject: string
          total_items?: number
        }
        Update: {
          answer_image_paths?: Json | null
          answer_mode?: string | null
          answer_pdf_path?: string | null
          answers?: Json | null
          created_at?: string
          created_by?: string | null
          error_types?: Json
          exam_period?: string
          exam_type?: string
          exam_year?: number
          grade?: string
          id?: string
          items?: Json
          school_name?: string
          subject?: string
          total_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_score_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_student_self_checks: {
        Row: {
          id: string
          item_number: number
          q_academy_helped: boolean | null
          q_concept_confused: boolean | null
          q_my_mistake: string | null
          q_need_more: string | null
          q_remembered: boolean | null
          review_id: string
          self_custom_reason: string | null
          self_error_types: Json | null
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          id?: string
          item_number: number
          q_academy_helped?: boolean | null
          q_concept_confused?: boolean | null
          q_my_mistake?: string | null
          q_need_more?: string | null
          q_remembered?: boolean | null
          review_id: string
          self_custom_reason?: string | null
          self_error_types?: Json | null
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          id?: string
          item_number?: number
          q_academy_helped?: boolean | null
          q_concept_confused?: boolean | null
          q_my_mistake?: string | null
          q_need_more?: string | null
          q_remembered?: boolean | null
          review_id?: string
          self_custom_reason?: string | null
          self_error_types?: Json | null
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_student_self_checks_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "exam_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_student_self_checks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_subject_details: {
        Row: {
          created_at: string
          event_id: string
          exam_date: string | null
          exam_scope: string | null
          exam_time: string | null
          id: string
          paper_file_size: number | null
          paper_mime_type: string | null
          paper_original_name: string | null
          paper_storage_path: string | null
          subject_name: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          exam_date?: string | null
          exam_scope?: string | null
          exam_time?: string | null
          id?: string
          paper_file_size?: number | null
          paper_mime_type?: string | null
          paper_original_name?: string | null
          paper_storage_path?: string | null
          subject_name: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          exam_date?: string | null
          exam_scope?: string | null
          exam_time?: string | null
          id?: string
          paper_file_size?: number | null
          paper_mime_type?: string | null
          paper_original_name?: string | null
          paper_storage_path?: string | null
          subject_name?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_subject_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "academy_events"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_monthly_tuition: {
        Row: {
          billed: number
          billed_at: string | null
          created_at: string
          id: string
          memo: string | null
          paid: number
          paid_at: string | null
          payment_method: string | null
          source: string | null
          student_id: string | null
          student_name: string
          teacher_id_override: string | null
          updated_at: string
          year_month: string
        }
        Insert: {
          billed?: number
          billed_at?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          paid?: number
          paid_at?: string | null
          payment_method?: string | null
          source?: string | null
          student_id?: string | null
          student_name: string
          teacher_id_override?: string | null
          updated_at?: string
          year_month: string
        }
        Update: {
          billed?: number
          billed_at?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          paid?: number
          paid_at?: string | null
          payment_method?: string | null
          source?: string | null
          student_id?: string | null
          student_name?: string
          teacher_id_override?: string | null
          updated_at?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_monthly_tuition_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_monthly_tuition_teacher_id_override_fkey"
            columns: ["teacher_id_override"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_by: string | null
          end_date: string | null
          homework_type: string
          id: string
          lesson_record_id: string | null
          notes: string | null
          points_earned: number | null
          required_submissions: number
          result: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submission_audio_url: string | null
          submission_image_url: string | null
          submission_text: string | null
          submitted_at: string | null
        }
        Insert: {
          assigned_date?: string
          check_status?: string
          checked_at?: string | null
          checked_by?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          homework_type?: string
          id?: string
          lesson_record_id?: string | null
          notes?: string | null
          points_earned?: number | null
          required_submissions?: number
          result?: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submission_audio_url?: string | null
          submission_image_url?: string | null
          submission_text?: string | null
          submitted_at?: string | null
        }
        Update: {
          assigned_date?: string
          check_status?: string
          checked_at?: string | null
          checked_by?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          homework_type?: string
          id?: string
          lesson_record_id?: string | null
          notes?: string | null
          points_earned?: number | null
          required_submissions?: number
          result?: string | null
          student_id?: string
          subject?: Database["public"]["Enums"]["subject_type"]
          submission_audio_url?: string | null
          submission_image_url?: string | null
          submission_text?: string | null
          submitted_at?: string | null
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
      homework_link_repair_log: {
        Row: {
          homework_id: string
          id: string
          new_lesson_record_id: string
          previous_lesson_record_id: string | null
          reason: string
          repaired_at: string
          repaired_by: string | null
          revert_reason: string | null
          reverted: boolean
          reverted_at: string | null
        }
        Insert: {
          homework_id: string
          id?: string
          new_lesson_record_id: string
          previous_lesson_record_id?: string | null
          reason: string
          repaired_at?: string
          repaired_by?: string | null
          revert_reason?: string | null
          reverted?: boolean
          reverted_at?: string | null
        }
        Update: {
          homework_id?: string
          id?: string
          new_lesson_record_id?: string
          previous_lesson_record_id?: string | null
          reason?: string
          repaired_at?: string
          repaired_by?: string | null
          revert_reason?: string | null
          reverted?: boolean
          reverted_at?: string | null
        }
        Relationships: []
      }
      homework_submissions: {
        Row: {
          created_at: string
          feedback: string | null
          homework_id: string
          id: string
          image_url: string | null
          points_awarded: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_id: string
          submission_note: string | null
          submitted_at: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          homework_id: string
          id?: string
          image_url?: string | null
          points_awarded?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_id: string
          submission_note?: string | null
          submitted_at?: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          homework_id?: string
          id?: string
          image_url?: string | null
          points_awarded?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_id?: string
          submission_note?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      intensive_applications: {
        Row: {
          billed_at: string | null
          billed_month: string | null
          child_name: string
          consent_agreed: boolean
          created_at: string
          expectations: string[]
          fee: number
          grade: string
          id: string
          student_id: string | null
          wishes: string | null
        }
        Insert: {
          billed_at?: string | null
          billed_month?: string | null
          child_name: string
          consent_agreed?: boolean
          created_at?: string
          expectations?: string[]
          fee?: number
          grade: string
          id?: string
          student_id?: string | null
          wishes?: string | null
        }
        Update: {
          billed_at?: string | null
          billed_month?: string | null
          child_name?: string
          consent_agreed?: boolean
          created_at?: string
          expectations?: string[]
          fee?: number
          grade?: string
          id?: string
          student_id?: string | null
          wishes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intensive_applications_student_id_fkey"
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
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          course: string | null
          created_at: string
          curriculum_unit_key: string | null
          curriculum_version: string | null
          draft_created_at: string
          english_grammar_unit: string | null
          english_pass_fail: string | null
          english_pass_fail_2: string | null
          english_reading_units: string[] | null
          homework_check_note: string | null
          homework_status: string
          id: string
          internal_notes: string | null
          is_common_entry: boolean
          korean_categories: string[] | null
          learning_issues: string[] | null
          learning_issues_note: string | null
          lesson_date: string
          lesson_range: string
          lesson_types: string[] | null
          next_lesson_goal: string | null
          notes: string | null
          parent_direct_message: string | null
          prev_homework_override_at: string | null
          prev_homework_override_by: string | null
          prev_homework_override_text: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submitted: boolean
          submitted_at: string | null
          teacher_display_name: string | null
          teacher_id: string
          test_assistant: string | null
          test_assistant_2: string | null
          test_content: string | null
          test_content_2: string | null
          test_date: string | null
          test_date_2: string | null
          test_name: string | null
          test_name_2: string | null
          test_notes: string | null
          test_result: string
          test_result_2: string | null
          test_result_text: string | null
          test_result_text_2: string | null
          test_time: string | null
          test_title: string | null
          understanding_score: number | null
          updated_at: string
          weekly_summary: string | null
          weekly_summary_week: string | null
        }
        Insert: {
          attendance_status?: string[] | null
          class_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          course?: string | null
          created_at?: string
          curriculum_unit_key?: string | null
          curriculum_version?: string | null
          draft_created_at?: string
          english_grammar_unit?: string | null
          english_pass_fail?: string | null
          english_pass_fail_2?: string | null
          english_reading_units?: string[] | null
          homework_check_note?: string | null
          homework_status: string
          id?: string
          internal_notes?: string | null
          is_common_entry?: boolean
          korean_categories?: string[] | null
          learning_issues?: string[] | null
          learning_issues_note?: string | null
          lesson_date?: string
          lesson_range: string
          lesson_types?: string[] | null
          next_lesson_goal?: string | null
          notes?: string | null
          parent_direct_message?: string | null
          prev_homework_override_at?: string | null
          prev_homework_override_by?: string | null
          prev_homework_override_text?: string | null
          student_id: string
          subject: Database["public"]["Enums"]["subject_type"]
          submitted?: boolean
          submitted_at?: string | null
          teacher_display_name?: string | null
          teacher_id: string
          test_assistant?: string | null
          test_assistant_2?: string | null
          test_content?: string | null
          test_content_2?: string | null
          test_date?: string | null
          test_date_2?: string | null
          test_name?: string | null
          test_name_2?: string | null
          test_notes?: string | null
          test_result?: string
          test_result_2?: string | null
          test_result_text?: string | null
          test_result_text_2?: string | null
          test_time?: string | null
          test_title?: string | null
          understanding_score?: number | null
          updated_at?: string
          weekly_summary?: string | null
          weekly_summary_week?: string | null
        }
        Update: {
          attendance_status?: string[] | null
          class_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          course?: string | null
          created_at?: string
          curriculum_unit_key?: string | null
          curriculum_version?: string | null
          draft_created_at?: string
          english_grammar_unit?: string | null
          english_pass_fail?: string | null
          english_pass_fail_2?: string | null
          english_reading_units?: string[] | null
          homework_check_note?: string | null
          homework_status?: string
          id?: string
          internal_notes?: string | null
          is_common_entry?: boolean
          korean_categories?: string[] | null
          learning_issues?: string[] | null
          learning_issues_note?: string | null
          lesson_date?: string
          lesson_range?: string
          lesson_types?: string[] | null
          next_lesson_goal?: string | null
          notes?: string | null
          parent_direct_message?: string | null
          prev_homework_override_at?: string | null
          prev_homework_override_by?: string | null
          prev_homework_override_text?: string | null
          student_id?: string
          subject?: Database["public"]["Enums"]["subject_type"]
          submitted?: boolean
          submitted_at?: string | null
          teacher_display_name?: string | null
          teacher_id?: string
          test_assistant?: string | null
          test_assistant_2?: string | null
          test_content?: string | null
          test_content_2?: string | null
          test_date?: string | null
          test_date_2?: string | null
          test_name?: string | null
          test_name_2?: string | null
          test_notes?: string | null
          test_result?: string
          test_result_2?: string | null
          test_result_text?: string | null
          test_result_text_2?: string | null
          test_time?: string | null
          test_title?: string | null
          understanding_score?: number | null
          updated_at?: string
          weekly_summary?: string | null
          weekly_summary_week?: string | null
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
            foreignKeyName: "lesson_records_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      material_files: {
        Row: {
          created_at: string
          file_size: number | null
          folder_id: string | null
          id: string
          mime_type: string | null
          original_name: string
          storage_path: string
          subject: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          original_name: string
          storage_path: string
          subject: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          original_name?: string
          storage_path?: string
          subject?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "material_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      material_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          subject: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          subject: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "material_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      material_links: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          folder_id: string | null
          id: string
          sort_order: number
          subject: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          sort_order?: number
          subject: string
          title: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          sort_order?: number
          subject?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_links_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "material_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      math_answers: {
        Row: {
          answer_input_mode: string
          answer_photo_urls: string[]
          answer_type: string
          content: string | null
          created_at: string
          id: string
          is_shared_to_all: boolean
          question_id: string
          teacher_id: string
          video_url: string | null
        }
        Insert: {
          answer_input_mode?: string
          answer_photo_urls?: string[]
          answer_type: string
          content?: string | null
          created_at?: string
          id?: string
          is_shared_to_all?: boolean
          question_id: string
          teacher_id: string
          video_url?: string | null
        }
        Update: {
          answer_input_mode?: string
          answer_photo_urls?: string[]
          answer_type?: string
          content?: string | null
          created_at?: string
          id?: string
          is_shared_to_all?: boolean
          question_id?: string
          teacher_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "math_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "math_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      math_concept_quizzes: {
        Row: {
          answer_code: string | null
          concept_id: string
          created_at: string
          id: string
          questions: Json
          status: string
          subtitle: string | null
          title: string | null
          updated_at: string
          version_label: string | null
          version_number: number
        }
        Insert: {
          answer_code?: string | null
          concept_id: string
          created_at?: string
          id?: string
          questions?: Json
          status?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          version_label?: string | null
          version_number?: number
        }
        Update: {
          answer_code?: string | null
          concept_id?: string
          created_at?: string
          id?: string
          questions?: Json
          status?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          version_label?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "math_concept_quizzes_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "math_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      math_concepts: {
        Row: {
          course: string
          created_at: string
          created_by: string | null
          extracted_text: string | null
          grade: string
          id: string
          pdf_file_size: number | null
          pdf_original_name: string
          pdf_storage_path: string
          quiz_generation_prompt: string | null
          status: string
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          course: string
          created_at?: string
          created_by?: string | null
          extracted_text?: string | null
          grade: string
          id?: string
          pdf_file_size?: number | null
          pdf_original_name: string
          pdf_storage_path: string
          quiz_generation_prompt?: string | null
          status?: string
          subject?: string
          title: string
          updated_at?: string
        }
        Update: {
          course?: string
          created_at?: string
          created_by?: string | null
          extracted_text?: string | null
          grade?: string
          id?: string
          pdf_file_size?: number | null
          pdf_original_name?: string
          pdf_storage_path?: string
          quiz_generation_prompt?: string | null
          status?: string
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      math_questions: {
        Row: {
          created_at: string
          date: string
          description: string | null
          grade: string
          id: string
          is_shared: boolean
          photo_problem_url: string
          photo_solution_url: string
          shared_from_id: string | null
          source_text: string
          status: string
          student_id: string
          subject: string
          teacher_id: string | null
          title: string
          view_count: number
        }
        Insert: {
          created_at?: string
          date?: string
          description?: string | null
          grade: string
          id?: string
          is_shared?: boolean
          photo_problem_url: string
          photo_solution_url: string
          shared_from_id?: string | null
          source_text: string
          status?: string
          student_id: string
          subject: string
          teacher_id?: string | null
          title: string
          view_count?: number
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          grade?: string
          id?: string
          is_shared?: boolean
          photo_problem_url?: string
          photo_solution_url?: string
          shared_from_id?: string | null
          source_text?: string
          status?: string
          student_id?: string
          subject?: string
          teacher_id?: string | null
          title?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "math_questions_shared_from_id_fkey"
            columns: ["shared_from_id"]
            isOneToOne: false
            referencedRelation: "math_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_questions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      math_quiz_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          class_id: string | null
          id: string
          quiz_id: string
          student_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          class_id?: string | null
          id?: string
          quiz_id: string
          student_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          class_id?: string | null
          id?: string
          quiz_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_quiz_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_quiz_assignments_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "math_concept_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_quiz_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      math_quiz_submissions: {
        Row: {
          ai_grading_result: Json | null
          ai_total_questions: number | null
          ai_total_score: number | null
          concept_id: string
          created_at: string
          id: string
          image_urls: string[]
          points_awarded: number | null
          quiz_id: string
          status: string
          student_id: string
          submitted_at: string
          teacher_feedback: string | null
          teacher_override_result: Json | null
          teacher_reviewed_at: string | null
          teacher_reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          ai_grading_result?: Json | null
          ai_total_questions?: number | null
          ai_total_score?: number | null
          concept_id: string
          created_at?: string
          id?: string
          image_urls?: string[]
          points_awarded?: number | null
          quiz_id: string
          status?: string
          student_id: string
          submitted_at?: string
          teacher_feedback?: string | null
          teacher_override_result?: Json | null
          teacher_reviewed_at?: string | null
          teacher_reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          ai_grading_result?: Json | null
          ai_total_questions?: number | null
          ai_total_score?: number | null
          concept_id?: string
          created_at?: string
          id?: string
          image_urls?: string[]
          points_awarded?: number | null
          quiz_id?: string
          status?: string
          student_id?: string
          submitted_at?: string
          teacher_feedback?: string | null
          teacher_override_result?: Json | null
          teacher_reviewed_at?: string | null
          teacher_reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_quiz_submissions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "math_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_quiz_submissions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "math_concept_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_quiz_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      math_student_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          student_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_student_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "math_student_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_student_group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      math_student_groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mentor_map_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_value: string | null
          id: string
          memo: string | null
          request_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_value?: string | null
          id?: string
          memo?: string | null
          request_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_value?: string | null
          id?: string
          memo?: string | null
          request_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_map_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mentor_map_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_map_requests: {
        Row: {
          assigned_at: string | null
          assigned_teacher_id: string | null
          author_type: string
          comm_pref: Json
          consent_at: string
          contact_owner: string
          contact_phone: string
          created_at: string
          free_note: string | null
          grade: string | null
          id: string
          parent_answers: Json
          preferred_method: string | null
          preferred_time: string | null
          priority_subjects: string[]
          school_level: string
          school_name: string | null
          score_info: Json
          source: string
          status: string
          student_answers: Json
          student_name: string
          subject_answers: Json
          subjects: string[]
          submission_hash: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_teacher_id?: string | null
          author_type: string
          comm_pref?: Json
          consent_at?: string
          contact_owner?: string
          contact_phone: string
          created_at?: string
          free_note?: string | null
          grade?: string | null
          id?: string
          parent_answers?: Json
          preferred_method?: string | null
          preferred_time?: string | null
          priority_subjects?: string[]
          school_level: string
          school_name?: string | null
          score_info?: Json
          source?: string
          status?: string
          student_answers?: Json
          student_name: string
          subject_answers?: Json
          subjects?: string[]
          submission_hash?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_teacher_id?: string | null
          author_type?: string
          comm_pref?: Json
          consent_at?: string
          contact_owner?: string
          contact_phone?: string
          created_at?: string
          free_note?: string | null
          grade?: string | null
          id?: string
          parent_answers?: Json
          preferred_method?: string | null
          preferred_time?: string | null
          priority_subjects?: string[]
          school_level?: string
          school_name?: string | null
          score_info?: Json
          source?: string
          status?: string
          student_answers?: Json
          student_name?: string
          subject_answers?: Json
          subjects?: string[]
          submission_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ops_changelog: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          log_date: string
          log_type: string
          target: string | null
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          log_date?: string
          log_type?: string
          target?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          log_date?: string
          log_type?: string
          target?: string | null
        }
        Relationships: []
      }
      parent_announcement_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      parent_learning_feedback: {
        Row: {
          consent_version: string
          daily_topics: string[]
          delivery_preference: string | null
          guardian_name: string | null
          guardian_relationship: string | null
          id: string
          improvement_feedback: string | null
          learning_interests: string[]
          learning_management_consent: boolean
          legal_representative_confirmed: boolean
          notification_preference: string | null
          parent_message: string | null
          portal_feedback: string | null
          public_web_consent: boolean
          satisfaction_areas: string[]
          student_id: string
          submitted_at: string
          survey_notice_confirmed: boolean
          updated_at: string
          weekly_detail_preference: string | null
        }
        Insert: {
          consent_version?: string
          daily_topics?: string[]
          delivery_preference?: string | null
          guardian_name?: string | null
          guardian_relationship?: string | null
          id?: string
          improvement_feedback?: string | null
          learning_interests?: string[]
          learning_management_consent?: boolean
          legal_representative_confirmed?: boolean
          notification_preference?: string | null
          parent_message?: string | null
          portal_feedback?: string | null
          public_web_consent?: boolean
          satisfaction_areas?: string[]
          student_id: string
          submitted_at?: string
          survey_notice_confirmed?: boolean
          updated_at?: string
          weekly_detail_preference?: string | null
        }
        Update: {
          consent_version?: string
          daily_topics?: string[]
          delivery_preference?: string | null
          guardian_name?: string | null
          guardian_relationship?: string | null
          id?: string
          improvement_feedback?: string | null
          learning_interests?: string[]
          learning_management_consent?: boolean
          legal_representative_confirmed?: boolean
          notification_preference?: string | null
          parent_message?: string | null
          portal_feedback?: string | null
          public_web_consent?: boolean
          satisfaction_areas?: string[]
          student_id?: string
          submitted_at?: string
          survey_notice_confirmed?: boolean
          updated_at?: string
          weekly_detail_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_learning_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_notifications: {
        Row: {
          id: string
          is_read: boolean
          message: string
          parent_phone: string
          student_id: string
          timestamp: string
          type: string
        }
        Insert: {
          id?: string
          is_read?: boolean
          message: string
          parent_phone: string
          student_id: string
          timestamp?: string
          type?: string
        }
        Update: {
          id?: string
          is_read?: boolean
          message?: string
          parent_phone?: string
          student_id?: string
          timestamp?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_portal_visits: {
        Row: {
          id: string
          ip_address: string | null
          student_id: string
          visited_at: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          student_id: string
          visited_at?: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          student_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_portal_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_survey_sends: {
        Row: {
          error_message: string | null
          id: string
          provider_message_id: string | null
          sent_at: string
          sent_by: string | null
          status: string
          student_id: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          student_id: string
        }
        Update: {
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_survey_sends_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_alerts: {
        Row: {
          created_date: string
          description: string
          id: string
          priority: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          student_id: string | null
          type: string
        }
        Insert: {
          created_date?: string
          description: string
          id?: string
          priority?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          student_id?: string | null
          type: string
        }
        Update: {
          created_date?: string
          description?: string
          id?: string
          priority?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          student_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          billing_schedule_id: string | null
          created_at: string
          id: string
          memo: string | null
          paid_date: string
          payment_method: string
          receipt_number: string | null
          recorded_by: string | null
          student_id: string
        }
        Insert: {
          amount: number
          billing_schedule_id?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          paid_date: string
          payment_method?: string
          receipt_number?: string | null
          recorded_by?: string | null
          student_id: string
        }
        Update: {
          amount?: number
          billing_schedule_id?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          paid_date?: string
          payment_method?: string
          receipt_number?: string | null
          recorded_by?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_billing_schedule_id_fkey"
            columns: ["billing_schedule_id"]
            isOneToOne: false
            referencedRelation: "billing_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_checks: {
        Row: {
          content_note: string | null
          created_at: string
          cutline: number | null
          design_id: string
          error_type: string | null
          goal_id: string | null
          id: string
          method: string
          passed: boolean | null
          score: number | null
          session_id: string | null
          student_id: string
        }
        Insert: {
          content_note?: string | null
          created_at?: string
          cutline?: number | null
          design_id: string
          error_type?: string | null
          goal_id?: string | null
          id?: string
          method?: string
          passed?: boolean | null
          score?: number | null
          session_id?: string | null
          student_id: string
        }
        Update: {
          content_note?: string | null
          created_at?: string
          cutline?: number | null
          design_id?: string
          error_type?: string | null
          goal_id?: string | null
          id?: string
          method?: string
          passed?: boolean | null
          score?: number | null
          session_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_checks_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_checks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_checks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_co_teachers: {
        Row: {
          created_at: string
          created_by: string | null
          design_id: string
          end_date: string
          id: string
          role_note: string | null
          start_date: string
          status: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          design_id: string
          end_date: string
          id?: string
          role_note?: string | null
          start_date: string
          status?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          design_id?: string
          end_date?: string
          id?: string
          role_note?: string | null
          start_date?: string
          status?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_co_teachers_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_designs: {
        Row: {
          angle_mode: string
          check_cycle: string
          check_methods: Json
          class_id: string | null
          created_at: string
          cutline_by_type: Json
          cutline_default: number
          end_goal_id: string | null
          escalate_after: number
          fail_action: string
          id: string
          pace_alert_sessions: number
          rhythm: Json
          status: string
          target_date: string | null
          teacher_id: string
          teaching_mode: string
          title: string
          track_id: string
          type_concepts: Json
          updated_at: string
        }
        Insert: {
          angle_mode?: string
          check_cycle?: string
          check_methods?: Json
          class_id?: string | null
          created_at?: string
          cutline_by_type?: Json
          cutline_default?: number
          end_goal_id?: string | null
          escalate_after?: number
          fail_action?: string
          id?: string
          pace_alert_sessions?: number
          rhythm?: Json
          status?: string
          target_date?: string | null
          teacher_id: string
          teaching_mode?: string
          title: string
          track_id: string
          type_concepts?: Json
          updated_at?: string
        }
        Update: {
          angle_mode?: string
          check_cycle?: string
          check_methods?: Json
          class_id?: string | null
          created_at?: string
          cutline_by_type?: Json
          cutline_default?: number
          end_goal_id?: string | null
          escalate_after?: number
          fail_action?: string
          id?: string
          pace_alert_sessions?: number
          rhythm?: Json
          status?: string
          target_date?: string | null
          teacher_id?: string
          teaching_mode?: string
          title?: string
          track_id?: string
          type_concepts?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_designs_end_goal_id_fkey"
            columns: ["end_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_designs_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "plan_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_flags: {
        Row: {
          created_at: string
          design_id: string
          id: string
          kind: string
          level: string
          message: string
          resolved_at: string | null
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          design_id: string
          id?: string
          kind: string
          level?: string
          message: string
          resolved_at?: string | null
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          design_id?: string
          id?: string
          kind?: string
          level?: string
          message?: string
          resolved_at?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_flags_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_goal_progress: {
        Row: {
          advanced_at: string | null
          design_id: string
          goal_id: string
          id: string
          next_review_date: string | null
          partial_upto: string | null
          review_count: number
          review_interval: number | null
          session_id: string | null
          status: string
          student_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          advanced_at?: string | null
          design_id: string
          goal_id: string
          id?: string
          next_review_date?: string | null
          partial_upto?: string | null
          review_count?: number
          review_interval?: number | null
          session_id?: string | null
          status?: string
          student_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          advanced_at?: string | null
          design_id?: string
          goal_id?: string
          id?: string
          next_review_date?: string | null
          partial_upto?: string | null
          review_count?: number
          review_interval?: number | null
          session_id?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_goal_progress_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_goal_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_goal_progress_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_goals: {
        Row: {
          created_at: string
          id: string
          order_index: number
          pages: string | null
          title: string
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index: number
          pages?: string | null
          title: string
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          pages?: string | null
          title?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_goals_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "plan_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_intensive_students: {
        Row: {
          id: string
          intensive_id: string
          student_id: string
        }
        Insert: {
          id?: string
          intensive_id: string
          student_id: string
        }
        Update: {
          id?: string
          intensive_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_intensive_students_intensive_id_fkey"
            columns: ["intensive_id"]
            isOneToOne: false
            referencedRelation: "plan_intensives"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_intensives: {
        Row: {
          added_sessions: number
          created_at: string
          created_by: string | null
          design_id: string
          end_date: string
          id: string
          label: string
          note: string | null
          rhythm: Json
          scope: string
          start_date: string
        }
        Insert: {
          added_sessions?: number
          created_at?: string
          created_by?: string | null
          design_id: string
          end_date: string
          id?: string
          label: string
          note?: string | null
          rhythm?: Json
          scope?: string
          start_date: string
        }
        Update: {
          added_sessions?: number
          created_at?: string
          created_by?: string | null
          design_id?: string
          end_date?: string
          id?: string
          label?: string
          note?: string | null
          rhythm?: Json
          scope?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_intensives_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_planner_prints: {
        Row: {
          design_id: string
          id: string
          period_month: string
          printed_at: string
          printed_by: string | null
          snapshot_updated_at: string | null
        }
        Insert: {
          design_id: string
          id?: string
          period_month: string
          printed_at?: string
          printed_by?: string | null
          snapshot_updated_at?: string | null
        }
        Update: {
          design_id?: string
          id?: string
          period_month?: string
          printed_at?: string
          printed_by?: string | null
          snapshot_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_planner_prints_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_queue: {
        Row: {
          assignee: string
          created_at: string
          design_id: string
          goal_id: string | null
          id: string
          kind: string
          resolved_at: string | null
          source_check_id: string | null
          status: string
          student_id: string
          title: string
        }
        Insert: {
          assignee?: string
          created_at?: string
          design_id: string
          goal_id?: string | null
          id?: string
          kind: string
          resolved_at?: string | null
          source_check_id?: string | null
          status?: string
          student_id: string
          title: string
        }
        Update: {
          assignee?: string
          created_at?: string
          design_id?: string
          goal_id?: string | null
          id?: string
          kind?: string
          resolved_at?: string | null
          source_check_id?: string | null
          status?: string
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_queue_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_queue_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_queue_source_check_id_fkey"
            columns: ["source_check_id"]
            isOneToOne: false
            referencedRelation: "plan_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_sessions: {
        Row: {
          assigned_teacher_id: string | null
          cancel_reason: string | null
          created_at: string
          design_id: string
          goal_id: string | null
          id: string
          intensive_id: string | null
          note: string | null
          role: string
          saved_at: string | null
          session_date: string
          status: string
        }
        Insert: {
          assigned_teacher_id?: string | null
          cancel_reason?: string | null
          created_at?: string
          design_id: string
          goal_id?: string | null
          id?: string
          intensive_id?: string | null
          note?: string | null
          role?: string
          saved_at?: string | null
          session_date: string
          status?: string
        }
        Update: {
          assigned_teacher_id?: string | null
          cancel_reason?: string | null
          created_at?: string
          design_id?: string
          goal_id?: string | null
          id?: string
          intensive_id?: string | null
          note?: string | null
          role?: string
          saved_at?: string | null
          session_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_sessions_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_sessions_intensive_id_fkey"
            columns: ["intensive_id"]
            isOneToOne: false
            referencedRelation: "plan_intensives"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_student_retros: {
        Row: {
          change_note: string | null
          created_at: string
          design_id: string | null
          id: string
          points_awarded: number
          replied_at: string | null
          replied_by: string | null
          stuck_note: string | null
          student_id: string
          teacher_reply: string | null
          understanding: number | null
          week_start: string
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          design_id?: string | null
          id?: string
          points_awarded?: number
          replied_at?: string | null
          replied_by?: string | null
          stuck_note?: string | null
          student_id: string
          teacher_reply?: string | null
          understanding?: number | null
          week_start: string
        }
        Update: {
          change_note?: string | null
          created_at?: string
          design_id?: string | null
          id?: string
          points_awarded?: number
          replied_at?: string | null
          replied_by?: string | null
          stuck_note?: string | null
          student_id?: string
          teacher_reply?: string | null
          understanding?: number | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_student_retros_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_students: {
        Row: {
          created_at: string
          custom_end_goal_id: string | null
          custom_target_date: string | null
          design_id: string
          id: string
          joined_at: string | null
          start_goal_id: string | null
          student_id: string
          student_type: string | null
        }
        Insert: {
          created_at?: string
          custom_end_goal_id?: string | null
          custom_target_date?: string | null
          design_id: string
          id?: string
          joined_at?: string | null
          start_goal_id?: string | null
          student_id: string
          student_type?: string | null
        }
        Update: {
          created_at?: string
          custom_end_goal_id?: string | null
          custom_target_date?: string | null
          design_id?: string
          id?: string
          joined_at?: string | null
          start_goal_id?: string | null
          student_id?: string
          student_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_students_custom_end_goal_id_fkey"
            columns: ["custom_end_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_students_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_students_start_goal_id_fkey"
            columns: ["start_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_teacher_memos: {
        Row: {
          content: string
          created_at: string
          design_id: string
          id: string
          session_id: string | null
          shown: boolean
        }
        Insert: {
          content: string
          created_at?: string
          design_id: string
          id?: string
          session_id?: string | null
          shown?: boolean
        }
        Update: {
          content?: string
          created_at?: string
          design_id?: string
          id?: string
          session_id?: string | null
          shown?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_teacher_memos_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "plan_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_teacher_memos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tracks: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          subject: string
          textbook: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          subject: string
          textbook?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string
          textbook?: string | null
          title?: string
        }
        Relationships: []
      }
      prep_lecture_proposals: {
        Row: {
          confirmed_course_id: string | null
          created_at: string
          exam_date: string
          exam_title: string | null
          grade_year: number | null
          id: string
          notes: string | null
          notify_students: boolean
          school_level: string | null
          school_name: string
          school_schedule_id: string | null
          selected_classroom_id: string | null
          selected_end_time: string | null
          selected_start_time: string | null
          status: string
          student_ids: string[]
          subject: string
          target_date: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          confirmed_course_id?: string | null
          created_at?: string
          exam_date: string
          exam_title?: string | null
          grade_year?: number | null
          id?: string
          notes?: string | null
          notify_students?: boolean
          school_level?: string | null
          school_name: string
          school_schedule_id?: string | null
          selected_classroom_id?: string | null
          selected_end_time?: string | null
          selected_start_time?: string | null
          status?: string
          student_ids?: string[]
          subject: string
          target_date: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_course_id?: string | null
          created_at?: string
          exam_date?: string
          exam_title?: string | null
          grade_year?: number | null
          id?: string
          notes?: string | null
          notify_students?: boolean
          school_level?: string | null
          school_name?: string
          school_schedule_id?: string | null
          selected_classroom_id?: string | null
          selected_end_time?: string | null
          selected_start_time?: string | null
          status?: string
          student_ids?: string[]
          subject?: string
          target_date?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_lecture_proposals_confirmed_course_id_fkey"
            columns: ["confirmed_course_id"]
            isOneToOne: false
            referencedRelation: "exam_prep_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_lecture_proposals_school_schedule_id_fkey"
            columns: ["school_schedule_id"]
            isOneToOne: false
            referencedRelation: "school_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_lecture_proposals_selected_classroom_id_fkey"
            columns: ["selected_classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_lecture_proposals_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      private_channel_members: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      private_channel_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      private_messages: {
        Row: {
          assignee: string | null
          body: string | null
          category_tags: string[] | null
          created_at: string
          done_at: string | null
          due_at: string | null
          from_user_id: string
          id: string
          kind: string
          link_url: string | null
          link_urls: string[] | null
          parent_id: string | null
          priority: string
          read_at: string | null
          status: string
          title: string
          to_user_id: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          body?: string | null
          category_tags?: string[] | null
          created_at?: string
          done_at?: string | null
          due_at?: string | null
          from_user_id: string
          id?: string
          kind?: string
          link_url?: string | null
          link_urls?: string[] | null
          parent_id?: string | null
          priority?: string
          read_at?: string | null
          status?: string
          title: string
          to_user_id: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          body?: string | null
          category_tags?: string[] | null
          created_at?: string
          done_at?: string | null
          due_at?: string | null
          from_user_id?: string
          id?: string
          kind?: string
          link_url?: string | null
          link_urls?: string[] | null
          parent_id?: string | null
          priority?: string
          read_at?: string | null
          status?: string
          title?: string
          to_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "private_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assigned_subject: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          student_course: string | null
          student_grade: string | null
          updated_at: string
        }
        Insert: {
          assigned_subject?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          student_course?: string | null
          student_grade?: string | null
          updated_at?: string
        }
        Update: {
          assigned_subject?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          student_course?: string | null
          student_grade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      report_delivery_events: {
        Row: {
          actor_id: string
          channel: string
          created_at: string
          id: string
          idempotency_key: string | null
          note: string | null
          report_id: string
          status: string
        }
        Insert: {
          actor_id?: string
          channel: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          report_id: string
          status: string
        }
        Update: {
          actor_id?: string
          channel?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          report_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_delivery_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
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
      room_assignments: {
        Row: {
          assigned_date: string | null
          created_at: string
          day: string | null
          id: string
          is_fixed: boolean
          is_routine: boolean
          memo: string | null
          room: string
          routine_days: Json | null
          slot_end: string
          slot_start: string
          span: number
          student_id: string | null
          student_ids: Json | null
          student_names: Json | null
          subject: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_date?: string | null
          created_at?: string
          day?: string | null
          id?: string
          is_fixed?: boolean
          is_routine?: boolean
          memo?: string | null
          room: string
          routine_days?: Json | null
          slot_end: string
          slot_start: string
          span?: number
          student_id?: string | null
          student_ids?: Json | null
          student_names?: Json | null
          subject?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_date?: string | null
          created_at?: string
          day?: string | null
          id?: string
          is_fixed?: boolean
          is_routine?: boolean
          memo?: string | null
          room?: string
          routine_days?: Json | null
          slot_end?: string
          slot_start?: string
          span?: number
          student_id?: string | null
          student_ids?: Json | null
          student_names?: Json | null
          subject?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      room_capacities: {
        Row: {
          capacity: number
          label: string | null
          room_id: string
        }
        Insert: {
          capacity?: number
          label?: string | null
          room_id: string
        }
        Update: {
          capacity?: number
          label?: string | null
          room_id?: string
        }
        Relationships: []
      }
      room_slot_copies: {
        Row: {
          copied_by: string
          created_at: string
          id: string
          room: string
          source_date: string
          target_date: string
        }
        Insert: {
          copied_by: string
          created_at?: string
          id?: string
          room: string
          source_date: string
          target_date: string
        }
        Update: {
          copied_by?: string
          created_at?: string
          id?: string
          room?: string
          source_date?: string
          target_date?: string
        }
        Relationships: []
      }
      routine_generation_logs: {
        Row: {
          created_at: string | null
          generated_date: string
          id: string
          routine_id: string | null
          student_ids: Json | null
          test_record_ids: Json | null
        }
        Insert: {
          created_at?: string | null
          generated_date: string
          id?: string
          routine_id?: string | null
          student_ids?: Json | null
          test_record_ids?: Json | null
        }
        Update: {
          created_at?: string | null
          generated_date?: string
          id?: string
          routine_id?: string | null
          student_ids?: Json | null
          test_record_ids?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_generation_logs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routine_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_schedules: {
        Row: {
          assistant_name: string | null
          auto_create_test: boolean | null
          created_at: string
          day_of_week: number
          end_time: string | null
          id: string
          is_active: boolean
          last_generated_date: string | null
          room: string
          start_time: string | null
          student_ids: Json
          subject: string | null
          teacher_id: string
          template_content: string | null
          test_content: string | null
          type: string
          updated_at: string
        }
        Insert: {
          assistant_name?: string | null
          auto_create_test?: boolean | null
          created_at?: string
          day_of_week: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          room?: string
          start_time?: string | null
          student_ids?: Json
          subject?: string | null
          teacher_id: string
          template_content?: string | null
          test_content?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          assistant_name?: string | null
          auto_create_test?: boolean | null
          created_at?: string
          day_of_week?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          room?: string
          start_time?: string | null
          student_ids?: Json
          subject?: string | null
          teacher_id?: string
          template_content?: string | null
          test_content?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_group_assignments: {
        Row: {
          created_at: string
          group_id: string
          id: string
          schedule_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          schedule_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_group_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_group_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_group_exceptions: {
        Row: {
          created_at: string
          group_id: string
          id: string
          reason: string | null
          schedule_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          reason?: string | null
          schedule_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          reason?: string | null
          schedule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_group_exceptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_group_exceptions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_group_exceptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_overrides: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          id: string
          new_date: string | null
          new_end_time: string | null
          new_start_time: string | null
          original_date: string
          override_type: string
          reason: string | null
          schedule_id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_date?: string | null
          new_end_time?: string | null
          new_start_time?: string | null
          original_date: string
          override_type?: string
          reason?: string | null
          schedule_id: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_date?: string | null
          new_end_time?: string | null
          new_start_time?: string | null
          original_date?: string
          override_type?: string
          reason?: string | null
          schedule_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_overrides_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      school_calendar_images: {
        Row: {
          academic_year: number
          created_at: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_name: string
          school_level: string
          school_name: string
          semester: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          academic_year?: number
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name: string
          school_level?: string
          school_name: string
          semester?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          academic_year?: number
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string
          school_level?: string
          school_name?: string
          semester?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      school_exam_archives: {
        Row: {
          academic_year: number
          academy_prep_notes: string | null
          course_name: string | null
          created_at: string
          created_by: string | null
          difficulty_level: string | null
          exam_analysis_detail: string | null
          exam_average_score: number | null
          exam_date_end: string | null
          exam_date_start: string | null
          exam_scope: string | null
          exam_type: string
          grade_ratio: string | null
          grade_year: number
          id: string
          notes: string | null
          performance_assessment_info: string | null
          post_exam_analysis: string | null
          preparing_teachers: string[] | null
          school_level: string
          school_name: string
          semester: string
          status: string
          subject: string
          teacher_notes: Json
          textbook_publisher: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: number
          academy_prep_notes?: string | null
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          difficulty_level?: string | null
          exam_analysis_detail?: string | null
          exam_average_score?: number | null
          exam_date_end?: string | null
          exam_date_start?: string | null
          exam_scope?: string | null
          exam_type?: string
          grade_ratio?: string | null
          grade_year?: number
          id?: string
          notes?: string | null
          performance_assessment_info?: string | null
          post_exam_analysis?: string | null
          preparing_teachers?: string[] | null
          school_level?: string
          school_name: string
          semester?: string
          status?: string
          subject: string
          teacher_notes?: Json
          textbook_publisher?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: number
          academy_prep_notes?: string | null
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          difficulty_level?: string | null
          exam_analysis_detail?: string | null
          exam_average_score?: number | null
          exam_date_end?: string | null
          exam_date_start?: string | null
          exam_scope?: string | null
          exam_type?: string
          grade_ratio?: string | null
          grade_year?: number
          id?: string
          notes?: string | null
          performance_assessment_info?: string | null
          post_exam_analysis?: string | null
          preparing_teachers?: string[] | null
          school_level?: string
          school_name?: string
          semester?: string
          status?: string
          subject?: string
          teacher_notes?: Json
          textbook_publisher?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_exam_materials: {
        Row: {
          archive_id: string
          created_at: string
          description: string | null
          file_category: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_name: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          archive_id: string
          created_at?: string
          description?: string | null
          file_category?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          archive_id?: string
          created_at?: string
          description?: string | null
          file_category?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_exam_materials_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "school_exam_archives"
            referencedColumns: ["id"]
          },
        ]
      }
      school_exam_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          exam_period: string | null
          grade: number | null
          id: string
          note: string | null
          schedule_id: string | null
          school_name: string
          scope: string | null
          subject: string | null
          subject_category: string | null
          updated_at: string
          urls: Json
          year: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          exam_period?: string | null
          grade?: number | null
          id?: string
          note?: string | null
          schedule_id?: string | null
          school_name: string
          scope?: string | null
          subject?: string | null
          subject_category?: string | null
          updated_at?: string
          urls?: Json
          year: number
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          exam_period?: string | null
          grade?: number | null
          id?: string
          note?: string | null
          schedule_id?: string | null
          school_name?: string
          scope?: string | null
          subject?: string | null
          subject_category?: string | null
          updated_at?: string
          urls?: Json
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_exam_notes_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "school_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      school_exam_reports: {
        Row: {
          academy_helped_rate: number | null
          ai_report: string | null
          avg_score: number | null
          created_at: string | null
          created_by: string | null
          exam_period: string
          exam_type: string
          exam_year: number
          final_report: string | null
          grade: string
          id: string
          published: boolean | null
          published_at: string | null
          recommended_study: Json | null
          school_name: string
          subject: string
          top_weak_concepts: Json | null
          total_students: number | null
          wrong_item_stats: Json | null
        }
        Insert: {
          academy_helped_rate?: number | null
          ai_report?: string | null
          avg_score?: number | null
          created_at?: string | null
          created_by?: string | null
          exam_period: string
          exam_type: string
          exam_year: number
          final_report?: string | null
          grade: string
          id?: string
          published?: boolean | null
          published_at?: string | null
          recommended_study?: Json | null
          school_name: string
          subject: string
          top_weak_concepts?: Json | null
          total_students?: number | null
          wrong_item_stats?: Json | null
        }
        Update: {
          academy_helped_rate?: number | null
          ai_report?: string | null
          avg_score?: number | null
          created_at?: string | null
          created_by?: string | null
          exam_period?: string
          exam_type?: string
          exam_year?: number
          final_report?: string | null
          grade?: string
          id?: string
          published?: boolean | null
          published_at?: string | null
          recommended_study?: Json | null
          school_name?: string
          subject?: string
          top_weak_concepts?: Json | null
          total_students?: number | null
          wrong_item_stats?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "school_exam_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_files: {
        Row: {
          ai_extracted_data: Json | null
          ai_extraction_status: string | null
          created_at: string | null
          created_by: string | null
          extracted_count: number | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          school_name: string
          subject_filter: string | null
        }
        Insert: {
          ai_extracted_data?: Json | null
          ai_extraction_status?: string | null
          created_at?: string | null
          created_by?: string | null
          extracted_count?: number | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          school_name: string
          subject_filter?: string | null
        }
        Update: {
          ai_extracted_data?: Json | null
          ai_extraction_status?: string | null
          created_at?: string | null
          created_by?: string | null
          extracted_count?: number | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          school_name?: string
          subject_filter?: string | null
        }
        Relationships: []
      }
      school_schedules: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          grade: number | null
          id: string
          is_ai_extracted: boolean | null
          notes: Json
          schedule_type: string
          school_name: string
          source_file_url: string | null
          start_date: string | null
          subject: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          grade?: number | null
          id?: string
          is_ai_extracted?: boolean | null
          notes?: Json
          schedule_type?: string
          school_name: string
          source_file_url?: string | null
          start_date?: string | null
          subject?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          grade?: number | null
          id?: string
          is_ai_extracted?: boolean | null
          notes?: Json
          schedule_type?: string
          school_name?: string
          source_file_url?: string | null
          start_date?: string | null
          subject?: string | null
          title?: string
        }
        Relationships: []
      }
      school_textbooks: {
        Row: {
          author: string | null
          course_name: string | null
          created_at: string | null
          created_by: string | null
          grade: number | null
          id: string
          is_ai_extracted: boolean | null
          publisher: string | null
          school_name: string
          source_file_url: string | null
          subject: string
          textbook_name: string | null
          year: number | null
        }
        Insert: {
          author?: string | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string | null
          grade?: number | null
          id?: string
          is_ai_extracted?: boolean | null
          publisher?: string | null
          school_name: string
          source_file_url?: string | null
          subject: string
          textbook_name?: string | null
          year?: number | null
        }
        Update: {
          author?: string | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string | null
          grade?: number | null
          id?: string
          is_ai_extracted?: boolean | null
          publisher?: string | null
          school_name?: string
          source_file_url?: string | null
          subject?: string
          textbook_name?: string | null
          year?: number | null
        }
        Relationships: []
      }
      self_study_records: {
        Row: {
          assistant_attendance: boolean | null
          assistant_confirmed: boolean
          assistant_confirmed_at: string | null
          assistant_memo: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          created_at: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          lesson_record_id: string | null
          memo: string | null
          room: string
          start_time: string | null
          student_id: string
          study_date: string
          subject: string | null
          task_list: Json | null
          teacher_check_memo: string | null
          teacher_checked: boolean
          teacher_checked_at: string | null
          teacher_display_name: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          assistant_attendance?: boolean | null
          assistant_confirmed?: boolean
          assistant_confirmed_at?: string | null
          assistant_memo?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          lesson_record_id?: string | null
          memo?: string | null
          room?: string
          start_time?: string | null
          student_id: string
          study_date: string
          subject?: string | null
          task_list?: Json | null
          teacher_check_memo?: string | null
          teacher_checked?: boolean
          teacher_checked_at?: string | null
          teacher_display_name?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          assistant_attendance?: boolean | null
          assistant_confirmed?: boolean
          assistant_confirmed_at?: string | null
          assistant_memo?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          lesson_record_id?: string | null
          memo?: string | null
          room?: string
          start_time?: string | null
          student_id?: string
          study_date?: string
          subject?: string | null
          task_list?: Json | null
          teacher_check_memo?: string | null
          teacher_checked?: boolean
          teacher_checked_at?: string | null
          teacher_display_name?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_study_records_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_study_records_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "lesson_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_study_records_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "overdue_lesson_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_study_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_accounts: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          pin_hash: string
          session_expires_at: string | null
          session_token: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          pin_hash: string
          session_expires_at?: string | null
          session_token?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          pin_hash?: string
          session_expires_at?: string | null
          session_token?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_accounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_book_progress: {
        Row: {
          book_role: string
          book_title: string
          created_at: string
          current_page: number
          id: string
          last_source: string | null
          status: string
          student_id: string
          subject: string
          textbook_id: string | null
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          book_role?: string
          book_title: string
          created_at?: string
          current_page?: number
          id?: string
          last_source?: string | null
          status?: string
          student_id: string
          subject?: string
          textbook_id?: string | null
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          book_role?: string
          book_title?: string
          created_at?: string
          current_page?: number
          id?: string
          last_source?: string | null
          status?: string
          student_id?: string
          subject?: string
          textbook_id?: string | null
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_book_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_book_progress_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      student_book_progress_log: {
        Row: {
          book_progress_id: string | null
          book_role: string | null
          book_title: string
          created_at: string
          from_page: number | null
          id: string
          progress_date: string
          source: string
          student_id: string
          subject: string
          to_page: number
        }
        Insert: {
          book_progress_id?: string | null
          book_role?: string | null
          book_title: string
          created_at?: string
          from_page?: number | null
          id?: string
          progress_date?: string
          source?: string
          student_id: string
          subject?: string
          to_page: number
        }
        Update: {
          book_progress_id?: string | null
          book_role?: string | null
          book_title?: string
          created_at?: string
          from_page?: number | null
          id?: string
          progress_date?: string
          source?: string
          student_id?: string
          subject?: string
          to_page?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_book_progress_log_book_progress_id_fkey"
            columns: ["book_progress_id"]
            isOneToOne: false
            referencedRelation: "student_book_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_book_progress_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_course_teacher_changes: {
        Row: {
          changed_by: string | null
          created_at: string
          effective_date: string
          from_teacher_id: string | null
          from_teacher_name: string | null
          id: string
          reason: string | null
          student_course_id: string | null
          student_id: string
          subject: string | null
          to_teacher_id: string | null
          to_teacher_name: string | null
          updated_at: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          effective_date: string
          from_teacher_id?: string | null
          from_teacher_name?: string | null
          id?: string
          reason?: string | null
          student_course_id?: string | null
          student_id: string
          subject?: string | null
          to_teacher_id?: string | null
          to_teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          from_teacher_id?: string | null
          from_teacher_name?: string | null
          id?: string
          reason?: string | null
          student_course_id?: string | null
          student_id?: string
          subject?: string | null
          to_teacher_id?: string | null
          to_teacher_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_course_teacher_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_course_teacher_changes_from_teacher_id_fkey"
            columns: ["from_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_course_teacher_changes_student_course_id_fkey"
            columns: ["student_course_id"]
            isOneToOne: false
            referencedRelation: "student_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_course_teacher_changes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_course_teacher_changes_to_teacher_id_fkey"
            columns: ["to_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_courses: {
        Row: {
          course_policy_id: string
          created_at: string
          custom_monthly_fee: number | null
          end_date: string | null
          enrollment_date: string
          id: string
          is_active: boolean
          notes: string | null
          student_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          course_policy_id: string
          created_at?: string
          custom_monthly_fee?: number | null
          end_date?: string | null
          enrollment_date: string
          id?: string
          is_active?: boolean
          notes?: string | null
          student_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          course_policy_id?: string
          created_at?: string
          custom_monthly_fee?: number | null
          end_date?: string | null
          enrollment_date?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          student_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_courses_course_policy_id_fkey"
            columns: ["course_policy_id"]
            isOneToOne: false
            referencedRelation: "course_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_exam_result_pdfs: {
        Row: {
          display_title: string
          file_size: number | null
          generated_at: string
          generated_by: string | null
          generated_by_name: string | null
          id: string
          page_count: number | null
          result_id: string
          storage_path: string
        }
        Insert: {
          display_title: string
          file_size?: number | null
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          page_count?: number | null
          result_id: string
          storage_path: string
        }
        Update: {
          display_title?: string
          file_size?: number | null
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          page_count?: number | null
          result_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_exam_result_pdfs_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "student_exam_results"
            referencedColumns: ["id"]
          },
        ]
      }
      student_exam_result_photos: {
        Row: {
          created_at: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_name: string | null
          result_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string | null
          result_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string | null
          result_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_exam_result_photos_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "student_exam_results"
            referencedColumns: ["id"]
          },
        ]
      }
      student_exam_results: {
        Row: {
          actual_score: number | null
          created_at: string
          exam_date: string | null
          exam_period: string | null
          exam_type: string
          exam_year: number | null
          expected_score: number | null
          grade_at_exam: string | null
          id: string
          is_staff_upload: boolean
          locked_at: string | null
          locked_by: string | null
          note: string | null
          review_status: string | null
          school_name: string
          score_locked: boolean
          student_id: string
          subject: string
          submitted_at: string
          updated_at: string
          uploaded_by_staff: string | null
          uploaded_by_staff_name: string | null
        }
        Insert: {
          actual_score?: number | null
          created_at?: string
          exam_date?: string | null
          exam_period?: string | null
          exam_type?: string
          exam_year?: number | null
          expected_score?: number | null
          grade_at_exam?: string | null
          id?: string
          is_staff_upload?: boolean
          locked_at?: string | null
          locked_by?: string | null
          note?: string | null
          review_status?: string | null
          school_name: string
          score_locked?: boolean
          student_id: string
          subject: string
          submitted_at?: string
          updated_at?: string
          uploaded_by_staff?: string | null
          uploaded_by_staff_name?: string | null
        }
        Update: {
          actual_score?: number | null
          created_at?: string
          exam_date?: string | null
          exam_period?: string | null
          exam_type?: string
          exam_year?: number | null
          expected_score?: number | null
          grade_at_exam?: string | null
          id?: string
          is_staff_upload?: boolean
          locked_at?: string | null
          locked_by?: string | null
          note?: string | null
          review_status?: string | null
          school_name?: string
          score_locked?: boolean
          student_id?: string
          subject?: string
          submitted_at?: string
          updated_at?: string
          uploaded_by_staff?: string | null
          uploaded_by_staff_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          student_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_onboarding_checks: {
        Row: {
          check_key: string
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          checked_by_name: string | null
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          check_key: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          checked_by_name?: string | null
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          check_key?: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          checked_by_name?: string | null
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_onboarding_checks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_point_history: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          points: number
          reason: string
          related_homework_id: string | null
          related_submission_id: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          points: number
          reason: string
          related_homework_id?: string | null
          related_submission_id?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          points?: number
          reason?: string
          related_homework_id?: string | null
          related_submission_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_point_history_related_homework_id_fkey"
            columns: ["related_homework_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_point_history_related_submission_id_fkey"
            columns: ["related_submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_point_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
      student_vocab_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          id: string
          required_rounds: number
          student_id: string
          word_set_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          id?: string
          required_rounds?: number
          student_id: string
          word_set_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          id?: string
          required_rounds?: number
          student_id?: string
          word_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_vocab_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_vocab_assignments_word_set_id_fkey"
            columns: ["word_set_id"]
            isOneToOne: false
            referencedRelation: "vocab_word_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      student_word_mastery: {
        Row: {
          correct_count: number
          created_at: string
          ease_factor: number
          english: string
          id: string
          interval_days: number
          last_seen_at: string | null
          level: number
          meaning: string | null
          next_due_at: string | null
          repetitions: number
          student_id: string
          updated_at: string
          word_key: string
          wrong_count: number
        }
        Insert: {
          correct_count?: number
          created_at?: string
          ease_factor?: number
          english: string
          id?: string
          interval_days?: number
          last_seen_at?: string | null
          level?: number
          meaning?: string | null
          next_due_at?: string | null
          repetitions?: number
          student_id: string
          updated_at?: string
          word_key: string
          wrong_count?: number
        }
        Update: {
          correct_count?: number
          created_at?: string
          ease_factor?: number
          english?: string
          id?: string
          interval_days?: number
          last_seen_at?: string | null
          level?: number
          meaning?: string | null
          next_due_at?: string | null
          repetitions?: number
          student_id?: string
          updated_at?: string
          word_key?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_word_mastery_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          course_status: string
          created_at: string
          deposit_name: string | null
          email: string | null
          emergency_contact: string | null
          enrollment_status: string
          followup_2w_done_subjects: string[]
          grade: string | null
          grade_year: number | null
          id: string
          name: string
          notes: string | null
          parent_name: string | null
          parent_phone: string | null
          parent_token: string | null
          payment_due_day: number
          phone: string | null
          registration_date: string | null
          school: string | null
          school_level: string | null
          sibling_group_id: number | null
          status: string | null
          student_code: string | null
          student_phone: string | null
          total_points: number | null
          tuition_memo: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          course_status?: string
          created_at?: string
          deposit_name?: string | null
          email?: string | null
          emergency_contact?: string | null
          enrollment_status?: string
          followup_2w_done_subjects?: string[]
          grade?: string | null
          grade_year?: number | null
          id?: string
          name: string
          notes?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_token?: string | null
          payment_due_day?: number
          phone?: string | null
          registration_date?: string | null
          school?: string | null
          school_level?: string | null
          sibling_group_id?: number | null
          status?: string | null
          student_code?: string | null
          student_phone?: string | null
          total_points?: number | null
          tuition_memo?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          course_status?: string
          created_at?: string
          deposit_name?: string | null
          email?: string | null
          emergency_contact?: string | null
          enrollment_status?: string
          followup_2w_done_subjects?: string[]
          grade?: string | null
          grade_year?: number | null
          id?: string
          name?: string
          notes?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_token?: string | null
          payment_due_day?: number
          phone?: string | null
          registration_date?: string | null
          school?: string | null
          school_level?: string | null
          sibling_group_id?: number | null
          status?: string | null
          student_code?: string | null
          student_phone?: string | null
          total_points?: number | null
          tuition_memo?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      study_session_tasks: {
        Row: {
          completed_at: string | null
          content: string
          created_at: string
          id: string
          is_completed: boolean
          session_id: string
          sort_order: number
        }
        Insert: {
          completed_at?: string | null
          content: string
          created_at?: string
          id?: string
          is_completed?: boolean
          session_id: string
          sort_order?: number
        }
        Update: {
          completed_at?: string | null
          content?: string
          created_at?: string
          id?: string
          is_completed?: boolean
          session_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_session_tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          linked_lesson_id: string | null
          notes: string | null
          session_date: string
          session_type: string
          start_time: string
          status: string
          student_id: string
          subject: string
          supervisor_id: string | null
          supervisor_name: string | null
          test_content: string | null
          test_result: string | null
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          linked_lesson_id?: string | null
          notes?: string | null
          session_date?: string
          session_type?: string
          start_time: string
          status?: string
          student_id: string
          subject: string
          supervisor_id?: string | null
          supervisor_name?: string | null
          test_content?: string | null
          test_result?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          linked_lesson_id?: string | null
          notes?: string | null
          session_date?: string
          session_type?: string
          start_time?: string
          status?: string
          student_id?: string
          subject?: string
          supervisor_id?: string | null
          supervisor_name?: string | null
          test_content?: string | null
          test_result?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_linked_lesson_id_fkey"
            columns: ["linked_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_linked_lesson_id_fkey"
            columns: ["linked_lesson_id"]
            isOneToOne: false
            referencedRelation: "overdue_lesson_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          severity: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          severity?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          severity?: string
          title?: string
          updated_at?: string
          visibility?: string
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
      task_replies: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_replies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assistant_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_monthly_compensation: {
        Row: {
          created_at: string
          id: string
          month: string
          notes: string | null
          salary: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          salary?: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          salary?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_monthly_compensation_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json | null
          notification_type: string
          student_id: string | null
          teacher_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          notification_type?: string
          student_id?: string | null
          teacher_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          notification_type?: string
          student_id?: string | null
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      team_note_reply_reads: {
        Row: {
          id: string
          last_read_at: string
          note_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          note_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          note_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_note_reply_reads_note_id_fkey"
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
          consult_method: string | null
          consult_target: string | null
          consulted_at: string | null
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
          consult_method?: string | null
          consult_target?: string | null
          consulted_at?: string | null
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
          consult_method?: string | null
          consult_target?: string | null
          consulted_at?: string | null
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
      test_records: {
        Row: {
          assistant_attendance: boolean | null
          assistant_confirmed: boolean
          assistant_confirmed_at: string | null
          assistant_memo: string | null
          assistant_name: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          content: string
          created_at: string
          end_time: string | null
          id: string
          lesson_record_id: string | null
          memo: string | null
          passed: boolean | null
          room: string
          routine_id: string | null
          score: string | null
          source: string | null
          start_time: string | null
          student_id: string
          subject: string
          teacher_check_memo: string | null
          teacher_checked: boolean
          teacher_checked_at: string | null
          teacher_display_name: string | null
          teacher_id: string
          test_date: string
          test_type: string
          updated_at: string
        }
        Insert: {
          assistant_attendance?: boolean | null
          assistant_confirmed?: boolean
          assistant_confirmed_at?: string | null
          assistant_memo?: string | null
          assistant_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          content: string
          created_at?: string
          end_time?: string | null
          id?: string
          lesson_record_id?: string | null
          memo?: string | null
          passed?: boolean | null
          room?: string
          routine_id?: string | null
          score?: string | null
          source?: string | null
          start_time?: string | null
          student_id: string
          subject: string
          teacher_check_memo?: string | null
          teacher_checked?: boolean
          teacher_checked_at?: string | null
          teacher_display_name?: string | null
          teacher_id: string
          test_date: string
          test_type?: string
          updated_at?: string
        }
        Update: {
          assistant_attendance?: boolean | null
          assistant_confirmed?: boolean
          assistant_confirmed_at?: string | null
          assistant_memo?: string | null
          assistant_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          content?: string
          created_at?: string
          end_time?: string | null
          id?: string
          lesson_record_id?: string | null
          memo?: string | null
          passed?: boolean | null
          room?: string
          routine_id?: string | null
          score?: string | null
          source?: string | null
          start_time?: string | null
          student_id?: string
          subject?: string
          teacher_check_memo?: string | null
          teacher_checked?: boolean
          teacher_checked_at?: string | null
          teacher_display_name?: string | null
          teacher_id?: string
          test_date?: string
          test_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_records_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_records_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "lesson_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_records_lesson_record_id_fkey"
            columns: ["lesson_record_id"]
            isOneToOne: false
            referencedRelation: "overdue_lesson_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_records_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routine_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      test_routine_students: {
        Row: {
          created_at: string
          id: string
          routine_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          routine_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          routine_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_routine_students_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "test_routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_routine_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      test_routines: {
        Row: {
          content_template: string | null
          created_at: string
          day_of_week: number
          id: string
          is_active: boolean
          subject: string
          teacher_id: string
          test_time: string | null
          test_type: string
          updated_at: string
        }
        Insert: {
          content_template?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_active?: boolean
          subject: string
          teacher_id: string
          test_time?: string | null
          test_type?: string
          updated_at?: string
        }
        Update: {
          content_template?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_active?: boolean
          subject?: string
          teacher_id?: string
          test_time?: string | null
          test_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_schedules: {
        Row: {
          content: string | null
          created_at: string
          id: string
          notes: string | null
          result_notes: string | null
          result_passed: boolean | null
          result_recorded_at: string | null
          result_recorded_by: string | null
          result_score: string | null
          student_id: string
          subject: string
          teacher_id: string
          test_date: string
          test_time: string | null
          test_type: string
          title: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          result_notes?: string | null
          result_passed?: boolean | null
          result_recorded_at?: string | null
          result_recorded_by?: string | null
          result_score?: string | null
          student_id: string
          subject: string
          teacher_id: string
          test_date: string
          test_time?: string | null
          test_type?: string
          title?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          result_notes?: string | null
          result_passed?: boolean | null
          result_recorded_at?: string | null
          result_recorded_by?: string | null
          result_score?: string | null
          student_id?: string
          subject?: string
          teacher_id?: string
          test_date?: string
          test_time?: string | null
          test_type?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_schedules_student_id_fkey"
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
      textbook_distributions: {
        Row: {
          billed_at: string | null
          confirmed_by: string | null
          created_at: string
          depositor_name: string | null
          distributed_by: string
          distributed_by_name: string
          distributed_confirmed_at: string | null
          distributed_confirmed_by: string | null
          id: string
          message_resent_at: string | null
          message_sent_at: string | null
          order_id: string
          paid_at: string | null
          payment_status: string
          quantity: number
          student_id: string
          student_name: string
          total_amount: number
        }
        Insert: {
          billed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          depositor_name?: string | null
          distributed_by: string
          distributed_by_name: string
          distributed_confirmed_at?: string | null
          distributed_confirmed_by?: string | null
          id?: string
          message_resent_at?: string | null
          message_sent_at?: string | null
          order_id: string
          paid_at?: string | null
          payment_status?: string
          quantity?: number
          student_id: string
          student_name: string
          total_amount?: number
        }
        Update: {
          billed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          depositor_name?: string | null
          distributed_by?: string
          distributed_by_name?: string
          distributed_confirmed_at?: string | null
          distributed_confirmed_by?: string | null
          id?: string
          message_resent_at?: string | null
          message_sent_at?: string | null
          order_id?: string
          paid_at?: string | null
          payment_status?: string
          quantity?: number
          student_id?: string
          student_name?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "textbook_distributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "textbook_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_distributions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      textbook_examples: {
        Row: {
          answer: string | null
          category: string
          chapter: string
          created_at: string
          created_by: string | null
          difficulty: string | null
          explanation: string | null
          graph_data: Json | null
          id: string
          page_number: number | null
          problem_number: string | null
          question_text: string
          sort_order: number
          textbook_id: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          answer?: string | null
          category?: string
          chapter: string
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          explanation?: string | null
          graph_data?: Json | null
          id?: string
          page_number?: number | null
          problem_number?: string | null
          question_text: string
          sort_order?: number
          textbook_id: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          answer?: string | null
          category?: string
          chapter?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          explanation?: string | null
          graph_data?: Json | null
          id?: string
          page_number?: number | null
          problem_number?: string | null
          question_text?: string
          sort_order?: number
          textbook_id?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "textbook_examples_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      textbook_orders: {
        Row: {
          approved_at: string | null
          approved_by_name: string | null
          category: string | null
          created_at: string
          distributed_qty: number
          grade: string | null
          id: string
          inhouse_author: string | null
          is_inhouse: boolean
          notes: string | null
          quantity: number
          requested_by: string
          requested_by_name: string
          status: string
          subject: string
          textbook_name: string
          textbook_type: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_name?: string | null
          category?: string | null
          created_at?: string
          distributed_qty?: number
          grade?: string | null
          id?: string
          inhouse_author?: string | null
          is_inhouse?: boolean
          notes?: string | null
          quantity?: number
          requested_by: string
          requested_by_name: string
          status?: string
          subject?: string
          textbook_name: string
          textbook_type?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_name?: string | null
          category?: string | null
          created_at?: string
          distributed_qty?: number
          grade?: string | null
          id?: string
          inhouse_author?: string | null
          is_inhouse?: boolean
          notes?: string | null
          quantity?: number
          requested_by?: string
          requested_by_name?: string
          status?: string
          subject?: string
          textbook_name?: string
          textbook_type?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      textbooks: {
        Row: {
          course: string | null
          created_at: string
          created_by: string | null
          description: string | null
          folder: string | null
          grade: string | null
          id: string
          publisher: string | null
          subject: string
          title: string
          toc: Json | null
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          course?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder?: string | null
          grade?: string | null
          id?: string
          publisher?: string | null
          subject?: string
          title: string
          toc?: Json | null
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          course?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder?: string | null
          grade?: string | null
          id?: string
          publisher?: string | null
          subject?: string
          title?: string
          toc?: Json | null
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          trial_expires_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          trial_expires_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          trial_expires_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vocab_card_completions: {
        Row: {
          completed_at: string
          correct_count: number
          duration_seconds: number | null
          expected_seconds: number | null
          finished_at: string | null
          id: string
          is_self_test: boolean
          mode: string
          notified_teacher_id: string | null
          original_correct_count: number | null
          original_wrong_count: number | null
          self_test_options: Json | null
          started_at: string | null
          student_id: string
          teacher_corrected_at: string | null
          teacher_corrected_by: string | null
          teacher_correction_note: string | null
          test_source: string
          total_count: number
          word_set_ids: string[]
          wrong_count: number
        }
        Insert: {
          completed_at?: string
          correct_count?: number
          duration_seconds?: number | null
          expected_seconds?: number | null
          finished_at?: string | null
          id?: string
          is_self_test?: boolean
          mode?: string
          notified_teacher_id?: string | null
          original_correct_count?: number | null
          original_wrong_count?: number | null
          self_test_options?: Json | null
          started_at?: string | null
          student_id: string
          teacher_corrected_at?: string | null
          teacher_corrected_by?: string | null
          teacher_correction_note?: string | null
          test_source?: string
          total_count?: number
          word_set_ids?: string[]
          wrong_count?: number
        }
        Update: {
          completed_at?: string
          correct_count?: number
          duration_seconds?: number | null
          expected_seconds?: number | null
          finished_at?: string | null
          id?: string
          is_self_test?: boolean
          mode?: string
          notified_teacher_id?: string | null
          original_correct_count?: number | null
          original_wrong_count?: number | null
          self_test_options?: Json | null
          started_at?: string | null
          student_id?: string
          teacher_corrected_at?: string | null
          teacher_corrected_by?: string | null
          teacher_correction_note?: string | null
          test_source?: string
          total_count?: number
          word_set_ids?: string[]
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "vocab_card_completions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "vocab_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vocab_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_generated_tests: {
        Row: {
          created_at: string
          created_by: string
          eng_to_kor_percent: number
          grading_strictness: string
          id: string
          notes: string | null
          question_count: number
          question_type: string
          share_token: string | null
          source_set_ids: string[]
          test_data: Json
          test_mode: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          eng_to_kor_percent?: number
          grading_strictness?: string
          id?: string
          notes?: string | null
          question_count?: number
          question_type?: string
          share_token?: string | null
          source_set_ids?: string[]
          test_data?: Json
          test_mode?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          eng_to_kor_percent?: number
          grading_strictness?: string
          id?: string
          notes?: string | null
          question_count?: number
          question_type?: string
          share_token?: string | null
          source_set_ids?: string[]
          test_data?: Json
          test_mode?: string
          title?: string
        }
        Relationships: []
      }
      vocab_schedule_logs: {
        Row: {
          action_type: string
          id: string
          new_schedules: Json
          note: string | null
          original_schedules: Json
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
          setting_id: string
          student_id: string
          undone_at: string | null
          undone_by: string | null
          undone_by_name: string | null
        }
        Insert: {
          action_type?: string
          id?: string
          new_schedules?: Json
          note?: string | null
          original_schedules?: Json
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          setting_id: string
          student_id: string
          undone_at?: string | null
          undone_by?: string | null
          undone_by_name?: string | null
        }
        Update: {
          action_type?: string
          id?: string
          new_schedules?: Json
          note?: string | null
          original_schedules?: Json
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          setting_id?: string
          student_id?: string
          undone_at?: string | null
          undone_by?: string | null
          undone_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vocab_schedule_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_schedules: {
        Row: {
          absence_reason: string | null
          book_name: string
          created_at: string
          day_number: number
          id: string
          schedule_type: string
          setting_id: string
          student_id: string
          test_date: string
          test_time: string | null
        }
        Insert: {
          absence_reason?: string | null
          book_name: string
          created_at?: string
          day_number: number
          id?: string
          schedule_type?: string
          setting_id: string
          student_id: string
          test_date: string
          test_time?: string | null
        }
        Update: {
          absence_reason?: string | null
          book_name?: string
          created_at?: string
          day_number?: number
          id?: string
          schedule_type?: string
          setting_id?: string
          student_id?: string
          test_date?: string
          test_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vocab_schedules_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "vocab_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_schedules_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_settings: {
        Row: {
          assigned_teacher: string | null
          book_name: string
          bundle_days: boolean
          created_at: string
          current_day_number: number
          cutline_percent: number
          days_per_test: number
          days_per_test_map: Json | null
          enhanced_features_enabled: boolean
          id: string
          is_active: boolean
          notes: string | null
          student_id: string
          teacher_id: string
          test_days: string[]
          test_level: number | null
          test_time_limit: number | null
          total_days: number | null
          updated_at: string
        }
        Insert: {
          assigned_teacher?: string | null
          book_name: string
          bundle_days?: boolean
          created_at?: string
          current_day_number?: number
          cutline_percent?: number
          days_per_test?: number
          days_per_test_map?: Json | null
          enhanced_features_enabled?: boolean
          id?: string
          is_active?: boolean
          notes?: string | null
          student_id: string
          teacher_id: string
          test_days?: string[]
          test_level?: number | null
          test_time_limit?: number | null
          total_days?: number | null
          updated_at?: string
        }
        Update: {
          assigned_teacher?: string | null
          book_name?: string
          bundle_days?: boolean
          created_at?: string
          current_day_number?: number
          cutline_percent?: number
          days_per_test?: number
          days_per_test_map?: Json | null
          enhanced_features_enabled?: boolean
          id?: string
          is_active?: boolean
          notes?: string | null
          student_id?: string
          teacher_id?: string
          test_days?: string[]
          test_level?: number | null
          test_time_limit?: number | null
          total_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_settings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_test_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          correct_count: number | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          result_entered_by: string | null
          score: number | null
          status: string
          student_id: string
          test_direction: string
          test_level: number
          test_mode: string
          test_time_limit: number | null
          total_questions: number | null
          updated_at: string
          word_set_ids: string[]
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          result_entered_by?: string | null
          score?: number | null
          status?: string
          student_id: string
          test_direction?: string
          test_level?: number
          test_mode?: string
          test_time_limit?: number | null
          total_questions?: number | null
          updated_at?: string
          word_set_ids?: string[]
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          result_entered_by?: string | null
          score?: number | null
          status?: string
          student_id?: string
          test_direction?: string
          test_level?: number
          test_mode?: string
          test_time_limit?: number | null
          total_questions?: number | null
          updated_at?: string
          word_set_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "vocab_test_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_test_results: {
        Row: {
          book_name: string
          correct_words: number | null
          created_at: string
          day_number: number
          id: string
          notes: string | null
          passed: boolean
          recorded_by: string | null
          retest_date: string | null
          retest_requested_at: string | null
          retest_scheduled: boolean
          retest_time: string | null
          schedule_id: string
          score_percent: number | null
          student_id: string
          test_date: string
          total_words: number | null
          updated_at: string
        }
        Insert: {
          book_name: string
          correct_words?: number | null
          created_at?: string
          day_number: number
          id?: string
          notes?: string | null
          passed?: boolean
          recorded_by?: string | null
          retest_date?: string | null
          retest_requested_at?: string | null
          retest_scheduled?: boolean
          retest_time?: string | null
          schedule_id: string
          score_percent?: number | null
          student_id: string
          test_date: string
          total_words?: number | null
          updated_at?: string
        }
        Update: {
          book_name?: string
          correct_words?: number | null
          created_at?: string
          day_number?: number
          id?: string
          notes?: string | null
          passed?: boolean
          recorded_by?: string | null
          retest_date?: string | null
          retest_requested_at?: string | null
          retest_scheduled?: boolean
          retest_time?: string | null
          schedule_id?: string
          score_percent?: number | null
          student_id?: string
          test_date?: string
          total_words?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_test_results_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "vocab_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_test_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_test_submissions: {
        Row: {
          answers: Json
          auto_score: number
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          final_score: number
          id: string
          image_urls: string[]
          status: string
          strictness_used: string
          student_id: string
          submission_type: string
          test_id: string
          total: number
          updated_at: string
        }
        Insert: {
          answers?: Json
          auto_score?: number
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          final_score?: number
          id?: string
          image_urls?: string[]
          status?: string
          strictness_used?: string
          student_id: string
          submission_type?: string
          test_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          answers?: Json
          auto_score?: number
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          final_score?: number
          id?: string
          image_urls?: string[]
          status?: string
          strictness_used?: string
          student_id?: string
          submission_type?: string
          test_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_test_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_test_submissions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "vocab_generated_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_word_items: {
        Row: {
          created_at: string
          english: string
          english_definition: string | null
          id: string
          meaning: string
          set_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          english: string
          english_definition?: string | null
          id?: string
          meaning: string
          set_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          english?: string
          english_definition?: string | null
          id?: string
          meaning?: string
          set_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "vocab_word_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "vocab_word_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_word_sets: {
        Row: {
          created_at: string
          created_by: string
          folder_id: string | null
          id: string
          round_number: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          folder_id?: string | null
          id?: string
          round_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          folder_id?: string | null
          id?: string
          round_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_word_sets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "vocab_folders"
            referencedColumns: ["id"]
          },
        ]
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
      weekly_principal_reports: {
        Row: {
          attention_students: Json
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          recurring_issues: Json
          summary_text: string | null
          teacher_breakdown: Json
          totals: Json
          week_end: string
          week_start: string
        }
        Insert: {
          attention_students?: Json
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          recurring_issues?: Json
          summary_text?: string | null
          teacher_breakdown?: Json
          totals?: Json
          week_end: string
          week_start: string
        }
        Update: {
          attention_students?: Json
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          recurring_issues?: Json
          summary_text?: string | null
          teacher_breakdown?: Json
          totals?: Json
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_report_gdocs: {
        Row: {
          document_id: string
          document_url: string
          last_student_count: number
          last_uploaded_at: string
          week_start: string
        }
        Insert: {
          document_id: string
          document_url: string
          last_student_count?: number
          last_uploaded_at?: string
          week_start: string
        }
        Update: {
          document_id?: string
          document_url?: string
          last_student_count?: number
          last_uploaded_at?: string
          week_start?: string
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
          parent_visible: boolean
          principal_comment: string | null
          principal_comment_enabled: boolean | null
          report_quality_tag: string | null
          risk_level: string | null
          sent_at: string | null
          sent_by: string | null
          sent_status: string | null
          share_token: string | null
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
          parent_visible?: boolean
          principal_comment?: string | null
          principal_comment_enabled?: boolean | null
          report_quality_tag?: string | null
          risk_level?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_status?: string | null
          share_token?: string | null
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
          parent_visible?: boolean
          principal_comment?: string | null
          principal_comment_enabled?: boolean | null
          report_quality_tag?: string | null
          risk_level?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_status?: string | null
          share_token?: string | null
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
      student_accounts_safe: {
        Row: {
          created_at: string | null
          id: string | null
          last_login_at: string | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          last_login_at?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          last_login_at?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_accounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_math_question_daily_limit: {
        Args: { _date?: string; _student_id: string }
        Returns: boolean
      }
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
      dq_base36: { Args: { n: number }; Returns: string }
      dq_sign: { Args: { k: string }; Returns: string }
      format_student_grade_label: {
        Args: { _grade_year: number; _school_level: string }
        Returns: string
      }
      generate_parent_token: { Args: never; Returns: string }
      generate_share_token: { Args: never; Returns: string }
      generate_vocab_test_token: { Args: never; Returns: string }
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
      get_admin_enrollment_stats: {
        Args: {
          _grade_filter?: string
          _subject_filter?: string
          _teacher_id_filter?: string
        }
        Returns: Json
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
      get_published_analysis_for_parent_token: {
        Args: { _parent_token: string }
        Returns: {
          answer_image_paths: Json | null
          answer_mode: string | null
          answer_pdf_path: string | null
          answers: Json | null
          avg_score: number | null
          card_image_paths: Json
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          exam_difficulty: string | null
          exam_period: string
          exam_scope: string | null
          exam_type: string
          exam_year: number
          grade: string
          id: string
          is_locked: boolean | null
          is_published: boolean
          locked_at: string | null
          locked_by: string | null
          locked_by_name: string | null
          original_pdf_path: string | null
          overall_review: string | null
          parent_message: string | null
          published_at: string | null
          school_name: string
          student_message: string | null
          study_links: Json | null
          subject: string
          textbook: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "exam_analysis_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_published_analysis_for_student: {
        Args: { _student_id: string }
        Returns: {
          answer_image_paths: Json | null
          answer_mode: string | null
          answer_pdf_path: string | null
          answers: Json | null
          avg_score: number | null
          card_image_paths: Json
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          exam_difficulty: string | null
          exam_period: string
          exam_scope: string | null
          exam_type: string
          exam_year: number
          grade: string
          id: string
          is_locked: boolean | null
          is_published: boolean
          locked_at: string | null
          locked_by: string | null
          locked_by_name: string | null
          original_pdf_path: string | null
          overall_review: string | null
          parent_message: string | null
          published_at: string | null
          school_name: string
          student_message: string | null
          study_links: Json | null
          subject: string
          textbook: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "exam_analysis_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_teacher_roster_sheet: { Args: { _date: string }; Returns: Json }
      grade_at_year: {
        Args: { current_grade: string; exam_year: number }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_staff: { Args: never; Returns: boolean }
      is_private_channel_member: {
        Args: { _user_id: string }
        Returns: boolean
      }
      reconcile_lesson_homework: {
        Args: {
          _assigned_date: string
          _items: Json
          _lesson_record_id: string
          _student_id: string
          _subject: Database["public"]["Enums"]["subject_type"]
        }
        Returns: Json
      }
      remove_student_from_schedules: {
        Args: { _student_id: string }
        Returns: undefined
      }
      resolve_teacher_display_name_for_record: {
        Args: { _record_date?: string; _teacher_id: string }
        Returns: string
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
              _test_assistant?: string
              _test_content?: string
              _test_date?: string
              _test_name?: string
              _test_notes?: string
              _test_result?: string
              _test_result_text?: string
              _test_slot?: number
              _test_time?: string
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
      app_role: ["admin", "teacher", "assistant"],
      subject_type: ["수학", "과학", "영어", "국어"],
    },
  },
} as const
