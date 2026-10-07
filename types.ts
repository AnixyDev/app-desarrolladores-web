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
  // NUEVO: reply-to configurable para emails de facturas/propuestas/presupuestos.
  // Si es undefined/vacío, el backend usa 'email' como fallback.
  invoice_reply_to_email?: string;
  address?: string;
  // NUEVO: domicilio fiscal completo — 'address' nunca llegó a
  // implementarse en la base de datos pese a estar en el tipo; estos
  // campos sí existen de verdad y son necesarios para una factura
  // legalmente completa (RD 1619/2012).
  fiscal_street?: string;
  fiscal_postal_code?: string;
  fiscal_city?: string;
  fiscal_province?: string;
  avatar_url: string;
  plan: 'Free' | 'Pro' | 'Teams';
  role: 'Admin' | 'Developer' | 'Manager' | string;
  ai_credits: number;
  /**
   * El saldo de ai_credits es el del equipo (miembro activo de una cuenta
   * Teams), no el de esta cuenta. Lo calcula saldo_creditos_ia() al cargar.
   * Solo para pantalla: nunca se escribe en la base de datos.
   */
  creditos_compartidos?: boolean;
  signature_credits: number;
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
  // NUEVO: cumplimiento Veri*Factu (RD 1007/2023). Desactivado por
  // defecto — cada usuario lo activa cuando le corresponda según su
  // fecha límite (autónomos: 1 julio 2027).
  veri_factu_enabled?: boolean;
  veri_factu_modality?: 'verifactu' | 'no_verifactu';
  /** Adónde se envían sus registros (lo cambia solo el servidor). Fase 4 de Verifactu. */
  verifactu_entorno?: 'sin_envio' | 'pruebas' | 'produccion';
}

export interface FiscalRecord {
  id: string;
  user_id: string;
  invoice_id: string;
  record_type: 'alta' | 'anulacion';
  nif_emisor: string;
  nombre_emisor: string;
  numero_factura: string;
  fecha_expedicion: string;
  tipo_factura: string;
  importe_total_cents: number;
  hash_anterior: string | null;
  hash: string;
  hash_input: string;
  modalidad: 'verifactu' | 'no_verifactu';
  estado_envio: 'no_aplica' | 'pendiente' | 'enviado' | 'aceptado' | 'aceptado_con_errores' | 'rechazado';
  csv_respuesta_aeat: string | null;
  created_at: string;
  /** Desde la fase 1 de Verifactu (07/10/2026). */
  cuota_total_cents?: number | null;
  fecha_hora_huso?: string | null;
  /** Contenido completo del registro con los nombres de campo del XSD de la AEAT. */
  registro?: Record<string, unknown>;
  orden?: number;
  /** Envío a la AEAT, desde la fase 2 de Verifactu (07/10/2026). */
  envio_intentos?: number;
  envio_ultimo_intento?: string | null;
  envio_error_codigo?: string | null;
  envio_error_descripcion?: string | null;
  envio_aceptado_en?: string | null;
  /** Fase 3: el registro de alta que este subsana (se reenvió tras corregir los datos). */
  subsana_registro_id?: string | null;
  /** Fase 4: entorno de la AEAT al que va (null = registro interno, no se envía). */
  entorno?: 'pruebas' | 'produccion' | null;
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
  /**
   * Cuándo se le envió la última invitación al Portal de Cliente.
   * La escribe solo la Edge Function `invite-portal-client`; desde el
   * navegador es de solo lectura.
   */
  portal_invitado_en?: string | null;
  /** Decide si sus facturas llevan IVA español (ver lib/ivaClientes.ts). */
  tipo_fiscal?: TipoFiscalCliente;
  /** NIF-IVA europeo (prefijo de país + número). Obligatorio para empresa_ue. */
  nif_iva?: string | null;
  /** Código ISO de país (ES, FR, US…). Obligatorio fuera de la UE; para el resto, España si no se indica. */
  pais?: string | null;
  /** Particular (no empresa ni autónomo): cambia la mención legal fuera de la UE y el tipo de documento en el registro fiscal. */
  es_particular?: boolean;
}

export type TipoFiscalCliente = 'nacional' | 'empresa_ue' | 'fuera_ue';
export type MotivoSinIva = 'inversion_sujeto_pasivo_ue' | 'no_sujeta_fuera_ue' | 'no_sujeta_fuera_ue_particular';

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
  // NUEVO: cumplimiento Veri*Factu
  fiscal_locked?: boolean;
  rectifies_invoice_id?: string | null;
  is_rectified?: boolean;
  motivo_rectificacion?: string | null;
  /** Causa de la rectificativa (decide R1 o R4 en Verifactu). */
  causa_rectificacion?: 'descuento' | 'cancelacion' | 'error_iva' | 'otro' | null;
  notes?: string | null;
  budget_id?: string | null;
  /** Recordatorios de cobro automáticos para esta factura (por defecto, sí). */
  recordatorios_activos?: boolean;
  contract_id?: string | null;
  /**
   * Por qué la factura no lleva IVA español. Lo deduce la base de datos a
   * partir del tipo fiscal del cliente cuando el IVA es 0 %; el PDF imprime
   * la mención legal. Inmutable tras el registro fiscal.
   */
  motivo_sin_iva?: MotivoSinIva | null;
}

