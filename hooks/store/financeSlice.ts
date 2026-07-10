import { StateCreator } from 'zustand';
import {
  Invoice,
  InvoiceItem,
  Expense,
  RecurringExpense,
  Budget,
  Proposal,
  Contract,
  RecurringInvoice,
} from '../../types.ts';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

// ─── Tipos de entrada (sin campos que genera el servidor) ─────────────────────

type NewInvoiceInput = Omit<Invoice, 'id' | 'user_id' | 'created_at' | 'invoice_number' | 'subtotal_cents' | 'total_cents' | 'paid' | 'payment_date'>;
type NewRecurringInvoiceInput = Omit<RecurringInvoice, 'id' | 'user_id' | 'created_at' | 'next_date'>;
type NewBudgetInput = Omit<Budget, 'id' | 'user_id' | 'created_at' | 'amount_cents' | 'status'> & { items: InvoiceItem[] };
type NewProposalInput = Omit<Proposal, 'id' | 'user_id' | 'created_at'>;
type NewContractInput = Omit<Contract, 'id' | 'user_id' | 'created_at' | 'signed_by' | 'signed_at'>;

// ─── Interfaz del slice ───────────────────────────────────────────────────────

export interface FinanceSlice {
  invoices: Invoice[];
  recurringInvoices: RecurringInvoice[];
  expenses: Expense[];
  recurringExpenses: RecurringExpense[];
  budgets: Budget[];
  proposals: Proposal[];
  contracts: Contract[];
  monthlyGoalCents: number;

  fetchFinanceData: () => Promise<void>;

  addInvoice: (invoiceData: NewInvoiceInput, timeEntryIdsToBill?: string[]) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  markInvoiceAsPaid: (id: string) => Promise<void>;

  addRecurringInvoice: (recurringData: Omit<RecurringInvoice, 'id' | 'user_id' | 'created_at' | 'next_date'>) => Promise<void>;
  deleteRecurringInvoice: (id: string) => Promise<void>;
  checkAndGenerateRecurringInvoices: () => Promise<void>;

  addExpense: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  addRecurringExpense: (expense: Omit<RecurringExpense, 'id' | 'user_id' | 'created_at' | 'next_date'>) => Promise<void>;
  deleteRecurringExpense: (id: string) => Promise<void>;

  addBudget: (budget: NewBudgetInput) => Promise<void>;
  updateBudgetStatus: (id: string, status: Budget['status']) => Promise<void>;

  addProposal: (proposal: NewProposalInput) => Promise<void>;
  updateProposal: (id: string, updates: Partial<Proposal>) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;

  addContract: (contract: NewContractInput) => Promise<void>;
  updateContract: (id: string, updates: Partial<Contract>) => Promise<void>;
  deleteContract: (id: string) => Promise<void>;
  sendContract: (id: string) => Promise<void>;
  signContract: (id: string, signerName: string) => Promise<void>;

  setMonthlyGoal: (goal: number) => void;
}

// ─── Implementación ───────────────────────────────────────────────────────────

