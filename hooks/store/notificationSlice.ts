import { StateCreator } from 'zustand';
import { Notification } from '../../types.ts';
import { AppState } from '../useAppStore.tsx';

export interface NotificationSlice {
  notifications: Notification[];
  notifiedEvents: string[];
  addNotification: (message: string, link: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  checkInvoiceStatuses: () => void;
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
});