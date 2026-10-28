export interface Profile { id: string; full_name: string; email: string; status: 'pending' | 'active' | 'deactivated'; batch_id: string | null; course_completed: boolean; created_at: string; last_login: string | null }
export interface Batch { id: string; name: string; course_title: string; start_date: string | null; end_date: string | null; status: 'upcoming' | 'active' | 'completed' }
export interface Note { id: string; batch_id: string; title: string; topic: string | null; class_date: string; body: string | null; link_url: string | null; file_path: string | null; file_name: string | null; status: 'draft' | 'published' }
export interface Assignment { id: string; batch_id: string; title: string; instructions: string | null; due_at: string; max_marks: number | null; status: 'draft' | 'published' | 'closed' }
export interface Submission { id: string; assignment_id: string; student_id: string; kind: 'pdf' | 'ppt' | 'link'; file_path: string | null; url: string | null; submitted_at: string; status: 'submitted' | 'reviewed' | 'needs_changes'; marks: number | null; feedback: string | null }
export interface Attendance { id: string; batch_id: string; student_id: string; class_date: string; status: 'present' | 'absent' | 'leave' }
export interface Announcement { id: string; batch_id: string | null; title: string; body: string; created_at: string }
