export type UserRole = 'admin' | 'worker';

export interface Company {
  id: string;
  name: string;
  siret?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  created_at: string;
  is_active: boolean;
}

export interface User {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  phone?: string;
  email: string;
  is_active: boolean;
  created_at: string;
  invited_at?: string;
  last_seen_at?: string;
}

export interface Worksite {
  id: string;
  company_id: string;
  client_name: string;
  client_phone?: string;
  client_email?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  description?: string;
  product_type?: string;
  is_active: boolean;
  created_at: string;
  completed_at?: string;
}

export interface Planning {
  id: string;
  company_id: string;
  user_id: string;
  worksite_id: string | null;
  work_date: string;
  estimated_start?: string;
  estimated_end?: string;
  notes?: string;
  absence_type?: 'conge' | 'maladie' | 'intemperie' | null;
  created_at: string;
  created_by: string;
}

export interface TimeEntry {
  id: string;
  company_id: string;
  user_id: string;
  worksite_id: string;
  planning_id?: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_minutes: number;
  meal_allowance: boolean;
  observation?: string;
  photos?: string[];
  status: 'draft' | 'submitted' | 'validated';
  created_at: string;
  submitted_at?: string;
  validated_at?: string;
  validated_by?: string;
  locked?: boolean;
  exported_at?: string | null;
  modified_by?: string | null;
  modified_at?: string | null;
}

export interface Invitation {
  id: string;
  company_id: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string;
  created_by: string;
}

export interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

export interface PlanningWithWorksite extends Planning {
  worksite: Worksite | null;
  user: User;
}
