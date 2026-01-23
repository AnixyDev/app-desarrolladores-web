// hooks/store/inboxSlice.ts
import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';

// Placeholder types for an inbox feature
export interface InboxItem {
  id: string;
  subject: string;
  sender: string;
  preview: string;
  timestamp: string;
  isRead: boolean;
  category: 'invoice' | 'proposal' | 'client';
}

export interface InboxSlice {
  inboxItems: InboxItem[];
  getUnreadCount: () => number;
  markAsRead: (id: string) => void;
}

export const createInboxSlice: StateCreator<AppState, [], [], InboxSlice> = (set, get) => ({
  inboxItems: [
    { id: 'inbox-1', subject: 'Factura #INV-0002 está pendiente', sender: 'Sistema', preview: 'Recuerda que la factura para QuantumLeap vence pronto.', timestamp: new Date().toISOString(), isRead: false, category: 'invoice' },
    { id: 'inbox-2', subject: 'Propuesta Aceptada', sender: 'InnovateCorp', preview: 'Hemos aceptado tu propuesta para el nuevo CRM.', timestamp: new Date(Date.now() - 86400000).toISOString(), isRead: true, category: 'proposal' },
  ],
  getUnreadCount: () => get().inboxItems.filter(item => !item.isRead).length,
  markAsRead: (id) => set(state => ({
    inboxItems: state.inboxItems.map(item => item.id === id ? { ...item, isRead: true } : item),
  })),
});