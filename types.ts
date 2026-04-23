// Definiciones de TypeScript definitivas alineadas con el repositorio AnixyDev/app-desarrolladores-web

export type BudgetStatus = 'pending' | 'accepted' | 'rejected';
export type ContractStatus = 'draft' | 'sent' | 'signed';
export type JobApplicationStatus = 'sent' | 'viewed' | 'accepted' | 'rejected';
export type ProjectStatus = 'planning' | 'in-progress' | 'completed' | 'on-hold';
export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
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
  payment_date?: string;
  created_at: string;
  irpf_percent?: number;
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

export interface Proposal {
  id: string;
  user_id: string;
  client_id: string;
  title: string;
  content: string;
  amount_cents: number;
  status: ProposalStatus;
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
  status: 'Registered' | 'Subscribed';
  commission_cents: number;
}