export const createFinanceSlice: StateCreator<AppState, [], [], FinanceSlice> = (set, get) => ({
  invoices: [],
  recurringInvoices: [],
  expenses: [],
  recurringExpenses: [],
  budgets: [],
  proposals: [],
  contracts: [],
  monthlyGoalCents: 0,

  fetchFinanceData: async () => {
    // FIX: se elimina la llamada a supabase.auth.getUser() que había aquí.
    // Era redundante (la RLS ya protege estas consultas con auth.uid()) y
    // competía por el Web Lock de supabase-js contra refreshProfile(),
    // pudiendo hacer que esta función se saliera en silencio sin cargar nada.
    const results = await Promise.allSettled([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('budgets').select('*').order('created_at', { ascending: false }),
      supabase.from('proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('recurring_invoices').select('*'),
      supabase.from('recurring_expenses').select('*'),
    ]);

    // Helper tipado: extrae datos o devuelve [] logueando el error
    const safeData = <T>(r: PromiseSettledResult<{ data: T[] | null; error: unknown }>): T[] => {
      if (r.status === 'fulfilled' && !r.value.error) {
        return r.value.data ?? [];
      }
      if (r.status === 'fulfilled') console.error('Finance fetch error:', r.value.error);
      return [];
    };

    set({
      invoices: safeData<Invoice>(results[0] as PromiseSettledResult<{ data: Invoice[] | null; error: unknown }>),
      expenses: safeData<Expense>(results[1] as PromiseSettledResult<{ data: Expense[] | null; error: unknown }>),
      budgets: safeData<Budget>(results[2] as PromiseSettledResult<{ data: Budget[] | null; error: unknown }>),
      proposals: safeData<Proposal>(results[3] as PromiseSettledResult<{ data: Proposal[] | null; error: unknown }>),
      contracts: safeData<Contract>(results[4] as PromiseSettledResult<{ data: Contract[] | null; error: unknown }>),
      recurringInvoices: safeData<RecurringInvoice>(results[5] as PromiseSettledResult<{ data: RecurringInvoice[] | null; error: unknown }>),
      recurringExpenses: safeData<RecurringExpense>(results[6] as PromiseSettledResult<{ data: RecurringExpense[] | null; error: unknown }>),
    });
  },

  // En financeSlice.ts

addInvoice: async (invoiceData, timeEntryIdsToBill) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuario no autenticado");

  // Cálculos de negocio (mantener lógica)
  const subtotal = invoiceData.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
  const total = Math.round(subtotal + (subtotal * ((invoiceData.tax_percent || 0) / 100)) - (subtotal * ((invoiceData.irpf_percent || 0) / 100)));

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      ...invoiceData,
      user_id: user.id, // Opcional si RLS usa auth.uid()
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      subtotal_cents: subtotal,
      total_cents: total,
      paid: false
    })
    .select()
    .single();

  if (error) {
    console.error('Supabase Error:', error);
    // Lanzar error para que el componente UI pueda capturarlo (ej: toast de error)
    throw error; 
  }

  // Actualización de estado solo si la DB confirma éxito
  set(state => ({ invoices: [data, ...state.invoices] }));
  
  if (timeEntryIdsToBill?.length) {
    await supabase.from('time_entries').update({ invoice_id: data.id }).in('id', timeEntryIdsToBill);
    get().fetchTimeEntries?.();
  }
},
  deleteInvoice: async (id) => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (!error) {
      set(state => ({ invoices: state.invoices.filter(i => i.id !== id) }));
    }
  },

  markInvoiceAsPaid: async (id) => {
    const paymentDate = new Date().toISOString();
    const { error } = await supabase
      .from('invoices')
      .update({ paid: true, payment_date: paymentDate })
      .eq('id', id);

    if (!error) {
      set(state => ({
        invoices: state.invoices.map(i =>
          i.id === id ? { ...i, paid: true, payment_date: paymentDate } : i
        ),
      }));
      const invoice = get().invoices.find(i => i.id === id);
      if (invoice) {
        get().addNotification(`La factura #${invoice.invoice_number} ha sido pagada.`, '/invoices');
      }
    }
  },

  addRecurringInvoice: async (recurringData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('recurring_invoices')
      .insert({ ...recurringData, user_id: user.id, next_date: recurringData.start_date, items: recurringData.items, tax_percent: recurringData.tax_percent })
      .select()
      .single();

    if (!error && data) {
      set(state => ({ recurringInvoices: [...state.recurringInvoices, data as RecurringInvoice] }));
      get().checkAndGenerateRecurringInvoices();
    }
  },

  deleteRecurringInvoice: async (id) => {
    const { error } = await supabase.from('recurring_invoices').delete().eq('id', id);
    if (!error) {
      set(state => ({
        recurringInvoices: state.recurringInvoices.filter(ri => ri.id !== id),
      }));
    }
  },

  checkAndGenerateRecurringInvoices: async () => {
    // Esta función ahora solo refresca los datos, ya que la lógica real 
    // se ejecuta en una Supabase Edge Function mediante un CRON job.
    const { data } = await supabase.from('recurring_invoices').select('*');
    if (data) set({ recurringInvoices: data as RecurringInvoice[] });
  },

  addExpense: async (expense) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, user_id: user.id })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding expense:', error);
      throw error;
    }

    if (!error && data) {
      set(state => ({ expenses: [data as Expense, ...state.expenses] }));
    }
  },

  deleteExpense: async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) {
      set(state => ({ expenses: state.expenses.filter(e => e.id !== id) }));
    }
  },

  addRecurringExpense: async (expense) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('recurring_expenses')
      .insert({ ...expense, user_id: user.id, next_date: expense.start_date })
      .select()
      .single();

    if (!error && data) {
      set(state => ({
        recurringExpenses: [data as RecurringExpense, ...state.recurringExpenses],
      }));
    }
  },

  deleteRecurringExpense: async (id) => {
    const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
    if (!error) {
      set(state => ({
        recurringExpenses: state.recurringExpenses.filter(re => re.id !== id),
      }));
    }
  },

  addBudget: async (budgetData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const amount_cents = budgetData.items.reduce(
      (sum, item) => sum + item.price_cents * item.quantity,
      0
    );

    const { data, error } = await supabase
      .from('budgets')
      .insert({ ...budgetData, user_id: user.id, amount_cents, status: 'pending' })
      .select()
      .single();

    if (!error && data) {
      set(state => ({ budgets: [data as Budget, ...state.budgets] }));
    }
  },

  updateBudgetStatus: async (id, status) => {
    const { error } = await supabase.from('budgets').update({ status }).eq('id', id);
    if (!error) {
      set(state => ({
        budgets: state.budgets.map(b => (b.id === id ? { ...b, status } : b)),
      }));
    }
  },

  addProposal: async (proposalData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('proposals')
      .insert({ ...proposalData, user_id: user.id })
      .select()
      .single();

    if (!error && data) {
      set(state => ({ proposals: [data as Proposal, ...state.proposals] }));
    }
  },
  updateProposal: async (id, updates) => {
    const { error } = await supabase.from('proposals').update(updates).eq('id', id);
    if (!error) {
      set(state => ({
        proposals: state.proposals.map(p => (p.id === id ? { ...p, ...updates } : p)),
      }));
    }
  },
  deleteProposal: async (id) => {
    const { error } = await supabase.from('proposals').delete().eq('id', id);
    if (!error) {
      set(state => ({ proposals: state.proposals.filter(p => p.id !== id) }));
    }
  },

  addContract: async (contractData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('contracts')
      .insert({ ...contractData, user_id: user.id })
      .select()
      .single();

    if (error) {
      console.error('Error adding contract:', error);
      throw error;
    }

    if (!error && data) {
      set(state => ({ contracts: [data as Contract, ...state.contracts] }));
    }
  },

  updateContract: async (id, updates) => {
    const { error } = await supabase.from('contracts').update(updates).eq('id', id);
    if (!error) {
      set(state => ({
        contracts: state.contracts.map(c => (c.id === id ? { ...c, ...updates } : c)),
      }));
    }
  },

  deleteContract: async (id) => {
    const { error } = await supabase.from('contracts').delete().eq('id', id);
    if (!error) {
      set(state => ({ contracts: state.contracts.filter(c => c.id !== id) }));
    }
  },

  sendContract: async (id) => {
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'sent' })
      .eq('id', id);

    if (!error) {
      set(state => ({
        contracts: state.contracts.map(c =>
          c.id === id ? { ...c, status: 'sent' as Contract['status'] } : c
        ),
      }));
    }
  },

  signContract: async (id, signerName) => {
    const signedAt = new Date().toISOString();
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'signed', signed_by: signerName, signed_at: signedAt })
      .eq('id', id);

    if (!error) {
      set(state => ({
        contracts: state.contracts.map(c =>
          c.id === id
            ? { ...c, status: 'signed' as Contract['status'], signed_by: signerName, signed_at: signedAt }
            : c
        ),
      }));
    }
  },

  setMonthlyGoal: (goal) => {
    set({ monthlyGoalCents: goal });
  },
});
