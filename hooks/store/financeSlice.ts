
import { StateCreator } from 'zustand';
import { Invoice, Expense, RecurringExpense, Budget, Proposal, Contract, RecurringInvoice } from '../../types.ts';
import { AppState } from '../useAppStore.tsx';
import { supabase } from '../../lib/supabaseClient.ts';

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
  
  addInvoice: (invoiceData: any, timeEntryIdsToBill?: string[]) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  markInvoiceAsPaid: (id: string) => Promise<void>;
  
  addRecurringInvoice: (recurringData: any) => Promise<void>;
  deleteRecurringInvoice: (id: string) => Promise<void>;
  checkAndGenerateRecurringInvoices: () => Promise<void>;
  
  addExpense: (expense: Omit<Expense, 'id'|'user_id'|'created_at'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  
  addRecurringExpense: (expense: Omit<RecurringExpense, 'id'|'user_id'|'created_at'|'next_due_date'>) => Promise<void>;
  deleteRecurringExpense: (id: string) => Promise<void>;
  
  addBudget: (budget: any) => Promise<void>;
  updateBudgetStatus: (id: string, status: Budget['status']) => Promise<void>;
  
  addProposal: (proposal: any) => Promise<void>;
  
  addContract: (contract: any) => Promise<void>;
  updateContract: (id: string, updates: Partial<Contract>) => Promise<void>;
  deleteContract: (id: string) => Promise<void>;
  sendContract: (id: string) => Promise<void>;
  signContract: (id: string, signerName: string) => Promise<void>;
  
  setMonthlyGoal: (goal: number) => void;
}

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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const results = await Promise.all([
            supabase.from('invoices').select('*').order('created_at', { ascending: false }),
            supabase.from('expenses').select('*').order('date', { ascending: false }),
            supabase.from('budgets').select('*').order('created_at', { ascending: false }),
            supabase.from('proposals').select('*').order('created_at', { ascending: false }),
            supabase.from('contracts').select('*').order('created_at', { ascending: false }),
            supabase.from('recurring_invoices').select('*'),
            supabase.from('recurring_expenses').select('*'),
        ]);

        set({
            invoices: (results[0].data || []) as Invoice[],
            expenses: (results[1].data || []) as Expense[],
            budgets: (results[2].data || []) as Budget[],
            proposals: (results[3].data || []) as Proposal[],
            contracts: (results[4].data || []) as Contract[],
            recurringInvoices: (results[5].data || []) as RecurringInvoice[],
            recurringExpenses: (results[6].data || []) as RecurringExpense[],
        });
    },

    addInvoice: async (invoiceData, timeEntryIdsToBill) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const subtotal = invoiceData.items.reduce((sum: number, item: any) => sum + item.price_cents * item.quantity, 0);
        const taxAmount = subtotal * ((invoiceData.tax_percent || 0) / 100);
        const irpfAmount = subtotal * ((invoiceData.irpf_percent || 0) / 100);
        const total = Math.round(subtotal + taxAmount - irpfAmount);

        const newInvoiceData = {
            ...invoiceData,
            user_id: user.id,
            invoice_number: `INV-${Date.now().toString().slice(-6)}`, // Simple generation strategy
            subtotal_cents: subtotal,
            total_cents: total,
            paid: false,
        };

        const { data, error } = await supabase.from('invoices').insert(newInvoiceData).select().single();

        if (!error && data) {
            set(state => ({ invoices: [data as Invoice, ...state.invoices] }));
            get().addNotification(`Nueva factura #${data.invoice_number} creada.`, '/invoices');

            if (timeEntryIdsToBill && timeEntryIdsToBill.length > 0) {
                // Update time entries to link them to this invoice
                await supabase.from('time_entries')
                    .update({ invoice_id: data.id })
                    .in('id', timeEntryIdsToBill);
                
                // Refresh time entries in local state
                get().fetchTimeEntries();
            }
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
        const { error } = await supabase.from('invoices').update({ paid: true, payment_date: paymentDate }).eq('id', id);
        
        if (!error) {
            set(state => ({ invoices: state.invoices.map(i => i.id === id ? { ...i, paid: true, payment_date: paymentDate } : i) }));
            const invoice = get().invoices.find(i => i.id === id);
            if(invoice) get().addNotification(`La factura #${invoice.invoice_number} ha sido pagada.`, '/invoices');
        }
    },

    addRecurringInvoice: async (recurringData) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('recurring_invoices').insert({
            ...recurringData,
            user_id: user.id,
            next_due_date: recurringData.start_date
        }).select().single();

        if (!error && data) {
            set(state => ({ recurringInvoices: [...state.recurringInvoices, data as RecurringInvoice] }));
            get().checkAndGenerateRecurringInvoices();
        }
    },

    deleteRecurringInvoice: async (id) => {
        const { error } = await supabase.from('recurring_invoices').delete().eq('id', id);
        if (!error) {
            set(state => ({ recurringInvoices: state.recurringInvoices.filter(ri => ri.id !== id) }));
        }
    },

    checkAndGenerateRecurringInvoices: async () => {
        // Logic to generate invoice from recurring template should ideally be server-side (Edge Function + Cron)
        // For client-side simulation:
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const recurringInvoices = get().recurringInvoices;
        
        for (const rec of recurringInvoices) {
            const nextDueDate = new Date(rec.next_due_date);
            if (nextDueDate <= today) {
                // Generate Invoice
                await get().addInvoice({
                    client_id: rec.client_id,
                    project_id: rec.project_id,
                    issue_date: new Date().toISOString().split('T')[0],
                    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    items: rec.items,
                    tax_percent: rec.tax_percent,
                });

                // Update Next Due Date
                let newNextDueDate = new Date(rec.next_due_date);
                if (rec.frequency === 'monthly') {
                    newNextDueDate.setMonth(newNextDueDate.getMonth() + 1);
                } else {
                    newNextDueDate.setFullYear(newNextDueDate.getFullYear() + 1);
                }
                
                await supabase.from('recurring_invoices')
                    .update({ next_due_date: newNextDueDate.toISOString().split('T')[0] })
                    .eq('id', rec.id);
            }
        }
        // Refresh
        const { data } = await supabase.from('recurring_invoices').select('*');
        if(data) set({ recurringInvoices: data as RecurringInvoice[] });
    },

    addExpense: async (expense) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('expenses').insert({ ...expense, user_id: user.id }).select().single();
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

        const { data, error } = await supabase.from('recurring_expenses').insert({ 
            ...expense, 
            user_id: user.id,
            next_due_date: expense.start_date 
        }).select().single();

        if (!error && data) {
            set(state => ({ recurringExpenses: [data as RecurringExpense, ...state.recurringExpenses] }));
        }
    },

    deleteRecurringExpense: async (id) => {
        const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
        if (!error) {
            set(state => ({ recurringExpenses: state.recurringExpenses.filter(re => re.id !== id) }));
        }
    },

    addBudget: async (budgetData) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const amount_cents = budgetData.items.reduce((sum: number, item: any) => sum + item.price_cents * item.quantity, 0);
        const { data, error } = await supabase.from('budgets').insert({ 
            ...budgetData, 
            user_id: user.id,
            amount_cents 
        }).select().single();

        if (!error && data) {
            set(state => ({ budgets: [data as Budget, ...state.budgets] }));
        }
    },

    updateBudgetStatus: async (id, status) => {
        const { error } = await supabase.from('budgets').update({ status }).eq('id', id);
        if (!error) {
            set(state => ({ budgets: state.budgets.map(b => b.id === id ? {...b, status} : b) }));
        }
    },

    addProposal: async (proposalData) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('proposals').insert({ 
            ...proposalData, 
            user_id: user.id 
        }).select().single();

        if (!error && data) {
            set(state => ({ proposals: [data as Proposal, ...state.proposals] }));
        }
    },

    addContract: async (contractData) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('contracts').insert({ 
            ...contractData, 
            user_id: user.id 
        }).select().single();

        if (!error && data) {
            set(state => ({ contracts: [data as Contract, ...state.contracts] }));
        }
    },

    updateContract: async (id, updates) => {
        const { error } = await supabase.from('contracts').update(updates).eq('id', id);
        if (!error) {
            set(state => ({ contracts: state.contracts.map(c => c.id === id ? { ...c, ...updates } : c) }));
        }
    },

    deleteContract: async (id) => {
        const { error } = await supabase.from('contracts').delete().eq('id', id);
        if (!error) {
            set(state => ({ contracts: state.contracts.filter(c => c.id !== id) }));
        }
    },

    sendContract: async (id) => {
        const { error } = await supabase.from('contracts').update({ status: 'sent' }).eq('id', id);
        if (!error) {
            set(state => ({ contracts: state.contracts.map(c => c.id === id ? { ...c, status: 'sent' } : c) }));
        }
    },

    signContract: async (id, signerName) => {
        const signedAt = new Date().toISOString();
        const { error } = await supabase.from('contracts').update({ 
            status: 'signed', 
            signed_by: signerName, 
            signed_at: signedAt 
        }).eq('id', id);

        if (!error) {
            set(state => ({ contracts: state.contracts.map(c => c.id === id ? { ...c, status: 'signed', signed_by: signerName, signed_at: signedAt } : c) }));
        }
    },

    setMonthlyGoal: (goal) => {
        // This is a local preference, usually persisted in localStorage via zustand persist, 
        // or could be added to profile table. For now, keep as is.
        set({ monthlyGoalCents: goal }); 
    },
});
