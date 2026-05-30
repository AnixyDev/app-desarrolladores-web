import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFinanceSlice } from '@/hooks/store/financeSlice';
import { supabase } from '@/lib/supabaseClient';

// Mock de Zustand set y get
const set = vi.fn();
const get = vi.fn();

describe('financeSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debería agregar un gasto correctamente', async () => {
    const slice = createFinanceSlice(set, get, {} as any);
    const mockExpense = {
      amount_cents: 1000,
      category: 'Software',
      date: '2024-01-01',
      description: 'Suscripción',
      tax_percent: 21,
    };

    const mockResponse = { data: { id: '1', ...mockExpense, user_id: 'test-user-id' }, error: null };
    (supabase.from as any).mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(mockResponse),
    });

    await slice.addExpense(mockExpense as any);

    expect(supabase.from).toHaveBeenCalledWith('expenses');
    expect(set).toHaveBeenCalled();
  });
});
