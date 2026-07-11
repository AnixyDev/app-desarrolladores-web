import { StateCreator } from 'zustand';
import { Notification } from '@/types';
import { AppState } from '../useAppStore';
import { formatCurrency } from '@/lib/utils';

export interface NotificationSlice {
  notifications: Notification[];
  notifiedEvents: string[];
  addNotification: (message: string, link?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  checkInvoiceStatuses: () => void;
  checkProjectProfitability: () => void;
}

export const createNotificationSlice: StateCreator<AppState, [], [], NotificationSlice> = (set, get) => ({
    notifications: [],
    notifiedEvents: [],
    addNotification: (message, link) => {
        const newNotification: Notification = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            message,
            link,
            isRead: false,
            createdAt: new Date().toISOString(),
        };
        set(state => ({ notifications: [newNotification, ...state.notifications] }));
    },
    markAsRead: (id) => {
        set(state => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
        }));
    },
    markAllAsRead: () => {
        set(state => ({
            notifications: state.notifications.map(n => ({ ...n, isRead: true })),
        }));
    },
    checkInvoiceStatuses: () => {
        const { invoices, notifiedEvents, addNotification, getClientById } = get();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const newEvents: string[] = [];

        invoices.forEach(invoice => {
            if (invoice.paid) {
                return;
            }

            const dueDate = new Date(invoice.due_date);
            const clientName = getClientById(invoice.client_id)?.name || 'un cliente';
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Claves únicas para evitar notificaciones duplicadas del mismo tipo
            const upcomingKey = `${invoice.id}-upcoming`;
            const overdueKey = `${invoice.id}-overdue`;

            if (diffDays < 0) {
                // Factura vencida
                if (!notifiedEvents.includes(overdueKey)) {
                    addNotification(`¡Atención! La factura #${invoice.invoice_number} de ${clientName} ha vencido.`, `/invoices`);
                    newEvents.push(overdueKey);
                }
            } else if (diffDays <= 3) {
                // Factura próxima a vencer (3 días o menos)
                if (!notifiedEvents.includes(upcomingKey)) {
                    addNotification(`La factura #${invoice.invoice_number} de ${clientName} vence en ${diffDays === 0 ? 'hoy' : `${diffDays} día(s)`}.`, `/invoices`);
                    newEvents.push(upcomingKey);
                }
            }
        });

        if (newEvents.length > 0) {
            set(state => ({ notifiedEvents: [...state.notifiedEvents, ...newEvents] }));
        }
    },

    // FIX / NUEVO: alerta proactiva de rentabilidad (función Pro/Teams).
    // Compara las horas invertidas (a tarifa/hora del perfil) contra el
    // presupuesto de cada proyecto activo, y avisa en dos umbrales: 85%
    // consumido (aviso temprano) y 100%+ (presupuesto superado). Reutiliza
    // exactamente el mismo cálculo de coste que ya usa ProjectCard.tsx, para
    // que la cifra que ve el usuario aquí coincida con la de la tarjeta.
    checkProjectProfitability: () => {
        const { projects, timeEntries, profile, notifiedEvents, addNotification } = get();

        // Función premium: en el plan Free no se generan estas alertas.
        // (Los avisos de vencimiento de checkInvoiceStatuses sí son gratis.)
        if (!profile || profile.plan === 'Free') return;

        const hourlyRateCents = profile.hourly_rate_cents || 0;
        if (hourlyRateCents <= 0) return; // sin tarifa configurada no hay cálculo posible

        const newEvents: string[] = [];

        projects.forEach(project => {
            if (!project.budget_cents || project.budget_cents <= 0) return;
            if (project.status === 'completed') return; // proyecto cerrado, no molestar más

            const projectHours = timeEntries
                .filter(t => t.project_id === project.id)
                .reduce((acc, t) => acc + t.duration_seconds / 3600, 0);

            const costIncurredCents = Math.round(projectHours * hourlyRateCents);
            if (costIncurredCents <= 0) return;

            const ratio = costIncurredCents / project.budget_cents;
            const exceededKey = `${project.id}-budget-exceeded`;
            const warningKey = `${project.id}-budget-warning`;

            if (ratio >= 1) {
                if (!notifiedEvents.includes(exceededKey)) {
                    addNotification(
                        `⚠️ El proyecto "${project.name}" ha superado su presupuesto: llevas invertido ${formatCurrency(costIncurredCents)} de ${formatCurrency(project.budget_cents)} estimados.`,
                        '/projects'
                    );
                    newEvents.push(exceededKey);
                }
            } else if (ratio >= 0.85) {
                if (!notifiedEvents.includes(warningKey)) {
                    addNotification(
                        `El proyecto "${project.name}" ya lleva el ${Math.round(ratio * 100)}% de su presupuesto invertido en horas. Revisa el margen antes de seguir.`,
                        '/projects'
                    );
                    newEvents.push(warningKey);
                }
            }
        });

        if (newEvents.length > 0) {
            set(state => ({ notifiedEvents: [...state.notifiedEvents, ...newEvents] }));
        }
    },
});