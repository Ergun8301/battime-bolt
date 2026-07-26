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
  // Fin de periode d'essai 30 j (posee a la creation via l'inscription patron).
  // NULL = pas en essai. Rien ne l'applique encore (pas de blocage a l'expiration).
  trial_ends_at?: string | null;
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
  photo_url?: string | null;
  // Optional payroll info (secretary-only).
  social_security_number?: string | null;
  hire_date?: string | null;
  contract_type?: string | null;
  hourly_rate?: number | null; // taux horaire (coût chargé) pour le coût par chantier
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
  // Budget de MAIN-D'ŒUVRE (facultatif) : sert aux alertes de dépassement à
  // 70/80/100 %. Les heures sont toujours exploitables ; les euros ne le sont
  // que si tous les salariés du chantier ont un taux horaire renseigné.
  budget_hours?: number | null;
  budget_amount?: number | null;
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
  absence_type?: 'conge' | 'maladie' | 'intemperie' | 'repos' | null;
  position?: number | null;
  added_by_worker?: boolean;
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
  // Statut du chantier déclaré par le salarié : null = non renseigné,
  // 'en_cours' = chantier non fini, 'sans' = réceptionné sans réserve,
  // 'avec' = réceptionné avec réserve (détail dans observation/photos).
  reception?: 'sans' | 'avec' | 'en_cours' | null;
  status: 'draft' | 'submitted' | 'validated' | 'cancelled';
  created_at: string;
  submitted_at?: string;
  validated_at?: string;
  validated_by?: string;
  locked?: boolean;
  exported_at?: string | null;
  modified_by?: string | null;
  modified_at?: string | null;
}

export type LeaveType = 'conge' | 'maladie' | 'intemperie';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  company_id: string;
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  note?: string | null;
  status: LeaveStatus;
  decided_at?: string | null;
  decided_by?: string | null;
  decision_note?: string | null;
  created_at: string;
}

export type CertificationType = 'caces' | 'carte_btp' | 'habilitation_electrique' | 'visite_medicale' | 'travail_hauteur' | 'autre';

export interface Certification {
  id: string;
  company_id: string;
  user_id: string;
  type: CertificationType;
  label?: string | null;
  expiry_date: string;
  alert_30_sent_at?: string | null;
  alert_7_sent_at?: string | null;
  created_at: string;
  created_by?: string | null;
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
