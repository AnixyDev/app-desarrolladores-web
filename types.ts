// Definiciones de TypeScript definitivas alineadas con el repositorio AnixyDev/app-desarrolladores-web

export type BudgetStatus = 'pending' | 'accepted' | 'rejected';
export type ContractStatus = 'draft' | 'sent' | 'signed';
export type JobApplicationStatus = 'sent' | 'viewed' | 'accepted' | 'rejected';
export type ProjectStatus = 'planning' | 'in-progress' | 'completed' | 'on-hold';
export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected';
export type ProjectPriority = 'Low' | 'Medium' | 'High';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  business_name: string;
  tax_id: string;
  address?: string;
  avatar_url: string;
  plan: 'Free' | 'Pro' | 'Teams';
  role: 'Admin' | 'Developer' | 'Manager' | string;
  ai_credits: number;
  hourly_rate_cents: number;
  pdf_color: string;
  portal_logo_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_url?: string;
  payment_reminders_enabled: boolean;
  reminder_template_upcoming: string;
  reminder_template_overdue: string;
  affiliate_code: string;
  stripe_account_id: string;
  stripe_onboarding_complete: boolean;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_end?: string;
  subscription_status?: string;
}

export interface Client {
  id: string;
  user_id: string;
  name: string;
  company: string;
  tax_id?: string;
  address?: string;
  email: string;
  phone: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  client_id: string;
  description?: string;
  status: ProjectStatus;
  start_date: string;
  due_date: string;
  budget_cents: number;
  created_at: string;
  category: string;
  priority: ProjectPriority;
}

export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'done' | 'blocked';

export interface Task {
  id: string;
  user_id: string;
  project_id: string;
  description: string;
  status: TaskStatus; // Corregido: antes usaba 'completed: boolean'
  created_at: string;
  invoice_id: string | null;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  price_cents: number;
}

export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  client_id: string;
  project_id: string | null;
  issue_date: string;
  due_date: string;
  items: InvoiceItem[];
  subtotal_cents: number;
  tax_percent: number;
  total_cents: number;
  paid: boolean;
  payment_date?: string | null;
  created_at: string;
  irpf_percent?: number;
}

export interface NewInvoice {
  client_id: string;
  project_id?: string | null;
  items: InvoiceItem[];
  tax_percent: number;
  irpf_percent?: number;
  due_date: string;
  notes?: string;
}

export interface Budget {
  id: string;
  user_id: string;
  client_id: string;
  description: string;
  items: InvoiceItem[];
  amount_cents: number;
  status: BudgetStatus;
  created_at: string;
}
export type NewBudget = Omit<Budget, 'id' | 'user_id' | 'amount_cents' | 'created_at'>;

export interface Proposal {
  id: string;
  user_id: string;
  client_id: string;
  title: string;
  content: string;
  amount_cents: number;
  status: ProposalStatus;
  items: InvoiceItem[];
  valid_until: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  user_id: string;
  client_id: string;
  project_id: string;
  content: string;
  status: ContractStatus;
  created_at: string;
  signed_by?: string;
  signed_at?: string;
}

export interface JobApplication {
  id: string;
  jobId: string;
  userId: string;
  applicantName: string;
  jobTitle: string;
  proposalText: string;
  status: JobApplicationStatus;
  appliedAt: string;
}

export interface Referral {
  id: string;
  name: string;
  join_date: string;
  created_at?: string;
  status: 'Registered' | 'Subscribed';
  commission_cents: number;
}

// Added missing types
export interface UserData { id: string; name: string; email: string; role: 'Admin' | 'Manager' | 'Developer'; status: 'Activo' | 'Inactivo' | 'Pendiente'; hourly_rate_cents: number; invitedOn?: string; }
export interface Job {
  id: string;
  postedByUserId: string;
  titulo: string;
  descripcionCorta?: string;
  descripcionLarga?: string;
  presupuesto: number;
  duracionSemanas?: number;
  habilidades?: string[];
  cliente?: string;
  fechaPublicacion?: string;
  isFeatured?: boolean;
  compatibilidadIA?: number;
  created_at: string;
  email_contacto?: string;
}
export interface KnowledgeArticle { id: string; user_id?: string; title: string; content: string; tags?: string[]; created_at?: string; updated_at?: string; }

// Additional missing types
export type IconName = string;
export type PlanType = 'free' | 'pro' | 'teams';
export type UserRole = 'admin' | 'user' | 'manager';
export interface Expense { id: string; user_id: string; amount_cents: number; category: string; date: string; description: string; tax_percent: number; project_id?: string | null; }
export interface RecurringExpense { id: string; user_id: string; amount_cents: number; category: string; frequency: string; start_date: string; next_date: string; description: string; project_id?: string | null; }
export interface RecurringInvoice { id: string; user_id: string; client_id: string; project_id?: string | null; items: InvoiceItem[]; tax_percent: number; frequency: string; start_date: string; next_date: string; }
export interface NewProject { name: string; client_id: string; status: string; description?: string; start_date?: string; due_date?: string; budget_cents?: number; category?: string; priority?: ProjectPriority; }
export interface TimeEntry { id: string; user_id: string; project_id: string; task_id?: string; description?: string; duration_seconds: number; start_time: string; end_time?: string; invoice_id?: string | null; }
export interface NewTimeEntry { project_id: string; task_id?: string; description?: string; duration_seconds: number; start_time: string; end_time?: string; invoice_id?: string | null; }
export interface ProjectMessage { id: string; project_id: string; user_id: string; user_name: string; text: string; timestamp: string; }
export interface Notification { id: string; message: string; link?: string; isRead: boolean; createdAt: string; }
export interface NewClient { name: string; email: string; company?: string; phone?: string; tax_id?: string; address?: string; }
export interface GoogleJwtPayload { email: string; name?: string; picture?: string; sub: string; }
export interface TeamMembership {
  membershipId: string;
  role: string;
  status: string;
  ownerId: string;
  ownerBusinessName: string | null;
  ownerFullName: string | null;
}