// hooks/useProfitability.ts
import { useMemo, useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';

export interface ProfitabilityData {
  projectId: string;
  projectName: string;
  clientName: string;
  totalIncome: number;
  totalCosts: number;
  netProfit: number;
  margin: number;
  totalHours: number;
  effectiveHourlyRate: number;
}

export type SortKey = keyof ProfitabilityData;
export type SortDirection = 'ascending' | 'descending';

export interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function useProfitability() {
  const { projects, clients, invoices, timeEntries, expenses } = useAppStore();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // ── Cálculo de rentabilidad por proyecto ──────────────────────────────────
  const profitabilityData = useMemo<ProfitabilityData[]>(() => {
    return projects.map(project => {
      const projectInvoices  = invoices.filter(i => i.project_id === project.id);
      const projectExpenses  = expenses.filter(e => e.project_id === project.id);
      const projectTimeEntries = timeEntries.filter(t => t.project_id === project.id);

      const totalIncome = projectInvoices.reduce((sum, i) => sum + i.total_cents, 0);
      const totalCosts  = projectExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
      const totalHours  = projectTimeEntries.reduce((sum, t) => sum + t.duration_seconds / 3600, 0);

      return {
        projectId: project.id,
        projectName: project.name,
        clientName: clients.find(c => c.id === project.client_id)?.name ?? 'Cliente desconocido',
        totalIncome,
        totalCosts,
        netProfit: totalIncome - totalCosts,
        margin: totalIncome > 0 ? ((totalIncome - totalCosts) / totalIncome) * 100 : 0,
        totalHours,
        effectiveHourlyRate: totalHours > 0 ? totalIncome / totalHours : 0,
      };
    });
  }, [projects, clients, invoices, expenses, timeEntries]);

  // ── Ordenación ────────────────────────────────────────────────────────────
  const sortedData = useMemo<ProfitabilityData[]>(() => {
    if (!sortConfig) return profitabilityData;
    return [...profitabilityData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      const order = sortConfig.direction === 'ascending' ? 1 : -1;
      if (aVal < bVal) return -order;
      if (aVal > bVal) return order;
      return 0;
    });
  }, [profitabilityData, sortConfig]);

  const requestSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev?.key === key && prev.direction === 'ascending'
        ? { key, direction: 'descending' }
        : { key, direction: 'ascending' }
    );
  };

  // ── Métricas de resumen ───────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (profitabilityData.length === 0) return null;

    const topProject = profitabilityData.reduce(
      (top, cur) => cur.netProfit > top.netProfit ? cur : top,
      profitabilityData[0]
    );
    const lowestProject = profitabilityData.reduce(
      (low, cur) => cur.netProfit < low.netProfit ? cur : low,
      profitabilityData[0]
    );
    const avgMargin =
      profitabilityData.reduce((sum, p) => sum + p.margin, 0) / profitabilityData.length;

    return { topProject, lowestProject, avgMargin };
  }, [profitabilityData]);

  return { profitabilityData, sortedData, sortConfig, requestSort, summary };
}