export interface Receipt {
  id: string;
  user_id: string;
  receipt_number: string;
  client_id: string | null;
  project_id: string | null;
  concept: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
  notes: string | null;
  created_at: string;
}

export interface NewReceipt {
  client_id: string | null;
  project_id?: string | null;
  concept: string;
  amount_cents: number;
  paid_at: string;
  method?: string | null;
  notes?: string | null;
}

export interface BankConnection {
  id: string;
  user_id: string;
  gocardless_requisition_id: string;
  institution_id: string;
  institution_name: string;
  status: 'pending' | 'linked' | 'expired' | 'error';
  created_at: string;
  expires_at: string | null;
}

export interface BankAccount {
  id: string;
  user_id: string;
  connection_id: string;
  gocardless_account_id: string;
  iban: string | null;
  account_name: string | null;
  currency: string;
  last_synced_at: string | null;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  bank_account_id: string;
  amount_cents: number;
  currency: string;
  booking_date: string;
  counterparty_name: string | null;
  description: string | null;
  matched_invoice_id: string | null;
  match_status: 'unmatched' | 'suggested' | 'confirmed' | 'ignored';
  match_confidence: number | null;
  created_at: string;
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
  signed_by?: string | null;
  signed_at?: string | null;
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
  /** Solo el nombre de pila del invitado. */
  referred_user_name: string | null;
  join_date: string | null;
  created_at?: string;
  status: 'Registered' | 'Subscribed' | 'Cancelled';
  commission_cents: number;
}

// Added missing types
export interface UserData { id: string; name: string; email: string; role: 'Admin' | 'Manager' | 'Developer'; status: 'Activo' | 'Inactivo' | 'Pendiente'; hourly_rate_cents: number; invitedOn?: string; accepted_user_id?: string | null; }
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
export interface Expense { id: string; user_id: string; amount_cents: number; category: string; date: string; description: string; tax_percent: number; project_id?: string | null; /** Mes (día 1) de la cuota de autónomo que representa este gasto, si lo es. */ cuota_autonomo_mes?: string | null; }
/** Un tramo del histórico de la cuota de autónomo: «desde este mes pago X». */
export interface CuotaAutonomo { id: string; user_id: string; desde: string; importe_cents: number; nota?: string | null; created_at?: string; }
export interface RecurringExpense { id: string; user_id: string; amount_cents: number; category: string; frequency: string; start_date: string; next_date: string; description: string; project_id?: string | null; }
export interface RecurringInvoice { id: string; user_id: string; client_id: string; project_id?: string | null; items: InvoiceItem[]; tax_percent: number; /** Retención de IRPF (%) de cada factura emitida. */ irpf_percent?: number; frequency: string; start_date: string; next_due_date: string; }
export interface NewProject { name: string; client_id: string; status: string; description?: string; start_date?: string; due_date?: string; budget_cents?: number; category?: string; priority?: ProjectPriority; }
export interface TimeEntry { id: string; user_id: string; project_id: string; task_id?: string; description?: string; duration_seconds: number; start_time: string; end_time?: string; invoice_id?: string | null; logged_by?: string | null; }
export interface NewTimeEntry { project_id: string; task_id?: string; description?: string; duration_seconds: number; start_time: string; end_time?: string; invoice_id?: string | null; }
// Mensaje del canal de proyecto. Refleja la tabla public.project_messages:
// `author_name` y `author_role` NO los manda el navegador, los sella un
// trigger leyendo quien es de verdad quien escribe — asi un cliente del
// portal no puede firmar un mensaje como si fuera el freelancer.
export type AutorDelChat = 'freelancer' | 'equipo' | 'cliente';
export interface ProjectMessage {
  id: string;
  project_id: string;
  author_id: string;
  author_name: string;
  author_role: AutorDelChat;
  body: string;
  created_at: string;
}
export interface Notification { id: string; message: string; link?: string; isRead: boolean; createdAt: string; }
export interface NewClient { name: string; email: string; company?: string; phone?: string; tax_id?: string; address?: string; tipo_fiscal?: TipoFiscalCliente; nif_iva?: string | null; pais?: string | null; es_particular?: boolean; }
export interface GoogleJwtPayload { email: string; name?: string; picture?: string; sub: string; }
export interface TeamMembership {
  membershipId: string;
  role: string;
  status: string;
  ownerId: string;
  ownerBusinessName: string | null;
  ownerFullName: string | null;
}
